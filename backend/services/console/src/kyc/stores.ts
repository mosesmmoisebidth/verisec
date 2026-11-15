import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { currentSid } from './session.context';

/**
 * In-memory stores for the applicant contact checks. Process-local on purpose
 * for now (single Console API instance); move to Redis before running more
 * than one instance.
 */

/** Sliding-window limiter. `take` records a hit and says whether it is allowed. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  take(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 50_000) this.sweep(windowMs);
    return true;
  }

  private sweep(windowMs: number) {
    const now = Date.now();
    for (const [k, v] of this.hits) if (!v.some((t) => now - t < windowMs)) this.hits.delete(k);
  }
}

/** A map whose entries expire. */
export class TtlMap<V> {
  private readonly m = new Map<string, { v: V; exp: number }>();
  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.m.delete(key);
      return undefined;
    }
    return e.v;
  }

  set(key: string, v: V) {
    this.m.set(key, { v, exp: Date.now() + this.ttlMs });
    if (this.m.size > 50_000) {
      const now = Date.now();
      for (const [k, e] of this.m) if (now > e.exp) this.m.delete(k);
    }
  }

  delete(key: string) {
    this.m.delete(key);
  }
}

export type OtpVerdict = 'ok' | 'wrong' | 'expired' | 'locked' | 'missing';

/**
 * Email one-time codes. Only a salted hash is kept, never the code itself;
 * codes expire and lock after too many wrong guesses.
 */
export class OtpStore {
  private readonly salt = randomBytes(16).toString('hex');
  private readonly m = new Map<string, { hash: Buffer; exp: number; attempts: number }>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxAttempts = 5,
  ) {}

  issue(key: string): string {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.m.set(key, { hash: this.hash(key, code), exp: Date.now() + this.ttlMs, attempts: 0 });
    return code;
  }

  verify(key: string, code: string): OtpVerdict {
    const e = this.m.get(key);
    if (!e) return 'missing';
    if (Date.now() > e.exp) {
      this.m.delete(key);
      return 'expired';
    }
    if (e.attempts >= this.maxAttempts) return 'locked';
    e.attempts++;
    const ok = timingSafeEqual(e.hash, this.hash(key, code.trim()));
    if (ok) this.m.delete(key);
    return ok ? 'ok' : e.attempts >= this.maxAttempts ? 'locked' : 'wrong';
  }

  private hash(key: string, code: string): Buffer {
    return createHash('sha256').update(`${this.salt}:${key}:${code}`).digest();
  }
}

/**
 * Signed, expiring proof that a phone/email passed its one-time code. HMAC over
 * `channel|value|expiry` with KYC_TOKEN_SECRET, so it survives API restarts and
 * cannot be forged or moved to another number/address by the browser.
 */
export class VerificationTokens {
  constructor(
    private readonly secret: string,
    private readonly ttlMs = 3 * 60 * 60_000,
  ) {}

  /**
   * Bound to the current verification session (see session.context.ts): it only counts there.
   * `at` is when the code was passed; a resumed session gets its proof again with the original time.
   */
  issue(channel: 'phone' | 'email', value: string, attempts = 1, at = Date.now()): string {
    const exp = Date.now() + this.ttlMs;
    const body = Buffer.from(
      JSON.stringify({ c: channel, v: value, exp, at, n: attempts, s: currentSid() ?? null }),
    ).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  valid(token: string | undefined, channel: 'phone' | 'email', value: string): boolean {
    return this.read(token, channel, value) !== null;
  }

  /** The verification time carried by a valid token, else null. */
  read(token: string | undefined, channel: 'phone' | 'email', value: string): { at: number; attempts: number } | null {
    if (!token || !this.secret) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expect = this.sign(body);
    if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
        c: string; v: string; exp: number; at?: number; n?: number; s?: string | null;
      };
      // a proof earned in one verification session never counts in another
      if ((p.s ?? null) !== (currentSid() ?? null)) return null;
      return p.c === channel && p.v === value && Date.now() < p.exp ? { at: p.at ?? p.exp - this.ttlMs, attempts: p.n ?? 1 } : null;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
