import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';

import { checkEmail, EmailCheck } from './email-check';
import { IntelClient } from './intel.client';
import { KycMailService } from './kyc-mail.service';
import { buildFindings, OtpMeta } from './findings';
import { computeRisk, RiskResult, WatchlistHit } from './risk';
import { screenPerson } from './screening.engine';
import { OtpStore, RateLimiter, TtlMap, VerificationTokens } from './stores';
import { VaultService } from './vault.service';

const MIN = 60_000;
const OTP_MINUTES = 10;

/** Line types that cannot receive a text message. */
const NO_SMS = new Set(['landline', 'tollFree', 'premium', 'sharedCost', 'pager', 'voicemail', 'uan']);

export interface PhoneCheck {
  ok: boolean;
  exists: boolean;
  e164: string;
  country: string | null;
  lineType: string | null;
  carrier: string | null;
  /** Carrier-reported line status (active, inactive, ...) when available. */
  status?: string | null;
  /** Mobile network code pair (MCC-MNC), e.g. 635-10. */
  network?: string | null;
  /** Number reputation from Twilio's SMS-pumping fraud signal. */
  reputation?: { score: number | null; carrierRisk: string | null; blocked: boolean; blockedRecently: boolean } | null;
  /** Every Twilio Lookup package: its data, or Twilio's error code (60600 no
   *  coverage for the number, 60607 country not supported, 60617 needs input). */
  lookup?: Record<string, { code: number | null; data: Record<string, unknown> }>;
  reason?: string;
  retryable?: boolean;
}

export interface ScreenInput {
  name?: string;
  dob?: string;
  nationality?: string;
  documentCountry?: string;
  /** The country the applicant picked on Choose Document. */
  declaredCountry?: string;
  phone?: string;
  email?: string;
  /** Submitted address only; ownership is not established by screening. */
  walletAddress?: string;
  livenessAttempts?: number;
  faceMatched?: boolean;
  documentQualityOverride?: boolean;
  /** Signed proofs from phone/email verify (survive API restarts). */
  phoneToken?: string;
  emailToken?: string;
  /** Random per-browser id (no personal data) for device-reuse checks. */
  deviceId?: string;
}

function tooMany(msg = 'Too many attempts. Please wait a few minutes and try again.'): never {
  throw new HttpException({ ok: false, reason: msg }, HttpStatus.TOO_MANY_REQUESTS);
}

export function toE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? '+' + digits.slice(1).replace(/\+/g, '') : '+' + digits;
}

@Injectable()
export class KycService {
  private readonly log = new Logger('Kyc');
  private readonly limiter = new RateLimiter();
  private readonly phoneChecks = new TtlMap<PhoneCheck>(30 * MIN);
  private readonly emailChecks = new TtlMap<EmailCheck>(30 * MIN);
  private readonly verified = new TtlMap<true>(3 * 60 * MIN);
  /** contact (phone/email hash) -> subject hashes that used it (reuse + velocity). */
  private readonly contactSubjects = new TtlMap<string[]>(30 * 24 * 60 * MIN);
  /** Per channel ('phone:+250..' / 'email:x'): sends, verify attempts, failures. */
  private readonly otpMeta = new TtlMap<OtpMeta & { failTimes: number[] }>(3 * 60 * MIN);
  /** Screening sessions per client IP (for 'sessions from this IP'). */
  private readonly ipSessions = new TtlMap<number[]>(24 * 60 * MIN);
  /** device id -> subject hashes seen on it. */
  private readonly deviceSubjects = new TtlMap<string[]>(30 * 24 * 60 * MIN);
  private readonly tokens: VerificationTokens;
  /** Screening reports (watchlist hits, risk reasons), encrypted by OpenBao; never held in clear. */
  private readonly reports = new TtlMap<string>(24 * 60 * MIN);
  private readonly emailOtp = new OtpStore(OTP_MINUTES * MIN, 5);
  /** Codes for placeholder SMS mode (no SMS provider): issued and checked here. */
  private readonly phoneOtp = new OtpStore(OTP_MINUTES * MIN, 5);
  private readonly lastEmailSend = new TtlMap<number>(OTP_MINUTES * MIN);
  private readonly probe: boolean;
  private readonly helo: string;
  readonly exposeReport: boolean;
  /** 'placeholder' = do not send SMS; the code is returned for an on-screen test
   *  banner. For development only, until the SMS provider is available. */
  readonly smsPlaceholder: boolean;

