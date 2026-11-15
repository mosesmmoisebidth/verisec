import { BadRequestException, Body, Controller, Get, HttpException, HttpStatus, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { fetch } from 'undici';

import { clientIp } from './client-ip';
import { IntelClient } from './intel.client';
import { KycService } from './kyc.service';
import { catalogForClient, looksLikeJwe, PG_BY_ID } from './playground.catalog';
import type { Param } from './playground.catalog';
import { RateLimiter } from './stores';
import { OperatorGuard } from './verifications.controller';
import { CreditsRefused, CreditsService } from './credits.service';
import { KeyServiceClient } from './key-service.client';
import { KeysGuard, type KeysRequest } from './keys.controller';
import { Need, NeedGuard } from '../auth/roles';

/**
 * The API Playground proxy for signed-in operators. It runs the sellable APIs end to end encrypted:
 *  - the browser sends the request body with every image as a JWE (encrypted next to the operator);
 *  - this proxy turns each JWE into an opaque vault token (`/v1/vault/documents`), so it never holds a plaintext image;
 *  - the API is called over post-quantum mTLS (or, for Contact & risk, the same checks the AML Explorer uses),
 *  - and the answer comes back in the API's own envelope: ok, request_id, latency_ms, data, warnings, error.
 * Only the endpoint ids in the catalog can be run; nothing here forwards an arbitrary path.
 *
 * Every run is made AS one of the account's API keys, through the API gateway, exactly like a customer's server: the
 * key's permissions, rate limit, IP allow-list, expiry, spend cap and the account's credits all apply, and a refusal
 * comes back as the gateway wrote it. (A machine without the gateway, a developer's, runs directly and still takes
 * the account's credits.)
 */

/** Internal labels that name the tools behind a result never reach the browser. */
export function withoutSources(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutSources);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k !== 'source' && k !== 'data_source') out[k] = withoutSources(x);
    return out;
  }
  return v;
}

type Slot = { get: () => unknown; set: (v: unknown) => void; label: string };

/** Every place an image sits in a body, following a pattern: "image", "frames[]", "gallery[].image", "images[].data". */
function slots(body: Record<string, unknown>, pattern: string): Slot[] {
  let cur: { holder: Record<string | number, unknown>; key: string | number; label: string }[] = [{ holder: { root: body }, key: 'root', label: '' }];
  for (const part of pattern.split('.')) {
    const many = part.endsWith('[]');
    const key = many ? part.slice(0, -2) : part;
    const next: typeof cur = [];
    for (const c of cur) {
      const obj = c.holder[c.key];
      if (!obj || typeof obj !== 'object') continue;
      const child = (obj as Record<string, unknown>)[key];
      const label = c.label ? `${c.label}.${key}` : key;
      if (!many) next.push({ holder: obj as Record<string, unknown>, key, label });
      else if (Array.isArray(child)) child.forEach((_, i) => next.push({ holder: child as unknown as Record<number, unknown>, key: i, label: `${label}[${i}]` }));
    }
    cur = next;
  }
  return cur.map((c) => ({ get: () => c.holder[c.key], set: (v) => (c.holder[c.key] = v), label: c.label }));
}

function getPath(body: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), body);
}

