import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { AuthService } from '../auth/auth.service';
import { ZitadelService } from '../zitadel/zitadel.service';
import { clientIp } from './client-ip';
import { IntelClient } from './intel.client';
import { RateLimiter } from './stores';
import { Need, NeedGuard } from '../auth/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

/**
 * API keys for the dashboard. The keys themselves live in the key service beside the API gateway (the engine host,
 * /v1/keys); this controller only says who is asking (account, person, role) and relays. The rules (scope within the
 * account's entitlement and the person's role, secrets shown once and stored as digests, audit) are enforced there.
 *
 * Who: a signed-in console session (Zitadel). The account is the person's organisation; the role comes from the
 * person's `vs_role` metadata, and is Owner when unset (team roles are not assigned yet, and the person who signs a
 * business up is its Owner). Creating or rotating a key, the two actions that hand out a secret, needs a session that
 * passed two-factor sign-in.
 */

export type KeyCaller = { org: string; actor: string; role: string; mfa: boolean };
export type KeysRequest = Request & { keyCaller?: KeyCaller };

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ROLES = new Set([
  'owner',
  'admin',
  'developer',
  'reviewer',
  'billing',
  'viewer',
]);

@Injectable()
export class KeysGuard implements CanActivate {
  private readonly cache = new Map<
    string,
    { caller: KeyCaller; caps: string[]; userId: string; twoFactorOn: boolean; at: number; exp: number }
  >();
  private readonly gateOff: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly zitadel: ZitadelService,
    config: ConfigService,
  ) {
    // Same switch as the rest of the console: on a dev machine with sign-in off, this computer is the local account's Owner.
    this.gateOff = config.get<string>('CONSOLE_AUTH_GATE') === '0';
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<KeysRequest>();
    if (this.gateOff && LOOPBACK.has(req.socket?.remoteAddress ?? '')) {
      (req as KeysRequest & { role?: string }).role = 'owner';
      req.keyCaller = {
        org: 'org_local_dev',
        actor: 'local-dev',
        role: 'owner',
        mfa: true,
      };
      return true;
    }
    let sessionId: string | undefined;
    try {
      sessionId = (
        JSON.parse((req.cookies?.['vs_session'] as string) ?? 'null') as {
          sessionId?: string;
        } | null
      )?.sessionId;
    } catch {
      sessionId = undefined;
    }
    if (!sessionId)
      throw new UnauthorizedException(
        'Sign in to the console to manage API keys.',
      );
    const hit = this.cache.get(sessionId);
    if (hit && hit.exp > Date.now() && !this.auth.changedSince(hit.userId, hit.at)) {
      await this.auth.enforceRequestSecurity(hit.caller.org, sessionId, clientIp(req));
      req.keyCaller = hit.caller;
      (req as KeysRequest & { role?: string }).role = hit.caller.role;
      // the member's own permissions (their role plus what an Owner or Admin changed) decide the routes
      (req as KeysRequest & { caps?: string[] }).caps = hit.caps;
      (req as KeysRequest & { twoFactorOn?: boolean }).twoFactorOn = hit.twoFactorOn;
      return true;
    }
    const me = await this.auth.me(sessionId, clientIp(req));
    if (!me?.userId || !me.passwordVerified)
      throw new UnauthorizedException(
        'Your console session has ended. Sign in again.',
      );
    const org = await this.zitadel.getUserOrg(me.userId).catch(() => '');
    if (!org)
      throw new UnauthorizedException(
        'Your account could not be found. Sign in again.',
      );
    // the person's role (Viewer when none is on record; the organisation's founder owns it)
    const role = me.role ?? 'viewer';
    const caller: KeyCaller = {
      org,
      actor: String(me.loginName ?? me.userId),
      role,
      mfa: !!me.mfaVerified,
    };
    const caps = (me.capabilities ?? []) as string[];
    this.cache.set(sessionId, { caller, caps, userId: me.userId, twoFactorOn: !!me.mfaEnabled, at: Date.now(), exp: Date.now() + 60_000 });
    (req as KeysRequest & { twoFactorOn?: boolean }).twoFactorOn = !!me.mfaEnabled;
    req.keyCaller = caller;
    (req as KeysRequest & { role?: string }).role = caller.role;
    (req as KeysRequest & { caps?: string[] }).caps = caps;
    return true;
  }
}