  constructor(
    private readonly intel: IntelClient,
    private readonly mail: KycMailService,
    private readonly vault: VaultService,
    config: ConfigService,
  ) {
    this.probe = (config.get<string>('KYC_SMTP_PROBE') ?? 'true') === 'true';
    this.helo = config.get<string>('KYC_HELO_HOST') ?? 'localhost';
    this.exposeReport = config.get<string>('KYC_EXPOSE_REPORT') === 'true';
    this.smsPlaceholder = config.get<string>('KYC_SMS_MODE') === 'placeholder';
    this.tokens = new VerificationTokens(config.get<string>('KYC_TOKEN_SECRET') ?? '');
    if (!config.get<string>('KYC_TOKEN_SECRET')) this.log.warn('KYC_TOKEN_SECRET not set: verification tokens disabled');
    if (this.smsPlaceholder) this.log.warn('SMS placeholder mode: no text messages are sent (dev only)');
  }

  /* ------------------------------------------------------------------ phone */

  async phoneCheck(raw: string, ip: string, person?: { first?: string; last?: string; dob?: string; country?: string }): Promise<PhoneCheck> {
    if (!this.limiter.take(`pchk:ip:${ip}`, 30, 60 * MIN)) tooMany();
    const e164 = toE164(raw);
    const blank = { e164, country: null, lineType: null, carrier: null };
    if (!/^\+\d{7,15}$/.test(e164)) {
      return { ok: true, exists: false, ...blank, reason: "That doesn't look like a complete phone number. Please check it." };
    }
    const ckey = person ? `${e164}|${hash(JSON.stringify(person))}` : e164;
    const cached = this.phoneChecks.get(ckey);
    if (cached) return cached;

    const env = await this.intel.post<any>('/v1/phone/lookup', {
      phone: e164,
      first_name: person?.first || null,
      last_name: person?.last || null,
      date_of_birth: person?.dob || null,
      country: person?.country || null,
    });
    const d = env.data ?? {};
    const tw = d.line_intelligence?.ok ? d.line_intelligence.data : null;
    const pi = d.validity?.ok ? d.validity.data : null;
    const nv = d.confirm?.ok ? d.confirm.data : null;
    if (!env.ok || (!tw && !pi && !nv)) {
      return { ok: false, exists: false, ...blank, retryable: true, reason: "We couldn't check this number right now. Please try again in a moment." };
    }
    const valid = tw ? tw.valid !== false : nv ? nv.valid !== false : true;
    const lineType: string | null = tw?.line_type_intelligence?.type ?? nv?.line_type ?? null;
    const status: string | null = tw?.line_status?.status ?? null;
    const result: PhoneCheck = {
      ok: true,
      exists: true,
      e164,
      country: (tw?.country_code ?? nv?.country_code ?? pi?.country ?? null)?.toString().toLowerCase() ?? null,
      lineType,
      carrier: tw?.line_type_intelligence?.carrier_name ?? nv?.carrier ?? null,
      status,
      network:
        tw?.line_type_intelligence?.mobile_country_code && tw?.line_type_intelligence?.mobile_network_code
          ? `${tw.line_type_intelligence.mobile_country_code}-${tw.line_type_intelligence.mobile_network_code}`
          : null,
      reputation: tw?.sms_pumping_risk && !tw.sms_pumping_risk.error_code
        ? {
            score: typeof tw.sms_pumping_risk.sms_pumping_risk_score === 'number' ? tw.sms_pumping_risk.sms_pumping_risk_score : null,
            carrierRisk: tw.sms_pumping_risk.carrier_risk_category ?? null,
            blocked: !!tw.sms_pumping_risk.number_blocked,
            blockedRecently: !!tw.sms_pumping_risk.number_blocked_last_3_months,
          }
        : null,
      lookup: Object.fromEntries(
        Object.entries(tw ?? {})
          .filter(([, v]) => v && typeof v === 'object')
          .map(([k, v]: [string, any]) => [k, { code: v.error_code ?? null, data: v }]),
      ),
    };
    if (!valid) {
      Object.assign(result, { exists: false, reason: "This number doesn't exist. Please check the country code and the number." });
    } else if (status === 'inactive') {
      Object.assign(result, { exists: false, reason: "This number isn't in service. Please use a number you can receive texts on." });
    } else if (lineType && NO_SMS.has(lineType)) {
      Object.assign(result, { exists: false, reason: "This looks like a landline or service number, which can't receive text messages. Please use a mobile number." });
    }
    this.phoneChecks.set(ckey, result);
    return result;
  }

