import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { clientIp } from '../kyc/client-ip';
import { RateLimiter } from '../kyc/stores';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { DeviceIdDto, ForgotDto, LoginDto, MfaCodeDto, OnboardingDto, RegisterDto, ResetDto, VerifyEmailDto } from './dto/auth.dto';
import { can, ROLE_NAMES, type Capability } from './roles';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

/** Multiple-choice answers only: short ids and short values, a handful of each. */
function cleanAnswers(raw: unknown): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const ok = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_-]{1,40}$/.test(v);
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (!/^[a-z0-9_]{1,40}$/.test(k)) continue;
    if (ok(v)) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter(ok).slice(0, 12);
  }
  return out;
}

// "Stay signed in": the session cookie outlives the browser session (persists
// across restarts/shutdown) for 30 days, matching the Zitadel session lifetime.
// httpOnly (no JS access → XSS can't read it), sameSite lax (CSRF), and the
// server-side session is revoked on logout so a stale cookie is worthless.
const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
// The trusted-device id: a long-lived, httpOnly marker that survives logout, so
// a device stays recognised across sessions until it's explicitly removed.
const ONE_YEAR = 1000 * 60 * 60 * 24 * 365;
// Secure (HTTPS-only) in production; read when a cookie is set, so the deployed env decides.
const cookieOpts = () => ({ httpOnly: true as const, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === 'true', path: '/' });

type SessionCookie = { sessionId: string; sessionToken: string; remember?: boolean };

/**
 * `/api/auth/*` — the control-plane auth surface.
 *
 * Session state lives in httpOnly cookies (never readable by JS): `vs_session`
 * once fully authenticated, `vs_mfa` while a login is waiting on the 2nd factor.
 * All credential/MFA work happens inside Zitadel; this only orchestrates.
 */
@Controller('api/auth')
export class AuthController {
  // attempts per address and per account (in memory, this process): guessing a password or a code stays slow,
  // and the firewall blocker bans an address that keeps failing
  private readonly limiter = new RateLimiter();

