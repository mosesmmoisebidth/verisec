import {
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';

import { CreditsService, toMicro } from './credits.service';
import { EntitlementsService } from './entitlements.service';
import { PolarService, type PolarEvent, type PolarProduct } from './polar.service';
import { RecordsService } from './records.service';
import { MailService } from '../mail/mail.service';

/**
 * The one public billing route: Polar calls it when a payment happens. It is deliberately outside the operator
 * guard (Polar has no session) and is protected instead by the webhook signature, a five-minute replay window,
 * and a de-duplication table, so only Polar can move credits and the same delivery can never be counted twice.
 *
 * It does the smallest amount of work and returns 200 quickly:
 *  - order.paid        -> a credit pack tops up the wallet, a plan grants/renews the monthly quota;
 *  - subscription.revoked -> the plan stops covering verifications (credits take over from then on).
 * Anything else is acknowledged and ignored. A handler error is allowed to surface as 500 so Polar retries.
 */
@Controller('api/billing/polar')
export class PolarWebhookController {
  private readonly log = new Logger('PolarWebhook');

  constructor(
    private readonly polar: PolarService,
    private readonly credits: CreditsService,
    private readonly entitlements: EntitlementsService,
    private readonly records: RecordsService,
    private readonly mail: MailService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>): Promise<{ ok: true }> {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const event = this.polar.verify(raw, req.headers);
    if (!event) throw new UnauthorizedException('invalid webhook signature');

    // Seen this exact delivery already? Acknowledge and do nothing (Polar retries reuse the same id).
    const fresh = await this.records.query<{ id: string }>(
      `INSERT INTO polar_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [event.id, event.type],
    );
    if (!fresh.length) return { ok: true };

    try {
      if (event.type === 'order.paid') await this.onOrderPaid(event);
      else if (event.type === 'subscription.revoked') await this.onSubscriptionRevoked(event);
      // every other event type is accepted and ignored on purpose
    } catch (e) {
      // Let it fail loudly so Polar retries; drop the dedup row so the retry is allowed to act.
      await this.records.query('DELETE FROM polar_events WHERE id = $1', [event.id]).catch(() => undefined);
      throw e;
    }
    return { ok: true };
  }

  /** A paid order: credits pack -> top up; verification plan (initial or renewal) -> set/reset the quota. */
  private async onOrderPaid(event: PolarEvent) {
    const d = event.data;
    const orderId = s(d.id) ?? event.id;
    const org = await this.orgOf(d);
    if (!org) {
      this.log.warn(`order.paid ${orderId}: no organisation on the order, ignored`);
      return;
    }
    const { credits, verifications, label } = await this.amounts(d);

    if (credits != null && credits > 0) {
      const res = await this.credits.topUp(org, toMicro(credits), {
        ref: orderId,
        note: `${label ?? 'Credit pack'}: ${credits} credits added`,
      });
      this.log.log(`order.paid ${orderId}: +${credits} credits to ${org}${res.duplicate ? ' (already applied)' : ''}`);
      // Only send the receipt the first time this order is applied (never again on a retry/re-delivery).
      if (!res.duplicate) void this.emailReceipt(d, orderId, 'credits', credits, label);
      return;
    }
    if (verifications != null && verifications > 0) {
      const sub = s(d.subscription_id) ?? s((d.subscription as Record<string, unknown> | undefined)?.id) ?? orderId;
      const period = this.period(d);
      await this.entitlements.grant(org, {
        plan: label ?? 'Verification plan',
        quota: verifications,
        subscriptionId: sub,
        periodStart: period.start,
        periodEnd: period.end,
      });
      this.log.log(`order.paid ${orderId}: plan "${label}" (${verifications}/mo) set for ${org}`);
      void this.emailReceipt(d, orderId, 'plan', verifications, label);
      return;
    }
    this.log.warn(`order.paid ${orderId}: nothing to grant (no credits/verifications metadata), ignored`);
  }

  /** A subscription was revoked: its plan stops covering verifications. */
  private async onSubscriptionRevoked(event: PolarEvent) {
    const d = event.data;
    const sub = s(d.id);
    const org = (await this.orgOf(d)) ?? (sub ? await this.entitlements.orgOfSubscription(sub) : null);
    if (!org) return;
    await this.entitlements.revoke(org, sub ?? undefined);
    this.log.log(`subscription.revoked: plan ended for ${org}`);
  }

  /**
   * Send the buyer their branded receipt. Fire-and-forget on purpose: a mail failure or a slow invoice
   * generation must never make the webhook fail (that would have Polar retry and risk a second receipt). The
   * official invoice is Polar's — we fetch its URL best-effort and link to it; if it isn't ready we link to the
   * billing page, where it's always available.
   */
  private async emailReceipt(
    d: Record<string, unknown>,
    orderId: string,
    kind: 'credits' | 'plan',
    qty: number,
    label: string | null,
  ): Promise<void> {
    try {
      const to = this.customerEmail(d);
      if (!to) {
        this.log.warn(`order.paid ${orderId}: no customer email, receipt skipped`);
        return;
      }
      const amountText = this.amountText(d);
      const manageUrl = `${this.polar.origin}${this.portalPath(d)}`;
      const invoiceUrl = (await this.polar.invoiceUrl(orderId).catch(() => null)) ?? undefined;
      const name = esc(label ?? (kind === 'credits' ? 'Credit pack' : 'Verification plan'));
      if (kind === 'credits') {
        await this.mail.sendReceipt(to, {
          heading: 'Payment received',
          lede: `Thanks for your purchase. <b>${qty.toLocaleString()} credit${qty === 1 ? '' : 's'}</b> ${qty === 1 ? 'has' : 'have'} been added to your VeriSec wallet, ready to spend on any verification or API call. Credits never expire.`,
          amountText,
          itemText: `${label ?? 'Credit pack'} — ${qty.toLocaleString()} credits`,
          reference: orderId,
          manageUrl,
          invoiceUrl,
        });
      } else {
        await this.mail.sendReceipt(to, {
          heading: 'Your plan is active',
          lede: `Your <b>${name}</b> plan is active: <b>${qty.toLocaleString()}</b> full verification flow${qty === 1 ? '' : 's'} each month. Anything beyond the monthly quota draws from your credits.`,
          amountText: `${amountText} / mo`,
          itemText: `${label ?? 'Verification plan'} — ${qty.toLocaleString()} verifications/mo`,
          reference: orderId,
          manageUrl,
          invoiceUrl,
        });
      }
      this.log.log(`order.paid ${orderId}: receipt sent to ${to}${invoiceUrl ? ' with invoice' : ''}`);
    } catch (e) {
      this.log.warn(`order.paid ${orderId}: receipt not sent (${(e as Error).message})`);
    }
  }

  /** The buyer's email from the Polar order payload, however it is shaped. */
  private customerEmail(d: Record<string, unknown>): string | null {
    const customer = (d.customer as Record<string, unknown> | undefined) ?? {};
    const user = (d.user as Record<string, unknown> | undefined) ?? {};
    return s(customer.email) ?? s(d.customer_email) ?? s(user.email) ?? s(d.email);
  }

  /** What the buyer paid, as "$25.00", from the order total (minor units) and its currency. */
  private amountText(d: Record<string, unknown>): string {
    const cents = n(d.total_amount) ?? n(d.amount) ?? n(d.net_amount) ?? 0;
    const currency = (s(d.currency) ?? 'usd').toUpperCase();
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
    } catch {
      return `${currency} ${(cents / 100).toFixed(2)}`;
    }
  }

  /** The billing page to link back to, from the portal we stored at checkout (allow-listed). */
  private portalPath(d: Record<string, unknown>): string {
    const md = (d.metadata as Record<string, unknown> | undefined) ?? {};
    const portal = s(md.portal);
    return portal === '/fin/billing/' ? '/fin/billing/' : '/billing/';
  }

  /** The VeriSec org behind an order/subscription: from our own metadata first, then the Polar customer. */
  private async orgOf(d: Record<string, unknown>): Promise<string | null> {
    const md = (d.metadata as Record<string, unknown> | undefined) ?? {};
    const customer = (d.customer as Record<string, unknown> | undefined) ?? {};
    return s(md.org) ?? s(d.external_customer_id) ?? s(customer.external_id) ?? null;
  }

  /** What a purchase grants: from the metadata we set at checkout, or the product's own metadata as a fallback. */
  private async amounts(d: Record<string, unknown>): Promise<{ credits: number | null; verifications: number | null; label: string | null }> {
    const md = (d.metadata as Record<string, unknown> | undefined) ?? {};
    let credits = n(md.credits);
    let verifications = n(md.verifications);
    let label = s(md.product);
    if (credits == null && verifications == null) {
      // Bought through a path that didn't carry our metadata: read the product's own.
      const pid = s(d.product_id) ?? s((d.product as Record<string, unknown> | undefined)?.id);
      if (pid) {
        const cat = await this.polar.catalog().catch((): PolarProduct[] => []);
        const p = cat.find((x) => x.id === pid);
        if (p?.kind === 'credits') credits = p.amount;
        if (p?.kind === 'plan') verifications = p.amount;
        label = label ?? p?.name ?? null;
      }
    }
    return { credits, verifications, label };
  }

  /** The plan's billing period, if Polar sent it; otherwise one month from now. */
  private period(d: Record<string, unknown>): { start: Date | null; end: Date | null } {
    const sub = (d.subscription as Record<string, unknown> | undefined) ?? {};
    const startRaw = s(sub.current_period_start) ?? s(d.current_period_start);
    const endRaw = s(sub.current_period_end) ?? s(d.current_period_end);
    const start = startRaw ? new Date(startRaw) : new Date();
    const end = endRaw ? new Date(endRaw) : new Date(Date.now() + 31 * 24 * 3600 * 1000);
    return { start, end };
  }
}

const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
/** Escape a value before it goes into the receipt's HTML lede (product names come from the Polar dashboard). */
const esc = (v: string): string => v.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
const n = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