  async phoneSend(raw: string, ip: string): Promise<{ ok: true; sentTo: string; testCode?: string }> {
    const e164 = toE164(raw);
    const check = await this.phoneCheck(e164, ip);
    if (!check.exists) throw new HttpException({ ok: false, reason: check.reason }, HttpStatus.BAD_REQUEST);
    // SMS costs money and is the target of "SMS pumping" fraud: limit per
    // number and per connection.
    if (!this.limiter.take(`psend:ph:${e164}`, 3, 10 * MIN)) tooMany('Too many codes requested for this number. Please wait 10 minutes.');
    if (!this.limiter.take(`psend:day:${e164}`, 8, 24 * 60 * MIN)) tooMany('Too many codes requested for this number today.');
    if (!this.limiter.take(`psend:ip:${ip}`, 10, 60 * MIN)) tooMany();

    const sentTo = e164.slice(0, -4).replace(/\d/g, '•') + e164.slice(-4);
    if (this.smsPlaceholder) {
      // Same checks and limits as a real send; only the delivery is replaced.
      this.meta(`phone:${e164}`).sends++;
      return { ok: true, sentTo, testCode: this.phoneOtp.issue(e164) };
    }

    const env = await this.intel.post<any>('/v1/phone/otp/send', { phone: e164 });
    if (!env.ok || !env.data?.status) {
      const msg = env.error?.message ?? '';
      // Twilio's own code (e.g. 21608) for the operator; never the number.
      this.log.warn(`SMS code send failed: ${msg.slice(0, 160)}`);
      const reason = /21608|compliance/i.test(msg)
        ? // Account-level block (Twilio compliance profile not yet approved):
          // no retry by the applicant can fix it.
          "We can't send text messages at the moment. Please try again later."
        : /60410|60605|21610|blocked|fraud/i.test(msg)
        ? "We can't send a text to this number. Please use a different mobile number."
        : /60203|max send/i.test(msg)
          ? 'Too many codes were sent to this number. Please wait and try again later.'
          : /60200|invalid/i.test(msg)
            ? "This number can't receive a text message. Please check it or use another mobile number."
            : "We couldn't send the code right now. Please try again in a moment.";
      throw new HttpException({ ok: false, reason }, HttpStatus.BAD_GATEWAY);
    }
    this.meta(`phone:${e164}`).sends++;
    return { ok: true, sentTo };
  }

