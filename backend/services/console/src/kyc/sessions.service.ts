import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { calculateJwkThumbprint, decodeProtectedHeader, EmbeddedJWK, jwtVerify, SignJWT, type JWK } from 'jose';

import { KycEvents } from './kyc-events';
import { RecordsService } from './records.service';
import { RateLimiter, TtlMap } from './stores';
import { VaultService } from './vault.service';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const LINK_TTL = 60 * MIN; // an unopened verification link works for one hour
const TOKEN_TTL = 60 * MIN; // an access token lives one hour at most; the same device renews it
const PROOF_MAX_AGE_S = 60; // a DPoP proof is only good for a minute
const PROOF_FUTURE_S = 5; // tolerated clock skew

const OTHER_DEVICE = 'This verification was started on another device or browser. Please continue it there, or ask for a new link.';
const DISABLED = 'This verification has been disabled by the organisation that sent it. Please contact them if you think this is a mistake.';
const COMPLETE = "This verification can't be opened again. You can close this page.";
/**
 * All a finished verification still answers: its result screen reads the plan, the organisation's name and its
 * decision again (/events then answers only "completed", see KycController). Every other request is refused, so an
 * endpoint added later is closed to finished verifications by default.
 */
const AFTER_COMPLETE = new Set(['/api/kyc/plan', '/api/kyc/brand', '/api/kyc/events']);
const ACCESS_TRIES = 5; // wrong access codes before the link locks for good
const LOCKED = 'This link is locked after too many wrong access codes. Please ask for a new link.';

/** A face step the applicant does on their phone because this browser has no usable camera (see createHandoff). */
export type HandoffStep = 'liveness' | 'face-match';
const HANDOFF_SCOPE = 'kyc.applicant.handoff';
const HANDOFF_TTL = 10 * MIN; // a phone code nobody opened works for 10 minutes
const HANDOFF_OPEN = 20 * MIN; // once a phone opened it, that phone has 20 minutes to finish the face step
const HANDOFF_GONE = 'This code no longer works. Make a new one on your computer and scan it again.';
/** All a phone doing a face step may call: that step, its own device report and finishing the step. */
const HANDOFF_PATHS: Record<HandoffStep, Set<string>> = {
  liveness: new Set(['/api/kyc/brand', '/api/kyc/keys/upload', '/api/kyc/device', '/api/kyc/events', '/api/kyc/handoff/done']),
  'face-match': new Set(['/api/kyc/brand', '/api/kyc/keys/upload', '/api/kyc/device', '/api/kyc/face/match', '/api/kyc/handoff/done']),
};
type Handoff = {
  id: string;
  sid: string;
  step: HandoffStep;
  /** Nobody opened the code by then: it stops working. */
  expiresAt: number;
  /** The phone that opened it may finish until then. */
  until?: number;
  state: 'waiting' | 'opened' | 'done';
  /** Thumbprint of the key of the phone that opened it: the only device that can use it from then on. */
  jkt?: string;
  /** Sealed in the browser with a key that only travels in the link fragment: never readable here. */
  payload?: string;
  result?: string;
};
/** Who made a request: the device holding the verification, or a phone doing one of its face steps. */
export type Authenticated = { sid: string; handoff?: { id: string; step: HandoffStep; jkt: string } };

type Session = {
  id: string;
  tenant: string;
  reference?: string;
  createdAt: number;
  /** An unopened link stops working at this time. */
  expiresAt: number;
  /** Thumbprint of the key the session is bound to (kept in memory only). */
  jkt?: string;
  /** Blind index of that key: what the database keeps, so the binding survives restarts. */
  boundKey?: string | null;
  /** After the first open, the same device can come back until this time. */
  resumeUntil?: number;
  status?: 'in_progress' | 'completed' | 'redacted' | 'disabled';
};

function deny(error: string, message: string, status = HttpStatus.UNAUTHORIZED, extra: Record<string, unknown> = {}): never {
  throw new HttpException({ ok: false, error, reason: message, ...extra }, status);
}

