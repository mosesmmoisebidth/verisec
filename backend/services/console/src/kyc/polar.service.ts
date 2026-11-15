import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Webhook } from 'svix';

/**
 * Polar (merchant of record) is where real money is taken. It only collects the payment; what a payment
 * means for an organisation (credits topped up, or a monthly verification plan granted) is decided here and
 * applied to our own ledger ([[credits.service]]) and entitlements ([[entitlements.service]]).
 *
 * This service does two things and holds no state of its own:
 *  - creates a hosted checkout for a signed-in organisation (the org id travels on the checkout so the
 *    webhook knows whose account to credit);
 *  - verifies and parses the webhooks Polar sends back, so a forged or replayed call can never add credits.
 *
 * Nothing here is specific to the six products we sell today: the amount a purchase is worth is read from the
 * product's own metadata (`credits` for a top-up pack, `verifications` for a monthly plan), so a new product
 * added in the Polar dashboard with that metadata works with no code change.
 */

/** One purchasable thing, as the billing page shows it. `kind` is read from the product's metadata. */
export type PolarProduct = {
  id: string;
  name: string;
  kind: 'credits' | 'plan' | 'other';
  /** Credits a top-up pack grants, or the monthly verification quota a plan grants. */
  amount: number | null;
  /** Price in cents (Polar's minor units), and whether it recurs. */
  priceAmount: number | null;
  currency: string;
  recurring: boolean;
};

/** What a verified webhook carries once parsed (only the parts we act on). */
export type PolarEvent = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

@Injectable()
export class PolarService {
  private readonly log = new Logger('Polar');
  private readonly base: string;
  private readonly token: string;
  private readonly secret: string;
  private readonly successUrl: string;
  private readonly appOrigin: string;

  constructor(config: ConfigService) {
    // Production host is https://api.polar.sh; the sandbox is https://sandbox-api.polar.sh.
    this.base = (config.get<string>('POLAR_API_BASE') ?? 'https://api.polar.sh').replace(/\/$/, '');
    this.token = config.get<string>('POLAR_ACCESS_TOKEN') ?? '';
    this.secret = config.get<string>('POLAR_WEBHOOK_SECRET') ?? '';
    // Where the buyer lands after paying; {CHECKOUT_ID} is filled in by Polar.
    this.successUrl =
      config.get<string>('POLAR_SUCCESS_URL') ??
      'https://verisec.dev/billing/?purchase=success&checkout={CHECKOUT_ID}';
    // The app's own origin, used to build the per-portal return page and the "manage billing" link.
    this.appOrigin = (() => {
      try {
        return new URL(config.get<string>('APP_URL') ?? this.successUrl).origin;
      } catch {
        return 'https://verisec.dev';
      }
    })();
  }

  /** The app origin (e.g. https://verisec.dev), for links in receipts. */
  get origin() {
    return this.appOrigin;
  }

  /**
   * Where the buyer is sent after paying, chosen from a short allow-list of our own billing pages so this can
   * never become an open redirect. A Financial-portal buyer returns to `/fin/billing/`, everyone else to the
   * console `/billing/`; an unknown value falls back to the configured default.
   */
  private successFor(returnTo?: string): string {
    const allowed: Record<string, string> = { '/billing/': '/billing/', '/fin/billing/': '/fin/billing/' };
    const path = returnTo ? allowed[returnTo] : undefined;
    if (!path) return this.successUrl;
    return `${this.appOrigin}${path}?purchase=success&checkout={CHECKOUT_ID}`;
  }

  /** Checkout can only be offered when an access token is set; webhooks only accepted when a secret is set. */
  get canCheckout() {
    return !!this.token;
  }
  get canVerify() {
    return !!this.secret;
  }

  /* --------------------------------------------------------------- checkout -- */

  /** The products on sale, newest first, each tagged with what it grants (read from Polar product metadata). */
  async catalog(): Promise<PolarProduct[]> {
    if (!this.token) return [];
    const list = await this.api<{ items: RawProduct[] }>('GET', '/v1/products/?is_archived=false&limit=100');
    return (list?.items ?? [])
      .filter((p) => !p.is_archived)
      .map((p) => this.describe(p))
      .sort((a, b) => (a.recurring === b.recurring ? (a.priceAmount ?? 0) - (b.priceAmount ?? 0) : a.recurring ? 1 : -1));
  }

  /**
   * Open a hosted checkout for `productId`, billed to organisation `org`. The org id is put on the checkout
   * two ways (as the external customer id and in the metadata) and the amount it grants is copied into the
   * metadata, so the `order.paid` webhook can credit the right account with no extra lookup.
   */
  async createCheckout(org: string, productId: string, returnTo?: string): Promise<{ url: string; id: string }> {
    const product = await this.getProduct(productId).catch(() => null);
    const meta: Record<string, string> = { org };
    if (product) {
      const d = this.describe(product);
      if (d.kind === 'credits' && d.amount != null) meta.credits = String(d.amount);
      if (d.kind === 'plan' && d.amount != null) meta.verifications = String(d.amount);
      meta.product = d.name;
    }
    // Remember which portal the buyer came from, so the receipt links them back to the right billing page.
    if (returnTo === '/billing/' || returnTo === '/fin/billing/') meta.portal = returnTo;
    const body = {
      products: [productId],
      external_customer_id: org,
      metadata: meta,
      success_url: this.successFor(returnTo),
    };
    const r = await this.api<{ id: string; url: string }>('POST', '/v1/checkouts/', body);
    if (!r?.url) throw new Error('Polar did not return a checkout URL');
    return { id: r.id, url: r.url };
  }