  constructor(
    private readonly auth: AuthService,
    private readonly captcha: CaptchaService,
    private readonly notes: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** A burst of wrong passwords on one account: its owner hears about it once (per half hour), never per attempt. */
  private async failedBurst(email: string) {
    if (!email || !this.limiter.take(`notice:failed:${email}`, 1, 30 * 60_000)) return;
    const acct = await this.auth.accountOf(email);
    if (!acct) return;
    this.notes.notify({
      org: acct.orgId,
      user: acct.userId,
      kind: 'security.failed_sign_ins',
      tone: 'danger',
      title: 'Several failed sign-in attempts',
      body: "Someone entered many wrong passwords for your account, so sign-in is paused for a few minutes. If it wasn't you, change your password.",
      href: '/settings/',
    });
  }

  private readonly log = new Logger('Auth');

  private slowDown(keys: [string, number, number][]) {
    for (const [key, limit, windowMs] of keys)
      if (!this.limiter.take(key, limit, windowMs))
        throw new HttpException(
          { code: 'too_many', message: 'Too many attempts. Please wait a few minutes and try again.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
  }

  /** `strict`: also refuse when the check service cannot be reached (sign-up and the forms that send email). */
  private human(req: Request, action: string, strict = false) {
    return this.captcha.check(req.headers['x-captcha-token'], action, clientIp(req), strict);
  }

  private readCookie(req: Request, name: string): SessionCookie | null {
    const raw = (req.cookies?.[name] as string | undefined) ?? undefined;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionCookie;
    } catch {
      return null;
    }
  }

  /** Revalidate a signed-in session and apply the tenant's idle/IP policy before direct auth mutations. */
  private async requireActiveSession(req: Request): Promise<SessionCookie> {
    const session = this.readCookie(req, 'vs_session');
    if (!session) throw new UnauthorizedException('not signed in');
    const me = await this.auth.me(session.sessionId, clientIp(req));
    if (!me.userId || !me.passwordVerified) throw new UnauthorizedException('not signed in');
    return session;
  }

  // maxAge omitted → a SESSION cookie (cleared when the browser closes), which
  // is what "Keep me signed in = off" means. A number → a persistent cookie.
  private setSession(res: Response, name: string, value: SessionCookie, maxAge?: number) {
    const opts = maxAge !== undefined ? { ...cookieOpts(), maxAge } : { ...cookieOpts() };
    res.cookie(name, JSON.stringify(value), opts);
  }

  /** vs_session lifetime from the "Keep me signed in" choice. */
  private sessionMaxAge(remember?: boolean): number | undefined {
    return remember ? THIRTY_DAYS : undefined;
  }

  private readDevice(req: Request): string | undefined {
    return (req.cookies?.['vs_device'] as string | undefined) || undefined;
  }
  private setDevice(res: Response, id: string) {
    res.cookie('vs_device', id, { ...cookieOpts(), maxAge: ONE_YEAR });
  }
  private userAgent(req: Request): string {
    return (req.headers['user-agent'] as string | undefined) ?? '';
  }

  /**
   * Record which browser/computer a just-completed login came from, refresh the
   * `vs_device` marker, and return the response fields that tell the UI whether
   * to toast a "new device" heads-up. Never blocks — recognition is advisory.
   */
  private async finishSignIn(req: Request, res: Response, userId: string | null, email: string | null | undefined) {
    const dev = await this.auth.recordSignIn(userId, email, this.readDevice(req), this.userAgent(req));
    this.setDevice(res, dev.deviceId);
    if (userId) {
      void this.auth.orgOfUser(userId).then((orgId) => {
        if (orgId) this.audit.record(orgId, email || userId, 'auth.signed_in', `successful sign-in from ${dev.deviceName || 'a device'}`, clientIp(req));
      }).catch(() => undefined);
    }
    // only a sign-in from a device or browser not seen before (the same device again stacks onto one notification)
    if (dev.isNew && userId)
      void this.auth.orgOfUser(userId).then((org) => {
        if (org)
          this.notes.notify({
            org,
            user: userId,
            kind: 'security.new_sign_in',
            tone: 'warning',
            title: 'New sign-in to your account',
            body: `From ${dev.deviceName || 'a new device'}. If this wasn't you, change your password in Settings.`,
            href: '/settings/',
          });
      });
    return { status: 'authenticated' as const, newDevice: dev.isNew, deviceName: dev.deviceName };
  }

  @Get('health')
  health() {
    return this.auth.health();
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    this.slowDown([[`register:${clientIp(req)}`, 10, 60 * 60_000]]);
    await this.human(req, 'signup', true);
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const email = String(dto.email ?? '').trim().toLowerCase();
    this.slowDown([[`login:ip:${clientIp(req)}`, 30, 15 * 60_000]]);
    try {
      this.slowDown([[`login:acct:${email}`, 10, 15 * 60_000]]);
    } catch (e) {
      void this.failedBurst(email);
      throw e;
    }
    await this.human(req, 'login');
    const r = await this.auth.login(dto);
    if (r.status === 'email_unverified') {
      // No session is handed out until the email is confirmed. A fresh code was
      // just emailed; the client takes the person to the verify-email step.
      return { status: 'email_unverified', email: r.email };
    }
    if (r.status === 'mfa_required') {
      // Hold the session in a short-lived cookie until the 2nd factor lands.
      // Carry the "keep me signed in" choice through to when vs_session is set.
      this.setSession(
        res,
        'vs_mfa',
        { sessionId: r.sessionId, sessionToken: r.sessionToken, remember: !!dto.remember },
        1000 * 60 * 5,
      );
      return { status: 'mfa_required', factors: r.factors };
    }
    this.setSession(
      res,
      'vs_session',
      { sessionId: r.sessionId, sessionToken: r.sessionToken },
      this.sessionMaxAge(dto.remember),
    );
    return this.finishSignIn(req, res, r.userId, dto.email);
  }

  @Post('mfa')
  @HttpCode(HttpStatus.OK)
  async mfa(@Body() dto: MfaCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const pending = this.readCookie(req, 'vs_mfa');
    if (!pending) throw new UnauthorizedException('no pending MFA challenge');
    this.slowDown([
      [`mfa:ip:${clientIp(req)}`, 20, 10 * 60_000],
      [`mfa:session:${pending.sessionId}`, 6, 10 * 60_000],
    ]);
    const { sessionToken, userId, loginName } = await this.auth.completeMfa(
      pending.sessionId,
      pending.sessionToken,
      dto.code,
    );

    // The 2nd factor passed — the login is done and is NEVER blocked by which
    // browser/computer it came from. We still recognise the device: a new one
    // is let straight in but flagged (toast) and emailed as a heads-up.
    res.clearCookie('vs_mfa', { path: '/' });
    this.setSession(
      res,
      'vs_session',
      { sessionId: pending.sessionId, sessionToken },
      this.sessionMaxAge(pending.remember),
    );
    return this.finishSignIn(req, res, userId, loginName);
  }

  @Get('me')
  async me(@Req() req: Request) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    return this.auth.me(s.sessionId, clientIp(req));
  }

  /** Profile tab: change the signed-in person's name. */
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(@Body() body: { name?: unknown }, @Req() req: Request) {
    const s = await this.requireActiveSession(req);
    return this.auth.updateProfileName(s.sessionId, typeof body?.name === 'string' ? body.name : '');
  }

  /** Profile tab: set (or clear) the profile photo. The browser sends a small downscaled data URL. */
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  async setAvatar(@Body() body: { image?: unknown }, @Req() req: Request) {
    const s = await this.requireActiveSession(req);
    return this.auth.setAvatar(s.sessionId, typeof body?.image === 'string' ? body.image : '');
  }

  /** Business tab: rename the organisation (owner or admin only). */
  @Patch('org')
  @HttpCode(HttpStatus.OK)
  async renameOrg(@Body() body: { name?: unknown }, @Req() req: Request) {
    const s = await this.requireActiveSession(req);
    return this.auth.renameOrg(s.sessionId, typeof body?.name === 'string' ? body.name : '');
  }

  /** Onboarding was shown to this account: it is offered once, never on a later sign-in. */
  @Post('onboarding/seen')
  @HttpCode(HttpStatus.OK)
  async onboardingSeen(@Req() req: Request) {
    const s = await this.requireActiveSession(req);
    return this.auth.markOnboardingSeen(s.sessionId);
  }

  /** The onboarding answers, after sign-up: which portal, and the multiple-choice answers. */
  @Post('onboarding')
  @HttpCode(HttpStatus.OK)
  async onboarding(@Body() dto: OnboardingDto, @Req() req: Request) {
    const s = await this.requireActiveSession(req);
    return this.auth.saveOnboarding(s.sessionId, dto.portal, cleanAnswers(dto.answers));
  }

  /**
   * The one sign-in check for every portal's APIs: the gateway asks this before passing a request
   * on, and forwards the organisation it returns, so each service only sees that organisation's data.
   */
  @Get('check')
  async check(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const s = this.readCookie(req, 'vs_session');
    const who = s ? await this.auth.sessionOrg(s.sessionId) : null;
    if (!who) throw new UnauthorizedException('not signed in');
    await this.auth.enforceRequestSecurity(who.orgId, s!.sessionId, clientIp(req));
    // what the request is for (the gateway passes its method and path) and whether the person's role allows it
    const need = financialNeed(String(req.headers['x-forwarded-method'] ?? ''), String(req.headers['x-forwarded-uri'] ?? ''));
    if (need) {
      const role = await this.auth.roleFor(who.userId, who.orgId);
      const caps = await this.auth.capabilitiesFor(who.userId, who.orgId);
      if (!caps.includes(need))
        throw new ForbiddenException({
          error: {
            code: 'forbidden',
            message: `Your permissions (${ROLE_NAMES[role]}) do not let you ${need === 'run' ? 'run reads or lookups' : 'see scans'}. Ask an Owner or Admin of your team.`,
          },
        });
    }
    res.setHeader('X-VeriSec-Org', who.orgId);
    res.setHeader('X-VeriSec-User', who.userId);
    res.setHeader('Cache-Control', 'no-store');
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const s = this.readCookie(req, 'vs_session');
    if (s) {
      const who = await this.auth.sessionOrg(s.sessionId).catch(() => null);
      if (who) this.audit.record(who.orgId, who.userId, 'auth.signed_out', 'signed out', clientIp(req));
      await this.auth.logout(s.sessionId, s.sessionToken);
    }
    res.clearCookie('vs_session', { path: '/' });
    res.clearCookie('vs_mfa', { path: '/' });
    return { ok: true };
  }

  /* ---- Google sign-in (full-page redirects, not fetch) ---- */

  /* ---- Organization SAML sign-in (Zitadel IdP intent) ---- */

  @Get('sso/start')
  async ssoStart(@Query('email') email: string | undefined, @Query('next') next: string | undefined, @Req() req: Request, @Res() res: Response) {
    try {
      this.slowDown([[`sso:ip:${clientIp(req)}`, 20, 15 * 60_000]]);
      const flow = await this.auth.ssoStart(email ?? '', next);
      res.cookie('vs_sso', flow.state, { ...cookieOpts(), maxAge: 10 * 60_000 });
      return res.redirect(302, flow.url);
    } catch (e) {
      this.log.warn(`SAML sign-in could not start: ${(e as Error).message}`);
      res.clearCookie('vs_sso', { path: '/' });
      return res.redirect(302, `${this.auth.frontendUrl}/login?error=sso`);
    }
  }

  @Get('sso/callback')
  async ssoCallback(
    @Query('state') state: string | undefined,
    @Query('idpIntentId') idpIntentId: string | undefined,
    @Query('idpIntentToken') idpIntentToken: string | undefined,
    @Query('id') intentId: string | undefined,
    @Query('token') intentToken: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const app = this.auth.frontendUrl;
    const browserState = req.cookies?.['vs_sso'] as string | undefined;
    res.clearCookie('vs_sso', { path: '/' });
    if (error) return res.redirect(302, `${app}/login?error=sso`);
    const id = idpIntentId ?? intentId;
    const token = idpIntentToken ?? intentToken;
    if (!state || !id || !token) return res.redirect(302, `${app}/login?error=sso`);
    try {
      const r = await this.auth.ssoFinish(id, token, state, browserState);
      const next = r.next ?? '/onboarding/';
      if (r.mfa) {
        this.setSession(res, 'vs_mfa', { sessionId: r.sessionId, sessionToken: r.sessionToken, remember: true }, 1000 * 60 * 5);
        const suffix = next.startsWith('/mfa') ? '' : `?next=${encodeURIComponent(next)}`;
        return res.redirect(302, `${app}/mfa/${suffix}`);
      }
      this.setSession(res, 'vs_session', { sessionId: r.sessionId, sessionToken: r.sessionToken }, THIRTY_DAYS);
      await this.finishSignIn(req, res, r.userId, r.email).catch(() => undefined);
      return res.redirect(302, next);
    } catch (e) {
      this.log.warn(`SAML sign-in not completed: ${(e as Error).message}`);
      return res.redirect(302, `${app}/login?error=sso`);
    }
  }

  /** The "Continue with Google" button points here (with the page to land on after, if any); we 302 to Google. */
  @Get('google/start')
  googleStart(@Query('next') next: string | undefined, @Req() req: Request, @Res() res: Response) {
    try {
      this.slowDown([[`google:ip:${clientIp(req)}`, 30, 15 * 60_000]]);
      const { url, state } = this.auth.googleStart(next);
      // the flow belongs to this browser: the callback must come back with the same state
      res.cookie('vs_g', state, { ...cookieOpts(), maxAge: 10 * 60_000 });
      return res.redirect(302, url);
    } catch {
      return res.redirect(302, `${this.auth.frontendUrl}/login?error=google`);
    }
  }

  /**
   * Google sends the browser back here. The console checks the answer (see AuthService.googleFinish), opens the
   * session, and sends the person on: to onboarding, which a returning account skips straight to its portal, or to
   * the two-step check first when they have one.
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const app = this.auth.frontendUrl;
    const browserState = req.cookies?.['vs_g'] as string | undefined;
    res.clearCookie('vs_g', { path: '/' });
    // the person closed Google's window or said no: back to sign-in, quietly
    if (error === 'access_denied') return res.redirect(302, `${app}/login/`);
    if (error || !code || !state) return res.redirect(302, `${app}/login?error=google`);
    try {
      const r = await this.auth.googleFinish(code, state, browserState);
      const next = r.next ? `?next=${encodeURIComponent(r.next)}` : '';
      if (r.mfa) {
        this.setSession(res, 'vs_mfa', { sessionId: r.sessionId, sessionToken: r.sessionToken, remember: true }, 1000 * 60 * 5);
        return res.redirect(302, `${app}/mfa/${next}`);
      }
      this.setSession(res, 'vs_session', { sessionId: r.sessionId, sessionToken: r.sessionToken }, THIRTY_DAYS);
      await this.finishSignIn(req, res, r.userId, r.email).catch(() => undefined);
      return res.redirect(302, `${app}/onboarding/${next}`);
    } catch (e) {
      this.log.warn(`google sign-in not completed: ${(e as Error).message}`);
      return res.redirect(302, `${app}/login?error=google`);
    }
  }

  /** Two-factor on the current session, without signing out: the code from the authenticator app. */
  @Post('mfa/step-up')
  @HttpCode(HttpStatus.OK)
  async stepUp(@Body() dto: MfaCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    this.slowDown([
      [`stepup:ip:${clientIp(req)}`, 20, 10 * 60_000],
      [`stepup:session:${s.sessionId}`, 6, 10 * 60_000],
    ]);
    const me = await this.auth.me(s.sessionId, clientIp(req));
    if (!me.mfaEnabled)
      throw new ForbiddenException({ code: 'no_2fa', message: 'Turn on two-factor sign-in first, in Settings, Security.' });
    let r: { sessionToken: string; remainingMs: number };
    try {
      r = await this.auth.stepUp(s.sessionId, s.sessionToken, String(dto.code ?? '').replace(/\D/g, ''));
    } catch {
      throw new UnauthorizedException({ code: 'wrong_code', message: "That code didn't work. Check your authenticator app and try again." });
    }
    // the same sign-in, now two-factor: a 30-day one stays 30 days, a browser-session one stays that
    this.setSession(res, 'vs_session', { sessionId: s.sessionId, sessionToken: r.sessionToken }, r.remainingMs > 13 * 3600_000 ? r.remainingMs : undefined);
    if (me.userId) this.auth.forgetRole(me.userId);
    return { ok: true };
  }

  /* ---- MFA enrolment ("enable MFA in the platform") ---- */

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  async mfaSetup(@Req() req: Request) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    const me = await this.auth.me(s.sessionId, clientIp(req));
    if (!me.userId) throw new UnauthorizedException('no user in session');
    return this.auth.enrollTotp(me.userId);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async mfaVerify(@Body() dto: MfaCodeDto, @Req() req: Request) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    const me = await this.auth.me(s.sessionId, clientIp(req));
    if (!me.userId) throw new UnauthorizedException('no user in session');
    await this.auth.verifyTotpEnrollment(me.userId, dto.code);
    this.audit.record(me.orgId ?? undefined, me.loginName ?? me.userId, 'mfa.enabled', 'TOTP two-factor authentication enabled', clientIp(req));
    return { ok: true, enabled: true };
  }

