import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { BadRequestException, ForbiddenException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MailService } from '../mail/mail.service';
import { ZitadelService } from '../zitadel/zitadel.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { effectiveCapabilities, isRole, parsePermissions, type Capability, type Role } from './roles';
import { businessProblem, emailProblem, firstNameProblem, lastNameProblem } from './identity-rules';
import { DISPOSABLE_DOMAINS } from '../kyc/disposable-domains';

export type LoginResult =
  | { status: 'authenticated'; sessionId: string; sessionToken: string; userId: string }
  | { status: 'mfa_required'; sessionId: string; sessionToken: string; userId: string; factors: string[] }
  | { status: 'email_unverified'; email: string };

/** A device the account owner has trusted (bound at MFA enrolment / first login). */
export interface TrustedDevice {
  id: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
}
/** A new device awaiting approval from a trusted one. */
export interface PendingDevice {
  id: string;
  name: string;
  code: string;
  requestedAt: string;
}
const TRUSTED_KEY = 'trusted_devices';
const PENDING_KEY = 'pending_devices';

/** Which portal an account came for (decides where its sign-ins land). */
export type Portal = 'kyc' | 'fin';
export type Onboarding = { portal: Portal; answers: Record<string, string | string[]>; completedAt: string };
const ONBOARDING_KEY = 'vs_onboarding';
/** When onboarding was first shown to the account: it is offered once, after sign-up, never again. */
const ONBOARDING_SEEN_KEY = 'vs_onboarding_seen';

function parseOnboarding(raw: string | undefined): Onboarding | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Onboarding>;
    return v && (v.portal === 'kyc' || v.portal === 'fin') ? { portal: v.portal, answers: v.answers ?? {}, completedAt: String(v.completedAt ?? '') } : null;
  } catch {
    return null;
  }
}

/** The session was opened by a Google sign-in the console checked (session metadata only the console writes). */
function viaGoogle(sess: any): boolean {
  const v = sess?.metadata?.vs_auth;
  if (typeof v !== 'string') return false;
  try {
    return Buffer.from(v, 'base64').toString('utf8') === 'google';
  } catch {
    return false;
  }
}

