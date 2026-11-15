import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { AuthService } from '../auth/auth.service';
import {
  allowed,
  can,
  CAPABILITIES,
  CAPABILITY_INFO,
  capabilitiesOf,
  EDITABLE,
  effectiveCapabilities,
  isRole,
  Need,
  NeedGuard,
  parsePermissions,
  permissionsFor,
  ROLE_NAMES,
  type Capability,
  type Permissions,
  type Role,
} from '../auth/roles';
import { MailService } from '../mail/mail.service';
import { ZitadelService } from '../zitadel/zitadel.service';
import { RecordsService } from './records.service';
import { clientIp } from './client-ip';
import { RateLimiter } from './stores';
import { OperatorGuard, type OperatorRequest } from './verifications.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

/** What each role is for, as the invite dialog and the Team page explain it. */
const ROLE_SUMMARY: Record<Role, string> = {
  owner: 'Full control, ownership and closing the account.',
  admin: 'Full control except ownership: team, settings, billing, keys, everything.',
  developer: 'API keys, Playground, workflows, webhooks; runs and reads verifications without personal data.',
  reviewer: 'Works the verifications, with personal data; runs checks and the AML Explorer.',
  billing: 'Usage, credits and budgets only.',
  viewer: 'Looks around: summaries, workflows, masked keys, usage. Changes nothing.',
};
const INVITABLE: Role[] = ['admin', 'developer', 'reviewer', 'billing', 'viewer'];
type Status = 'active' | 'invited' | 'deactivated';
/** Zitadel creates every user "active": an invitation is still open while the invited person has set no password. */
const statusOf = (state: string, hasPassword: boolean, meta: Record<string, string>): Status =>
  state === 'USER_STATE_INACTIVE' || state === 'USER_STATE_LOCKED'
    ? 'deactivated'
    : meta['vs_invited_by'] !== undefined && !hasPassword
      ? 'invited'
      : 'active';
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const initials = (name: string, email: string) => {
  const parts = (name || email).trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
};
const splitName = (name: string) => {
  const [given, ...rest] = name.trim().split(/\s+/);
  return { givenName: given || 'New', familyName: rest.join(' ') || 'Member' };
};

/**
 * The Team page: the organisation's people, their roles and invitations. Only an Owner or an Admin manages it; the
 * rules no screen can bend are here: nobody changes or removes themselves, the Owner is changed only by handing
 * ownership over, and an invitation never makes an Owner. Roles live on the person (`vs_role`), written only here.
 */
@Controller('api/team')
export class TeamController {
  private readonly log = new Logger('Team');
  private readonly app: string;
  private readonly limiter = new RateLimiter();