  /* ---- passkey / security key (WebAuthn) registration ---- */

  @Post('passkey/register/begin')
  @HttpCode(HttpStatus.OK)
  async passkeyBegin(@Req() req: Request) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    const me = await this.auth.me(s.sessionId, clientIp(req));
    if (!me.userId) throw new UnauthorizedException('no user in session');
    const { u2fId, options } = await this.auth.passkeyRegisterBegin(me.userId);
    return { u2fId, options };
  }

  @Post('passkey/register/finish')
  @HttpCode(HttpStatus.OK)
  async passkeyFinish(@Body() body: { u2fId: string; credential: unknown; name?: string }, @Req() req: Request) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    const me = await this.auth.me(s.sessionId, clientIp(req));
    if (!me.userId) throw new UnauthorizedException('no user in session');
    await this.auth.passkeyRegisterFinish(me.userId, body.u2fId, body.credential, body.name ?? 'Passkey');
    this.audit.record(me.orgId ?? undefined, me.loginName ?? me.userId, 'mfa.passkey_added', 'a passkey was registered', clientIp(req));
    return { ok: true, enabled: true };
  }

  /* ---- MFA at login: available factors + the WebAuthn path ---- */

  @Get('mfa/options')
  async mfaOptions(@Req() req: Request) {
    const pending = this.readCookie(req, 'vs_mfa');
    if (!pending) throw new UnauthorizedException('no pending MFA challenge');
    return this.auth.pendingFactors(pending.sessionId);
  }

  @Post('mfa/webauthn/begin')
  @HttpCode(HttpStatus.OK)
  async mfaWebauthnBegin(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const pending = this.readCookie(req, 'vs_mfa');
    if (!pending) throw new UnauthorizedException('no pending MFA challenge');
    const { sessionToken, options } = await this.auth.webauthnLoginBegin(pending.sessionId, pending.sessionToken);
    // The session token rotates on every update — persist the newest one, and
    // carry the "keep me signed in" choice through.
    this.setSession(
      res,
      'vs_mfa',
      { sessionId: pending.sessionId, sessionToken, remember: pending.remember },
      1000 * 60 * 5,
    );
    return { options };
  }

  @Post('mfa/webauthn/finish')
  @HttpCode(HttpStatus.OK)
  async mfaWebauthnFinish(
    @Body() body: { credential: unknown },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pending = this.readCookie(req, 'vs_mfa');
    if (!pending) throw new UnauthorizedException('no pending MFA challenge');
    const { sessionToken, userId, loginName } = await this.auth.webauthnLoginFinish(
      pending.sessionId,
      pending.sessionToken,
      body.credential,
    );

    // The passkey IS the strong device identity: its private key only exists on
    // the phone that registered it, so a valid assertion already proves a known
    // phone. We still recognise the browser/computer — a new one is allowed but
    // flagged (toast) and emailed — but it never blocks the sign-in.
    res.clearCookie('vs_mfa', { path: '/' });
    this.setSession(
      res,
      'vs_session',
      { sessionId: pending.sessionId, sessionToken },
      this.sessionMaxAge(pending.remember),
    );
    return this.finishSignIn(req, res, userId, loginName);
  }

  /* ---- trusted devices ---- */

  @Get('devices')
  async devices(@Req() req: Request) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    const me = await this.auth.me(s.sessionId, clientIp(req));
    if (!me.userId) throw new UnauthorizedException('no user in session');
    const { trusted, pending } = await this.auth.listDevices(me.userId);
    return { current: this.readDevice(req) ?? null, trusted, pending };
  }

  @Post('devices/approve')
  @HttpCode(HttpStatus.OK)
  async approveDevice(@Body() dto: DeviceIdDto, @Req() req: Request) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    const me = await this.auth.me(s.sessionId, clientIp(req));
    if (!me.userId) throw new UnauthorizedException('no user in session');
    await this.auth.approveDevice(me.userId, dto.id);
    this.audit.record(me.orgId ?? undefined, me.loginName ?? me.userId, 'device.approved', 'a sign-in device was trusted', clientIp(req));
    return { ok: true };
  }

  @Post('devices/remove')
  @HttpCode(HttpStatus.OK)
  async removeDevice(@Body() dto: DeviceIdDto, @Req() req: Request) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    const me = await this.auth.me(s.sessionId, clientIp(req));
    if (!me.userId) throw new UnauthorizedException('no user in session');
    await this.auth.removeDevice(me.userId, dto.id);
    this.audit.record(me.orgId ?? undefined, me.loginName ?? me.userId, 'device.removed', 'a trusted sign-in device was removed', clientIp(req));
    return { ok: true };
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  async mfaDisable(@Req() req: Request) {
    const s = this.readCookie(req, 'vs_session');
    if (!s) throw new UnauthorizedException('not signed in');
    const me = await this.auth.me(s.sessionId, clientIp(req));
    if (!me.userId) throw new UnauthorizedException('no user in session');
    await this.auth.disableMfa(me.userId);
    this.audit.record(me.orgId ?? undefined, me.loginName ?? me.userId, 'mfa.disabled', 'two-factor authentication methods were removed', clientIp(req));
    return { ok: true, enabled: false };
  }

  /* ---- email verification + password reset ---- */

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    this.slowDown([
      [`verify:ip:${clientIp(req)}`, 30, 15 * 60_000],
      [`verify:acct:${String(dto.email ?? '').trim().toLowerCase()}`, 10, 15 * 60_000],
    ]);
    await this.auth.verifyEmail(dto.email, dto.code);
    return { ok: true, verified: true };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ForgotDto, @Req() req: Request) {
    this.slowDown([
      [`resend:ip:${clientIp(req)}`, 10, 60 * 60_000],
      [`resend:acct:${String(dto.email ?? '').trim().toLowerCase()}`, 3, 60 * 60_000],
    ]);
    await this.human(req, 'resend', true);
    await this.auth.resendVerification(dto.email);
    return { ok: true };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgot(@Body() dto: ForgotDto, @Req() req: Request) {
    this.slowDown([
      [`forgot:ip:${clientIp(req)}`, 10, 60 * 60_000],
      [`forgot:acct:${String(dto.email ?? '').trim().toLowerCase()}`, 3, 60 * 60_000],
    ]);
    await this.human(req, 'reset', true);
    await this.auth.forgot(dto.email);
    // Always ok — never reveal whether the email is registered.
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async reset(@Body() dto: ResetDto, @Req() req: Request) {
    this.slowDown([
      [`reset:ip:${clientIp(req)}`, 20, 15 * 60_000],
      [`reset:acct:${String(dto.email ?? '').trim().toLowerCase()}`, 6, 15 * 60_000],
    ]);
    await this.human(req, 'reset_confirm');
    await this.auth.reset(dto.email, dto.code, dto.password);
    return { ok: true };
  }
}

/**
 * What a Financial portal request needs from the person's role: reads and lookups (priced) need "run"; looking at scans,
 * images, logos and logs needs the summary view (everyone but Billing); warm-up and health need only a sign-in.
 */
function financialNeed(method: string, uri: string): Capability | null {
  const path = uri.split('?')[0] ?? '';
  if (!path.startsWith('/fin-api/')) return null;
  if (/\/(health|v2\/(cheques|cards)\/warm)$/.test(path)) return null;
  if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') return 'run';
  if (/^\/fin-api\/(micr\/v2\/banks|card\/v2\/bin\/)/.test(path) && !/\/logo$/.test(path)) return 'run';
  return 'verifications.summary';
}