@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');
  private readonly appUrl: string;
  private readonly consoleUrl: string;

  constructor(
    private readonly zitadel: ZitadelService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const appOrigin = new URL(this.appUrl);
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(appOrigin.hostname);
    const localConsoleUrl = `${appOrigin.protocol}//${appOrigin.hostname}:${config.get<string>('CONSOLE_PORT') ?? '3001'}`;
    this.consoleUrl = (config.get<string>('CONSOLE_PUBLIC_URL') ?? (localHost ? localConsoleUrl : '')).replace(/\/$/, '');
    // the Google OAuth client this platform signs people in with (the same client Zitadel was given)
    this.googleId = (config.get<string>('GOOGLE_CLIENT_ID') ?? config.get<string>('ZITADEL_GOOGLE_CLIENT_ID') ?? '').trim();
    this.googleSecret = (config.get<string>('GOOGLE_CLIENT_SECRET') ?? config.get<string>('ZITADEL_GOOGLE_CLIENT_SECRET') ?? '').trim();
    // The WebAuthn Relying-Party ID — the registrable domain passkeys bind to.
    // "localhost" for dev; set WEBAUTHN_RPID to the shared apex in production.
    this.rpId = config.get<string>('WEBAUTHN_RPID') ?? 'localhost';
  }

  private readonly rpId: string;
  private readonly googleId: string;
  private readonly googleSecret: string;

  /** Where finished flows land in the app. */
  get frontendUrl(): string {
    return this.appUrl;
  }

  /** External authentication needs a reachable public callback URL in production. */
  private callbackOrigin(): string {
    if (!this.consoleUrl) {
      throw new ServiceUnavailableException('External sign-in is not configured: set CONSOLE_PUBLIC_URL to the public HTTPS console API origin.');
    }
    return this.consoleUrl;
  }

  /** Connectivity check — proves the console ↔ Zitadel wiring. */
  health() {
    return this.zitadel.ping();
  }

  /** Create a business tenant (org + Owner), then email our verify code. */
  async register(dto: RegisterDto) {
    // a real person and a real business: the same rules as the sign-up page, for requests that skip it
    const [first = '', ...rest] = String(dto.fullName ?? '').trim().split(/\s+/);
    const domain = String(dto.email ?? '').trim().toLowerCase().split('@')[1] ?? '';
    const problems: [string, string | null][] = [
      ['first_name', firstNameProblem(first)],
      ['last_name', lastNameProblem(rest.join(' '))],
      ['email', emailProblem(dto.email ?? '') ?? (DISPOSABLE_DOMAINS.has(domain) ? 'Use your work email, not a temporary inbox.' : null)],
      ['business', businessProblem(dto.businessName ?? '')],
    ];
    const bad = problems.find(([, p]) => p);
    if (bad) throw new BadRequestException({ code: `invalid_${bad[0]}`, field: bad[0], message: bad[1] });
    const created = await this.zitadel.createTenant({
      ...dto,
      fullName: `${first} ${rest.join(' ')}`.trim(),
      businessName: String(dto.businessName).trim().replace(/\s+/g, ' '),
      email: String(dto.email).trim(),
    });
    // Deliver the verification code in our own branded email. Best-effort:
    // a mail hiccup must not fail the signup — the user can always resend.
    try {
      const code = await this.zitadel.mintEmailCode(created.userId);
      await this.mail.sendVerifyCode(dto.email, code);
    } catch (e) {
      this.log.warn(`verify email not sent: ${(e as Error).message}`);
    }
    return created;
  }

  /** Whether this user has confirmed their email address (Zitadel's human email flag). */
  private async emailVerified(userId: string): Promise<boolean> {
    const u = await this.zitadel.getUser(userId).catch(() => null);
    return !!u?.human?.email?.isVerified;
  }

  /** A friendly timestamp for the sign-in / new-device emails. */
  private nowText(): string {
    return (
      new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' (UTC)'
    );
  }

  /** A sign-in alert (fire-and-forget — never blocks or fails a login). */
  notifySignIn(email?: string | null): void {
    if (!email) return;
    void this.mail
      .sendSignInAlert(email, this.nowText())
      .catch((e) => this.log.warn(`sign-in alert not sent: ${e.message}`));
  }

  /** A new-device heads-up (fire-and-forget — informational, never blocks). */
  notifyNewDevice(email: string | null | undefined, deviceName: string): void {
    if (!email) return;
    void this.mail
      .sendNewDeviceAlert(email, deviceName, this.nowText())
      .catch((e) => this.log.warn(`new-device alert not sent: ${e.message}`));
  }

  /**
   * Verify the password, then decide whether a second factor is needed.
   * MFA is opt-in: we only require it if this user has enrolled a factor.
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    let sessionId: string;
    let sessionToken: string;
    try {
      ({ sessionId, sessionToken } = await this.zitadel.createSessionWithPassword(dto));
    } catch {
      // Wrong email/password (or unknown user) → a clean 401, so the client can
      // show "that email or password doesn't match" rather than a generic error.
      throw new UnauthorizedException('invalid credentials');
    }
    const sess = await this.zitadel.getSession(sessionId);
    const userId: string = sess?.factors?.user?.id ?? '';
    // First sign-up must confirm the email. If this account's address has not
    // been verified yet, no session is handed out: we end the one just opened,
    // send a fresh code, and tell the client to take the person to the
    // verify-email step. (Google sign-in arrives already verified, and existing
    // accounts were marked verified when this was turned on, so only accounts
    // created from here on ever see this.)
    if (userId && !(await this.emailVerified(userId))) {
      await this.zitadel.endSession(sessionId).catch(() => {});
      try {
        const code = await this.zitadel.mintEmailCode(userId);
        await this.mail.sendVerifyCode(dto.email, code);
      } catch (e) {
        this.log.warn(`verify email (login) not sent: ${(e as Error).message}`);
      }
      return { status: 'email_unverified', email: dto.email };
    }
    let factors: string[] = [];
    if (userId) {
      const orgId = await this.zitadel.getUserOrg(userId);
      factors = await this.zitadel.userMfaFactors(userId, orgId);
    }
    if (factors.length > 0) {
      return { status: 'mfa_required', sessionId, sessionToken, userId, factors };
    }
    // Fully authenticated on the first factor. The sign-in / new-device alert is
    // sent by the controller via recordSignIn (it has the device cookie + UA).
    return { status: 'authenticated', sessionId, sessionToken, userId };
  }

  /**
   * Confirm two-factor sign-in on a session that is already signed in (before a sensitive action such as creating an
   * API key): the authenticator's code is checked on that same session. Returns the new session token and how long
   * the session has left, so the cookie keeps its lifetime.
   */
  async stepUp(sessionId: string, sessionToken: string, code: string): Promise<{ sessionToken: string; remainingMs: number }> {
    const r = await this.zitadel.sessionTotp(sessionId, sessionToken, code);
    const sess = await this.zitadel.getSession(sessionId).catch(() => null);
    const exp = sess?.expirationDate ? Date.parse(sess.expirationDate) : NaN;
    return { sessionToken: r.sessionToken, remainingMs: Number.isFinite(exp) ? exp - Date.now() : 0 };
  }

  /** Second factor at login: add the TOTP check to the pending session. */
  async completeMfa(sessionId: string, sessionToken: string, code: string) {
    const r = await this.zitadel.sessionTotp(sessionId, sessionToken, code);
    // Read the session once to get the user for the device gate + sign-in alert.
    const sess = await this.zitadel.getSession(sessionId).catch(() => null);
    const userId: string | null = sess?.factors?.user?.id ?? null;
    return { sessionToken: r.sessionToken, userId, loginName: sess?.factors?.user?.loginName ?? null };
  }

  /**
   * A first factor was verified on this session: the password, a passkey, an identity provider intent, or Google
   * (the console checked Google's ID token and marked the session; see createSessionForGoogle).
   */
  private signedIn(sess: any): boolean {
    const f = sess?.factors ?? {};
    return !!(f.password?.verifiedAt || f.webAuthN?.verifiedAt || f.intent?.verifiedAt || viaGoogle(sess));
  }

  /** The current session's user (identity + org + avatar), verified factors and onboarding. */
  private readonly roles = new Map<string, { role: Role; exp: number }>();
  private readonly touched = new Map<string, number>();

  /**
   * A person's role in their organisation (Zitadel metadata `vs_role`, written only by the console; Zitadel itself is
   * not reachable from outside). Someone with no role on record who is the organisation's first member signed it up,
   * so they own it, and that is saved. Anyone else without a role gets the least: Viewer. Cached for a minute.
   */
  async roleFor(userId: string, orgId: string, meta?: Record<string, string>): Promise<Role> {
    const hit = this.roles.get(userId);
    if (hit && hit.exp > Date.now()) return hit.role;
    let failed = false;
    const m = meta ?? (await this.zitadel.listUserMetadata(userId, orgId).catch(() => ((failed = true), {} as Record<string, string>)));
    let role: Role = 'viewer';
    if (isRole(m['vs_role'])) role = m['vs_role'];
    else if (!failed) {
      const first = (await this.zitadel.orgUsers(orgId).catch(() => ((failed = true), [])))[0];
      if (first?.userId === userId) {
        role = 'owner';
        await this.zitadel.setUserMetadata(userId, orgId, 'vs_role', 'owner').catch(() => undefined);
      }
    }
    // a lookup that failed is not remembered for long (it falls back to the least role meanwhile)
    this.roles.set(userId, { role, exp: Date.now() + (failed ? 5_000 : 60_000) });
    return role;
  }

  /** A role or a member's permissions changed: the next request reads them again, wherever it was cached. */
  forgetRole(userId: string) {
    this.roles.delete(userId);
    this.changed.set(userId, Date.now());
  }
  private readonly changed = new Map<string, number>();

  /** Whether this member's role or permissions changed after `since` (a guard's cached answer is then stale). */
  changedSince(userId: string, since: number): boolean {
    return (this.changed.get(userId) ?? 0) >= since;
  }

  /** What this member may do (the role plus their own changes), for checks outside the console's own guards. */
  async capabilitiesFor(userId: string, orgId: string): Promise<Capability[]> {
    const meta = await this.zitadel.listUserMetadata(userId, orgId).catch(() => ({}) as Record<string, string>);
    const role = await this.roleFor(userId, orgId, meta);
    return effectiveCapabilities(role, parsePermissions(meta['vs_perms']));
  }

  /** When a person was last active (for the Team page), written at most every fifteen minutes. */
  touch(userId: string, orgId: string) {
    const last = this.touched.get(userId) ?? 0;
    if (Date.now() - last < 15 * 60_000) return;
    this.touched.set(userId, Date.now());
    void this.zitadel.setUserMetadata(userId, orgId, 'vs_last_active', new Date().toISOString()).catch(() => undefined);
  }

  async me(sessionId: string, requestIp = '') {
    // a session that ended (signed out, expired, or ended by an Owner or Admin) is "not signed in", never an error
    const sess = await this.zitadel.getSession(sessionId).catch(() => null);
    if (!sess) throw new UnauthorizedException('not signed in');
    const f = sess?.factors ?? {};
    const userId: string | null = f.user?.id ?? null;
    let orgName: string | null = null;
    let avatarUrl: string | null = null;
    let mfaEnabled = false;
    let orgId: string | null = null;
    let onboarding: Onboarding | null = null;
    let onboardingSeen = false;
    let role: Role | null = null;
    let metaOf: Record<string, string> = {};
    // The live profile (not the session snapshot), so a name change on the Profile tab shows at once.
    let liveName: string | null = null;
    if (userId) {
      const prof = await this.zitadel.getUserProfile(userId).catch(() => null);
      orgId = (prof?.orgId || (await this.zitadel.getUserOrg(userId).catch(() => ''))) || null;
      if (orgId) await this.enforceRequestSecurity(orgId, sessionId, requestIp);
      liveName = prof ? [prof.givenName, prof.familyName].filter(Boolean).join(' ').trim() || prof.displayName || null : null;
      if (orgId) {
        const [name, meta, factors] = await Promise.all([
          this.zitadel.getOrgName(orgId).catch(() => null),
          this.zitadel.listUserMetadata(userId, orgId).catch(() => ({}) as Record<string, string>),
          this.zitadel.userMfaFactors(userId, orgId).catch(() => [] as string[]),
        ]);
        orgName = name;
        // A platform-uploaded avatar wins over the one carried from Google.
        avatarUrl = meta['avatar_platform'] || meta['avatar_google'] || null;
        // Whether 2FA is actually set up — so the toggle survives a refresh.
        mfaEnabled = factors.length > 0;
        onboarding = parseOnboarding(meta[ONBOARDING_KEY]);
        onboardingSeen = !!onboarding || !!meta[ONBOARDING_SEEN_KEY];
        role = await this.roleFor(userId, orgId, meta);
        metaOf = meta;
      }
    }
    return {
      userId,
      orgId,
      role,
      // the role's permissions with this member's own changes (an Owner or Admin sets them on the Team page)
      capabilities: role ? effectiveCapabilities(role, parsePermissions(metaOf['vs_perms'])) : [],
      customPermissions: !!role && role !== 'owner' && !!metaOf['vs_perms'] && (() => {
        const p = parsePermissions(metaOf['vs_perms']);
        return p.add.length + p.remove.length > 0;
      })(),
      onboarding,
      onboardingSeen,
      loginName: f.user?.loginName ?? null,
      displayName: liveName ?? f.user?.displayName ?? null,
      orgName,
      avatarUrl,
      mfaEnabled,
      // a first factor: the password, or Google (the gates that ask for it accept either)
      passwordVerified: !!f.password?.verifiedAt || !!f.intent?.verifiedAt || viaGoogle(sess),
      signedInWith: viaGoogle(sess) ? 'google' : f.intent?.verifiedAt ? 'sso' : 'password',
      mfaVerified: !!(f.totp?.verifiedAt || f.webAuthN?.verifiedAt || f.otpEmail?.verifiedAt || f.otpSms?.verifiedAt),
    };
  }

  /** Check the durable IP/idle policy for an authenticated session. */
  async enforceRequestSecurity(orgId: string, sessionId: string, requestIp: string): Promise<void> {
    let result: 'allowed' | 'ip_denied' | 'idle_expired';
    try {
      result = await this.audit.checkSessionAccess(orgId, sessionId, requestIp);
    } catch (e) {
      this.log.error(`security policy check failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Security settings are temporarily unavailable. Try again shortly.');
    }
    if (result === 'ip_denied') {
      this.audit.record(orgId, 'unknown', 'security.ip_blocked', 'request blocked by the dashboard IP allow-list', requestIp);
      throw new ForbiddenException('This network address is not on your organisation’s dashboard IP allow-list.');
    }
    if (result === 'idle_expired') {
      await this.zitadel.endSession(sessionId).catch(() => undefined);
      this.audit.record(orgId, 'unknown', 'security.session_expired', 'session ended after the configured idle timeout', requestIp);
      throw new UnauthorizedException('Your session ended after being idle. Sign in again.');
    }
  }

  /** The signed-in user + org for this session, or throw if the session has ended. */
  private async sessionUser(sessionId: string): Promise<{ userId: string; orgId: string }> {
    const sess = await this.zitadel.getSession(sessionId).catch(() => null);
    const userId: string | null = sess?.factors?.user?.id ?? null;
    if (!userId) throw new UnauthorizedException('not signed in');
    const orgId = (await this.zitadel.getUserOrg(userId).catch(() => '')) || '';
    if (!orgId) throw new UnauthorizedException('not signed in');
    return { userId, orgId };
  }

  /** Change the person's own name (Profile tab). Split into given/family on the first space. */
  async updateProfileName(sessionId: string, fullName: string): Promise<{ name: string }> {
    const name = (fullName ?? '').trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > 200) throw new BadRequestException('Enter a name of up to 200 characters.');
    const { userId, orgId } = await this.sessionUser(sessionId);
    const [given, ...rest] = name.split(' ');
    const family = rest.join(' ') || given;
    await this.zitadel.updateProfile(userId, orgId, given, family);
    return { name };
  }

  /**
   * Set the person's profile photo (Profile tab). The browser downscales the image to a small JPEG
   * data URL first, which we keep in Zitadel metadata under `avatar_platform` (what `me()` reads and
   * what wins over a Google picture). Passing an empty string clears it back to the Google/initial avatar.
   */
  async setAvatar(sessionId: string, image: string): Promise<{ avatar: string | null }> {
    const { userId, orgId } = await this.sessionUser(sessionId);
    const v = (image ?? '').trim();
    if (!v) {
      await this.zitadel.setUserMetadata(userId, orgId, 'avatar_platform', '').catch(() => undefined);
      return { avatar: null };
    }
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(v))
      throw new BadRequestException('That image could not be read. Use a PNG, JPEG or WebP.');
    // ~256 KB cap on the stored data URL (the browser already downscales to ~256px).
    if (v.length > 256 * 1024) throw new BadRequestException('That image is too large. It is resized automatically — try again.');
    await this.zitadel.setUserMetadata(userId, orgId, 'avatar_platform', v);
    return { avatar: v };
  }

  /** Rename the organisation (Business tab). Owner or Admin only; the new name shows across the console. */
  async renameOrg(sessionId: string, name: string): Promise<{ orgName: string }> {
    const next = (name ?? '').trim().replace(/\s+/g, ' ');
    if (next.length < 2 || next.length > 200) throw new BadRequestException('Enter a business name of 2 to 200 characters.');
    const { userId, orgId } = await this.sessionUser(sessionId);
    const role = await this.roleFor(userId, orgId);
    if (role !== 'owner' && role !== 'admin')
      throw new ForbiddenException('Only an owner or admin can change the business name.');
    await this.zitadel.renameOrg(orgId, next);
    return { orgName: next };
  }

  /**
   * Save the onboarding answers on the user (Zitadel metadata, next to the avatar and devices):
   * which portal brought them here and their multiple-choice answers. The portal decides where
   * every later sign-in lands.
   */
  async saveOnboarding(sessionId: string, portal: Portal, answers: Record<string, string | string[]>) {
    const sess = await this.zitadel.getSession(sessionId);
    const userId: string | null = sess?.factors?.user?.id ?? null;
    // any completed sign-in may answer it: a password, a passkey or Google
    if (!userId || !this.signedIn(sess)) throw new UnauthorizedException('not signed in');
    const orgId = await this.zitadel.getUserOrg(userId);
    const value: Onboarding = { portal, answers, completedAt: new Date().toISOString() };
    await this.zitadel.setUserMetadata(userId, orgId, ONBOARDING_KEY, JSON.stringify(value));
    this.checks.delete(sessionId);
    return value;
  }

  /**
   * Record that onboarding has been shown to this account (the first time only), so a later sign-in
   * goes straight to the portal even if the questions were never finished.
   */
  async markOnboardingSeen(sessionId: string): Promise<{ ok: true }> {
    const sess = await this.zitadel.getSession(sessionId);
    const userId: string | null = sess?.factors?.user?.id ?? null;
    if (!userId || !this.signedIn(sess)) throw new UnauthorizedException('not signed in');
    const orgId = await this.zitadel.getUserOrg(userId);
    const meta = await this.zitadel.listUserMetadata(userId, orgId).catch(() => ({}) as Record<string, string>);
    if (!meta[ONBOARDING_SEEN_KEY]) await this.zitadel.setUserMetadata(userId, orgId, ONBOARDING_SEEN_KEY, new Date().toISOString());
    return { ok: true };
  }

  /**
   * A fast "is this session signed in, and for which organisation" for the gateway in front of
   * the portals' APIs (one sign-in for every portal). Cached for a minute per session.
   */
  async sessionOrg(sessionId: string): Promise<{ userId: string; orgId: string } | null> {
    const hit = this.checks.get(sessionId);
    if (hit && hit.exp > Date.now()) return hit.value;
    const sess = await this.zitadel.getSession(sessionId).catch(() => null);
    const f = sess?.factors ?? {};
    const userId: string | null = f.user?.id ?? null;
    if (!userId || !(f.password?.verifiedAt || f.intent?.verifiedAt || viaGoogle(sess))) return null;
    const orgId = await this.zitadel.getUserOrg(userId).catch(() => '');
    if (!orgId) return null;
    const value = { userId, orgId };
    this.checks.set(sessionId, { value, exp: Date.now() + 60_000 });
    return value;
  }
  private readonly checks = new Map<string, { value: { userId: string; orgId: string }; exp: number }>();

  /** An organisation's display name, cached ten minutes (what an applicant sees as who is asking). */
  async orgDisplayName(orgId: string): Promise<string | null> {
    const hit = this.orgNames.get(orgId);
    if (hit && hit.exp > Date.now()) return hit.name;
    const name = await this.zitadel.getOrgName(orgId).catch(() => null);
    this.orgNames.set(orgId, { name, exp: Date.now() + 10 * 60_000 });
    return name;
  }
  private readonly orgNames = new Map<string, { name: string | null; exp: number }>();

  /* --------------------------------------------------------- SAML sign-in -- */

  private readonly ssoFlows = new Map<
    string,
    { userId: string; orgId: string; idpId: string; email: string; next: string | null; exp: number }
  >();

  /** Start a tenant's configured SAML flow after identifying the existing member by email. */
  async ssoStart(emailInput: string, nextInput?: string | null): Promise<{ url: string; state: string }> {
    const email = String(emailInput ?? '').trim().toLowerCase();
    if (!/^[^\s@]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/i.test(email))
      throw new BadRequestException('Enter the work email on your existing VeriSec team account.');
    const userId = await this.zitadel.resolveUser(email).catch(() => null);
    if (!userId) throw new UnauthorizedException('SSO is only available to existing VeriSec team members.');
    const orgId = await this.zitadel.getUserOrg(userId).catch(() => '');
    if (!orgId) throw new UnauthorizedException('SSO is only available to existing VeriSec team members.');
    const security = await this.audit.securitySettings(orgId);
    if (!security.ssoIdpId) throw new UnauthorizedException('SAML single sign-on is not configured for this account.');

    const now = Date.now();
    for (const [key, flow] of this.ssoFlows) if (flow.exp < now) this.ssoFlows.delete(key);
    if (this.ssoFlows.size > 5000) throw new BadRequestException('Too many sign-ins in progress. Try again in a minute.');
    const state = randomBytes(24).toString('base64url');
    const next = typeof nextInput === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(nextInput) && nextInput.length < 300 ? nextInput : null;
    const success = `${this.callbackOrigin()}/api/auth/sso/callback?state=${encodeURIComponent(state)}`;
    const failure = `${this.appUrl}/login?error=sso`;
    const url = await this.zitadel.startIdpIntent(security.ssoIdpId, success, failure);
    this.ssoFlows.set(state, { userId, orgId, idpId: security.ssoIdpId, email, next, exp: now + 10 * 60_000 });
    return { url, state };
  }

  /** Consume one signed Zitadel IdP intent and link it only to the matching, pre-existing team user. */
  async ssoFinish(id: string, token: string, state: string, browserState?: string) {
    const flow = this.ssoFlows.get(state);
    this.ssoFlows.delete(state);
    if (!flow || flow.exp < Date.now() || !browserState || browserState !== state)
      throw new UnauthorizedException('SAML sign-in expired. Start again.');
    if (!id || id.length > 200 || !token || token.length > 10_000)
      throw new UnauthorizedException('SAML sign-in response was incomplete.');

    const info = await this.zitadel.retrieveIdpIntent(id, token);
    const email = info.email.trim().toLowerCase();
    if (!email || email !== flow.email) throw new UnauthorizedException('The SAML account does not match the existing team member.');
    const userId = await this.zitadel.resolveUser(email).catch(() => null);
    if (!userId || userId !== flow.userId) throw new UnauthorizedException('SAML sign-in is only available to existing team members.');
    const orgId = await this.zitadel.getUserOrg(userId).catch(() => '');
    if (orgId !== flow.orgId) throw new UnauthorizedException('The SAML team account changed during sign-in. Start again.');
    const latest = await this.audit.securitySettings(orgId);
    if (latest.ssoIdpId !== flow.idpId) throw new UnauthorizedException('This SAML provider was changed during sign-in. Start again.');
    if (info.zUserId && info.zUserId !== userId) throw new UnauthorizedException('The SAML identity is linked to a different VeriSec user.');
    if (!info.externalId) throw new UnauthorizedException('The SAML provider did not return a stable user identifier.');

    if (!info.zUserId) {
      await this.zitadel.linkUserIdp(userId, flow.idpId, info.externalId, info.externalUserName || email);
    }
    const factors = await this.zitadel.userMfaFactors(userId, orgId).catch(() => [] as string[]);
    const session = await this.zitadel.createSessionFromIntent(id, token, userId);
    return { ...session, userId, email, next: flow.next, mfa: factors.length ? factors : null };
  }

  /** Proper logout: revoke the session in Zitadel, not just drop the cookie. */
  async logout(sessionId: string, sessionToken: string): Promise<void> {
    this.checks.delete(sessionId);
    await this.zitadel
      .terminateSession(sessionId, sessionToken)
      .catch((e) => this.log.warn(`session terminate failed: ${(e as Error).message}`));
  }

  /**
   * Enable MFA: start TOTP enrolment (returns secret + otpauth URI for the QR).
   * Self-heals a stale/existing enrolment — Zitadel 409s if a TOTP already
   * exists, so on failure we clear it and enroll fresh, guaranteeing a QR.
   */
  async enrollTotp(userId: string) {
    try {
      return await this.zitadel.enrollTotp(userId);
    } catch {
      const orgId = await this.zitadel.getUserOrg(userId).catch(() => '');
      if (orgId) await this.zitadel.removeTotp(userId, orgId).catch(() => undefined);
      return this.zitadel.enrollTotp(userId);
    }
  }

  /** Activate the enrolled TOTP; a wrong/expired code is a clean 400. */
  async verifyTotpEnrollment(userId: string, code: string): Promise<void> {
    try {
      await this.zitadel.verifyTotpEnrollment(userId, code);
    } catch {
      throw new BadRequestException('invalid or expired code');
    }
  }

  /** Disable MFA: remove ALL of the user's factors (TOTP + any passkeys). */
  async disableMfa(userId: string): Promise<void> {
    const orgId = await this.zitadel.getUserOrg(userId).catch(() => '');
    if (!orgId) return;
    await this.zitadel.removeTotp(userId, orgId).catch(() => undefined);
    const u2fIds = await this.zitadel.listU2FFactorIds(userId, orgId).catch(() => [] as string[]);
    for (const id of u2fIds) {
      await this.zitadel.removeU2F(userId, orgId, id).catch(() => undefined);
    }
  }

  /* ---- passkey / security key (WebAuthn) ---- */

  /** Begin passkey registration — returns creation options for the browser. */
  passkeyRegisterBegin(userId: string) {
    return this.zitadel.beginU2F(userId, this.rpId);
  }

  /** Finish passkey registration with the created credential. */
  passkeyRegisterFinish(userId: string, u2fId: string, credential: unknown, name: string) {
    return this.zitadel.finishU2F(userId, u2fId, credential, name || 'Passkey');
  }

  /** Which second factors the pending (password-verified) session can use. */
  async pendingFactors(sessionId: string): Promise<{ totp: boolean; passkey: boolean }> {
    const sess = await this.zitadel.getSession(sessionId).catch(() => null);
    const userId: string | null = sess?.factors?.user?.id ?? null;
    if (!userId) return { totp: false, passkey: false };
    const orgId = await this.zitadel.getUserOrg(userId).catch(() => '');
    const factors = orgId ? await this.zitadel.userMfaFactors(userId, orgId).catch(() => [] as string[]) : [];
    return { totp: factors.includes('otp'), passkey: factors.includes('u2f') || factors.includes('webAuthN') };
  }

  /** Login step 1 (passkey): request a WebAuthn challenge on the pending session. */
  webauthnLoginBegin(sessionId: string, sessionToken: string) {
    return this.zitadel.requestWebAuthNChallenge(sessionId, sessionToken, this.rpId);
  }

  /** Login step 2 (passkey): verify the assertion → returns new token + user. */
  async webauthnLoginFinish(sessionId: string, sessionToken: string, credential: unknown) {
    const r = await this.zitadel.sessionWebAuthN(sessionId, sessionToken, credential);
    const sess = await this.zitadel.getSession(sessionId).catch(() => null);
    return {
      sessionToken: r.sessionToken,
      userId: (sess?.factors?.user?.id as string | undefined) ?? null,
      loginName: (sess?.factors?.user?.loginName as string | undefined) ?? null,
    };
  }

  /* ---- email verification + password reset ---- */

  /** Confirm an email address with the code from the signup email. */
  async verifyEmail(email: string, code: string): Promise<void> {
    const userId = await this.zitadel.resolveUser(email);
    if (!userId) throw new BadRequestException('invalid or expired code');
    await this.zitadel.verifyEmail(userId, code);
  }

  /** Re-send the verification email. Always silent about whether the user exists. */
  async resendVerification(email: string): Promise<void> {
    const userId = await this.zitadel.resolveUser(email);
    if (!userId) return;
    try {
      const code = await this.zitadel.mintEmailCode(userId);
      await this.mail.sendVerifyCode(email, code);
    } catch (e) {
      this.log.warn(`resend verify failed: ${(e as Error).message}`);
    }
  }

  /** Forgot password: mail a reset code. Never reveals whether the email exists. */
  async forgot(email: string): Promise<void> {
    const userId = await this.zitadel.resolveUser(email);
    if (!userId) return;
    const code = await this.zitadel.requestResetCode(userId);
    await this.mail.sendResetCode(email, code);
  }

  /** Complete a reset with the emailed code + a new password. */
  async reset(email: string, code: string, password: string): Promise<void> {
    const userId = await this.zitadel.resolveUser(email);
    if (!userId) throw new BadRequestException('invalid or expired code');
    await this.zitadel.setPasswordWithCode(userId, code, password);
  }

  /* ---- Google sign-in ---- */

  /*
   * Google sign-in, run by the console itself (OpenID Connect authorization code flow with PKCE). Google sends the
   * browser back to https://<site>/api/auth/google/callback. The flow is bound to the browser that started it (a
   * short-lived httpOnly cookie carries its `state`), the code is exchanged server-side with the client secret and
   * the PKCE verifier, and the ID token is verified against Google's published keys: issuer, audience (our client),
   * expiry, the nonce of this flow, and a verified email. Only then does anyone get a session.
   */
  private readonly googleFlows = new Map<string, { nonce: string; verifier: string; next: string | null; exp: number }>();
  private readonly googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

  private get googleClient() {
    return { id: this.googleId, secret: this.googleSecret, redirect: `${this.consoleUrl}/api/auth/google/callback` };
  }

  get googleEnabled(): boolean {
    return !!(this.googleId && this.googleSecret && this.consoleUrl);
  }

  /** Start Google sign-in: Google's consent URL, and the flow's `state` (for the browser's cookie). */
  googleStart(next?: string | null): { url: string; state: string } {
    this.callbackOrigin();
    const c = this.googleClient;
    if (!c.id || !c.secret) throw new BadRequestException('Google sign-in is not configured');
    const now = Date.now();
    for (const [k, v] of this.googleFlows) if (v.exp < now) this.googleFlows.delete(k);
    if (this.googleFlows.size > 5000) throw new BadRequestException('Too many sign-ins in progress. Try again in a minute.');
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    // only a page of this site (a path), never another site
    const safe = typeof next === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) && next.length < 300 ? next : null;
    this.googleFlows.set(state, { nonce, verifier, next: safe, exp: now + 10 * 60_000 });
    const q = new URLSearchParams({
      client_id: c.id,
      redirect_uri: c.redirect,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`, state };
  }

  /**
   * Finish Google sign-in: check everything Google sent, find the person by their verified email (or open a new
   * organisation for them, which then goes through onboarding), and open their session. A person with two-step
   * verification on still has to pass it (`mfa`).
   */
  async googleFinish(code: string, state: string, browserState: string | undefined) {
    const flow = this.googleFlows.get(state);
    this.googleFlows.delete(state);
    if (!flow || flow.exp < Date.now() || !browserState || browserState !== state) throw new UnauthorizedException('google: unknown or expired sign-in');
    const c = this.googleClient;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.id,
        client_secret: c.secret,
        redirect_uri: c.redirect,
        grant_type: 'authorization_code',
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const tok = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string };
    if (!r.ok || !tok.id_token) throw new UnauthorizedException(`google: token exchange refused (${tok.error ?? r.status})`);
    const { payload } = await jwtVerify(tok.id_token, this.googleKeys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: c.id,
      algorithms: ['RS256'],
    });
    if (payload.nonce !== flow.nonce) throw new UnauthorizedException('google: nonce mismatch');
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email || payload.email_verified !== true) throw new UnauthorizedException('google: email not verified');
    const info = {
      email,
      externalId: String(payload.sub ?? ''),
      givenName: typeof payload.given_name === 'string' ? payload.given_name : '',
      familyName: typeof payload.family_name === 'string' ? payload.family_name : '',
      picture: typeof payload.picture === 'string' ? payload.picture : '',
    };

    let userId = await this.zitadel.resolveUser(email);
    if (userId) {
      // the same person signing in with Google: their account, linked once (already linked is fine)
      await this.zitadel.linkGoogleIdp(userId, info.externalId, email).catch(() => undefined);
    } else {
      const created = await this.zitadel.createGoogleTenant({
        email,
        givenName: info.givenName,
        familyName: info.familyName,
        externalId: info.externalId,
        externalUserName: email,
      });
      userId = created.userId;
    }
    if (!userId) throw new UnauthorizedException('google: no account');

    const orgId = await this.zitadel.getUserOrg(userId).catch(() => '');
    const factors = orgId ? await this.zitadel.userMfaFactors(userId, orgId).catch(() => [] as string[]) : [];
    const session = await this.zitadel.createSessionForGoogle(userId);

    // Carry the Google profile picture in as the default avatar. A platform
    // avatar (once uploads exist) is stored under a different key and wins in
    // me(), so we never clobber a picture the user chose themselves.
    if (userId && info.picture) {
      const orgId = await this.zitadel.getUserOrg(userId).catch(() => '');
      if (orgId) {
        await this.zitadel
          .setUserMetadata(userId, orgId, 'avatar_google', info.picture)
          .catch((e) => this.log.warn(`avatar store failed: ${(e as Error).message}`));
      }
    }

    return { ...session, userId, email, next: flow.next, mfa: factors.length > 0 ? factors : null };
  }

  /* --------------------------------------------------------------------------
     Device recognition (informational, non-blocking)

     The strong device identity is the PASSKEY — its private key never leaves the
     phone that registered it, so a valid assertion already proves a known
     device. On top of that we recognise the browser/computer a login came from
     via a long-lived httpOnly marker (`vs_device`). A login from a browser we
     haven't seen is NEVER blocked — the user is let straight in — but we record
     it, flag it back to the UI (a toast), and email a "new device" heads-up.
     Recognised devices live in Zitadel user metadata (no DB needed).
  -------------------------------------------------------------------------- */

  private async loadDevices(userId: string, orgId: string): Promise<{ trusted: TrustedDevice[]; pending: PendingDevice[] }> {
    const meta = await this.zitadel.listUserMetadata(userId, orgId).catch(() => ({}) as Record<string, string>);
    const parse = <T>(v?: string): T[] => {
      try {
        const a = v ? JSON.parse(v) : [];
        return Array.isArray(a) ? (a as T[]) : [];
      } catch {
        return [];
      }
    };
    return { trusted: parse<TrustedDevice>(meta[TRUSTED_KEY]), pending: parse<PendingDevice>(meta[PENDING_KEY]) };
  }

  private saveTrusted(userId: string, orgId: string, list: TrustedDevice[]) {
    return this.zitadel.setUserMetadata(userId, orgId, TRUSTED_KEY, JSON.stringify(list));
  }
  private savePending(userId: string, orgId: string, list: PendingDevice[]) {
    return this.zitadel.setUserMetadata(userId, orgId, PENDING_KEY, JSON.stringify(list));
  }

  /** A friendly device name from the User-Agent (e.g. "Chrome on Windows"). */
  private deviceName(ua: string): string {
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Browser';
    const os = /Windows/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad|iOS/.test(ua)
          ? 'iOS'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'device';
    return `${browser} on ${os}`;
  }

  /** List a user's trusted + pending devices (for the Settings screen). */
  async listDevices(userId: string) {
    const orgId = await this.zitadel.getUserOrg(userId);
    return this.loadDevices(userId, orgId);
  }

  /**
   * Record a successful sign-in against the browser/computer it came from, and
   * decide whether it's a NEW device — WITHOUT ever blocking the login.
   *
   *   - known device  → refresh lastSeen, send the normal sign-in alert.
   *   - first device  → remember it, send the normal sign-in alert (not a
   *                     "change" — there's nothing to compare against yet).
   *   - new device    → remember it too, but flag `isNew` and send the distinct
   *                     "new device" heads-up so the user is told about it.
   *
   * Returns the device id to (re)store in the cookie, plus the new-device flag
   * and a friendly name for the toast. Best-effort: if we can't resolve the
   * user/org we still send a plain sign-in alert and report not-new (no false
   * alarm), so recognition can never break a login.
   */
  /** For a notification: the person and organisation behind an email (null when there is none). */
  async accountOf(email: string): Promise<{ userId: string; orgId: string } | null> {
    const userId = await this.zitadel.resolveUser(email).catch(() => null);
    if (!userId) return null;
    const orgId = await this.zitadel.getUserOrg(userId).catch(() => null);
    return orgId ? { userId, orgId } : null;
  }

  async orgOfUser(userId: string): Promise<string | null> {
    return this.zitadel.getUserOrg(userId).catch(() => null);
  }

  async recordSignIn(
    userId: string | null,
    email: string | null | undefined,
    deviceId: string | undefined,
    ua: string,
  ): Promise<{ deviceId: string; isNew: boolean; deviceName: string }> {
    const name = this.deviceName(ua);
    const orgId = userId ? await this.zitadel.getUserOrg(userId).catch(() => '') : '';
    if (!userId || !orgId) {
      this.notifySignIn(email);
      return { deviceId: deviceId || randomUUID(), isNew: false, deviceName: name };
    }

    const { trusted } = await this.loadDevices(userId, orgId);
    const now = new Date().toISOString();
    const known = deviceId ? trusted.find((d) => d.id === deviceId) : undefined;

    if (known) {
      await this.saveTrusted(
        userId,
        orgId,
        trusted.map((d) => (d.id === deviceId ? { ...d, lastSeen: now } : d)),
      );
      this.notifySignIn(email);
      return { deviceId: known.id, isNew: false, deviceName: known.name };
    }

    // Unrecognised browser/computer → remember it (auto-trust; we don't block),
    // then either treat it as the very first device or flag a genuine change.
    const id = deviceId || randomUUID();
    const isFirst = trusted.length === 0;
    await this.saveTrusted(userId, orgId, [...trusted, { id, name, firstSeen: now, lastSeen: now }]);
    if (isFirst) {
      this.notifySignIn(email);
      return { deviceId: id, isNew: false, deviceName: name };
    }
    this.notifyNewDevice(email, name);
    return { deviceId: id, isNew: true, deviceName: name };
  }

  /** Approve a pending device (from a trusted-device session) → make it trusted. */
  async approveDevice(userId: string, pendingId: string): Promise<void> {
    const orgId = await this.zitadel.getUserOrg(userId);
    const { trusted, pending } = await this.loadDevices(userId, orgId);
    const p = pending.find((x) => x.id === pendingId);
    if (!p) throw new BadRequestException('no such pending device');
    const now = new Date().toISOString();
    await this.saveTrusted(userId, orgId, [...trusted, { id: p.id, name: p.name, firstSeen: now, lastSeen: now }]);
    await this.savePending(userId, orgId, pending.filter((x) => x.id !== pendingId));
  }

  /** Remove a device (trusted or pending) — e.g. a lost or unrecognised one. */
  async removeDevice(userId: string, deviceId: string): Promise<void> {
    const orgId = await this.zitadel.getUserOrg(userId);
    const { trusted, pending } = await this.loadDevices(userId, orgId);
    await this.saveTrusted(userId, orgId, trusted.filter((d) => d.id !== deviceId));
    await this.savePending(userId, orgId, pending.filter((p) => p.id !== deviceId));
  }
}
