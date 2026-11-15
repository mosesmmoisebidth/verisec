import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetch } from 'undici';

/**
 * Fingerprint (fingerprint.com) device identity for the public landing-page demo.
 *
 * The browser loads the Fingerprint Pro agent with the PUBLIC key and sends us only a one-time
 * `requestId`. We never trust the browser's own visitorId: this client asks Fingerprint's Server
 * API, with the SECRET key, for the event behind that requestId and reads the authoritative
 * visitorId and its smart signals (VPN, proxy, Tor, bot, incognito). The visitorId is stable for a
 * device across VPN switches, incognito windows and cleared cookies, so the demo's per-device limit
 * cannot be reset by hiding the IP.
 *
 * Never throws: any failure (no key, Fingerprint unreachable, unknown requestId, stale event) comes
 * back as `{ ok: false }`, and the caller falls back to limiting by IP address instead.
 */

export type FpVerdict = {
  /** The server confirmed a fresh event for this requestId. */
  ok: boolean;
  /** The authoritative device id from Fingerprint's servers (never the browser's claim). */
  visitorId: string | null;
  /** Smart signals, when the plan provides them (undefined = not available / not checked). */
  bot?: boolean;
  vpn?: boolean;
  proxy?: boolean;
  tor?: boolean;
  incognito?: boolean;
  /** The IP Fingerprint saw the request come from. */
  ip?: string | null;
  /** Why verification did not succeed, for the attempt log (never shown to the visitor). */
  reason?: string;
};

/** Region -> Server API base. Matches the region the browser agent is loaded with. */
const REGION_BASE: Record<string, string> = {
  us: 'https://api.fpjs.io',
  global: 'https://api.fpjs.io',
  eu: 'https://eu.api.fpjs.io',
  ap: 'https://ap.api.fpjs.io',
};

/** A fresh identification is one seen in the last few minutes: a replayed old requestId is refused. */
const MAX_AGE_MS = 3 * 60_000;

@Injectable()
export class FingerprintClient {
  private readonly log = new Logger('Fingerprint');
  private readonly secret: string;
  private readonly region: string;
  private readonly base: string;

  constructor(config: ConfigService) {
    this.secret = (config.get<string>('FP_SECRET_KEY') ?? '').trim();
    this.region = (config.get<string>('FP_REGION') ?? 'us').trim().toLowerCase();
    this.base = REGION_BASE[this.region] ?? REGION_BASE.us;
    this.log.log(this.secret ? `device identity on (region ${this.region})` : 'device identity off (no FP_SECRET_KEY)');
  }

  /** Whether server-side verification is configured. When off, the demo limits by IP alone. */
  get enabled(): boolean {
    return !!this.secret;
  }

  /**
   * Verify a one-time requestId. Returns the authoritative visitorId and the device's smart signals.
   * `clientIp` is only used to note a mismatch in the log; it does not refuse on its own (a corporate
   * proxy or mobile network can legitimately differ).
   */
  async verify(requestId: unknown, clientIp?: string): Promise<FpVerdict> {
    if (!this.secret) return { ok: false, visitorId: null, reason: 'not_configured' };
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9._-]{8,120}$/.test(requestId)) {
      return { ok: false, visitorId: null, reason: 'bad_request_id' };
    }
    let body: FpEvent | null = null;
    try {
      const r = await fetch(`${this.base}/events/${encodeURIComponent(requestId)}`, {
        headers: { 'Auth-API-Key': this.secret, Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
      if (r.status === 404) return { ok: false, visitorId: null, reason: 'unknown_request_id' };
      if (!r.ok) {
        this.log.warn(`server API answered ${r.status}`);
        return { ok: false, visitorId: null, reason: `http_${r.status}` };
      }
      body = (await r.json().catch(() => null)) as FpEvent | null;
    } catch (e) {
      this.log.warn(`could not reach the server API (${(e as Error).message})`);
      return { ok: false, visitorId: null, reason: 'unreachable' };
    }

    const ident = body?.products?.identification?.data;
    const visitorId = typeof ident?.visitorId === 'string' ? ident.visitorId : null;
    if (!visitorId) return { ok: false, visitorId: null, reason: 'no_visitor' };

    // the event must be for this very requestId and recent (an old or replayed id is refused)
    if (ident?.requestId && ident.requestId !== requestId) return { ok: false, visitorId, reason: 'request_id_mismatch' };
    const ts = Number(ident?.timestamp ?? 0);
    if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_MS) return { ok: false, visitorId, reason: 'stale' };

    const p = body?.products ?? {};
    const seenIp = typeof ident?.ip === 'string' ? ident.ip : null;
    if (clientIp && seenIp && seenIp !== clientIp.replace(/^::ffff:/, '')) {
      this.log.debug(`ip differs: agent saw ${seenIp}, request from ${clientIp}`);
    }
    return {
      ok: true,
      visitorId,
      bot: p.botd?.data?.bot?.result != null ? p.botd!.data!.bot!.result === 'bad' : undefined,
      vpn: p.vpn?.data?.result ?? undefined,
      proxy: p.proxy?.data?.result ?? undefined,
      tor: p.tor?.data?.result ?? undefined,
      incognito: ident?.incognito ?? undefined,
      ip: seenIp,
    };
  }
}

/** The slice of Fingerprint's Server API event we read (every field optional across plans). */
type FpEvent = {
  products?: {
    identification?: { data?: { visitorId?: string; requestId?: string; timestamp?: number; ip?: string; incognito?: boolean } };
    botd?: { data?: { bot?: { result?: string } } };
    vpn?: { data?: { result?: boolean } };
    proxy?: { data?: { result?: boolean } };
    tor?: { data?: { result?: boolean } };
  };
};