  /**
   * The hosted invoice PDF for a paid order. Polar is the merchant of record and issues the real invoice; we
   * ask it to generate one (a repeat ask is harmless) and poll briefly for the signed URL so our receipt email
   * can link straight to it. Returns null if it isn't ready quickly or the order has no invoice — the receipt
   * then simply leaves out the download button and points at the billing page instead.
   */
  async invoiceUrl(orderId: string): Promise<string | null> {
    if (!this.token || !orderId) return null;
    const path = `/v1/orders/${encodeURIComponent(orderId)}/invoice`;
    await this.api('POST', path).catch(() => null); // generate (idempotent; already-generated just errors, ignored)
    for (let i = 0; i < 5; i++) {
      const r = await this.api<{ url?: string }>('GET', path).catch(() => null);
      if (r?.url) return r.url;
      await new Promise((res) => setTimeout(res, 900));
    }
    return null;
  }

  private async getProduct(id: string): Promise<RawProduct | null> {
    return this.api<RawProduct>('GET', `/v1/products/${encodeURIComponent(id)}`);
  }

  private describe(p: RawProduct): PolarProduct {
    const md = p.metadata ?? {};
    const credits = num(md.credits);
    const verifications = num(md.verifications);
    const price = p.prices?.find((x) => !x.is_archived) ?? p.prices?.[0];
    const kind: PolarProduct['kind'] = credits != null ? 'credits' : verifications != null ? 'plan' : 'other';
    return {
      id: p.id,
      name: p.name,
      kind,
      amount: credits ?? verifications,
      priceAmount: num(price?.price_amount),
      currency: str(price?.price_currency) ?? 'usd',
      recurring: !!p.is_recurring,
    };
  }

  /* ---------------------------------------------------------------- webhook -- */

  /**
   * Verify a webhook and return the parsed event, or null if the signature does not check out. Verification is
   * the Standard Webhooks scheme Polar uses: HMAC-SHA256 over `{id}.{timestamp}.{raw body}`, base64. We verify
   * with svix first (the library already in the tree); if the secret's encoding trips it up we fall back to a
   * manual check that tries the secret both as raw bytes and base64-decoded, so a correct Polar signature is
   * never wrongly rejected, while a forged one (no secret) still fails every path. The raw body must be the
   * exact bytes received: parsing and re-serialising would change them and break the signature.
   */
  verify(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>): PolarEvent | null {
    if (!this.secret) return null;
    const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const h = this.lowerHeaders(headers);
    const id = h['webhook-id'] ?? h['svix-id'];
    const ts = h['webhook-timestamp'] ?? h['svix-timestamp'];
    const sig = h['webhook-signature'] ?? h['svix-signature'];
    if (!id || !ts || !sig) return null;
    // Reject anything older than five minutes: a captured call can't be replayed later.
    const skew = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(skew) || skew > 300) {
      this.log.warn('webhook rejected: timestamp outside the allowed window');
      return null;
    }

    let ok = false;
    // Polar issues the secret in the standard "whsec_<base64>" form; svix strips the prefix and base64-decodes
    // it to the HMAC key. (If a raw secret is ever used instead, svix throws and the manual check below, which
    // also tries the secret as raw bytes, covers it.)
    try {
      const wh = new Webhook(this.secret);
      // svix reads the id/timestamp/signature values; the header names may be svix-* or webhook-*.
      wh.verify(raw, { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig });
      ok = true;
    } catch {
      ok = this.manualVerify(raw, id, ts, sig);
    }
    if (!ok) {
      this.log.warn('webhook rejected: signature did not verify');
      return null;
    }

    try {
      const body = JSON.parse(raw) as { type?: string; data?: Record<string, unknown> };
      return { id, type: body.type ?? '', data: body.data ?? {} };
    } catch {
      return null;
    }
  }

  /** Manual Standard Webhooks check, trying the two ways Polar's secret can be read, in constant time. */
  private manualVerify(raw: string, id: string, ts: string, header: string): boolean {
    const signed = `${id}.${ts}.${raw}`;
    const keys = [Buffer.from(this.secret, 'utf8')];
    try {
      keys.push(Buffer.from(this.secret.replace(/^whsec_/, ''), 'base64'));
    } catch {
      /* not base64: the utf8 key stands alone */
    }
    // The header is a space-separated list of "v1,<base64 signature>" entries; any match passes.
    const given = header.split(' ').map((p) => (p.includes(',') ? p.split(',')[1] : p));
    for (const key of keys) {
      const mine = createHmac('sha256', key).update(signed).digest('base64');
      const mineBuf = Buffer.from(mine);
      for (const g of given) {
        const gb = Buffer.from(g);
        if (gb.length === mineBuf.length && timingSafeEqual(gb, mineBuf)) return true;
      }
    }
    return false;
  }

  private lowerHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
    return out;
  }

  /* ------------------------------------------------------------------- http -- */

  private async api<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Never log the token; the status and Polar's message are enough to diagnose.
      this.log.error(`Polar ${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
      throw new Error(`Polar API ${res.status}`);
    }
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }
}

/* The slices of Polar's product shape we read (its API returns much more). */
type RawPrice = { price_amount?: number; price_currency?: string; is_archived?: boolean };
type RawProduct = {
  id: string;
  name: string;
  is_archived?: boolean;
  is_recurring?: boolean;
  metadata?: Record<string, unknown>;
  prices?: RawPrice[];
};