  async phoneVerify(raw: string, code: string, ip: string): Promise<{ ok: true; verified: boolean; reason?: string; token?: string }> {
    const e164 = toE164(raw);
    if (!this.limiter.take(`pver:${e164}`, 8, 10 * MIN)) tooMany('Too many wrong codes. Please request a new code in a few minutes.');
    if (!this.limiter.take(`pver:ip:${ip}`, 30, 60 * MIN)) tooMany();
    if (!/^\d{4,10}$/.test(code.trim())) return { ok: true, verified: false, reason: 'Please enter the code from the text message.' };
    if (this.smsPlaceholder) {
      const v = this.phoneOtp.verify(e164, code);
      this.attempt(`phone:${e164}`, v === 'ok');
      if (v === 'ok') {
        this.verified.set(`phone:${e164}`, true);
        return { ok: true, verified: true, token: this.tokens.issue('phone', e164, this.meta(`phone:${e164}`).attempts) };
      }
      return {
        ok: true,
        verified: false,
        reason:
          v === 'wrong'
            ? "That code isn't right. Please check it and try again."
            : v === 'locked'
              ? 'Too many wrong codes. Please request a new code.'
              : 'This code has expired or was already used. Please request a new code.',
      };
    }
    const env = await this.intel.post<any>('/v1/phone/otp/check', { phone: e164, code: code.trim() });
    if (!env.ok) {
      return { ok: true, verified: false, reason: 'This code has expired or was already used. Please request a new code.' };
    }
    this.attempt(`phone:${e164}`, !!env.data?.valid);
    if (env.data?.valid) {
      this.verified.set(`phone:${e164}`, true);
      return { ok: true, verified: true, token: this.tokens.issue('phone', e164, this.meta(`phone:${e164}`).attempts) };
    }
    return { ok: true, verified: false, reason: "That code isn't right. Please check it and try again." };
  }

  /* ------------------------------------------------------------------ email */

  async emailCheck(raw: string, ip: string): Promise<EmailCheck> {
    if (!this.limiter.take(`echk:ip:${ip}`, 30, 60 * MIN)) tooMany();
    return this.emailLookup(raw);
  }

  /** The same check for signed-in console operators (the AML Explorer), without the applicant rate limit. */
  async emailLookup(raw: string): Promise<EmailCheck> {
    const key = raw.trim().toLowerCase();
    const cached = this.emailChecks.get(key);
    if (cached) return cached;
    const res = await checkEmail(key, {
      probe: this.probe,
      heloHost: this.helo,
      mailFrom: this.mail.address || `verify@${this.helo}`,
    });
    this.emailChecks.set(key, res);
    return res;
  }

  async emailSend(raw: string, ip: string): Promise<{ ok: true; sentTo: string }> {
    const check = await this.emailCheck(raw, ip);
    if (check.deliverable === 'no') throw new HttpException({ ok: false, reason: check.reason }, HttpStatus.BAD_REQUEST);
    const email = check.email;
    const last = this.lastEmailSend.get(email);
    if (last && Date.now() - last < 30_000) tooMany('Please wait 30 seconds before requesting another code.');
    if (!this.limiter.take(`esend:${email}`, 4, 10 * MIN)) tooMany('Too many codes requested for this address. Please wait 10 minutes.');
    if (!this.limiter.take(`esend:ip:${ip}`, 12, 60 * MIN)) tooMany();
    const code = this.emailOtp.issue(email);
    try {
      await this.mail.sendCode(email, code, OTP_MINUTES);
    } catch (e) {
      this.log.warn(`code email failed: ${(e as Error).message}`);
      throw new HttpException({ ok: false, reason: "We couldn't send the email right now. Please try again in a moment." }, HttpStatus.BAD_GATEWAY);
    }
    this.lastEmailSend.set(email, Date.now());
    this.meta(`email:${email}`).sends++;
    const [local, domain] = email.split('@');
    return { ok: true, sentTo: `${local!.slice(0, 2)}${'•'.repeat(Math.max(1, local!.length - 2))}@${domain}` };
  }

  emailVerify(raw: string, code: string, ip: string): { ok: true; verified: boolean; reason?: string; token?: string } {
    const email = raw.trim().toLowerCase();
    if (!this.limiter.take(`ever:ip:${ip}`, 30, 60 * MIN)) tooMany();
    const v = this.emailOtp.verify(email, code);
    this.attempt(`email:${email}`, v === 'ok');
    if (v === 'ok') {
      this.verified.set(`email:${email}`, true);
      return { ok: true, verified: true, token: this.tokens.issue('email', email, this.meta(`email:${email}`).attempts) };
    }
    const reason =
      v === 'wrong'
        ? "That code isn't right. Please check it and try again."
        : v === 'locked'
          ? 'Too many wrong codes. Please request a new code.'
          : 'This code has expired or was already used. Please request a new code.';
    return { ok: true, verified: false, reason };
  }