/** The key service's refusal codes as HTTP statuses. */
const STATUS: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  beyond_role: 403,
  live_locked: 403,
  product_not_enabled: 403,
  not_found: 404,
  not_active: 409,
  key_not_active: 409,
  invalid_input: 400,
  no_permissions: 400,
  gateway_unavailable: 502,
  unavailable: 503,
};

@Controller('api/keys')
@UseGuards(KeysGuard, NeedGuard)
export class KeysController {
  private readonly limiter = new RateLimiter();

  /** Ed25519 key that signs every request to the key service; its public half is the only identity the service trusts. */
  private readonly signer: KeyObject | null;

  constructor(
    private readonly intel: IntelClient,
    private readonly notes: NotificationsService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    const pem = config.get<string>('KEYS_ASSERTION_KEY');
    this.signer = pem
      ? createPrivateKey(Buffer.from(pem, 'base64').toString('utf8'))
      : null;
  }

  @Need('keys.view')
  @Get('catalog')
  catalog(@Req() req: KeysRequest) {
    return this.relay(req, 'GET', '/v1/keys/catalog');
  }

  @Need('keys.view')
  @Get()
  list(@Req() req: KeysRequest) {
    return this.relay(req, 'GET', '/v1/keys');
  }

  @Need('keys.view')
  @Get('events')
  events(@Req() req: KeysRequest, @Query('key_id') keyId?: string) {
    const q =
      typeof keyId === 'string' && /^key_[A-Za-z0-9]{8,32}$/.test(keyId)
        ? `?key_id=${keyId}`
        : '';
    return this.relay(req, 'GET', `/v1/keys/events${q}`);
  }

  /** Every call made with the organisation's keys (and Playground runs), newest first: the Logs tab. */
  @Need('keys.view')
  @Get('logs')
  logs(@Req() req: KeysRequest, @Query() q: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if (/^\d{1,5}$/.test(q.page ?? '')) p.set('page', q.page!);
    if (/^\d{1,3}$/.test(q.size ?? '')) p.set('size', q.size!);
    if (/^key_[A-Za-z0-9]{8,32}$/.test(q.key_id ?? '')) p.set('key_id', q.key_id!);
    if (q.outcome === 'ok' || q.outcome === 'error') p.set('outcome', q.outcome);
    const qs = p.toString();
    return this.relay(req, 'GET', `/v1/keys/logs${qs ? `?${qs}` : ''}`);
  }

  @Need('keys.manage')
  @Post()
  async create(@Req() req: KeysRequest, @Body() body: unknown) {
    this.secretAction(req);
    const r = await this.relay(req, 'POST', '/v1/keys', body);
    this.keyNote(req, r, 'created');
    return r;
  }

  @Need('keys.manage')
  @Patch(':id')
  edit(
    @Req() req: KeysRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.throttle(req);
    const safeId = keyId(id);
    return this.relay(req, 'PATCH', `/v1/keys/${safeId}`, body).then((result) => {
      const who = req.keyCaller;
      if (who && who.org !== 'org_local_dev')
        this.audit.record(who.org, who.actor, 'api_key.updated', `API key ${safeId} was updated`, clientIp(req));
      return result;
    });
  }

  @Need('keys.manage')
  @Post(':id/rotate')
  async rotate(
    @Req() req: KeysRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    this.secretAction(req);
    const r = await this.relay(req, 'POST', `/v1/keys/${keyId(id)}/rotate`, body);
    this.keyNote(req, r, 'rotated');
    return r;
  }

  @Need('keys.manage')
  @Post(':id/revoke')
  async revoke(@Req() req: KeysRequest, @Param('id') id: string) {
    this.throttle(req);
    const r = await this.relay(req, 'POST', `/v1/keys/${keyId(id)}/revoke`, {});
    this.keyNote(req, r, 'revoked');
    return r;
  }