  constructor(
    private readonly zitadel: ZitadelService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly notes: NotificationsService,
    private readonly records: RecordsService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.app = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  /* ------------------------------------------------------------ managing (Owner, Admin) -- */

  @Get()
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('team.manage')
  async list(@Req() req: OperatorRequest) {
    const org = this.orgOf(req);
    const users = await this.zitadel.orgUsers(org);
    const members = await Promise.all(
      users.map(async (u) => {
        const meta = await this.zitadel.listUserMetadata(u.userId, org).catch(() => ({}) as Record<string, string>);
        const role: Role = isRole(meta['vs_role']) ? meta['vs_role'] : u.userId === users[0]?.userId ? 'owner' : 'viewer';
        const own = role === 'owner' ? { add: [], remove: [] } : parsePermissions(meta['vs_perms']);
        return {
          id: u.userId,
          // what they may do: the role's permissions with their own changes
          permissions: effectiveCapabilities(role, own),
          customPermissions: own.add.length + own.remove.length > 0,
          name: u.name || u.email,
          initials: initials(u.name, u.email),
          email: u.email,
          role,
          roleName: ROLE_NAMES[role],
          status: statusOf(u.state, u.hasPassword, meta),
          lastActive: meta['vs_last_active'] ?? null,
          invitedAt: u.createdAt,
          isMe: u.userId === req.userId,
        };
      }),
    );
    return {
      me: { id: req.userId ?? null, role: req.role, canTransfer: can(req.role, 'ownership') },
      roles: (Object.keys(ROLE_NAMES) as Role[]).map((r) => ({
        id: r,
        name: ROLE_NAMES[r],
        summary: ROLE_SUMMARY[r],
        invitable: INVITABLE.includes(r),
        // each role's permissions, so the invite dialog can show them before anyone is invited
        capabilities: capabilitiesOf(r),
      })),
      // every permission, named and grouped as the Team page shows it
      capabilities: CAPABILITIES.map((c) => ({ id: c, ...CAPABILITY_INFO[c], editable: EDITABLE.includes(c) })),
      members,
    };
  }

  @Post('invite')
  @HttpCode(201)
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('team.manage')
  async invite(@Req() req: OperatorRequest, @Body() b: { email?: unknown; name?: unknown; role?: unknown; permissions?: unknown }) {
    const org = this.orgOf(req);
    if (!this.limiter.take(`invite:${org}`, 30, 60 * 60_000))
      throw new HttpException('Too many invitations. Please wait a while.', HttpStatus.TOO_MANY_REQUESTS);
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new BadRequestException('Enter the email address to invite.');
    const role = String(b.role ?? '');
    if (!isRole(role) || !INVITABLE.includes(role)) throw new BadRequestException('Choose the role to give them (an invitation never makes an Owner).');
    const name = String(b.name ?? '').trim().slice(0, 80) || email.split('@')[0]!;
    // the role's permissions, or the exact set the inviter chose (more or fewer than the role's)
    const perms = b.permissions === undefined ? null : this.wantedPermissions(req, role, b.permissions);
    const userId = await this.zitadel.inviteMember(org, { email, ...splitName(name), displayName: name });
    try {
      await this.zitadel.setUserMetadata(userId, org, 'vs_role', role);
      if (perms && perms.add.length + perms.remove.length > 0) await this.zitadel.setUserMetadata(userId, org, 'vs_perms', JSON.stringify(perms));
      // they join an organisation that is already set up: no onboarding for them
      await this.zitadel.setUserMetadata(userId, org, 'vs_onboarding_seen', '1');
      await this.zitadel.setUserMetadata(userId, org, 'vs_invited_by', req.operator ?? '');
      await this.sendInvite(userId, org, email, role, req.operator ?? 'A teammate');
    } catch (e) {
      // nothing half-made is left behind
      await this.zitadel.deleteUser(userId).catch(() => undefined);
      this.log.warn(`invite to ${email} failed: ${(e as Error).message}`);
      throw new HttpException('The invitation could not be sent. Please try again.', HttpStatus.BAD_GATEWAY);
    }
    this.audit.record(org, req.operator ?? req.userId ?? 'unknown', 'team.invited', `${email} invited as ${ROLE_NAMES[role]}`, clientIp(req));
    return { ok: true, id: userId };
  }

  @Post(':id/resend')
  @HttpCode(200)
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('team.manage')
  async resend(@Req() req: OperatorRequest, @Param('id') id: string) {
    const org = this.orgOf(req);
    const m = await this.member(org, id);
    if (m.status !== 'invited') throw new ConflictException('They have already accepted.');
    await this.sendInvite(id, org, m.email, m.role, req.operator ?? 'A teammate');
    this.audit.record(org, req.operator ?? req.userId ?? 'unknown', 'team.invitation_resent', `invitation resent to ${m.email}`, clientIp(req));
    return { ok: true };
  }

  @Patch(':id')
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('team.manage')
  async change(@Req() req: OperatorRequest, @Param('id') id: string, @Body() b: { role?: unknown; name?: unknown; permissions?: unknown }) {
    const org = this.orgOf(req);
    const m = await this.member(org, id);
    this.notSelf(req, id);
    // their own permissions: the exact set chosen (checked against their role, new or current); a new role alone starts
    // from that role's permissions
    const nextRole = b.role !== undefined && isRole(String(b.role)) ? (String(b.role) as Role) : m.role;
    if (b.permissions !== undefined || (b.role !== undefined && nextRole !== m.role)) {
      if (m.role === 'owner' || nextRole === 'owner') throw new ForbiddenException('The Owner always has every permission.');
      const perms = b.permissions === undefined ? { add: [], remove: [] } : this.wantedPermissions(req, nextRole, b.permissions);
      await this.zitadel.setUserMetadata(id, org, 'vs_perms', JSON.stringify(perms));
      this.auth.forgetRole(id);
      if (b.permissions !== undefined && nextRole === m.role)
        this.notes.notify({
          org,
          user: id,
          kind: 'team.role',
          tone: 'info',
          title: 'Your permissions changed',
          body: 'An Owner or Admin of your team changed what you can see and do in VeriSec.',
        });
    }
    if (b.role !== undefined) {
      const role = String(b.role);
      if (!isRole(role) || role === 'owner') throw new BadRequestException('Choose a role. Ownership is handed over with Transfer ownership.');
      if (m.role === 'owner') throw new ForbiddenException("The Owner's role changes only when they hand ownership over.");
      await this.zitadel.setUserMetadata(id, org, 'vs_role', role);
      this.auth.forgetRole(id);
      if (role !== m.role)
        this.notes.notify({
          org,
          user: id,
          kind: 'team.role',
          tone: 'info',
          title: 'Your role changed',
          body: `You are now ${ROLE_NAMES[role]}. What you can see and do in VeriSec changed with it.`,
        });
    }
    if (typeof b.name === 'string' && b.name.trim()) {
      const name = b.name.trim().slice(0, 80);
      const n = splitName(name);
      await this.zitadel.updateName(id, n.givenName, n.familyName, name);
    }
    this.audit.record(org, req.operator ?? req.userId ?? 'unknown', 'team.member_updated', `team member ${m.email} was updated${nextRole !== m.role ? ` to ${ROLE_NAMES[nextRole]}` : ''}`, clientIp(req));
    return { ok: true };
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('team.manage')
  async deactivate(@Req() req: OperatorRequest, @Param('id') id: string) {
    const org = this.orgOf(req);
    const m = await this.member(org, id);
    this.notSelf(req, id);
    if (m.role === 'owner') throw new ForbiddenException('The Owner cannot be deactivated.');
    if (m.status !== 'active') throw new ConflictException('Only an active member can be deactivated.');
    await this.zitadel.deactivateUser(id);
    this.audit.record(org, req.operator ?? req.userId ?? 'unknown', 'team.member_deactivated', `${m.email} was deactivated`, clientIp(req));
    return { ok: true };
  }

  @Post(':id/activate')
  @HttpCode(200)
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('team.manage')
  async activate(@Req() req: OperatorRequest, @Param('id') id: string) {
    const org = this.orgOf(req);
    const m = await this.member(org, id);
    if (m.status !== 'deactivated') throw new ConflictException('They are not deactivated.');
    await this.zitadel.reactivateUser(id);
    this.audit.record(org, req.operator ?? req.userId ?? 'unknown', 'team.member_activated', `${m.email} was reactivated`, clientIp(req));
    return { ok: true };
  }

  @Delete(':id')
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('team.manage')
  async remove(@Req() req: OperatorRequest, @Param('id') id: string) {
    const org = this.orgOf(req);
    const m = await this.member(org, id);
    this.notSelf(req, id);
    if (m.role === 'owner') throw new ForbiddenException('The Owner cannot be removed.');
    await this.zitadel.deleteUser(id);
    this.auth.forgetRole(id);
    this.audit.record(org, req.operator ?? req.userId ?? 'unknown', 'team.member_removed', `${m.email} was removed from the team`, clientIp(req));
    return { ok: true };
  }

  /** The Owner hands ownership to an active member and becomes an Admin. */
  @Post(':id/transfer')
  @HttpCode(200)
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('ownership')
  async transfer(@Req() req: OperatorRequest, @Param('id') id: string) {
    const org = this.orgOf(req);
    const m = await this.member(org, id);
    this.notSelf(req, id);
    if (m.status !== 'active') throw new ConflictException('Ownership can only go to an active member.');
    await this.zitadel.setUserMetadata(id, org, 'vs_role', 'owner');
    await this.zitadel.setUserMetadata(req.userId!, org, 'vs_role', 'admin');
    this.auth.forgetRole(id);
    this.auth.forgetRole(req.userId!);
    this.notes.notify({
      org,
      user: id,
      kind: 'team.owner',
      tone: 'success',
      title: 'You are now the Owner',
      body: 'Ownership of the organisation was handed to you.',
      href: '/team/',
    });
    this.audit.record(org, req.operator ?? req.userId ?? 'unknown', 'team.ownership_transferred', `ownership transferred to ${m.email}`, clientIp(req));
    return { ok: true };
  }

  /* ------------------------------------------------------------ the invited person (public) -- */

  /** What the invitation page shows: the organisation, the role and the email (only for an invitation not yet used). */
  @Get('invitation')
  async invitation(@Req() req: Request, @Query('user') user?: string) {
    if (!this.limiter.take(`invitation:${clientIp(req)}`, 60, 10 * 60_000))
      throw new HttpException('Too many attempts. Please wait a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    if (!user || !/^\d{6,24}$/.test(user)) throw new NotFoundException('This invitation is not valid.');
    const { u, org, meta } = await this.openInvitation(user);
    const role = isRole(meta['vs_role']) ? meta['vs_role'] : 'viewer';
    return {
      email: u.human?.email?.email ?? '',
      name: u.human?.profile?.displayName ?? '',
      orgName: (await this.zitadel.getOrgName(org).catch(() => null)) ?? 'your team',
      role,
      roleName: ROLE_NAMES[role],
      roleSummary: ROLE_SUMMARY[role],
    };
  }

  /** Accept: the invitation code proves the email; the person chooses their password and can sign in. */
  @Post('accept')
  @HttpCode(200)
  async accept(@Req() req: Request, @Body() b: { user?: unknown; code?: unknown; password?: unknown; name?: unknown }) {
    if (!this.limiter.take(`accept:${clientIp(req)}`, 20, 10 * 60_000))
      throw new HttpException('Too many attempts. Please wait a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    const user = String(b.user ?? '');
    const code = String(b.code ?? '');
    const password = String(b.password ?? '');
    if (!/^\d{6,24}$/.test(user) || !/^[A-Za-z0-9]{4,64}$/.test(code)) throw new BadRequestException('This invitation link is not complete. Open it from the email again.');
    if (password.length < 8) throw new BadRequestException('Use at least 8 characters for your password.');
    const { u, org: teamOrg, meta: teamMeta } = await this.openInvitation(user);
    try {
      await this.zitadel.verifyInviteCode(user, code);
    } catch {
      throw new BadRequestException('This invitation link has expired or was replaced by a newer one. Ask for a new invitation.');
    }
    try {
      await this.zitadel.setPassword(user, password);
    } catch (e) {
      throw new BadRequestException(
        /complex|policy|length|character/i.test((e as Error).message)
          ? 'Choose a stronger password: at least 8 characters with upper and lower case letters, a number and a symbol.'
          : 'Your password could not be set. Please try again.',
      );
    }
    await this.zitadel.markEmailVerified(user, u.human?.email?.email ?? '').catch(() => undefined);
    // the name they gave themselves (an invitation by email alone only knew the address)
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    if (name) {
      const n = splitName(name);
      await this.zitadel.updateName(user, n.givenName, n.familyName, name).catch(() => undefined);
    }
    // the people who manage the team hear that the invitation was taken up
    const joinedRole: Role = isRole(teamMeta['vs_role']) ? teamMeta['vs_role'] : 'viewer';
    this.notes.notify({
      org: teamOrg,
      audience: 'team.manage',
      kind: 'team.joined',
      tone: 'success',
      title: 'A new member joined your team',
      body: `${name || u.human?.profile?.displayName || u.human?.email?.email || 'Someone'} joined as ${ROLE_NAMES[joinedRole]}.`,
      href: '/team/',
    });
    this.audit.record(teamOrg, u.human?.email?.email ?? user, 'team.member_joined', `joined as ${ROLE_NAMES[joinedRole]}`, clientIp(req));
    return { ok: true, email: u.human?.email?.email ?? '' };
  }

  /* ------------------------------------------------------------ inside -- */

  /**
   * One member's page: who they are, how they sign in, what they may do, and what they did (their sign-ins and their
   * actions on verification records, from the append-only access log). Owner and Admin only.
   */
  @Get(':id')
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('team.manage')
  async detail(@Req() req: OperatorRequest, @Param('id') id: string) {
    const org = this.orgOf(req);
    if (!/^\d{6,24}$/.test(id)) throw new NotFoundException('No such member.');
    const users = await this.zitadel.orgUsers(org);
    const u = users.find((x) => x.userId === id);
    if (!u) throw new NotFoundException('No such member.');
    const [meta, factors] = await Promise.all([
      this.zitadel.listUserMetadata(id, org).catch(() => ({}) as Record<string, string>),
      this.zitadel.userMfaFactors(id, org).catch(() => [] as string[]),
    ]);
    const role: Role = isRole(meta['vs_role']) ? meta['vs_role'] : users[0]?.userId === id ? 'owner' : 'viewer';
    const own = role === 'owner' ? { add: [], remove: [] } : parsePermissions(meta['vs_perms']);
    const devices = (() => {
      try {
        const a = JSON.parse(meta['trusted_devices'] ?? '[]') as { name?: string; lastSeen?: string; firstSeen?: string }[];
        return Array.isArray(a) ? a.filter((d) => d && d.lastSeen) : [];
      } catch {
        return [];
      }
    })().sort((a, b) => +new Date(b.lastSeen!) - +new Date(a.lastSeen!));
    const ACTION: Record<string, string> = {
      'viewed record': 'Opened a verification',
      'redacted record': 'Redacted a verification',
      'deleted record': 'Deleted a verification',
      'disabled verification': 'Disabled a verification',
      'enabled verification': 'Enabled a verification',
    };
    const actions = (await this.records.accessByActor([u.email, u.email.toLowerCase(), id], 30)).map((r) => ({
      action: ACTION[r.action] ?? (r.action.startsWith('viewed ') ? `Viewed the ${r.action.slice(7)}` : r.action),
      target: r.reference ?? 'A deleted verification',
      at: new Date(r.at).toISOString(),
    }));
    const signIns = devices.slice(0, 10).map((d) => ({ action: 'Signed in', target: d.name ?? 'A browser', at: d.lastSeen! }));
    const activity = [...actions, ...signIns].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 25);
    return {
      id,
      name: u.name || u.email,
      initials: initials(u.name, u.email),
      email: u.email,
      role,
      roleName: ROLE_NAMES[role],
      roleSummary: ROLE_SUMMARY[role],
      status: statusOf(u.state, u.hasPassword, meta),
      joined: u.createdAt || null,
      lastActive: meta['vs_last_active'] ?? null,
      lastLogin: devices[0] ? { device: devices[0].name ?? 'A browser', at: devices[0].lastSeen } : null,
      twoFactor: factors.length > 0,
      permissions: effectiveCapabilities(role, own),
      customPermissions: own.add.length + own.remove.length > 0,
      isMe: id === req.userId,
      activity,
    };
  }

  /** Sign a member out everywhere now: every session they have ends (they can sign in again unless suspended). */
  @Post(':id/signout')
  @HttpCode(200)
  @UseGuards(OperatorGuard, NeedGuard)
  @Need('team.manage')
  async signOut(@Req() req: OperatorRequest, @Param('id') id: string) {
    const org = this.orgOf(req);
    await this.member(org, id);
    this.notSelf(req, id);
    const ids = await this.zitadel.userSessionIds(id);
    let ended = 0;
    for (const s of ids) {
      await this.zitadel
        .endSession(s)
        .then(() => ended++)
        .catch((e) => this.log.warn(`sign-out of a session failed: ${(e as Error).message}`));
    }
    // every guard's cached answer for them is dropped: their next request finds no session
    this.auth.forgetRole(id);
    const member = await this.member(org, id);
    this.audit.record(org, req.operator ?? req.userId ?? 'unknown', 'team.member_signed_out', `all sessions ended for ${member.email}`, clientIp(req));
    return { ok: true, ended };
  }

  private orgOf(req: OperatorRequest): string {
    const org = req.org ?? req.homeOrg;
    if (!org || !req.userId) throw new ForbiddenException('Sign in to your organisation to manage its team.');
    return org;
  }

  private notSelf(req: OperatorRequest, id: string) {
    if (id === req.userId) throw new ForbiddenException('You cannot change or remove yourself. Ask another Owner or Admin.');
  }

  /** An invitation not yet accepted: the person was invited and has never set a password. */
  private async openInvitation(user: string) {
    const u = await this.zitadel.getUser(user).catch(() => null);
    const org = (u?.details?.resourceOwner as string | undefined) ?? '';
    const meta = u && org ? await this.zitadel.listUserMetadata(user, org).catch(() => null) : null;
    if (!u || !meta || statusOf(String(u.state ?? ''), !!u.human?.passwordChanged, meta) !== 'invited')
      throw new NotFoundException('This invitation is not valid or has already been used.');
    return { u, org, meta };
  }

  /** A member of THIS organisation (anyone else is "not found"). */
  /**
   * The permissions someone may be given, as stored changes from their role. Nobody hands out a permission they do not
   * have themselves, and ownership is never part of it (Transfer ownership moves it).
   */
  private wantedPermissions(req: OperatorRequest, role: Role, raw: unknown): Permissions {
    if (!Array.isArray(raw) || raw.length > CAPABILITIES.length || raw.some((c) => typeof c !== 'string'))
      throw new BadRequestException('Choose the permissions from the list.');
    const unknown = raw.filter((c) => !(EDITABLE as string[]).includes(c as string));
    if (unknown.length) throw new BadRequestException('Some of those permissions cannot be given.');
    const p = permissionsFor(role, raw as Capability[]);
    const beyond = p.add.filter((c) => !allowed(req, c));
    if (beyond.length) throw new ForbiddenException('You can only give permissions you have yourself.');
    return p;
  }

  private async member(org: string, id: string) {
    if (!/^\d{6,24}$/.test(id)) throw new NotFoundException('No such member.');
    const users = await this.zitadel.orgUsers(org);
    const u = users.find((x) => x.userId === id);
    if (!u) throw new NotFoundException('No such member.');
    const meta = await this.zitadel.listUserMetadata(id, org).catch(() => ({}) as Record<string, string>);
    const role: Role = isRole(meta['vs_role']) ? meta['vs_role'] : users[0]?.userId === id ? 'owner' : 'viewer';
    return { email: u.email, role, status: statusOf(u.state, u.hasPassword, meta) };
  }

  private async sendInvite(userId: string, org: string, email: string, role: Role, inviter: string) {
    const code = await this.zitadel.inviteCode(userId);
    const orgName = (await this.zitadel.getOrgName(org).catch(() => null)) ?? 'your team';
    const link = `${this.app}/accept-invite/?user=${encodeURIComponent(userId)}&code=${encodeURIComponent(code)}`;
    await this.mail.sendInvite(email, { orgName, inviter, roleName: ROLE_NAMES[role], link });
  }
}