  /** When a verification proof was earned and after how many attempts (null if not valid here). */
  proofOf(token: string | undefined, channel: 'phone' | 'email', value: string) {
    return this.tokens.read(token, channel, value);
  }

  /**
   * A resumed session gets the proof of a phone or email it already verified again, with the
   * original time and attempts, so screening counts it exactly as before the break.
   */
  reissueProof(channel: 'phone' | 'email', value: string, at: number, attempts: number): string {
    return this.tokens.issue(channel, value, attempts, at);
  }

  /* -------------------------------------------------------------- screening */

  async screen(input: ScreenInput, ip: string) {
    if (!this.limiter.take(`scr:ip:${ip}`, 20, 60 * MIN)) tooMany();
    const name = input.name?.trim();
    const e164 = input.phone ? toE164(input.phone) : undefined;
    const email = input.email?.trim().toLowerCase();
    const publicIp = ip && isIP(ip) && !isPrivate(ip) ? ip : null;

    const walletAddress = input.walletAddress?.trim();
    const [sanc, ipRes, phone, mail, walletRes] = await Promise.all([
      // the integrated AML engine: the same index, matcher and graph as the AML Explorer
      name
        ? screenPerson(this.intel, { name, dob: input.dob || null, countries: [input.nationality ?? '', input.documentCountry ?? ''] }).catch(() => null)
        : Promise.resolve(null),
      publicIp ? this.intel.post<any>('/v1/screen/ip', { ip: publicIp }) : Promise.resolve(null),
      e164
        ? this.phoneCheck(e164, ip, name ? splitName(name, input.dob, input.nationality || input.documentCountry) : undefined).catch(() => null)
        : Promise.resolve(null),
      email ? this.emailCheck(email, ip).catch(() => null) : Promise.resolve(null),
      walletAddress ? this.intel.post('/v1/aml/crypto/screen', { addresses: [walletAddress] }, 30_000) : Promise.resolve(null),
    ]);

    const walletResults = walletRes?.ok && Array.isArray(walletRes.data?.results) && walletRes.data.results.length === 1
      && walletRes.data.results[0]?.address === walletAddress ? walletRes.data.results : null;
    const walletReview = !!walletAddress && (!walletResults || walletResults.some((w: any) =>
      w.format?.valid !== true || w.risk === 'high' || w.risk === 'medium' || w.flags?.includes('listing_disputed')));
    const wallets = walletAddress ? { address: walletAddress, ownershipVerified: false, ran: !!walletResults,
      at: new Date().toISOString(), requiresReview: walletReview, results: walletResults ?? [],
      error: walletResults ? null : walletRes?.error?.code ?? 'unavailable' } : null;

    const rawHits: any[] = sanc?.ran ? sanc.hits : [];
    const hits: WatchlistHit[] = rawHits.map((h: any) => ({
      id: h.id ? String(h.id) : undefined,
      caption: String(h.caption ?? ''),
      score: Number(h.score ?? 0),
      topics: h.topics ?? [],
      datasets: h.datasets ?? [],
      birthDates: h.birth_dates ?? [],
      nationalities: h.nationalities ?? [],
      countries: h.countries ?? [],
      formerly: !!h.formerly,
    }));
    const geo = ipRes?.data?.geo?.ok ? ipRes.data.geo.data : null;
    const abuse = ipRes?.data?.abuse?.ok ? ipRes.data.abuse.data?.data ?? ipRes.data.abuse.data : null;

    // Reuse: the same phone/email used by a different person (name + birth date).
    const subject = name ? hash(name.toLowerCase().replace(/\s+/g, ' ') + '|' + (input.dob ?? '')) : '';
    let reused = false;
    const accounts: Record<'phone' | 'email', number | null> = { phone: null, email: null };
    for (const [kind, c] of [['phone', e164 && `phone:${e164}`], ['email', email && `email:${email}`]] as const) {
      if (!c) continue;
      const key = hash(c);
      const seen = this.contactSubjects.get(key) ?? [];
      if (subject && seen.some((x) => x !== subject)) reused = true;
      if (subject && !seen.includes(subject)) seen.push(subject);
      this.contactSubjects.set(key, seen);
      accounts[kind] = Math.max(1, seen.length);
    }
    const now = Date.now();
    const sessions = (this.ipSessions.get(ip) ?? []).filter((t) => now - t < 24 * 60 * MIN);
    sessions.push(now);
    this.ipSessions.set(ip, sessions);

    // Verified = a valid signed token (survives restarts) or this process saw it.
    const phoneVerified = !!e164 && (!!this.verified.get(`phone:${e164}`) || this.tokens.valid(input.phoneToken, 'phone', e164));
    const emailVerified = !!email && (!!this.verified.get(`email:${email}`) || this.tokens.valid(input.emailToken, 'email', email));

    // Device reuse: the same browser used by a different person.
    let deviceAccounts: number | null = null;
    let deviceReused = false;
    const device = input.deviceId && /^[A-Za-z0-9_-]{8,64}$/.test(input.deviceId) ? hash('dev:' + input.deviceId) : null;
    if (device) {
      const seen = this.deviceSubjects.get(device) ?? [];
      if (subject && seen.some((x) => x !== subject)) deviceReused = true;
      if (subject && !seen.includes(subject)) seen.push(subject);
      this.deviceSubjects.set(device, seen);
      deviceAccounts = Math.max(1, seen.length);
    }

    const risk: RiskResult = computeRisk({
      subject: { name, dob: input.dob, nationality: input.nationality, documentCountry: input.documentCountry },
      sanctions: { ran: !!name, error: !!name && !sanc?.ran, hits },
      phone: {
        provided: !!e164,
        verified: phoneVerified,
        lineType: phone?.lineType,
        country: phone?.country,
        smsRiskScore: phone?.reputation?.score ?? null,
        blocked: !!phone?.reputation?.blocked,
      },
      email: { provided: !!email, verified: emailVerified, disposable: mail?.disposable, mailbox: mail?.mailbox },
      ip: {
        ran: !!publicIp && !!(geo || abuse),
        country: geo?.countryCode ?? abuse?.countryCode ?? null,
        tor: !!abuse?.isTor,
        proxy: !!geo?.proxy,
        hosting: !!geo?.hosting,
        abuseScore: abuse?.abuseConfidenceScore ?? null,
      },
      reuse: { contactUsedByAnother: reused, deviceUsedByAnother: deviceReused },
      session: { livenessAttempts: input.livenessAttempts, faceMatched: input.faceMatched ?? null, documentQualityOverride: input.documentQualityOverride },
    });

    const reference = 'KYC-' + randomBytes(4).toString('hex').toUpperCase();
    // Every hit with its full list profile and why it was confirmed, kept for review, or ruled out.
    const statusOf = (h: any): { status: string; why: string } => {
      const id = h.id ? String(h.id) : '';
      if (h.formerly) return { status: 'discounted', why: 'Formerly listed and since removed: not a current listing' };
      if (risk.watchlist.confirmed.some((x) => x.id === id)) return { status: 'confirmed', why: 'Name and birth date match the list entry' };
      if (risk.watchlist.possible.some((x) => x.id === id)) {
        return { status: 'possible', why: input.dob ? 'Name matches; the list has no birth date to confirm or rule it out' : 'Name matches; no birth date was available to confirm or rule it out' };
      }
      if (Number(h.score ?? 0) < 0.85) return { status: 'discounted', why: 'Name similarity below the match threshold' };
      if ((h.birth_dates ?? []).length && input.dob) return { status: 'discounted', why: 'Listed birth date differs (a namesake)' };
      return { status: 'discounted', why: 'Listed nationality differs (a namesake)' };
    };
    const screening = name
      ? {
          query: { name, dob: input.dob ?? null, country: input.nationality || input.documentCountry || null, countries: sanc?.query.countries ?? [] },
          index: sanc?.index ?? null,
          ran: !!sanc?.ran,
          at: new Date().toISOString(),
          hits: rawHits.map((h) => ({ ...h, ...statusOf(h) })),
        }
      : null;
    const outcome = walletReview ? 'review' as const : risk.outcome;
    const report = { reference, at: new Date().toISOString(), ...risk, outcome, screening, wallets };
    // Kept only encrypted; if encryption is unavailable the report is not kept at all.
    const sealed = await this.vault.seal(report);
    if (sealed) this.reports.set(reference, sealed);
    this.log.log(`screen ${reference}: ${outcome} (${risk.level}, ${risk.score})`);

    // Meta lives in memory; after a restart, fall back to the token's signed time.
    const withToken = (m: (OtpMeta & { failTimes: number[] }) | undefined, t: { at: number; attempts: number } | null) =>
      t && !m?.verifiedAt ? { sends: m?.sends ?? 0, attempts: Math.max(m?.attempts ?? 0, t.attempts), failed: m?.failed ?? 0, failTimes: m?.failTimes ?? [], verifiedAt: t.at } : m;
    const phoneMeta = e164 ? withToken(this.otpMeta.get(`phone:${e164}`), this.tokens.read(input.phoneToken, 'phone', e164)) : undefined;
    const emailMeta = email ? withToken(this.otpMeta.get(`email:${email}`), this.tokens.read(input.emailToken, 'email', email)) : undefined;
    const retriesHour = [phoneMeta, emailMeta].reduce(
      (n, m) => n + (m?.failTimes.filter((t) => now - t < 60 * MIN).length ?? 0),
      0,
    );
    const findings = buildFindings({
      risk,
      subject: { name, documentCountry: input.documentCountry, nationality: input.nationality },
      declaredCountry: input.declaredCountry,
      phone: e164
        ? {
            verified: phoneVerified,
            testMode: this.smsPlaceholder,
            network: phone?.network,
            reputation: phone?.reputation,
            lookup: phone?.lookup,
            meta: phoneMeta,
            valid: phone ? phone.exists || phone.lineType !== null : undefined,
            country: phone?.country,
            lineType: phone?.lineType,
            carrier: phone?.carrier,
            status: phone?.status,
          }
        : null,
      email: email ? { verified: emailVerified, meta: emailMeta, check: mail } : null,
      ip: {
        ran: !!publicIp && !!(geo || abuse),
        country: geo?.countryCode ?? abuse?.countryCode ?? null,
        tor: !!abuse?.isTor,
        proxy: !!geo?.proxy || !!geo?.hosting,
        abuseScore: abuse?.abuseConfidenceScore ?? null,
      },
      velocity: {
        phoneAccounts: accounts.phone,
        emailAccounts: accounts.email,
        deviceAccounts,
        otpRetriesHour: retriesHour,
        ipSessions24h: sessions.length,
      },
    });

    return {
      ok: true,
      reference,
      outcome,
      findings,
      // The applicant never sees why: no watchlist details reach them.
      message:
        outcome === 'approved'
          ? 'Your details have been checked.'
          : 'Thanks. Your details need a quick manual review. We will be in touch.',
      // The full report never goes to the applicant's browser: operators read it from the record.
    };
  }

  private meta(key: string): OtpMeta & { failTimes: number[] } {
    let m = this.otpMeta.get(key);
    if (!m) {
      m = { sends: 0, attempts: 0, failed: 0, failTimes: [] };
      this.otpMeta.set(key, m);
    }
    return m;
  }

  private attempt(key: string, ok: boolean) {
    const m = this.meta(key);
    m.attempts++;
    if (ok) m.verifiedAt = Date.now();
    else {
      m.failed++;
      m.failTimes.push(Date.now());
    }
  }

  async report(reference: string) {
    const sealed = this.reports.get(reference);
    return sealed ? ((await this.vault.open(sealed)) ?? undefined) : undefined;
  }
}

/** Document name to Identity Match fields: last word as last name, rest first. */
function splitName(name: string, dob?: string, country?: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : undefined;
  return { first: parts.join(' ') || undefined, last, dob, country };
}

function hash(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

function isPrivate(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^(fc|fd|fe80)/i.test(ip) || ip.startsWith('::ffff:127.') || ip.startsWith('::ffff:10.') || ip.startsWith('::ffff:192.168.')) return true;
  return false;
}
