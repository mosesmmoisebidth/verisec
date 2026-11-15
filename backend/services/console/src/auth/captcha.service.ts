import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Cloudflare's published test secrets (always pass / always fail / token already used): local development only
const TEST_SECRET = /^[123]x0{20,}A{2}$/;

/**
 * The human check on the public forms (sign-up, sign-in, password reset, invitations, contact), with Cloudflare
 * Turnstile. The browser solves it and sends the one-time token in the `X-Captcha-Token` header; the console asks
 * Cloudflare whether that token is genuine, unused, issued on our own site and for this very form (a token from the
 * contact form cannot open a sign-in).
 *
 * Off until TURNSTILE_SECRET_KEY is set. A missing token, or one Cloudflare rejects, is always refused. When
 * Cloudflare cannot be reached, a `strict` check (sign-up and the forms that send email) is refused too, so nothing
 * automated slips through during an outage; a non-strict check (sign-in) goes through, because the attempt limits
 * and the firewall blocker still stand and an outage must not lock every customer out.
 */
@Injectable()
export class CaptchaService {
  private readonly log = new Logger('Captcha');
  private readonly secret: string;
  private readonly hosts: Set<string>;
  // the server's own address (its health and test scripts): it cannot be forged from outside (it comes from the
  // connection, through the trusted proxy), and whoever can send from it already controls the server
  private readonly trusted: Set<string>;

  constructor(config: ConfigService) {
    this.secret = (config.get<string>('TURNSTILE_SECRET_KEY') ?? '').trim();
    const app = (() => {
      try {
        return new URL(config.get<string>('APP_URL') ?? '').hostname;
      } catch {
        return '';
      }
    })();
    const extra = (config.get<string>('TURNSTILE_HOSTNAMES') ?? '').split(',').map((h) => h.trim()).filter(Boolean);
    this.hosts = new Set([app, ...extra].filter(Boolean));
    this.trusted = new Set((config.get<string>('TURNSTILE_TRUSTED_IPS') ?? '').split(',').map((h) => h.trim()).filter(Boolean));
    this.log.log(this.secret ? `human check on (${TEST_SECRET.test(this.secret) ? 'test keys' : 'live keys'})` : 'human check off (no TURNSTILE_SECRET_KEY)');
  }

  get enabled(): boolean {
    return !!this.secret;
  }

  async check(token: unknown, action: string, ip: string, strict = false): Promise<void> {
    if (!this.secret || this.trusted.has(ip)) return;
    if (typeof token !== 'string' || !token || token.length > 2048) throw this.refuse();
    let res: { success?: boolean; action?: string; hostname?: string; 'error-codes'?: string[] };
    try {
      const r = await fetch(VERIFY_URL, {
        method: 'POST',
        body: new URLSearchParams({ secret: this.secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) throw new Error(`answered ${r.status}`);
      res = (await r.json()) as typeof res;
    } catch (e) {
      if (strict) {
        this.log.warn(`could not reach the check (${(e as Error).message}); refusing this ${action}`);
        throw this.refuse();
      }
      this.log.warn(`could not reach the check (${(e as Error).message}); letting this ${action} through`);
      return;
    }
    if (!res.success) {
      this.log.log(`${action}: token refused (${(res['error-codes'] ?? []).join(',') || 'no reason'})`);
      throw this.refuse();
    }
    // the test keys answer for any site and any form; live tokens must be ours and for this form
    if (!TEST_SECRET.test(this.secret) && (res.action !== action || !this.hosts.has(res.hostname ?? ''))) {
      this.log.warn(`${action}: token for another form or site (${res.action ?? '-'} on ${res.hostname ?? '-'})`);
      throw this.refuse();
    }
  }

  private refuse() {
    return new BadRequestException({ code: 'captcha_failed', message: 'Please complete the security check and try again.' });
  }
}