/** The reason code of a refusal, for the log (never the secret, the token or the proof). */
const refusal = (e: unknown) =>
  e instanceof HttpException ? `${(e.getResponse() as { error?: string }).error ?? 'error'} (${e.getStatus()})` : (e as Error).message;

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/**
 * Verification sessions with sender-constrained (DPoP, RFC 9449) access tokens.
 *
 *   1. The tenant's server creates a session with its secret key and receives a client secret
 *      for the applicant's link. An unopened link works for 1 hour.
 *   2. The applicant's browser makes a non-extractable P-256 key and exchanges the client
 *      secret, proving possession of that key, for an access token bound to the key's
 *      thumbprint (cnf.jkt). The FIRST exchange binds the session to that key for good.
 *   3. Every KYC request carries the token AND a fresh proof signed by the same key over the
 *      method, the exact URL, the time, a unique id and the token hash. A stolen token is
 *      useless without the key; a captured request cannot be replayed.
 *   4. Resuming: the bound device can exchange the same secret again (a closed tab, an expired
 *      token, a server restart) for a fresh one-hour token, within the resume window after the
 *      first open. Any other device is refused, so a forwarded or leaked link cannot take over a
 *      verification someone started. The binding is kept in the database as a blind index of
 *      the key (never the key or the secret), so it survives restarts.
 */
@Injectable()
export class SessionsService {
  private readonly log = new Logger('Sessions');
  private readonly limiter = new RateLimiter();
  private readonly resumeTtl: number;
  private readonly sessions: TtlMap<Session>; // a cache: the database is the record of truth
  private readonly secrets: TtlMap<string>; // sha256(client secret) -> session id
  private readonly keyIndex = new TtlMap<string>(DAY); // key thumbprint -> its blind index
  private readonly seenJti = new TtlMap<true>(3 * MIN); // replay protection for proofs
  private readonly handoffs = new TtlMap<Handoff>(HANDOFF_TTL + HANDOFF_OPEN);
  private readonly handoffCodes = new TtlMap<string>(HANDOFF_TTL); // sha256(phone code) -> handoff id
  private readonly handoffOf = new TtlMap<string>(HANDOFF_TTL + HANDOFF_OPEN); // session id -> its one live handoff
  private readonly tokenKey: Uint8Array;
  private readonly accessKey: Buffer;
  private readonly tenantKey: Buffer;
  private readonly origin: string;
  readonly devSessions: boolean;
  readonly anonDevSessions: boolean;

  constructor(
    config: ConfigService,
    private readonly records: RecordsService,
    private readonly vault: VaultService,
    private readonly events: KycEvents,
  ) {
    const secret = config.get<string>('KYC_TOKEN_SECRET') ?? '';
    if (!secret) throw new Error('KYC_TOKEN_SECRET is required for session tokens');
    // a separate key for access tokens, derived from the master secret
    this.tokenKey = new Uint8Array(hkdfSync('sha256', secret, 'verisec', 'dpop-access-token-v1', 32));
    // a third key for the links' access codes: the database keeps only this keyed hash of a code
    this.accessKey = Buffer.from(hkdfSync('sha256', secret, 'verisec', 'link-access-code-v1', 32));
    this.tenantKey = Buffer.from(config.get<string>('KYC_TENANT_KEY') ?? '');
    this.origin = (config.get<string>('KYC_PUBLIC_ORIGIN') ?? 'https://localhost:3001').replace(/\/$/, '');
    this.devSessions = config.get<string>('KYC_DEV_SESSIONS') === 'true';
    // a demo session for someone who is not signed in (local development); off in production, where a demo
    // is always an operator's own preview of one of their workflows
    this.anonDevSessions = this.devSessions && config.get<string>('KYC_DEV_ANON') !== 'false';
    const days = Number(config.get<string>('KYC_RESUME_DAYS') ?? 7);
    this.resumeTtl = (Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 7) * DAY;
    this.sessions = new TtlMap<Session>(this.resumeTtl);
    this.secrets = new TtlMap<string>(this.resumeTtl);
    if (this.devSessions) this.log.warn('KYC_DEV_SESSIONS=true: the demo flow can open sessions without a tenant key (dev only)');
  }

