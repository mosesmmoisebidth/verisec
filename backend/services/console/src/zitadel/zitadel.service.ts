import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// How long a signed-in session stays valid without re-authenticating. A durable
// "stay signed in" window (30 days) — the httpOnly cookie carries it across
// browser restarts, and the server-side session is revoked on logout.
const SESSION_LIFETIME = '2592000s';
/** "Keep me signed in" left off: the session ends when the browser closes, and at the latest after 12 hours. */
const SHORT_LIFETIME = '43200s';

/**
 * Thin client over Zitadel's REST API, authenticated with the `verisec-api`
 * service-account PAT (persisted in infra/.env). This is the ONLY thing that
 * talks to Zitadel — the auth service orchestrates flows through it.
 *
 * We never hold passwords, MFA secrets or sessions ourselves: tenant creation,
 * credential checks, TOTP/passkey MFA and resets all happen inside Zitadel.
 */
@Injectable()
export class ZitadelService implements OnModuleInit {
  private readonly log = new Logger('Zitadel');
  private base = 'http://localhost:8088';
  private publicBase = 'http://localhost:8088';
  private pat = '';
  private projectId = '';
  private googleIdpId = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.base = this.config.get<string>('ZITADEL_API_URL') ?? this.base;
    const explicitPublic = this.config.get<string>('ZITADEL_PUBLIC_URL') ?? this.config.get<string>('ZITADEL_ISSUER_URL');
    const domain = this.config.get<string>('ZITADEL_EXTERNALDOMAIN');
    const secure = this.config.get<string>('ZITADEL_EXTERNALSECURE') === 'true';
    const port = this.config.get<string>('ZITADEL_EXTERNALPORT');
    const scheme = secure ? 'https' : 'http';
    const defaultPort = secure ? '443' : '80';
    this.publicBase = (explicitPublic?.trim() || (domain ? `${scheme}://${domain}${port && port !== defaultPort ? `:${port}` : ''}` : this.base)).replace(/\/$/, '');
    this.pat = this.config.get<string>('ZITADEL_PAT') ?? '';
    this.projectId = this.config.get<string>('ZITADEL_PROJECT_ID') ?? '';
    this.googleIdpId = this.config.get<string>('ZITADEL_GOOGLE_IDP_ID') ?? '';
    if (!this.pat) this.log.warn('ZITADEL_PAT is not set — auth calls will fail');
  }

  hasGoogle(): boolean {
    return !!this.googleIdpId;
  }

  /** Public SP metadata URL used by a customer's SAML identity provider. */
  samlServiceProviderMetadataUrl(idpId: string): string {
    return `${this.publicBase}/idps/${encodeURIComponent(idpId)}/saml/metadata`;
  }

  private async api<T = any>(path: string, init: RequestInit = {}, orgId?: string): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.pat}`,
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (orgId) headers['x-zitadel-orgid'] = orgId;
    const res = await fetch(`${this.base}${path}`, { ...init, headers });
    const text = await res.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    if (!res.ok) {
      const msg = body?.message ?? body?.details ?? res.statusText;
      throw new Error(`Zitadel ${res.status} ${path}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }
    return body as T;
  }

  /** Verify connectivity + that the PAT is valid. */
  async ping(): Promise<{ ok: true; projects: number }> {
    const r = await this.api('/management/v1/projects/_search', { method: 'POST', body: '{}' });
    return { ok: true, projects: (r?.result ?? []).length };
  }

  /** Add or update an organization-scoped SAML identity provider. User creation stays disabled. */
  async addSamlProvider(orgId: string, name: string, metadataXml: string): Promise<string> {
    const r = await this.api(
      '/management/v1/idps/saml',
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          metadataXml: Buffer.from(metadataXml, 'utf8').toString('base64'),
          providerOptions: {
            isLinkingAllowed: true,
            isCreationAllowed: false,
            isAutoCreation: false,
            isAutoUpdate: false,
          },
        }),
      },
      orgId,
    );
    if (typeof r?.id !== 'string' || !r.id) throw new Error('Zitadel did not return the SAML provider id');
    return r.id;
  }

  async updateSamlProvider(orgId: string, idpId: string, name: string, metadataXml: string): Promise<void> {
    await this.api(
      `/management/v1/idps/saml/${encodeURIComponent(idpId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name,
          metadataXml: Buffer.from(metadataXml, 'utf8').toString('base64'),
          providerOptions: {
            isLinkingAllowed: true,
            isCreationAllowed: false,
            isAutoCreation: false,
            isAutoUpdate: false,
          },
        }),
      },
      orgId,
    );
  }

  /** Ensure this organization permits external IdP authentication without changing its other policy values. */
  async allowOrganizationExternalIdp(orgId: string): Promise<void> {
    const current = await this.api('/management/v1/policies/login', { method: 'GET' }, orgId).catch((e: Error) => {
      if (/Zitadel 404/.test(e.message)) return null;
      throw e;
    });
    const policy = current?.policy ?? current ?? {};
    const fields = [
      'allowUsernamePassword',
      'allowRegister',
      'forceMfa',
      'passwordlessType',
      'hidePasswordReset',
      'ignoreUnknownUsernames',
      'defaultRedirectUri',
      'passwordCheckLifetime',
      'externalLoginCheckLifetime',
      'mfaInitSkipLifetime',
      'secondFactorCheckLifetime',
      'multiFactorCheckLifetime',
      'secondFactors',
      'multiFactors',
      'allowDomainDiscovery',
      'disableLoginWithEmail',
      'disableLoginWithPhone',
      'forceMfaLocalOnly',
    ];
    const body: Record<string, unknown> = {};
    for (const field of fields) if (policy[field] !== undefined) body[field] = policy[field];
    body.allowUsernamePassword ??= true;
    body.allowRegister ??= false;
    body.allowExternalIdp = true;

    const method = policy.isDefault === true || !current ? 'POST' : 'PUT';
    await this.api('/management/v1/policies/login', { method, body: JSON.stringify(body) }, orgId);
  }

  async activateOrganizationIdp(orgId: string, idpId: string): Promise<void> {
    await this.api(
      '/management/v1/policies/login/idps',
      { method: 'POST', body: JSON.stringify({ idpId, ownerType: 'IDP_OWNER_TYPE_ORG' }) },
      orgId,
    );
  }

  async deactivateOrganizationIdp(orgId: string, idpId: string): Promise<void> {
    await this.api(`/management/v1/policies/login/idps/${encodeURIComponent(idpId)}`, { method: 'DELETE' }, orgId);
  }

  async removeSamlProvider(orgId: string, idpId: string): Promise<void> {
    await this.api(`/management/v1/idps/${encodeURIComponent(idpId)}`, { method: 'DELETE' }, orgId);
  }

  /** Register a business tenant: an org + its first (Owner) human user. */
  async createTenant(p: {
    businessName: string;
    fullName: string;
    email: string;
    password: string;
  }): Promise<{ orgId: string; userId: string }> {
    const [given, ...rest] = p.fullName.trim().split(/\s+/);
    const family = rest.join(' ') || given;
    const org = await this.api('/v2/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: p.businessName,
        admins: [
          {
            human: {
              profile: { givenName: given, familyName: family },
              // returnCode (not sendCode) → Zitadel mints a code but does NOT
              // email it; the console mints a fresh one via mintEmailCode() and
              // delivers it in our own branded template instead.
              email: { email: p.email, returnCode: {} },
              password: { password: p.password, changeRequired: false },
            },
          },
        ],
      }),
    }).catch((e: Error) => {
      // Zitadel answers 409 when the business name or the person is already registered: say which, never a 500
      if (/^Zitadel 409/.test(e.message)) {
        if (/organi[sz]ation/i.test(e.message))
          throw new ConflictException({
            code: 'business_taken',
            message: 'An account already uses this business name. Add something that tells yours apart, such as your city or trading name.',
          });
        throw new ConflictException({ code: 'email_taken', message: 'An account with this email already exists.' });
      }
      throw e;
    });
    const orgId: string = org.organizationId ?? org.details?.resourceOwner ?? '';
    const userId: string = org.createdAdmins?.[0]?.userId ?? '';
    if (userId && this.projectId) {
      try {
        await this.api(
          `/management/v1/users/${userId}/grants`,
          { method: 'POST', body: JSON.stringify({ projectId: this.projectId, roleKeys: ['owner'] }) },
          orgId,
        );
      } catch (e) {
        this.log.warn(`owner role grant failed: ${(e as Error).message}`);
      }
    }
    // the person who signs the organisation up owns it (the role every console check reads)
    if (userId && orgId) await this.setUserMetadata(userId, orgId, 'vs_role', 'owner').catch((e: Error) => this.log.warn(`owner role not saved: ${e.message}`));
    return { orgId, userId };
  }

  /* --------------------------------------------------------------------------
     Sessions (login) + MFA
  -------------------------------------------------------------------------- */

  /** Create a session with a password check. First factor only. */
  async createSessionWithPassword(p: {
    email: string;
    password: string;
    remember?: boolean;
  }): Promise<{ sessionId: string; sessionToken: string }> {
    const s = await this.api('/v2/sessions', {
      method: 'POST',
      body: JSON.stringify({
        checks: { user: { loginName: p.email }, password: { password: p.password } },
        lifetime: p.remember ? SESSION_LIFETIME : SHORT_LIFETIME,
      }),
    });
    return { sessionId: s.sessionId, sessionToken: s.sessionToken };
  }

  /** Every open session of a person (for Force sign-out). */
  async userSessionIds(userId: string): Promise<string[]> {
    const r = await this.api('/v2/sessions/search', {
      method: 'POST',
      body: JSON.stringify({ query: { limit: 200 }, queries: [{ userIdQuery: { id: userId } }] }),
    });
    return ((r?.sessions ?? []) as { id?: string }[]).map((s) => s.id ?? '').filter(Boolean);
  }

  /** End a session as the platform (an Owner or Admin signing a member out everywhere). */
  async endSession(sessionId: string): Promise<void> {
    await this.api(`/v2/sessions/${sessionId}`, { method: 'DELETE', body: '{}' });
  }

  /** Revoke a session server-side (proper logout — not just dropping the cookie). */
  async terminateSession(sessionId: string, sessionToken: string): Promise<void> {
    await this.api(`/v2/sessions/${sessionId}`, {
      method: 'DELETE',
      body: JSON.stringify({ sessionToken }),
    });
  }

  /** Read a session — its user id and which factors are verified. */
  async getSession(sessionId: string): Promise<any> {
    const r = await this.api(`/v2/sessions/${sessionId}`, { method: 'GET' });
    return r?.session ?? r;
  }

  /** The org a user belongs to — needed to query their MFA factors. */
  async getUserOrg(userId: string): Promise<string> {
    const r = await this.api(`/v2/users/${userId}`, { method: 'GET' });
    return r?.user?.details?.resourceOwner ?? r?.details?.resourceOwner ?? '';
  }

  /** The user's org and live profile in one call (used by `me()` so a name change shows at once). */
  async getUserProfile(
    userId: string,
  ): Promise<{ orgId: string; givenName: string; familyName: string; displayName: string } | null> {
    const r = await this.api(`/v2/users/${userId}`, { method: 'GET' }).catch(() => null);
    const u = r?.user ?? r;
    if (!u) return null;
    const p = u.human?.profile ?? {};
    return {
      orgId: u.details?.resourceOwner ?? r?.details?.resourceOwner ?? '',
      givenName: p.givenName ?? '',
      familyName: p.familyName ?? '',
      displayName: p.displayName ?? '',
    };
  }

  /** Change the signed-in person's name. Verified: PUT /v2/users/human/{id} with a profile block. */
  async updateProfile(userId: string, orgId: string, given: string, family: string): Promise<void> {
    await this.api(
      `/v2/users/human/${userId}`,
      { method: 'PUT', body: JSON.stringify({ profile: { givenName: given, familyName: family } }) },
      orgId,
    );
  }

  /** The display name of an org (the tenant/business name shown in the console). */
  async getOrgName(orgId: string): Promise<string | null> {
    const r = await this.api('/management/v1/orgs/me', { method: 'GET' }, orgId);
    return r?.org?.name ?? null;
  }

  /**
   * Rename an org. Verified: PUT /management/v1/orgs/me with the org-id header. Zitadel answers 400
   * "Organisation not changed" when the name is unchanged, which we treat as success (a no-op).
   */
  async renameOrg(orgId: string, name: string): Promise<void> {
    await this.api('/management/v1/orgs/me', { method: 'PUT', body: JSON.stringify({ name }) }, orgId).catch((e: Error) => {
      if (/not changed/i.test(e.message)) return; // same name — nothing to do
      throw e;
    });
  }

  /** Suspend a whole organisation: no one in it can sign in until it is reactivated. Verified endpoint. */
  async deactivateOrg(orgId: string): Promise<void> {
    await this.api('/management/v1/orgs/me/_deactivate', { method: 'POST', body: '{}' }, orgId).catch((e: Error) => {
      if (/not changed|already|inactive/i.test(e.message)) return; // already suspended
      throw e;
    });
  }

  async reactivateOrg(orgId: string): Promise<void> {
    await this.api('/management/v1/orgs/me/_reactivate', { method: 'POST', body: '{}' }, orgId).catch((e: Error) => {
      if (/not changed|already|active/i.test(e.message)) return;
      throw e;
    });
  }

  /** Change a user's login name (used by soft-delete to anonymise it). Verified: PUT /v2/users/human/{id}. */
  async setUsername(userId: string, orgId: string, username: string): Promise<void> {
    await this.api(`/v2/users/human/${userId}`, { method: 'PUT', body: JSON.stringify({ username }) }, orgId);
  }

  /**
   * A user's READY MFA factors (empty = no MFA enrolled). Each factor is an
   * object like `{state, otp:{}}` (TOTP), `{u2f:{}}` (passkey), etc. — so the
   * key that isn't `state` names the factor kind.
   */
  async userMfaFactors(userId: string, orgId: string): Promise<string[]> {
    try {
      const r = await this.api(
        `/management/v1/users/${userId}/auth_factors/_search`,
        { method: 'POST', body: '{}' },
        orgId,
      );
      return (r?.result ?? [])
        .filter((f: any) => f.state === 'AUTH_FACTOR_STATE_READY')
        .map((f: any) => Object.keys(f).find((k) => k !== 'state') ?? 'mfa');
    } catch (e) {
      this.log.warn(`read MFA factors failed: ${(e as Error).message}`);
      return [];
    }
  }

  /** Add a TOTP code as a 2nd-factor check on an in-flight session. */
  async sessionTotp(sessionId: string, sessionToken: string, code: string): Promise<{ sessionToken: string }> {
    const r = await this.api(`/v2/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ sessionToken, checks: { totp: { code } } }),
    });
    return { sessionToken: r.sessionToken };
  }

  /* --------------------------------------------------------------------------
     MFA enrolment ("enable MFA in the platform")
  -------------------------------------------------------------------------- */

  /** Start TOTP enrolment — returns the shared secret + otpauth:// URI (QR). */
  async enrollTotp(userId: string): Promise<{ secret: string; uri: string }> {
    const r = await this.api(`/v2/users/${userId}/totp`, { method: 'POST', body: '{}' });
    return { secret: r.secret, uri: this.brandOtpUri(r.uri) };
  }

  /**
   * Rewrite the otpauth issuer/label from Zitadel's default to "VeriSec" so
   * authenticator apps (Google, Microsoft, Authy…) show our name, not "ZITADEL".
   * The secret/algorithm/digits/period are untouched, so the codes are identical.
   */
  private brandOtpUri(uri: string): string {
    return uri
      .replace(/\/totp\/[^:?/]+:/, '/totp/VeriSec:')
      .replace(/([?&]issuer=)[^&]*/, '$1VeriSec');
  }

  /** Activate an enrolled TOTP with a code from the authenticator app. */
  async verifyTotpEnrollment(userId: string, code: string): Promise<void> {
    await this.api(`/v2/users/${userId}/totp/verify`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /** Remove a user's TOTP factor (to disable 2FA, or clear a stale enrolment). */
  async removeTotp(userId: string, orgId: string): Promise<void> {
    await this.api(`/management/v1/users/${userId}/auth_factors/otp`, { method: 'DELETE' }, orgId);
  }

  /* --------------------------------------------------------------------------
     Passkey / security key (WebAuthn, as a 2nd factor via U2F)
  -------------------------------------------------------------------------- */

  /** Begin registering a passkey/security key → credential-creation options. */
  async beginU2F(userId: string, domain: string): Promise<{ u2fId: string; options: unknown }> {
    const r = await this.api(`/v2/users/${userId}/u2f`, { method: 'POST', body: JSON.stringify({ domain }) });
    return { u2fId: r.u2fId, options: r.publicKeyCredentialCreationOptions };
  }

  /** Finish passkey registration with the browser's created credential. */
  async finishU2F(userId: string, u2fId: string, publicKeyCredential: unknown, tokenName: string): Promise<void> {
    await this.api(`/v2/users/${userId}/u2f/${u2fId}`, {
      method: 'POST',
      body: JSON.stringify({ publicKeyCredential, tokenName }),
    });
  }

  /** Remove a user's passkey/security-key (u2f) factor by its id. */
  async removeU2F(userId: string, orgId: string, tokenId: string): Promise<void> {
    await this.api(`/management/v1/users/${userId}/auth_factors/u2f/${tokenId}`, { method: 'DELETE' }, orgId);
  }

  /** The ids of a user's registered passkey/security-key (u2f) factors. */
  async listU2FFactorIds(userId: string, orgId: string): Promise<string[]> {
    const r = await this.api(
      `/management/v1/users/${userId}/auth_factors/_search`,
      { method: 'POST', body: '{}' },
      orgId,
    );
    return (r?.result ?? [])
      .map((f: any) => f?.u2f?.id as string | undefined)
      .filter((id: string | undefined): id is string => !!id);
  }

  /** Ask a session for a WebAuthn login challenge (rotates the session token). */
  async requestWebAuthNChallenge(
    sessionId: string,
    sessionToken: string,
    domain: string,
  ): Promise<{ sessionToken: string; options: unknown }> {
    const r = await this.api(`/v2/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        sessionToken,
        // PREFERRED (not REQUIRED): REQUIRED means passwordless-only in Zitadel,
        // which rejects a 2nd-factor security key. PREFERRED verifies the user
        // (Face ID / Windows Hello) when the device can, and still accepts a
        // plain security key when it can't.
        challenges: { webAuthN: { domain, userVerificationRequirement: 'USER_VERIFICATION_REQUIREMENT_PREFERRED' } },
      }),
    });
    return { sessionToken: r.sessionToken, options: r.challenges?.webAuthN?.publicKeyCredentialRequestOptions };
  }

  /** Verify a WebAuthn assertion against a session (completes the 2nd factor). */
  async sessionWebAuthN(
    sessionId: string,
    sessionToken: string,
    credentialAssertionData: unknown,
  ): Promise<{ sessionToken: string }> {
    const r = await this.api(`/v2/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ sessionToken, checks: { webAuthN: { credentialAssertionData } } }),
    });
    return { sessionToken: r.sessionToken };
  }

  /* --------------------------------------------------------------------------
     Email verification + password reset (codes)
  -------------------------------------------------------------------------- */

  /** Find a user id by email (null if none — callers must not leak existence). */
  async resolveUser(email: string): Promise<string | null> {
    const r = await this.api('/v2/users', {
      method: 'POST',
      body: JSON.stringify({
        queries: [{ emailQuery: { emailAddress: email, method: 'TEXT_QUERY_METHOD_EQUALS' } }],
      }),
    });
    return (r?.result ?? [])[0]?.userId ?? null;
  }

  /** Mint a password-reset code (returned to us, so we email it ourselves). */
  async requestResetCode(userId: string): Promise<string> {
    const r = await this.api(`/v2/users/${userId}/password_reset`, {
      method: 'POST',
      body: JSON.stringify({ returnCode: {} }),
    });
    return r.verificationCode as string;
  }

  /** Set a new password using a reset code. */
  async setPasswordWithCode(userId: string, code: string, newPassword: string): Promise<void> {
    await this.api(`/v2/users/${userId}/password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword: { password: newPassword }, verificationCode: code }),
    });
  }

  /** Confirm an email address with its verification code. */
  async verifyEmail(userId: string, code: string): Promise<void> {
    await this.api(`/v2/users/${userId}/email/verify`, {
      method: 'POST',
      body: JSON.stringify({ verificationCode: code }),
    });
  }

  /**
   * Mint an email-verification code and return it to us (returnCode), so the
   * console can deliver it in our own branded template rather than Zitadel's.
   */
  async mintEmailCode(userId: string): Promise<string> {
    const r = await this.api(`/v2/users/${userId}/email/resend`, {
      method: 'POST',
      body: JSON.stringify({ returnCode: {} }),
    });
    return r.verificationCode as string;
  }

  /* --------------------------------------------------------------------------
     Google sign-in (external IdP via the "IdP intent" flow)

     Custom UI stays: we start an intent (→ Google authUrl), Google returns to
     Zitadel's /idps/callback, Zitadel redirects to our successUrl with the
     intent id+token, and we finish it — provisioning/linking the user and
     minting a session — entirely through the API.
  -------------------------------------------------------------------------- */

  /** Begin a Google login: returns the Google authorize URL to redirect to. */
  async startGoogleIntent(successUrl: string, failureUrl: string): Promise<string> {
    const r = await this.api('/v2/idp_intents', {
      method: 'POST',
      body: JSON.stringify({ idpId: this.googleIdpId, urls: { successUrl, failureUrl } }),
    });
    return r.authUrl as string;
  }

  /** Begin a federated SAML/OIDC sign-in through a provider already configured for this organization. */
  async startIdpIntent(idpId: string, successUrl: string, failureUrl: string): Promise<string> {
    const r = await this.api('/v2/idp_intents', {
      method: 'POST',
      body: JSON.stringify({ idpId, urls: { successUrl, failureUrl } }),
    });
    if (typeof r?.authUrl !== 'string' || !r.authUrl) throw new Error('Zitadel did not return the identity provider sign-in URL');
    return r.authUrl;
  }

  /** Read a finished intent: the external identity, and the linked user if any. */
  async retrieveIdpIntent(
    id: string,
    token: string,
  ): Promise<{
    zUserId: string | null;
    externalId: string;
    externalUserName: string;
    email: string;
    givenName: string;
    familyName: string;
    picture: string;
  }> {
    const r = await this.api(`/v2/idp_intents/${id}`, {
      method: 'POST',
      body: JSON.stringify({ idpIntentToken: token }),
    });
    const info = r.idpInformation ?? {};
    const raw = info.rawInformation ?? {};
    // Zitadel's rawInformation can be flat for SAML and nested under `User`
    // for some social/enterprise connectors. Read both shapes without trusting
    // any provider claim beyond matching it to the existing account's email.
    const sources = [raw, raw.User, raw.user, raw.attributes, raw.Attributes].filter(
      (value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value),
    );
    const stringClaim = (value: unknown): string => {
      if (typeof value === 'string') return value.trim();
      if (Array.isArray(value)) return value.map(stringClaim).find(Boolean) ?? '';
      if (value && typeof value === 'object' && 'value' in value) return stringClaim((value as { value?: unknown }).value);
      return '';
    };
    const claim = (...names: string[]): string => {
      for (const source of sources) {
        for (const name of names) {
          const value = stringClaim(source[name]);
          if (value) return value;
        }
      }
      return '';
    };
    const email = [
      claim(
        'email',
        'Email',
        'emailAddress',
        'mail',
        'upn',
        'userPrincipalName',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
        'urn:oid:0.9.2342.19200300.100.1.3',
        'NameID',
        'nameID',
        'nameId',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
      ),
      info.userName,
    ].find((value): value is string => typeof value === 'string' && value.includes('@')) ?? '';
    return {
      zUserId: r.userId ?? null,
      externalId: info.userId ?? claim(
        'sub',
        'userId',
        'NameID',
        'nameID',
        'nameId',
        'nameid',
        'uid',
        'objectGUID',
        'id',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
      ),
      externalUserName: info.userName ?? email,
      email,
      givenName: claim('given_name', 'givenName', 'firstName', 'first_name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'),
      familyName: claim('family_name', 'familyName', 'lastName', 'last_name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'),
      picture: claim('picture', 'avatar', 'photo'),
    };
  }

  /** Link a completed Google identity to an existing user (best-effort). */
  async linkGoogleIdp(userId: string, externalId: string, externalUserName: string): Promise<void> {
    await this.linkUserIdp(userId, this.googleIdpId, externalId, externalUserName);
  }

  async linkUserIdp(userId: string, idpId: string, externalId: string, externalUserName: string): Promise<void> {
    await this.api(`/v2/users/${userId}/links`, {
      method: 'POST',
      body: JSON.stringify({ idpLink: { idpId, userId: externalId, userName: externalUserName } }),
    });
  }

  /** Create a tenant (org + Owner) from a Google identity — no password, email verified. */
  async createGoogleTenant(p: {
    email: string;
    givenName: string;
    familyName: string;
    externalId: string;
    externalUserName: string;
  }): Promise<{ orgId: string; userId: string }> {
    const given = p.givenName || p.email.split('@')[0];
    const family = p.familyName || given;
    const org = await this.api('/v2/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: p.email,
        admins: [
          {
            human: {
              profile: { givenName: given, familyName: family },
              email: { email: p.email, isVerified: true },
              idpLinks: [{ idpId: this.googleIdpId, userId: p.externalId, userName: p.externalUserName }],
            },
          },
        ],
      }),
    });
    const orgId: string = org.organizationId ?? org.details?.resourceOwner ?? '';
    const userId: string = org.createdAdmins?.[0]?.userId ?? '';
    if (userId && this.projectId) {
      await this.api(
        `/management/v1/users/${userId}/grants`,
        { method: 'POST', body: JSON.stringify({ projectId: this.projectId, roleKeys: ['owner'] }) },
        orgId,
      ).catch((e) => this.log.warn(`owner role grant failed: ${(e as Error).message}`));
    }
    return { orgId, userId };
  }

  /**
   * A session for someone Google has just vouched for. The console ran the sign-in with Google itself and checked
   * Google's signed ID token (its signature, audience, nonce and a verified email), so the session names the user and
   * says how they signed in, in session metadata only the console can write (Zitadel is not reachable from outside).
   */
  async createSessionForGoogle(userId: string): Promise<{ sessionId: string; sessionToken: string }> {
    const s = await this.api('/v2/sessions', {
      method: 'POST',
      body: JSON.stringify({
        checks: { user: { userId } },
        metadata: { vs_auth: Buffer.from('google').toString('base64') },
        lifetime: SESSION_LIFETIME,
      }),
    });
    return { sessionId: s.sessionId, sessionToken: s.sessionToken };
  }

  /** Mint a session authenticated by a completed IdP intent. */
  async createSessionFromIntent(
    id: string,
    token: string,
    userId?: string,
  ): Promise<{ sessionId: string; sessionToken: string }> {
    const checks: Record<string, unknown> = { idpIntent: { idpIntentId: id, idpIntentToken: token } };
    if (userId) checks.user = { userId };
    const s = await this.api('/v2/sessions', {
      method: 'POST',
      body: JSON.stringify({ checks, lifetime: SESSION_LIFETIME }),
    });
    return { sessionId: s.sessionId, sessionToken: s.sessionToken };
  }

  /* --------------------------------------------------------------------------
     User metadata — we use it to store the avatar URL (Google's, and later a
     platform-uploaded one that takes precedence). base64 on the wire.
  -------------------------------------------------------------------------- */

  /** Write one metadata value (plain string; encoded for the API). */
  /* ---------------------------------------------------------------- team -- */

  /** The people of an organisation (humans only), oldest first. */
  async orgUsers(orgId: string): Promise<
    { userId: string; state: string; email: string; emailVerified: boolean; hasPassword: boolean; givenName: string; familyName: string; name: string; createdAt: string }[]
  > {
    const r = await this.api('/v2/users', {
      method: 'POST',
      body: JSON.stringify({ query: { limit: 500 }, queries: [{ organizationIdQuery: { organizationId: orgId } }] }),
    });
    return ((r?.result ?? []) as any[])
      .filter((u) => u.human)
      .map((u) => ({
        userId: u.userId,
        state: String(u.state ?? ''),
        email: u.human.email?.email ?? u.preferredLoginName ?? '',
        emailVerified: !!u.human.email?.isVerified,
        // Zitadel makes every new user "active"; an invited person has simply never set a password
        hasPassword: !!u.human.passwordChanged,
        givenName: u.human.profile?.givenName ?? '',
        familyName: u.human.profile?.familyName ?? '',
        name: u.human.profile?.displayName || [u.human.profile?.givenName, u.human.profile?.familyName].filter(Boolean).join(' '),
        createdAt: u.details?.creationDate ?? '',
      }))
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }

  /** A new member of an organisation, not yet able to sign in (no password until they accept the invite). */
  async inviteMember(orgId: string, p: { email: string; givenName: string; familyName: string; displayName: string }): Promise<string> {
    const r = await this.api('/v2/users/human', {
      method: 'POST',
      body: JSON.stringify({
        organization: { orgId },
        // Zitadel needs both name parts; the name shown is exactly what was entered
        profile: { givenName: p.givenName, familyName: p.familyName, displayName: p.displayName },
        // returnCode: Zitadel sends nothing itself; the console sends its own invitation
        email: { email: p.email, returnCode: {} },
      }),
    }).catch((e: Error) => {
      if (/^Zitadel 409/.test(e.message))
        throw new ConflictException({ code: 'email_taken', message: 'This email already has a VeriSec account, so it cannot be invited again.' });
      throw e;
    });
    return r.userId as string;
  }

  /** A fresh invitation code (returned to us, so the console sends it in its own email). */
  async inviteCode(userId: string): Promise<string> {
    const r = await this.api(`/v2/users/${userId}/invite_code`, { method: 'POST', body: JSON.stringify({ returnCode: {} }) });
    return r.inviteCode as string;
  }

  async verifyInviteCode(userId: string, code: string): Promise<void> {
    await this.api(`/v2/users/${userId}/invite_code/verify`, { method: 'POST', body: JSON.stringify({ verificationCode: code }) });
  }

  async setPassword(userId: string, password: string): Promise<void> {
    await this.api(`/v2/users/${userId}/password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword: { password, changeRequired: false } }),
    });
  }

  async markEmailVerified(userId: string, email: string): Promise<void> {
    await this.api(`/v2/users/${userId}/email`, { method: 'POST', body: JSON.stringify({ email, isVerified: true }) });
  }

  async getUser(userId: string): Promise<any> {
    return (await this.api(`/v2/users/${userId}`))?.user ?? null;
  }

  async deactivateUser(userId: string): Promise<void> {
    await this.api(`/v2/users/${userId}/deactivate`, { method: 'POST', body: '{}' });
  }

  async reactivateUser(userId: string): Promise<void> {
    await this.api(`/v2/users/${userId}/reactivate`, { method: 'POST', body: '{}' });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.api(`/v2/users/${userId}`, { method: 'DELETE' });
  }

  async updateName(userId: string, givenName: string, familyName: string, displayName?: string): Promise<void> {
    await this.api(`/v2/users/human/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ profile: { givenName, familyName, displayName: displayName ?? `${givenName} ${familyName}`.trim() } }),
    });
  }

  async setUserMetadata(userId: string, orgId: string, key: string, value: string): Promise<void> {
    await this.api(
      `/management/v1/users/${userId}/metadata/${key}`,
      { method: 'POST', body: JSON.stringify({ value: Buffer.from(value, 'utf8').toString('base64') }) },
      orgId,
    );
  }

  /** Read all of a user's metadata as a decoded {key: value} map. */
  async listUserMetadata(userId: string, orgId: string): Promise<Record<string, string>> {
    const r = await this.api(
      `/management/v1/users/${userId}/metadata/_search`,
      { method: 'POST', body: '{}' },
      orgId,
    );
    const out: Record<string, string> = {};
    for (const m of r?.result ?? []) {
      if (m.key) out[m.key] = Buffer.from(m.value ?? '', 'base64').toString('utf8');
    }
    return out;
  }
}
