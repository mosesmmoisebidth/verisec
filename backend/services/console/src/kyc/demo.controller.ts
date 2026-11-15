import { BadRequestException, Body, Controller, Get, HttpCode, HttpException, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

import { CaptchaService } from '../auth/captcha.service';
import { clientIp } from './client-ip';
import { DEMO_BY_ID, demoApisForClient, type DemoApi } from './demo.catalog';
import { DemoStore } from './demo.store';
import { FingerprintClient, type FpVerdict } from './fingerprint.client';
import { IntelClient } from './intel.client';
import { curate } from './demo.curate';
import { looksLikeJwe } from './playground.catalog';
import { validationError } from './playground.controller';

/**
 * The public demo behind the landing page. A guest, with no account, runs one of a fixed set of APIs
 * on one uploaded image. Every call passes one gate so it cannot be bypassed from the browser:
 *   1. a human check (Cloudflare Turnstile),
 *   2. a device check (Fingerprint): we verify the one-time requestId on Fingerprint's servers and
 *      take the authoritative, VPN-stable device id; a device flagged as a bot is refused,
 *   3. a durable per-device, per-API daily limit (and a looser per-network cap as a backstop),
 *   4. an attempt log, so an abuser switching VPNs or hiding the device agent can still be seen.
 * The limit is keyed to the device, not the IP, so a new VPN exit does not hand out a fresh demo.
 */
@Controller('api/demo')
export class DemoController {
  private readonly log = new Logger('Demo');
  private readonly total: number;
  private readonly perBlock: number;
  private readonly fpKey: string;
  private readonly fpRegion: string;
  private readonly micrBase: string;
  private readonly cardBase: string;
  private readonly alprBase: string;
  /** This server's own addresses (its test scripts): they may run without a browser's device check. */
  private readonly trusted: Set<string>;
  /** Signs the visit pass: one human + device check per visit, not per run. */
  private readonly passKey: Buffer;
  /** Per-network daily safety ceiling for checks outside the free-run budget (stops bots, never people). */
  private readonly openCeiling: number;

  constructor(
    private readonly intel: IntelClient,
    private readonly captcha: CaptchaService,
    private readonly fp: FingerprintClient,
    private readonly store: DemoStore,
    config: ConfigService,
  ) {
    // One pool of free runs per device, shared across every check (not per check).
    this.total = Math.max(1, Number(config.get('DEMO_TOTAL_LIMIT') ?? config.get('DEMO_PER_API_LIMIT') ?? 4));
    this.perBlock = Math.max(this.total, Number(config.get('DEMO_PER_BLOCK_LIMIT') ?? 40));
    this.fpKey = (config.get<string>('FP_PUBLIC_KEY') ?? '').trim();
    this.fpRegion = (config.get<string>('FP_REGION') ?? 'us').trim().toLowerCase();
    this.micrBase = (config.get<string>('DEMO_MICR_BASE') ?? 'http://127.0.0.1:8061').replace(/\/+$/, '');
    this.cardBase = (config.get<string>('DEMO_CARD_BASE') ?? 'http://127.0.0.1:8062').replace(/\/+$/, '');
    this.alprBase = (config.get<string>('DEMO_ALPR_BASE') ?? 'http://127.0.0.1:8063').replace(/\/+$/, '');
    this.trusted = new Set((config.get<string>('TURNSTILE_TRUSTED_IPS') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    this.passKey = Buffer.from((config.get<string>('DEMO_PASS_SECRET') ?? '').trim() || randomBytes(32).toString('hex'));
    this.openCeiling = Math.max(1, Number(config.get('DEMO_OPEN_CEILING') ?? 300));
  }

  /** What the browser needs to render and run the demo. The Fingerprint PUBLIC key is safe to send. */
  @Get('config')
  config() {
    return {
      fingerprint: this.fp.enabled && this.fpKey ? { key: this.fpKey, region: this.fpRegion } : null,
      turnstile: this.captcha.enabled,
      limit: this.total,
      products: demoApisForClient(),
    };
  }

  /** The browser's public key for encrypting an image before it is sent (JWKS, same as the Playground). */
  @Get('upload-key')
  async uploadKey() {
    const env = await this.intel.get<{ keys: unknown[] }>('/v1/vault/upload-key');
    if (!env.ok || !env.data?.keys) throw new HttpException('We cannot accept images right now. Please try again.', HttpStatus.BAD_GATEWAY);
    return env.data;
  }

  /** How many runs this device has left on each demo API today (no run is counted). */
  @Post('quota')
  @HttpCode(200)
  async quota(@Body() dto: { fpRequestId?: unknown }, @Req() req: Request) {
    const ip = clientIp(req);
    const { subjects } = await this.identify(dto?.fpRequestId, ip);
    return { limit: this.total, remaining: await this.remaining(subjects) };
  }

  @Post('run')
  @HttpCode(200)
  async run(@Body() dto: { api?: unknown; fpRequestId?: unknown; body?: unknown; pass?: unknown }, @Req() req: Request) {
    const received = Date.now();
    const ip = clientIp(req);
    const ua = (req.headers['user-agent'] as string) ?? null;
    const block = networkBlock(ip);

    const def = typeof dto?.api === 'string' ? DEMO_BY_ID.get(dto.api) : undefined;

    // A visit pass (signed by us after this browser passed the human and device checks, bound to its address,
    // valid 30 minutes) stands in for both checks, so a visitor solves them once per visit and not on every run.
    // The free-run counting below is the same either way.
    const passed = this.readPass(dto?.pass, ip);
    let verdict: FpVerdict;
    let subjects: string[];
    let visitorId: string | null;
    if (passed) {
      if (!def) throw new BadRequestException('Unknown demo.');
      visitorId = passed.v;
      subjects = [...(visitorId ? [`v:${visitorId}`] : []), `ip:${addressKey(ip)}`];
      verdict = { ok: !!visitorId, visitorId, reason: 'visit_pass' };
    } else {
      // 1. human check (no-op when Turnstile is off; throws on a bad token)
      await this.captcha.check(req.headers['x-captcha-token'], 'demo', ip);
      if (!def) throw new BadRequestException('Unknown demo.');
      // 2. device check
      const id = await this.identify(dto?.fpRequestId, ip);
      verdict = id.verdict;
      subjects = id.subjects;
      visitorId = id.visitorId;
      // A browser that blocks the device check (an ad or tracker blocker, a privacy setting, a script that failed
      // to load) is not refused: the run still needed the human check and counts on the address and its block.
      if (id.deviceMissing) this.log.warn(`device check missing (${verdict.reason ?? 'unknown'}); counting by address`);
    }
    const base = { api: def.id, visitorId, ip, ipBlock: block, vpn: verdict.vpn, proxy: verdict.proxy, tor: verdict.tor, incognito: verdict.incognito, bot: verdict.bot, ua } as const;
    if (verdict.ok && verdict.bot) {
      this.store.logAttempt({ ...base, outcome: 'blocked_bot' });
      throw new HttpException({ code: 'automated', message: 'This demo is for people. Automated use is not allowed.' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    // a new browser behind a VPN would be a new device on a new address: the free demo needs the real connection
    if (verdict.ok && (verdict.vpn || verdict.proxy || verdict.tor)) {
      this.store.logAttempt({ ...base, outcome: 'blocked_vpn' });
      throw new HttpException(
        { code: 'vpn_blocked', message: 'Turn off your VPN or proxy to use the free demo, or create a free account to keep going.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. one shared daily limit, counted on the device AND on the address at once: a new browser on the same
    //    connection, or the same browser on a new connection, finds the runs already used. Then a looser
    //    per-network backstop.
    // A check outside the budget (ALPR / ANPR) uses no free runs: only a high per-network safety ceiling of its own.
    const open = !!def.unlimited;
    if (open) {
      const c = await this.store.take(`ipb:${block}`, def.id, this.openCeiling);
      if (!c.allowed) {
        if (c.failed) throw this.unavailable();
        this.store.logAttempt({ ...base, outcome: 'blocked_limit' });
        throw new HttpException(
          { code: 'busy', message: 'This network has made a very large number of runs today. Please try again tomorrow.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } else {
      const taken: string[] = [];
      for (const s of subjects) {
        const t = await this.store.take(s, '*', this.total);
        if (!t.allowed) {
          for (const back of taken) await this.store.giveBack(back, '*');
          if (t.failed) throw this.unavailable();
          this.store.logAttempt({ ...base, outcome: 'blocked_limit' });
          throw this.limitReached();
        }
        taken.push(s);
      }
      const blk = await this.store.take(`ipb:${block}`, '*', this.perBlock);
      if (!blk.allowed) {
        for (const back of taken) await this.store.giveBack(back, '*');
        if (blk.failed) throw this.unavailable();
        this.store.logAttempt({ ...base, outcome: 'blocked_limit' });
        throw this.limitReached('This network has used up the demo for now. Please try later.');
      }
    }
    // the checks passed: this browser keeps (or now gets) its visit pass
    const pass = passed ? (dto.pass as string) : this.issuePass(ip, visitorId);
    const giveBack = () => (open ? this.store.giveBack(`ipb:${block}`, def.id) : this.giveBackAll(subjects, block));

    // 4. run the engine; a failure on our side is given back so it does not cost the visitor a run
    const started = Date.now();
    let result: RunOut;
    try {
      result = def.transport === 'enc' ? await this.runEnc(def, dto?.body, ip) : await this.runFin(def, dto?.body);
    } catch (e) {
      await giveBack();
      // the visitor's input (bad or missing image): given back, and the visit pass still comes back with the answer
      if (e instanceof BadRequestException) {
        const msg = (e.getResponse() as { message?: unknown })?.message;
        throw new BadRequestException({ code: 'invalid', message: typeof msg === 'string' ? msg : e.message, pass });
      }
      this.log.warn(`${def.id}: ${(e as Error).message}`);
      this.store.logAttempt({ ...base, outcome: 'engine_error' });
      throw new HttpException({ code: 'unavailable', message: 'The demo could not run just now. Please try again.', pass }, HttpStatus.BAD_GATEWAY);
    }
    if (!result.reachable) {
      await giveBack();
      this.store.logAttempt({ ...base, outcome: 'engine_error' });
      throw new HttpException({ code: 'unavailable', message: 'The demo could not run just now. Please try again.', pass }, HttpStatus.BAD_GATEWAY);
    }

    this.store.logAttempt({ ...base, outcome: 'ok' });
    const left = await this.remaining(subjects);
    const engineMs = Date.now() - started;
    const data = curate(def.id, result.data ?? null);
    this.log.log(`${def.id}: checks ${started - received} ms, engine ${engineMs} ms, total ${Date.now() - received} ms`);
    return {
      ok: result.ok,
      api: def.id,
      latency_ms: engineMs,
      data,
      warnings: result.warnings ?? [],
      error: result.error ?? null,
      remaining: left,
      pass,
    };
  }

  /* ---------------------------------------------------------------- the visit pass -- */

  /** A pass for this browser on this address: who the device check said it is, and when it stops working. */
  private issuePass(ip: string, visitorId: string | null): string {
    const body = Buffer.from(JSON.stringify({ a: addressKey(ip), v: visitorId, e: Date.now() + PASS_MS })).toString('base64url');
    return `${body}.${createHmac('sha256', this.passKey).update(body).digest('base64url')}`;
  }

  /** The device a valid pass stands for, or null: a forged, expired or moved (other address) pass is ignored. */
  private readPass(raw: unknown, ip: string): { v: string | null } | null {
    if (typeof raw !== 'string' || raw.length > 600) return null;
    const dot = raw.indexOf('.');
    if (dot <= 0) return null;
    const body = raw.slice(0, dot);
    const want = createHmac('sha256', this.passKey).update(body).digest();
    const got = Buffer.from(raw.slice(dot + 1), 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { a?: unknown; v?: unknown; e?: unknown };
      if (typeof p.e !== 'number' || p.e < Date.now() || p.a !== addressKey(ip)) return null;
      return { v: typeof p.v === 'string' && p.v ? p.v : null };
    } catch {
      return null;
    }
  }

  /* ---------------------------------------------------------------- the two transports -- */

  /** Encrypted image (JWE) -> vault token -> identity engine over mTLS. The browser always sends the
   *  main image as `image` and an optional second side as `imageBack`; we place them at the engine's
   *  own field names so the browser never needs to know them. */
  private async runEnc(def: DemoApi, rawBody: unknown, ip: string): Promise<RunOut> {
    const incoming = (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : {}) as Record<string, unknown>;
    if (!looksLikeJwe(incoming.image)) throw new BadRequestException('Add a photo to run the demo.');
    if (def.pair && !looksLikeJwe(incoming.imageBack)) throw new BadRequestException('Add both photos to compare.');
    const body: Record<string, unknown> = { ...(def.extra ?? {}) };
    body[def.imageKey] = await this.toVaultToken(incoming.image);
    if (def.imageKey2 && looksLikeJwe(incoming.imageBack)) body[def.imageKey2] = await this.toVaultToken(incoming.imageBack as string);

    const caller = ip.replace(/^::ffff:/, '');
    const env = (await this.intel.post(def.path, body, def.timeoutMs ?? 45_000, caller ? { 'X-VeriSec-Caller-IP': caller } : {})) as Record<string, any>;
    if (env?.error?.code === 'unreachable' || env?.error?.code === 'no_identity' || env?.error?.code === 'bad_response') return { reachable: false, ok: false, data: null };
    const invalid = validationError(env);
    if (invalid) return { reachable: true, ok: false, data: null, error: invalid };
    return { reachable: true, ok: !!env.ok, data: env.data ?? null, warnings: Array.isArray(env.warnings) ? env.warnings : [], error: env.error ?? null };
  }

  /** Cheque or card photo (base64) -> multipart upload to the reading service. */
  private async runFin(def: DemoApi, rawBody: unknown): Promise<RunOut> {
    const incoming = (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : {}) as Record<string, unknown>;
    const bytes = decodeImage(incoming.image);
    if (!bytes) throw new BadRequestException('Add a photo to run the demo.');
    // the cheque and card readers take JPG, PNG and BMP only: anything else is refused here, by its real bytes, so a
    // visitor gets a clear answer and does not lose a free run (the browser already converts what it can)
    if (def.transport !== 'alpr') {
      const kind = classicImage(bytes.data);
      if (!kind) throw new BadRequestException('This photo format is not supported here. Please upload a JPG, PNG or BMP image.');
      bytes.type = kind;
    }

    const form = new FormData();
    form.append(def.imageKey, new Blob([new Uint8Array(bytes.data)], { type: bytes.type }), 'upload');
    for (const [k, v] of Object.entries(def.extra ?? {})) form.append(k, String(v));

    const engineBase = def.transport === 'micr' ? this.micrBase : def.transport === 'alpr' ? this.alprBase : this.cardBase;
    let res: Response;
    try {
      res = await fetch(`${engineBase}${def.path}`, {
        method: 'POST',
        body: form,
        headers: { 'X-VeriSec-Source': 'demo', 'X-VeriSec-Env': 'test' },
        signal: AbortSignal.timeout(def.timeoutMs ?? 120_000),
      });
    } catch (e) {
      this.log.warn(`${def.id}: reader unreachable (${(e as Error).message})`);
      return { reachable: false, ok: false, data: null };
    }
    const json = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (res.status >= 500 || json === null) return { reachable: false, ok: false, data: null };
    if (!res.ok) {
      const err = json?.error ?? { code: 'read_failed', message: 'The photo could not be read.' };
      return { reachable: true, ok: false, data: null, error: err };
    }
    return { reachable: true, ok: true, data: json, warnings: [] };
  }

  /* ---------------------------------------------------------------- helpers -- */

  private async toVaultToken(jwe: string): Promise<string> {
    for (const ms of [15_000, 30_000]) {
      const r = await this.intel.post<{ token: string }>('/v1/vault/documents', { jwe }, ms);
      if (r.ok && r.data?.token) return r.data.token;
    }
    throw new HttpException('We could not receive the image. Please try again.', HttpStatus.BAD_GATEWAY);
  }

  /**
   * Who is counting: the verified device (when the device check passed) AND the address, always both, so neither a
   * new browser nor a new connection alone resets the limit. IPv6 counts by its /64, since a device rotates the rest.
   */
  private async identify(
    fpRequestId: unknown,
    ip: string,
  ): Promise<{ verdict: Awaited<ReturnType<FingerprintClient['verify']>>; subjects: string[]; visitorId: string | null; deviceMissing: boolean }> {
    const verdict: FpVerdict = this.fp.enabled ? await this.fp.verify(fpRequestId, ip) : { ok: false, visitorId: null, reason: 'not_configured' };
    const visitorId = verdict.ok ? verdict.visitorId : null;
    const subjects = [`ip:${addressKey(ip)}`];
    if (visitorId) subjects.unshift(`v:${visitorId}`);
    // the browser sent no usable device id (blocked agent, forged or replayed id); not an outage on the check's side
    const deviceMissing = this.fp.enabled && !verdict.ok && !/^(unreachable|http_|not_configured)/.test(verdict.reason ?? '');
    return { verdict, subjects, visitorId, deviceMissing };
  }

  /** Runs left today: the fewest left on any of the visitor's subjects (none when the counts cannot be read). */
  private async remaining(subjects: string[]): Promise<number> {
    let left = this.total;
    for (const s of subjects) {
      const counts = await this.store.counts(s, ['*']);
      if (!counts) return 0;
      left = Math.min(left, this.total - (counts['*'] ?? 0));
    }
    return Math.max(0, left);
  }

  /** The run counter could not be reached: no run is given out uncounted. */
  private unavailable() {
    return new HttpException({ code: 'unavailable', message: 'The demo is unavailable right now. Please try again in a few minutes.' }, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private async giveBackAll(subjects: string[], block: string) {
    for (const s of subjects) await this.store.giveBack(s, '*');
    await this.store.giveBack(`ipb:${block}`, '*');
  }

  private limitReached(message = 'You have used all your free demo runs for today. Create a free account to keep going.') {
    return new HttpException({ code: 'demo_limit', message, remaining: 0 }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** How long a visit pass stands in for the human and device checks. */
const PASS_MS = 30 * 60_000;

type RunOut = {
  /** false: we could not reach the engine (our fault); the run is given back and not counted. */
  reachable: boolean;
  ok: boolean;
  data: unknown;
  error?: { code?: string; message?: string } | null;
  warnings?: string[];
};

/** The address a visitor is counted on: the IPv4 address itself, or the IPv6 /64 (one home or phone line). */
function addressKey(ip: string): string {
  const v = ip.replace(/^::ffff:/, '');
  if (isIP(v) === 6) return v.split(':').slice(0, 4).join(':') + '::/64';
  return v || 'unknown';
}

/** A coarse network block for the backstop cap and the attempt log: /24 for IPv4, /48 for IPv6. */
function networkBlock(ip: string): string {
  const v = ip.replace(/^::ffff:/, '');
  if (isIP(v) === 4) return v.split('.').slice(0, 3).join('.') + '.0/24';
  if (isIP(v) === 6) return v.split(':').slice(0, 3).join(':') + '::/48';
  return v || 'unknown';
}

/** Accept a data URL or bare base64; cap at 10 MB. */
/** JPG, PNG or BMP by the file's own first bytes (whatever the browser named it), else null. */
function classicImage(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  return null;
}

function decodeImage(v: unknown): { data: Buffer; type: string } | null {
  if (typeof v !== 'string' || !v) return null;
  let type = 'application/octet-stream';
  let b64 = v;
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(v);
  if (m) {
    if (m[1]) type = m[1];
    b64 = m[3];
  }
  let data: Buffer;
  try {
    data = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  if (!data.length || data.length > 10 * 1024 * 1024) return null;
  return { data, type };
}