  /* ------------------------------------------------------------ tenant side */

  /** Constant-time check of the tenant's secret key (Authorization: Bearer <key>). */
  isTenant(authorization: string | undefined): boolean {
    const m = /^Bearer (.+)$/.exec(authorization ?? '');
    if (!m || this.tenantKey.length === 0) return false;
    const given = Buffer.from(m[1]);
    return given.length === this.tenantKey.length && timingSafeEqual(given, this.tenantKey);
  }

  /** A new session id, for holding credits against a verification before it is created. */
  newId() {
    return 'ses_' + randomBytes(12).toString('hex');
  }

  /** The keyed hash of a link's access code (bound to the session, so a code is worthless on any other link). */
  private accessHash(id: string, code: string) {
    return createHmac('sha256', this.accessKey).update(`${id}:${code}`).digest('hex');
  }

  /**
   * `workflow`: the workflow version this verification runs (pinned for its whole life). `id`: from `newId()`.
   * `accessCode`: the link also needs a 6-digit code, given to the applicant separately (returned once, here).
   */
  async create(
    tenant: string,
    reference?: string,
    workflow?: { id: string; version: number },
    presetId?: string,
    opts: { accessCode?: boolean; hint?: string } = {},
  ) {
    const id = presetId ?? this.newId();
    const clientSecret = 'cs_' + randomBytes(32).toString('base64url');
    const hash = sha256(clientSecret).toString('hex');
    const accessCode = opts.accessCode ? String(randomInt(0, 1_000_000)).padStart(6, '0') : undefined;
    const now = Date.now();
    this.sessions.set(id, { id, tenant, reference, createdAt: now, expiresAt: now + LINK_TTL, status: 'in_progress' });
    this.secrets.set(hash, id);
    // the verification record: its reference is what operators search and quote
    const asked = reference?.trim() || `VS-${randomBytes(4).toString('hex').toUpperCase()}`;
    const access = accessCode ? this.accessHash(id, accessCode) : undefined;
    const ref = await this.records.start(id, asked, tenant, { hash, expiresAt: now + LINK_TTL, access, hint: opts.hint }, workflow);
    const cached = this.sessions.get(id);
    if (cached) cached.reference = ref;
    this.events.emit(id, 'verification.created', { status: 'created', workflow_id: workflow?.id ?? null, workflow_version: workflow?.version ?? null });
    return { ok: true as const, sessionId: id, reference: ref, clientSecret, accessCode, expiresAt: new Date(now + LINK_TTL).toISOString() };
  }

  /**
   * A new link and access code for an unfinished verification. The earlier link stops opening and the device that
   * held the verification is signed out of it (its token fails at the next request); whoever opens the new link
   * needs the new code, and the first device to enter it holds the verification from then on. The record and its
   * finished parts stay, so the flow continues where it stopped. False when it is no longer in progress.
   */
  async relink(id: string, hint: string) {
    const clientSecret = 'cs_' + randomBytes(32).toString('base64url');
    const hash = sha256(clientSecret).toString('hex');
    const accessCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = Date.now() + LINK_TTL;
    const done = await this.records.relink(id, { hash, expiresAt, access: this.accessHash(id, accessCode), hint });
    if (!done) return false;
    // nothing of the earlier link or device stays in memory: the database (just changed) decides from here
    if (done.oldHash) this.secrets.delete(done.oldHash);
    this.sessions.delete(id);
    this.cancelHandoff(id);
    this.secrets.set(hash, id);
    return { clientSecret, accessCode, expiresAt: new Date(expiresAt).toISOString() };
  }

  /**
   * The organisation disabled (or enabled again) a verification, or it was decided: an open session stops at its
   * next request (a decided one answers only what its result screen reads).
   */
  setStatus(id: string, status: 'disabled' | 'in_progress' | 'completed') {
    const s = this.sessions.get(id);
    if (s) s.status = status;
    // a phone doing a face step of it stops at its next request too
    if (status !== 'in_progress') this.cancelHandoff(id);
  }

