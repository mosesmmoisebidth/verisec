import {
  Body,
  Controller,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';

import { CreditsRefused, CreditsService } from './credits.service';
import { IntelClient } from './intel.client';
import { KeyServiceClient } from './key-service.client';
import { KycService } from './kyc.service';
import { PG_BY_ID } from './playground.catalog';
import { validationError, withoutSources } from './playground.controller';

/**
 * Whether a connection came from this machine: its address is one of the machine's own (the gateway runs on the host
 * network, and a local connection can arrive from any of the host's addresses, the public one included). An outside
 * caller cannot present one of these, and Caddy's container address is not one of them.
 */
function ownAddresses(): Set<string> {
  const out = new Set(['127.0.0.1', '::1']);
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) out.add(a.address);
  return out;
}
const fromThisMachine = (addr: string, own: Set<string>) => own.has(addr.replace(/^::ffff:/, ''));

/** The parts of the contact dossier, each priced as the API that does that part alone. */
const DOSSIER_PARTS: [string, string][] = [
  ['email', 'email.verify'],
  ['phone', 'phone.lookup'],
  ['ip', 'screen.ip'],
  ['screening', 'screen.sanctions'],
  ['wallet', 'screen.crypto'],
  ['accounts', 'email.footprint'],
  ['username', 'osint.username'],
  ['web', 'osint.web'],
];

/**
 * The gateway's side doors into the console, open only to the gateway itself: on this machine, and holding the token
 * only the gateway and the console know (anything else gets a plain 404, as if nothing were here).
 *   POST /api/internal/credits/reserve  take a call's price before it runs (402 when there are no credits)
 *   POST /api/internal/credits/refund   give it back when the call did not succeed (or the unused part)
 *   POST /api/gw/run/:id                run a contact and risk API the console itself implements
 */
@Controller('api')
export class GatewayController {
  private readonly log = new Logger('Gateway');
  private readonly token: Buffer;
  private own = ownAddresses();
  private ownAt = Date.now();

  constructor(
    private readonly credits: CreditsService,
    private readonly intel: IntelClient,
    private readonly kyc: KycService,
    private readonly keys: KeyServiceClient,
    config: ConfigService,
  ) {
    this.token = Buffer.from(config.get<string>('CREDITS_GATEWAY_TOKEN') ?? '');
  }

  private gate(req: Request, header: string) {
    const got = Buffer.from(String(req.headers[header] ?? ''));
    if (Date.now() - this.ownAt > 60_000) {
      this.own = ownAddresses();
      this.ownAt = Date.now();
    }
    const ok =
      this.token.length >= 32 &&
      got.length === this.token.length &&
      timingSafeEqual(got, this.token) &&
      fromThisMachine(req.socket?.remoteAddress ?? '', this.own);
    if (!ok) throw new NotFoundException();
  }

  @Post('internal/credits/reserve')
  @HttpCode(200)
  async reserve(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() b: Record<string, unknown>) {
    this.gate(req, 'x-verisec-credits-token');
    const org = typeof b.org === 'string' ? b.org : '';
    const price = Number(b.price);
    if (!org || !Number.isInteger(price) || price < 0 || typeof b.api !== 'string' || typeof b.product !== 'string') {
      res.status(400);
      return { code: 'invalid_input', message: 'A reservation needs an account, an API, a product and a price.' };
    }
    const label = typeof b.label === 'string' && b.label ? b.label : b.api;
    try {
      const reservation = await this.credits.reserve(org, {
        product: b.product,
        item: b.api,
        label,
        price,
        keyId: typeof b.key_id === 'string' ? b.key_id : null,
        spendCap: Number.isInteger(b.spend_cap) ? (b.spend_cap as number) : null,
        requestId: typeof b.request_id === 'string' ? b.request_id.slice(0, 64) : undefined,
        // where the call came from: the API with a key, the Playground, or the Financial portal's own pages
        note: b.portal === true ? `${label} (Financial portal)` : `${label} API call${b.playground === true ? ' (Playground)' : ''}`,
      });
      return { reservation };
    } catch (e) {
      if (e instanceof CreditsRefused) {
        res.status(402);
        return { code: e.reason, message: e.message };
      }
      throw e;
    }
  }

  @Post('internal/credits/refund')
  @HttpCode(200)
  async refund(@Req() req: Request, @Body() b: Record<string, unknown>) {
    this.gate(req, 'x-verisec-credits-token');
    const id = typeof b.reservation === 'string' && /^\d{1,18}$/.test(b.reservation) ? b.reservation : null;
    const amount = Number(b.amount);
    if (!id || !Number.isFinite(amount) || amount <= 0) return { ok: false };
    await this.credits.refund(id, amount);
    return { ok: true };
  }

  /**
   * A KYC API run for the gateway, for the account the key belongs to: the contact and risk checks the console runs
   * itself, every other one on the engines. Either way the answer leaves without engine-internal fields.
   */
  @Post('gw/run/:id')
  @HttpCode(200)
  async run(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('id') id: string, @Body() body: unknown) {
    this.gate(req, 'x-verisec-gateway');
    const ep = PG_BY_ID.get(id);
    if (!ep) throw new NotFoundException();
    const org = String(req.headers['x-verisec-org'] ?? '');
    const started = Date.now();
    const input = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    let r: { ok: boolean; data: unknown; error?: { code?: string; message?: string } | null; warnings?: string[] };
    if (ep.run) r = await ep.run(input, { intel: this.intel, kyc: this.kyc });
    else {
      // the engine reports the address the call really came from (the gateway passes the caller's)
      const caller = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
      const env = (await this.intel.post(ep.path, input, ep.timeoutMs ?? 45_000, caller ? { 'X-VeriSec-Caller-IP': caller } : {})) as Record<string, any>;
      const invalid = validationError(env);
      r = invalid
        ? { ok: false, data: null, error: invalid }
        : { ok: !!env.ok, data: env.data ?? null, warnings: Array.isArray(env.warnings) ? env.warnings : [], error: env.error ?? null };
    }
    if (id === 'verify.contact' && r.ok) {
      // charged for the parts that ran and answered; the gateway gives back the rest of its reservation
      const prices = new Map((await this.keys.apis({ org, actor: 'gateway', role: 'viewer', mfa: false })).map((a) => [a.id, a.price]));
      const data = (r.data ?? {}) as Record<string, unknown>;
      let used = 0;
      for (const [part, api] of DOSSIER_PARTS) {
        const v = data[part] as Record<string, unknown> | null | undefined;
        if (v && typeof v === 'object' && !('error' in v)) used += prices.get(api) ?? 0;
      }
      res.setHeader('X-VeriSec-Charge', String(used));
    }
    // a run that did not succeed is not a 2xx, so the gateway gives its price back
    if (!r.ok) res.status(r.error?.code === 'invalid_input' ? 400 : 502);
    return {
      ok: r.ok,
      request_id: `req_${String(req.headers['x-request-id'] ?? '').slice(0, 20)}`,
      latency_ms: Date.now() - started,
      data: withoutSources(r.data ?? null),
      warnings: r.warnings ?? [],
      error: r.error ?? null,
    };
  }
}