const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** A validation answer from the API (FastAPI's `detail`), as one readable sentence that names the field. */
export function validationError(env: Record<string, unknown>): { code: string; message: string } | null {
  const detail = env.detail;
  if (!Array.isArray(detail) || !detail.length) return null;
  const d = detail[0] as { loc?: unknown[]; msg?: string };
  const where = (d.loc ?? []).filter((x) => x !== 'body').join('.');
  return { code: 'invalid_input', message: `${where ? `${where}: ` : ''}${d.msg ?? 'This value is not accepted.'}` };
}

@Controller('api/playground')
@UseGuards(OperatorGuard, NeedGuard)
// what the person's role must allow (auth/roles.ts)
@Need('playground')
export class PlaygroundController {
  private readonly limiter = new RateLimiter();
  private readonly log = new Logger('Playground');

  /** One line per run: where the time went (image uploads, then the API itself). */
  private timing(id: string, uploadMs: number, apiMs: number, images: number) {
    this.log.log(`${id}: upload ${uploadMs} ms (${images} image${images === 1 ? '' : 's'}), api ${apiMs} ms, total ${uploadMs + apiMs} ms`);
  }

  /** The API gateway on this machine (unset on a developer's machine). */
  private readonly gateway: string;

  constructor(
    private readonly intel: IntelClient,
    private readonly kyc: KycService,
    private readonly keys: KeyServiceClient,
    private readonly credits: CreditsService,
    config: ConfigService,
  ) {
    this.gateway = (config.get<string>('GATEWAY_URL') ?? '').replace(/\/$/, '');
  }

  /** The catalog the Playground renders: groups, endpoints, request fields, example responses and how-to guides. */
  @Get('catalog')
  catalog() {
    return { groups: catalogForClient() };
  }

  /** The public key the operator's browser encrypts an image with before it is run (JWKS). The private half never
   *  leaves OpenBao; the operator never sends a plaintext image. */
  @Get('upload-key')
  async uploadKey() {
    const env = await this.intel.get<{ keys: unknown[] }>('/v1/vault/upload-key');
    if (!env.ok || !env.data?.keys) throw new HttpException('We cannot accept images right now. Please try again.', HttpStatus.BAD_GATEWAY);
    return env.data;
  }

  @Post('run')
  @UseGuards(KeysGuard)
  async run(@Body() dto: { id?: unknown; body?: unknown; keyId?: unknown }, @Req() req: Request) {
    const ep = typeof dto?.id === 'string' ? PG_BY_ID.get(dto.id) : undefined;
    if (!ep) throw new BadRequestException('Unknown endpoint.');
    const keyId = typeof dto.keyId === 'string' && /^key_[A-Za-z0-9]{8,32}$/.test(dto.keyId) ? dto.keyId : null;
    if (this.gateway && !keyId) throw new BadRequestException('Choose the API key to run this with.');
    const who = (req as KeysRequest).keyCaller!;
    if (!this.limiter.take(`pg:${clientIp(req)}`, 60, 60 * 60_000)) {
      throw new HttpException('Too many runs. Please wait a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const body = (dto.body && typeof dto.body === 'object' && !Array.isArray(dto.body) ? dto.body : {}) as Record<string, unknown>;

    // required fields (lists by their own bounds)
    for (const p of ep.params as Param[]) {
      const v = getPath(body, p.path ?? p.name);
      if (p.kind === 'images' && p.list) {
        const n = Array.isArray(v) ? v.length : 0;
        if ((p.required || n) && (n < p.list.min || n > p.list.max)) {
          throw new BadRequestException(`${p.label}: send ${p.list.min === p.list.max ? p.list.min : `${p.list.min} to ${p.list.max}`} ${p.list.itemLabel}s.`);
        }
        continue;
      }
      if (p.required && empty(v)) throw new BadRequestException(`${p.label} is required.`);
    }

    // every image arrives as a JWE (encrypted in the browser) and leaves as a vault token
    const found = (ep.images ?? []).flatMap((pattern) => slots(body, pattern));
    for (const s of found) {
      const v = s.get();
      if (!empty(v) && !looksLikeJwe(v)) throw new BadRequestException(`${s.label} must be an encrypted image.`);
    }
    // Each upload is bounded and retried once (the vault only stores ciphertext, so a retry is safe): a stalled
    // upload used to hold the run for up to a minute.
    const resolve = async (jwe: string): Promise<string> => {
      for (const ms of [15_000, 30_000]) {
        const r = await this.intel.post<{ token: string }>('/v1/vault/documents', { jwe }, ms);
        if (r.ok && r.data?.token) return r.data.token;
      }
      throw new HttpException('We could not receive the image. Please try again.', HttpStatus.BAD_GATEWAY);
    };
    const t0 = Date.now();
    // several images (a match pair, a gallery) upload together, four at a time
    const pending = found.filter((s) => looksLikeJwe(s.get()));
    for (let i = 0; i < pending.length; i += 4) {
      await Promise.all(pending.slice(i, i + 4).map(async (s) => s.set(await resolve(s.get() as string))));
    }
    const upload_ms = Date.now() - t0;

    const started = Date.now();
    const request_id = `req_${randomBytes(10).toString('hex')}`;
    const caller = clientIp(req).replace(/^::ffff:/, '');

    // through the gateway, as the chosen key
    if (this.gateway && keyId) {
      const token = await this.keys.playgroundToken(who, keyId);
      let status = 0;
      let j: Record<string, any> | null = null;
      try {
        const r = await fetch(`${this.gateway}${ep.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Forwarded-For': caller },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout((ep.timeoutMs ?? 45_000) + 30_000),
        });
        status = r.status;
        j = (await r.json().catch(() => null)) as Record<string, any> | null;
      } catch {
        j = null;
      }
      const latency_ms = Date.now() - started;
      this.timing(ep.id, upload_ms, latency_ms, pending.length);
      return {
        ok: status >= 200 && status < 300 && !!j?.ok,
        status,
        request_id: typeof j?.request_id === 'string' ? j.request_id : request_id,
        latency_ms,
        upload_ms,
        data: withoutSources(j?.data ?? null),
        warnings: Array.isArray(j?.warnings) ? j.warnings : [],
        error: j?.error ?? (status >= 200 && status < 300 ? null : { code: 'unavailable', message: 'The API did not answer. Please try again.' }),
      };
    }

    // no gateway on this machine: run directly, taking the account's credits the same way (given back on failure)
    const price = await this.keys.price(who, ep.id).catch(() => null);
    let reservation: string | null = null;
    if (price && price.price > 0) {
      try {
        reservation = await this.credits.reserve(who.org, {
          product: price.product, item: ep.id, label: price.label, price: price.price, keyId, requestId: request_id,
          actor: who.actor, note: `${price.label} API call (Playground)`,
        });
      } catch (e) {
        if (e instanceof CreditsRefused) return { ok: false, status: 402, request_id, latency_ms: 0, upload_ms, data: null, warnings: [], error: { code: e.reason, message: e.message } };
        throw e;
      }
    }
    const giveBack = async (ok: boolean) => {
      if (reservation && !ok) await this.credits.refund(reservation, price!.price).catch(() => undefined);
    };
    if (ep.run) {
      const r = await ep.run(body, { intel: this.intel, kyc: this.kyc });
      const latency_ms = Date.now() - started;
      this.timing(ep.id, upload_ms, latency_ms, pending.length);
      await giveBack(r.ok);
      return { ok: r.ok, request_id, latency_ms, upload_ms, data: withoutSources(r.data ?? null), warnings: r.warnings ?? [], error: r.error ?? null };
    }
    // the engine sees this service as its client; it reports the address the request really came from instead
    const env = (await this.intel.post(ep.path, body, ep.timeoutMs ?? 45_000, caller ? { 'X-VeriSec-Caller-IP': caller } : {})) as Record<string, any>;
    const latency_ms = Date.now() - started;
    this.timing(ep.id, upload_ms, latency_ms, pending.length);
    const invalid = validationError(env);
    await giveBack(!invalid && !!env.ok);
    if (invalid) return { ok: false, request_id, latency_ms, upload_ms, data: null, warnings: [], error: invalid };
    return {
      ok: !!env.ok,
      request_id: typeof env.request_id === 'string' ? env.request_id : request_id,
      latency_ms,
      upload_ms,
      data: withoutSources(env.data ?? null),
      warnings: Array.isArray(env.warnings) ? env.warnings : [],
      error: env.error ?? null,
    };
  }
}