  /** The verification was decided: it takes no more steps. */
  isComplete(id: string): boolean {
    return this.sessions.get(id)?.status === 'completed';
  }

  /** A deleted verification: nothing of it stays in memory. */
  forget(id: string) {
    this.sessions.delete(id);
    this.cancelHandoff(id);
  }

  /* --------------------------------------------------------- applicant side */

  /**
   * Client secret + proof of a key -> access token bound to that key. The first exchange binds
   * the session to the key; later ones (the same device resuming) get a fresh token.
   */
  async exchange(clientSecret: string, proof: string | undefined, ip: string, accessCode?: string) {
    try {
      return await this.exchangeOnce(clientSecret, proof, ip, accessCode);
    } catch (e) {
      this.log.warn(`link not opened: ${refusal(e)}`);
      throw e;
    }
  }

  private async exchangeOnce(clientSecret: string, proof: string | undefined, ip: string, accessCode?: string) {
    if (!this.limiter.take(`xchg:${ip}`, 20, 10 * MIN)) deny('rate_limited', 'Too many attempts.', HttpStatus.TOO_MANY_REQUESTS);
    const { jkt } = await this.checkProof(proof, 'POST', '/api/kyc/sessions/exchange');
    const hash = sha256(clientSecret).toString('hex');
    const cachedId = this.secrets.get(hash);
    const cached = cachedId ? this.sessions.get(cachedId) : undefined;
    const stored = await this.records.binding({ linkHash: hash });
    if (!stored && !cached) deny('invalid_grant', 'This verification link is not valid. Please use the latest link you were sent.');
    const s: Session = cached ?? { id: stored!.id, tenant: stored!.tenant, createdAt: Date.now(), expiresAt: stored!.linkExpiresAt ?? 0 };
    if (stored) {
      // the database decides the status and the binding whenever it is there
      s.status = stored.status;
      s.boundKey = stored.boundKey;
      if (stored.resumeUntil) s.resumeUntil = stored.resumeUntil;
      if (stored.linkExpiresAt) s.expiresAt = stored.linkExpiresAt;
    }
    if (s.status === 'completed') deny('session_complete', COMPLETE, HttpStatus.GONE);
    if (s.status === 'redacted') deny('invalid_grant', 'This verification link is no longer valid.');
    if (s.status === 'disabled') deny('session_disabled', DISABLED, HttpStatus.GONE);

    const now = Date.now();
    const key = await this.bindKey(jkt);
    const firstOpen = !s.boundKey && !s.jkt;
    if (firstOpen) {
      if (now > s.expiresAt) deny('invalid_grant', 'This verification link has expired. Please ask for a new one.');
      // the link's second factor: the access code given to the applicant separately (the first open only; after
      // that the session is bound to this device and the code is not asked again)
      if (stored?.accessHash) {
        if ((stored.accessTries ?? 0) >= ACCESS_TRIES) deny('access_locked', LOCKED, HttpStatus.FORBIDDEN);
        const code = (accessCode ?? '').replace(/\D/g, '');
        const sentTo = stored.accessHint ? ` we emailed to ${stored.accessHint}` : ' you were given with this link';
        if (!code) deny('access_code_required', `Check your email: enter the 6-digit code${sentTo} to continue on this device.`, HttpStatus.UNAUTHORIZED, { hint: stored.accessHint ?? null });
        const want = Buffer.from(stored.accessHash, 'hex');
        const got = Buffer.from(this.accessHash(s.id, code), 'hex');
        if (want.length !== got.length || !timingSafeEqual(want, got)) {
          const tries = await this.records.accessMiss(s.id);
          if (tries >= ACCESS_TRIES) deny('access_locked', LOCKED, HttpStatus.FORBIDDEN);
          const left = ACCESS_TRIES - tries;
          deny('access_code_wrong', `That access code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
        }
      }
      const until = now + this.resumeTtl;
      if (key && !(await this.records.bindDevice(s.id, key, until))) deny('other_device', OTHER_DEVICE, HttpStatus.FORBIDDEN);
      s.jkt = jkt;
      s.boundKey = key;
      s.resumeUntil = until;
      await this.records.put(s.id, null, null, { event: { type: 'opened', label: 'Applicant opened the verification' }, step: 'opened' });
      this.events.emit(s.id, 'verification.started', { status: 'in_progress' });
    } else {
      if (!s.jkt && !key) deny('temporarily_unavailable', 'We could not open your verification right now. Please try again in a moment.', HttpStatus.SERVICE_UNAVAILABLE);
      // the same device coming back (a closed tab, an expired token): any other device is refused
      const same = s.jkt ? s.jkt === jkt : key === s.boundKey;
      if (!same) deny('other_device', OTHER_DEVICE, HttpStatus.FORBIDDEN);
      if (!s.resumeUntil || now > s.resumeUntil) deny('invalid_grant', 'This verification can no longer be resumed. Please ask for a new link.');
      s.jkt = jkt;
    }
    this.sessions.set(s.id, s);
    this.secrets.set(hash, s.id);

    const exp = Math.min(now + TOKEN_TTL, s.resumeUntil!);
    const accessToken = await new SignJWT({ scope: 'kyc.applicant', cnf: { jkt } })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject(s.id)
      .setIssuer('verisec-console')
      .setAudience('verisec-kyc')
      .setIssuedAt()
      .setExpirationTime(Math.floor(exp / 1000))
      .setJti(randomBytes(12).toString('hex'))
      .sign(this.tokenKey);
    return {
      ok: true as const,
      accessToken,
      tokenType: 'DPoP',
      expiresAt: new Date(exp).toISOString(),
      sessionId: s.id,
      // until when this device can come back to it (the "Save & exit" note shows it)
      resumeUntil: new Date(s.resumeUntil!).toISOString(),
      resumed: !firstOpen,
    };
  }

  /** Thumbprint of the key the applicant's browser holds for this session (stable per browser). */
  keyOf(sid: string): string | undefined {
    return this.sessions.get(sid)?.jkt;
  }

  /* ------------------------------------------------- a face step on a phone */

  /**
   * The device holding a verification hands one face step to the applicant's phone (its own browser has no usable
   * camera, Tor Browser for one). Returns a one-time code for the link the phone opens; an earlier code of the same
   * verification stops working. `payload` is sealed in the browser with a key that only travels in the link
   * fragment, so the server cannot read it (the document photo a selfie is compared with).
   */
  createHandoff(sid: string, step: HandoffStep, payload?: string) {
    this.cancelHandoff(sid);
    // 144 random bits: plenty for a code that works 10 minutes, once, under a rate limit, and short enough to keep
    // the phone QR code easy to scan
    const code = 'ho_' + randomBytes(18).toString('base64url');
    const id = 'hof_' + randomBytes(12).toString('hex');
    const expiresAt = Date.now() + HANDOFF_TTL;
    this.handoffs.set(id, { id, sid, step, expiresAt, state: 'waiting', payload });
    this.handoffCodes.set(sha256(code).toString('hex'), id);
    this.handoffOf.set(sid, id);
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  /** What the computer sees of its phone code: none, waiting, opened on the phone, expired, or done (with the sealed result). */
  handoffStatus(sid: string) {
    const id = this.handoffOf.get(sid);
    const h = id ? this.handoffs.get(id) : undefined;
    if (!h) return { state: 'none' as const };
    const now = Date.now();
    if ((h.state === 'waiting' && now > h.expiresAt) || (h.state === 'opened' && now > (h.until ?? 0))) return { state: 'expired' as const, step: h.step };
    return {
      state: h.state,
      step: h.step,
      expiresAt: new Date(h.state === 'waiting' ? h.expiresAt : (h.until ?? h.expiresAt)).toISOString(),
      ...(h.state === 'done' ? { result: h.result ?? null } : {}),
    };
  }

  /** The computer stopped waiting, or the verification moved on: the code and the phone token stop working. */
  cancelHandoff(sid: string) {
    const id = this.handoffOf.get(sid);
    if (id) this.handoffs.delete(id);
    this.handoffOf.delete(sid);
  }

  /** The phone finished its face step: the computer picks the sealed result up, and the phone token stops working. */
  finishHandoff(id: string, result: string) {
    const h = this.handoffs.get(id);
    if (!h || h.state !== 'opened') deny('handoff_gone', HANDOFF_GONE, HttpStatus.GONE);
    h.state = 'done';
    h.result = result;
    h.payload = undefined;
  }

  /** The phone opens the code with proof of its own key: a token for that one face step of that verification only. */
  async exchangeHandoff(code: string, proof: string | undefined, ip: string) {
    try {
      return await this.exchangeHandoffOnce(code, proof, ip);
    } catch (e) {
      this.log.warn(`phone code not opened: ${refusal(e)}`);
      throw e;
    }
  }

  private async exchangeHandoffOnce(code: string, proof: string | undefined, ip: string) {
    if (!this.limiter.take(`hxchg:${ip}`, 20, 10 * MIN)) deny('rate_limited', 'Too many attempts.', HttpStatus.TOO_MANY_REQUESTS);
    const { jkt } = await this.checkProof(proof, 'POST', '/api/kyc/handoff/exchange');
    const id = this.handoffCodes.get(sha256(code).toString('hex'));
    const h = id ? this.handoffs.get(id) : undefined;
    const now = Date.now();
    if (!h || this.handoffOf.get(h.sid) !== h.id) deny('handoff_gone', HANDOFF_GONE, HttpStatus.GONE);
    if (h.state === 'done') deny('handoff_done', 'This face check is done. Go back to your computer to continue.', HttpStatus.GONE);
    // the phone that opened the code may load its page again; no other device can use it from then on
    if (h.state === 'opened' && h.jkt !== jkt) deny('handoff_used', 'This code was already opened on another phone. Make a new one on your computer.', HttpStatus.FORBIDDEN);
    if (h.state === 'waiting' ? now > h.expiresAt : now > (h.until ?? 0)) deny('handoff_gone', HANDOFF_GONE, HttpStatus.GONE);
    const status = await this.statusOf(h.sid);
    if (status === 'completed') deny('session_complete', COMPLETE, HttpStatus.GONE);
    if (status === 'disabled') deny('session_disabled', DISABLED, HttpStatus.GONE);
    if (!status || status === 'redacted') deny('invalid_grant', 'This verification link is no longer valid.');
    const first = h.state === 'waiting';
    if (first) {
      h.state = 'opened';
      h.jkt = jkt;
      h.until = now + HANDOFF_OPEN;
    }
    const until = h.until ?? now + HANDOFF_OPEN;
    const accessToken = await new SignJWT({ scope: HANDOFF_SCOPE, hid: h.id, cnf: { jkt } })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject(h.sid)
      .setIssuer('verisec-console')
      .setAudience('verisec-kyc')
      .setIssuedAt()
      .setExpirationTime(Math.floor(until / 1000))
      .setJti(randomBytes(12).toString('hex'))
      .sign(this.tokenKey);
    if (first) {
      const what = h.step === 'liveness' ? 'Liveness check' : 'Face match';
      await this.records.put(h.sid, null, null, { event: { type: 'opened', label: `${what} continued on another device (the applicant scanned the code)` } });
    }
    return { ok: true as const, accessToken, tokenType: 'DPoP', expiresAt: new Date(until).toISOString(), step: h.step, payload: h.payload ?? null };
  }

  /** The status of a verification: the cache first (it changes first), then the database. */
  private async statusOf(sid: string) {
    return this.sessions.get(sid)?.status ?? (await this.records.binding({ id: sid }))?.status;
  }

  /** Until when the bound device can come back to this session. */
  resumeUntilOf(sid: string): number | undefined {
    return this.sessions.get(sid)?.resumeUntil;
  }

  /** A demo session (dev only): the applicant may start a new one instead of resuming. */
  isDevSession(sid: string): boolean {
    return this.devSessions && (this.sessions.get(sid)?.tenant ?? '').startsWith('dev:');
  }

  /** The organisation a session belongs to (the cache first, then the database). */
  async tenantOf(sid: string): Promise<string | null> {
    return this.sessions.get(sid)?.tenant ?? (await this.records.binding({ id: sid }))?.tenant ?? null;
  }

  /** Verify "Authorization: DPoP <token>" + "DPoP: <proof>" for a request. Returns who made it (see Authenticated). */
  async authenticate(authorization: string | undefined, proof: string | undefined, method: string, path: string): Promise<Authenticated> {
    try {
      return await this.authenticateOnce(authorization, proof, method, path);
    } catch (e) {
      this.log.warn(`request refused: ${refusal(e)}`);
      throw e;
    }
  }

  private async authenticateOnce(authorization: string | undefined, proof: string | undefined, method: string, path: string) {
    const m = /^DPoP (.+)$/.exec(authorization ?? '');
    if (!m) deny('invalid_token', 'Missing session token. Please reopen your verification link.');
    const token = m[1];
    let claims: { sub?: string; scope?: string; hid?: string; cnf?: { jkt?: string } };
    try {
      ({ payload: claims } = await jwtVerify(token, this.tokenKey, {
        issuer: 'verisec-console',
        audience: 'verisec-kyc',
        algorithms: ['HS256'],
        typ: 'at+jwt',
      }));
    } catch {
      deny('invalid_token', 'Your session has expired. Please reopen your verification link.');
    }
    if (claims.scope === HANDOFF_SCOPE) return this.authenticateHandoff(claims, token, proof, method, path);
    if (claims.scope !== 'kyc.applicant' || !claims.sub || !claims.cnf?.jkt) deny('invalid_token', 'Invalid session token.');
    const { jkt } = await this.checkProof(proof, method, path, token);
    // the token is bound to one key: the proof must be signed by exactly that key
    if (jkt !== claims.cnf.jkt) deny('invalid_dpop_proof', 'This request was not made from the device that opened the session.');
    // after a restart the session is not in memory: the database binding is checked instead
    const s = this.sessions.get(claims.sub) ?? (await this.restore(claims.sub, jkt));
    if (!s || s.jkt !== jkt) deny('invalid_token', 'Your session has ended. Please reopen your verification link.');
    if (s.status === 'disabled') deny('session_disabled', DISABLED, HttpStatus.GONE);
    // a finished verification never opens again or takes another step, whatever token the device still holds
    if (s.status === 'completed' && !AFTER_COMPLETE.has(path)) deny('session_complete', COMPLETE, HttpStatus.GONE);
    if (s.status === 'redacted') deny('invalid_grant', 'This verification link is no longer valid.');
    return { sid: s.id };
  }

  /** A phone doing one face step: its own key, only the routes of that step, and only while that step is open. */
  private async authenticateHandoff(
    claims: { sub?: string; hid?: string; cnf?: { jkt?: string } },
    token: string,
    proof: string | undefined,
    method: string,
    path: string,
  ): Promise<Authenticated> {
    if (!claims.sub || !claims.hid || !claims.cnf?.jkt) deny('invalid_token', 'Invalid session token.');
    const { jkt } = await this.checkProof(proof, method, path, token);
    if (jkt !== claims.cnf.jkt) deny('invalid_dpop_proof', 'This request was not made from the device that opened the session.');
    const h = this.handoffs.get(claims.hid);
    if (!h || h.sid !== claims.sub || h.jkt !== jkt || h.state !== 'opened' || Date.now() > (h.until ?? 0) || this.handoffOf.get(h.sid) !== h.id)
      deny('handoff_gone', HANDOFF_GONE, HttpStatus.GONE);
    if (!HANDOFF_PATHS[h.step].has(path)) deny('forbidden', 'This page can only do the face check.', HttpStatus.FORBIDDEN);
    const status = await this.statusOf(h.sid);
    if (status === 'disabled') deny('session_disabled', DISABLED, HttpStatus.GONE);
    if (status === 'completed') deny('session_complete', COMPLETE, HttpStatus.GONE);
    if (!status || status === 'redacted') deny('invalid_grant', 'This verification link is no longer valid.');
    return { sid: h.sid, handoff: { id: h.id, step: h.step, jkt } };
  }

  /** A session the database knows, bound to exactly this key and still inside its window. */
  private async restore(id: string, jkt: string): Promise<Session | undefined> {
    const b = await this.records.binding({ id });
    if (!b || b.status === 'redacted' || !b.boundKey || !b.resumeUntil || Date.now() > b.resumeUntil) return undefined;
    const key = await this.bindKey(jkt);
    if (!key || key !== b.boundKey) return undefined;
    const s: Session = {
      id: b.id,
      tenant: b.tenant,
      createdAt: Date.now(),
      expiresAt: b.linkExpiresAt ?? 0,
      jkt,
      boundKey: key,
      resumeUntil: b.resumeUntil,
      status: b.status,
    };
    this.sessions.set(id, s);
    return s;
  }

  /** The blind index of a device key (keyed hash inside OpenBao), cached; null if unavailable. */
  private async bindKey(jkt: string): Promise<string | null> {
    const hit = this.keyIndex.get(jkt);
    if (hit) return hit;
    const k = await this.vault.blindIndex(`bind:${jkt}`).catch(() => null);
    if (k) this.keyIndex.set(jkt, k);
    return k;
  }

  /** RFC 9449 section 4.3 proof checks. */
  private async checkProof(proof: string | undefined, method: string, path: string, accessToken?: string) {
    if (!proof) deny('invalid_dpop_proof', 'Missing proof of possession.');
    let header: { typ?: string; alg?: string; jwk?: JWK };
    try {
      header = decodeProtectedHeader(proof) as typeof header;
    } catch {
      deny('invalid_dpop_proof', 'Malformed proof.');
    }
    if (header.typ !== 'dpop+jwt') deny('invalid_dpop_proof', 'Wrong proof type.');
    if (header.alg !== 'ES256') deny('invalid_dpop_proof', 'Unsupported proof algorithm.');
    if (!header.jwk || (header.jwk as { d?: string }).d) deny('invalid_dpop_proof', 'Proof must carry a public key only.');
    let p: { htm?: string; htu?: string; iat?: number; jti?: string; ath?: string };
    try {
      ({ payload: p } = await jwtVerify(proof, EmbeddedJWK, { typ: 'dpop+jwt', algorithms: ['ES256'] }));
    } catch {
      deny('invalid_dpop_proof', 'Proof signature is not valid.');
    }
    const now = Math.floor(Date.now() / 1000);
    if (p.htm !== method) deny('invalid_dpop_proof', 'Proof was made for a different method.');
    if (p.htu !== `${this.origin}${path}`) deny('invalid_dpop_proof', 'Proof was made for a different address.');
    if (typeof p.iat !== 'number' || p.iat > now + PROOF_FUTURE_S || now - p.iat > PROOF_MAX_AGE_S) {
      // the server's time goes back with it: a device whose clock is off corrects for it and signs again
      deny('invalid_dpop_proof', 'Proof is too old. Check your device clock.', HttpStatus.UNAUTHORIZED, { server_time: now });
    }
    if (!p.jti || p.jti.length < 16) deny('invalid_dpop_proof', 'Proof needs a unique id.');
    const jkt = await calculateJwkThumbprint(header.jwk, 'sha256');
    const replayKey = `${jkt}:${p.jti}`;
    if (this.seenJti.get(replayKey)) deny('invalid_dpop_proof', 'This request was already used (replay).');
    this.seenJti.set(replayKey, true);
    if (accessToken !== undefined) {
      const ath = sha256(accessToken).toString('base64url');
      if (p.ath !== ath) deny('invalid_dpop_proof', 'Proof is not bound to this token.');
    }
    return { jkt };
  }
}