  /** Everyone who sees the organisation's keys hears when one is created, rotated or revoked. */
  private keyNote(req: KeysRequest, r: unknown, what: 'created' | 'rotated' | 'revoked') {
    const who = req.keyCaller;
    const name = (r as { key?: { name?: unknown } } | null)?.key?.name;
    if (who && who.org !== 'org_local_dev')
      this.audit.record(who.org, who.actor, `api_key.${what}`, `${typeof name === 'string' && name ? name : 'API key'} was ${what}`, clientIp(req));
    if (!who || who.org === 'org_local_dev') return;
    this.notes.notify({
      org: who.org,
      audience: 'keys.view',
      kind: `key.${what}`,
      tone: what === 'revoked' ? 'warning' : 'info',
      title: `API key ${what}`,
      body: `${typeof name === 'string' && name ? name : 'A key'} was ${what} by ${who.actor}.`,
      href: '/api-keys/',
    });
  }

  /**
   * A ten-minute token for a Playground that calls the API straight from the browser (the Financial one sends its
   * uploads to /v2 itself): it acts as this key, so the key's permissions, limits, IP allow-list, expiry, spend cap and
   * the account's credits all apply. Only a role that may use the Playground gets one; the key service audits it.
   */
  @Need('playground')
  @Post(':id/playground-token')
  playgroundToken(@Req() req: KeysRequest, @Param('id') id: string) {
    this.throttle(req);
    return this.relay(req, 'POST', `/v1/keys/${keyId(id)}/playground-token`, {});
  }

  /** Creating and rotating hand out a secret: a session that passed two-factor sign-in, and a tighter rate. */
  private secretAction(req: KeysRequest) {
    this.throttle(req);
    if (!req.keyCaller?.mfa) {
      const on = !!(req as KeysRequest & { twoFactorOn?: boolean }).twoFactorOn;
      throw new ForbiddenException({
        code: 'mfa_required',
        // the screen asks for the code right there when two-factor is set up, else shows how to set it up
        hasTwoFactor: on,
        message: on
          ? 'A key hands out a secret: enter the 6-digit code from your authenticator app to continue.'
          : 'API keys need two-factor sign-in on your account. Turn it on in Settings, Security, then create the key again.',
      });
    }
  }

  private throttle(req: KeysRequest) {
    if (!this.limiter.take(`keys:${clientIp(req)}`, 30, 10 * 60_000)) {
      throw new HttpException(
        'Too many key changes. Please wait a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private assertion(
    who: KeyCaller,
    method: string,
    path: string,
    body: string,
  ): string {
    return assertionFor(this.signer as KeyObject, who, method, path, body);
  }

  private async relay(
    req: KeysRequest,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ) {
    const who = req.keyCaller;
    if (!who)
      throw new UnauthorizedException(
        'Sign in to the console to manage API keys.',
      );
    const payload =
      body && typeof body === 'object' && !Array.isArray(body)
        ? body
        : method === 'GET'
          ? undefined
          : {};
    if (!this.signer) {
      throw new HttpException(
        {
          code: 'unavailable',
          message: 'API keys are not available right now.',
        },
        503,
      );
    }
    const raw = payload === undefined ? '' : JSON.stringify(payload);
    const env = await this.intel.send(method, path, payload, 20_000, {
      'X-VeriSec-Assertion': this.assertion(who, method, path, raw),
    });
    if (env.ok) return env.data as unknown;
    const code = env.error?.code ?? 'unavailable';
    throw new HttpException(
      {
        code,
        message: env.error?.message ?? 'API keys are not available right now.',
      },
      STATUS[code] ?? 502,
    );
  }
}

/**
 * Who is asking, signed: account, person and role, valid for one minute and once, bound to this request's method,
 * path and body (the key service rejects it for any other request).
 */
export function assertionFor(
  signer: KeyObject,
  who: KeyCaller,
  method: string,
  path: string,
  body: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const part = (v: object) =>
    Buffer.from(JSON.stringify(v)).toString('base64url');
  const head = part({ alg: 'EdDSA', typ: 'vs-keys+jwt' });
  const claims = part({
    aud: 'verisec-keys',
    iat: now,
    exp: now + 60,
    jti: randomBytes(16).toString('hex'),
    org: who.org,
    actor: who.actor,
    role: who.role,
    mfa: who.mfa,
    m: method,
    p: path,
    b: createHash('sha256').update(body).digest('hex'),
  });
  return `${head}.${claims}.${sign(null, Buffer.from(`${head}.${claims}`), signer).toString('base64url')}`;
}

function keyId(id: string): string {
  if (!/^key_[A-Za-z0-9]{8,32}$/.test(id))
    throw new HttpException(
      { code: 'not_found', message: 'No such key.' },
      404,
    );
  return id;
}
