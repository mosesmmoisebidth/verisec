import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { ZitadelService } from '../zitadel/zitadel.service';
import { ipInRange, validIpRange } from '../audit/audit.service';
import { RecordsService } from './records.service';
import { maskEmail } from './verifications.controller';

/** Session-timeout windows the Security tab offers (hours). null = the platform default. */
const TIMEOUT_HOURS = new Set([1, 4, 8, 12, 24, 72]);
const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/**
 * Danger-zone account actions for an organisation: deactivate (suspend everyone), transfer ownership
 * (a Namecheap-style invite → accept → approve), and soft-delete (verify the owner by email, then
 * anonymise their login and suspend the org — reversible by support, nothing is hard-deleted).
 *
 * All three are owner-gated. Identity changes go through Zitadel (endpoints verified against v4.17);
 * transfer and lifecycle state live in the shared records Postgres.
 */
@Injectable()
export class AccountService {
  private readonly log = new Logger('Account');
  private schemaReady = false;
  /** Short-lived delete-confirmation codes, keyed by userId. */
  private readonly deleteCodes = new Map<string, { code: string; exp: number; tries: number }>();
  private readonly appUrl: string;

  constructor(
    private readonly records: RecordsService,
    private readonly zitadel: ZitadelService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  private async ensureSchema(): Promise<boolean> {
    if (this.schemaReady) return true;
    if (!this.records?.ready) return false;
    try {
      await this.records.query(`
        CREATE TABLE IF NOT EXISTS account_lifecycle (
          tenant text PRIMARY KEY,
          status text NOT NULL,
          handle text,
          actor  text,
          at     timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS account_transfer (
          id          text PRIMARY KEY,
          tenant      text NOT NULL,
          from_user   text NOT NULL,
          from_email  text,
          to_user     text NOT NULL,
          to_email    text,
          to_name     text,
          status      text NOT NULL,
          created_at  timestamptz NOT NULL DEFAULT now(),
          accepted_at timestamptz
        );
        CREATE TABLE IF NOT EXISTS org_security (
          tenant                text PRIMARY KEY,
          session_timeout_hours int,
          session_timeout_configured boolean NOT NULL DEFAULT false,
          ip_allowlist          jsonb NOT NULL DEFAULT '[]'::jsonb,
          sso_idp_id            text,
          sso_name              text,
          updated_at            timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE org_security ADD COLUMN IF NOT EXISTS sso_idp_id text;
        ALTER TABLE org_security ADD COLUMN IF NOT EXISTS sso_name text;
        ALTER TABLE org_security ADD COLUMN IF NOT EXISTS session_timeout_configured boolean NOT NULL DEFAULT false;
      `);
      this.schemaReady = true;
      return true;
    } catch (e) {
      this.log.error(`account tables: ${(e as Error).message}`);
      return false;
    }
  }

  /** The signed-in person, their org, role and login email. */
  private async ctx(sessionId: string) {
    const sess = await this.zitadel.getSession(sessionId).catch(() => null);
    const userId: string | null = sess?.factors?.user?.id ?? null;
    if (!userId) throw new UnauthorizedException('not signed in');
    const orgId = (await this.zitadel.getUserOrg(userId).catch(() => '')) || '';
    if (!orgId) throw new UnauthorizedException('not signed in');
    const role = await this.auth.roleFor(userId, orgId);
    const loginName: string = sess?.factors?.user?.loginName ?? '';
    return { userId, orgId, role, loginName };
  }

  private async orgName(orgId: string): Promise<string> {
    return (await this.auth.orgDisplayName(orgId).catch(() => null)) ?? 'your organisation';
  }

  /* --------------------------------------------------------------- members -- */

  /** The org's members, for the transfer target picker. */
  async members(sessionId: string) {
    const { orgId, userId } = await this.ctx(sessionId);
    const users = await this.zitadel.orgUsers(orgId);
    const out: { userId: string; email: string; name: string; role: string; isSelf: boolean }[] = [];
    for (const u of users) {
      const role = await this.auth.roleFor(u.userId, orgId);
      out.push({ userId: u.userId, email: u.email, name: u.name || u.email, role, isSelf: u.userId === userId });
    }
    return { members: out };
  }

  /* --------------------------------------------------------- security tab -- */

  /** The org's security settings (session timeout + dashboard IP allow-list). */
  async getSecurity(sessionId: string) {
    if (!(await this.ensureSchema())) throw new BadRequestException('Security settings are temporarily unavailable. Try again shortly.');
    const { orgId } = await this.ctx(sessionId);
    const rows = await this.records.query<{
      session_timeout_hours: number | null;
      session_timeout_configured: boolean;
      ip_allowlist: unknown;
      sso_idp_id: string | null;
      sso_name: string | null;
    }>(
      'SELECT session_timeout_hours, session_timeout_configured, ip_allowlist, sso_idp_id, sso_name FROM org_security WHERE tenant = $1',
      [orgId],
    );
    const r = rows[0];
    const list = Array.isArray(r?.ip_allowlist) ? (r!.ip_allowlist as string[]) : [];
    return {
      sessionTimeoutHours: r
        ? r.session_timeout_hours ?? (r.session_timeout_configured ? null : 24)
        : 24,
      ipAllowlist: list,
      sso: r?.sso_idp_id
        ? { enabled: true, name: r.sso_name ?? 'SAML single sign-on', metadataUrl: this.zitadel.samlServiceProviderMetadataUrl(r.sso_idp_id) }
        : { enabled: false, name: null, metadataUrl: null },
    };
  }

  /** Change the session timeout and/or the dashboard IP allow-list (owner or admin). */
  async setSecurity(sessionId: string, patch: { sessionTimeoutHours?: unknown; ipAllowlist?: unknown }, requestIp = '') {
    if (!(await this.ensureSchema())) throw new BadRequestException('Security settings are temporarily unavailable. Try again shortly.');
    const { orgId, role, loginName } = await this.ctx(sessionId);
    if (role !== 'owner' && role !== 'admin') throw new ForbiddenException('Only an owner or admin can change security settings.');
    const cur = await this.getSecurity(sessionId);

    let hours = cur.sessionTimeoutHours;
    if (patch.sessionTimeoutHours !== undefined) {
      if (patch.sessionTimeoutHours === null) hours = null;
      else {
        const h = Number(patch.sessionTimeoutHours);
        if (!TIMEOUT_HOURS.has(h)) throw new BadRequestException('Choose one of the listed session-timeout windows.');
        hours = h;
      }
    }

    let list = cur.ipAllowlist;
    if (patch.ipAllowlist !== undefined) {
      if (!Array.isArray(patch.ipAllowlist)) throw new BadRequestException('The IP allow-list must be a list.');
      const cleaned = [...new Set(patch.ipAllowlist.map((v) => String(v).trim()).filter(Boolean))];
      if (cleaned.length > 50) throw new BadRequestException('Up to 50 IP entries.');
      const bad = cleaned.find((v) => !validIpRange(v));
      if (bad) throw new BadRequestException(`"${bad}" is not a valid IP address or CIDR block.`);
      if (cleaned.length && !cleaned.some((range) => ipInRange(requestIp, range)))
        throw new BadRequestException('Include your current network address before saving, or you may lock yourself out of the dashboard.');
      list = cleaned;
    }

    await this.records.query(
      `INSERT INTO org_security (tenant, session_timeout_hours, session_timeout_configured, ip_allowlist, updated_at)
         VALUES ($1, $2, true, $3::jsonb, now())
       ON CONFLICT (tenant) DO UPDATE SET session_timeout_hours = $2, session_timeout_configured = true, ip_allowlist = $3::jsonb, updated_at = now()`,
      [orgId, hours, JSON.stringify(list)],
    );
    this.audit.record(
      orgId,
      loginName,
      'security.updated',
      `session timeout ${hours == null ? 'off' : hours + 'h'}, ${list.length} IP entr${list.length === 1 ? 'y' : 'ies'}`,
    );
    return { sessionTimeoutHours: hours, ipAllowlist: list };
  }

  /** Configure an organization-scoped SAML IdP in Zitadel; only existing VeriSec members can link. */
  async configureSso(sessionId: string, input: { name?: unknown; metadataXml?: unknown }) {
    if (!(await this.ensureSchema())) throw new BadRequestException('Security settings are temporarily unavailable. Try again shortly.');
    const { orgId, role, loginName } = await this.ctx(sessionId);
    if (role !== 'owner' && role !== 'admin') throw new ForbiddenException('Only an owner or admin can configure SSO.');
    const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
    const metadataXml = typeof input.metadataXml === 'string' ? input.metadataXml.trim() : '';
    if (name.length < 2 || name.length > 100) throw new BadRequestException('Give the identity provider a name between 2 and 100 characters.');
    if (metadataXml.length < 50 || metadataXml.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(metadataXml) || !/<(?:[\w.-]+:)?IDPSSODescriptor\b/i.test(metadataXml)) {
      throw new BadRequestException('Paste valid SAML identity provider metadata XML (up to 1 MB).');
    }

    const current = await this.getSecurity(sessionId);
    const currentIdpId = (await this.records.query<{ sso_idp_id: string | null }>(
      'SELECT sso_idp_id FROM org_security WHERE tenant = $1',
      [orgId],
    ))[0]?.sso_idp_id ?? null;
    let idpId = currentIdpId;
    let created = false;
    try {
      if (idpId) await this.zitadel.updateSamlProvider(orgId, idpId, name, metadataXml);
      else {
        idpId = await this.zitadel.addSamlProvider(orgId, name, metadataXml);
        created = true;
      }
      await this.zitadel.allowOrganizationExternalIdp(orgId);
      if (created) await this.zitadel.activateOrganizationIdp(orgId, idpId!);
      await this.records.query(
        `INSERT INTO org_security (tenant, sso_idp_id, sso_name, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (tenant) DO UPDATE SET sso_idp_id = $2, sso_name = $3, updated_at = now()`,
        [orgId, idpId, name],
      );
    } catch (e) {
      if (created && idpId) {
        await this.zitadel.deactivateOrganizationIdp(orgId, idpId).catch(() => undefined);
        await this.zitadel.removeSamlProvider(orgId, idpId).catch(() => undefined);
      }
      throw new BadRequestException(`Could not configure SAML with Zitadel: ${(e as Error).message}`);
    }
    this.audit.record(orgId, loginName, current.sso.enabled ? 'sso.updated' : 'sso.enabled', `SAML identity provider: ${name}`);
    return { sso: { enabled: true, name } };
  }

  async disableSso(sessionId: string) {
    if (!(await this.ensureSchema())) throw new BadRequestException('Security settings are temporarily unavailable. Try again shortly.');
    const { orgId, role, loginName } = await this.ctx(sessionId);
    if (role !== 'owner' && role !== 'admin') throw new ForbiddenException('Only an owner or admin can change SSO.');
    const idpId = (await this.records.query<{ sso_idp_id: string | null }>(
      'SELECT sso_idp_id FROM org_security WHERE tenant = $1',
      [orgId],
    ))[0]?.sso_idp_id;
    if (!idpId) return { sso: { enabled: false, name: null } };
    await this.zitadel.deactivateOrganizationIdp(orgId, idpId).catch((e: Error) => {
      if (!/Zitadel 404/.test(e.message)) throw e;
    });
    await this.zitadel.removeSamlProvider(orgId, idpId).catch((e: Error) => {
      if (!/Zitadel 404/.test(e.message)) throw e;
    });
    await this.records.query('UPDATE org_security SET sso_idp_id = NULL, sso_name = NULL, updated_at = now() WHERE tenant = $1', [orgId]);
    this.audit.record(orgId, loginName, 'sso.disabled', 'SAML single sign-on disabled');
    return { sso: { enabled: false, name: null } };
  }

  /** The organisation's security audit log (newest first). */
  async auditLog(sessionId: string, limit = 100) {
    const { orgId, role } = await this.ctx(sessionId);
    if (role !== 'owner' && role !== 'admin') throw new ForbiddenException('Only an owner or admin can view the security audit log.');
    return { entries: await this.audit.list(orgId, limit) };
  }

  /* ------------------------------------------------------------ deactivate -- */

  async deactivate(sessionId: string) {
    await this.ensureSchema();
    const { userId, orgId, role, loginName } = await this.ctx(sessionId);
    if (role !== 'owner') throw new ForbiddenException('Only the owner can deactivate the account.');
    await this.zitadel.deactivateOrg(orgId);
    await this.records.query(
      `INSERT INTO account_lifecycle (tenant, status, actor, at) VALUES ($1, 'deactivated', $2, now())
       ON CONFLICT (tenant) DO UPDATE SET status = 'deactivated', actor = $2, at = now()`,
      [orgId, userId],
    );
    this.audit.record(orgId, loginName, 'account.deactivated', 'the organisation was suspended');
    this.log.warn(`org ${orgId} deactivated by ${userId}`);
    return { ok: true };
  }

  /* -------------------------------------------------------------- transfer -- */

  async transferStatus(sessionId: string) {
    await this.ensureSchema();
    const { orgId, userId, role } = await this.ctx(sessionId);
    const rows = await this.records.query<Record<string, string>>(
      `SELECT * FROM account_transfer WHERE tenant = $1 AND status IN ('pending','accepted') ORDER BY created_at DESC LIMIT 1`,
      [orgId],
    );
    const t = rows[0];
    return {
      role,
      canInitiate: role === 'owner',
      transfer: t
        ? {
            id: t.id,
            toUser: t.to_user,
            toEmail: t.to_email,
            toName: t.to_name,
            status: t.status,
            iAmOwner: role === 'owner',
            iAmRecipient: userId === t.to_user,
            createdAt: t.created_at,
          }
        : null,
    };
  }

  async transferInitiate(sessionId: string, toUserId: string) {
    await this.ensureSchema();
    const { userId, orgId, role, loginName } = await this.ctx(sessionId);
    if (role !== 'owner') throw new ForbiddenException('Only the owner can transfer ownership.');
    if (!toUserId || toUserId === userId) throw new BadRequestException('Choose a different team member to transfer ownership to.');
    const members = await this.zitadel.orgUsers(orgId);
    const target = members.find((m) => m.userId === toUserId);
    if (!target) throw new NotFoundException('That team member is not in this organisation.');
    await this.records.query(`UPDATE account_transfer SET status = 'cancelled' WHERE tenant = $1 AND status IN ('pending','accepted')`, [orgId]);
    const id = 'tr_' + randomBytes(8).toString('hex');
    await this.records.query(
      `INSERT INTO account_transfer (id, tenant, from_user, from_email, to_user, to_email, to_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [id, orgId, userId, loginName, target.userId, target.email, target.name],
    );
    const orgName = await this.orgName(orgId);
    await this.mail
      .sendOwnershipInvite(target.email, { orgName, inviterName: loginName || 'The owner', link: `${this.appUrl}/settings/danger` })
      .catch((e) => this.log.warn(`transfer invite email: ${(e as Error).message}`));
    this.audit.record(orgId, loginName, 'ownership.transfer_requested', `to ${target.email}`);
    this.log.log(`transfer ${id}: ${userId} → ${target.userId} (org ${orgId})`);
    return { ok: true };
  }

  async transferAccept(sessionId: string) {
    await this.ensureSchema();
    const { userId, orgId, loginName } = await this.ctx(sessionId);
    const rows = await this.records.query<Record<string, string>>(
      `SELECT * FROM account_transfer WHERE tenant = $1 AND status = 'pending' AND to_user = $2 ORDER BY created_at DESC LIMIT 1`,
      [orgId, userId],
    );
    const t = rows[0];
    if (!t) throw new NotFoundException('There is no ownership transfer waiting for you.');
    await this.records.query(`UPDATE account_transfer SET status = 'accepted', accepted_at = now() WHERE id = $1`, [t.id]);
    this.audit.record(orgId, loginName, 'ownership.transfer_accepted', 'the recipient accepted');
    const orgName = await this.orgName(orgId);
    if (t.from_email)
      await this.mail
        .sendOwnershipUpdate(t.from_email, {
          orgName,
          heading: 'Ownership transfer accepted',
          lede: `<b>${esc(t.to_email ?? 'The recipient')}</b> accepted the transfer of <b>${esc(orgName)}</b>. Open VeriSec to confirm and complete it.`,
          link: `${this.appUrl}/settings/danger`,
        })
        .catch((e) => this.log.warn(`transfer accept email: ${(e as Error).message}`));
    return { ok: true };
  }

  async transferApprove(sessionId: string) {
    await this.ensureSchema();
    const { userId, orgId, role, loginName } = await this.ctx(sessionId);
    if (role !== 'owner') throw new ForbiddenException('Only the owner can complete the transfer.');
    const rows = await this.records.query<Record<string, string>>(
      `SELECT * FROM account_transfer WHERE tenant = $1 AND status = 'accepted' ORDER BY accepted_at DESC LIMIT 1`,
      [orgId],
    );
    const t = rows[0];
    if (!t) throw new NotFoundException('There is no accepted transfer to complete.');
    // The new owner gets 'owner'; the old owner steps down to 'admin'.
    await this.zitadel.setUserMetadata(t.to_user, orgId, 'vs_role', 'owner');
    await this.zitadel.setUserMetadata(userId, orgId, 'vs_role', 'admin');
    this.auth.forgetRole(t.to_user);
    this.auth.forgetRole(userId);
    await this.records.query(`UPDATE account_transfer SET status = 'done' WHERE id = $1`, [t.id]);
    this.audit.record(orgId, loginName, 'ownership.transferred', `${t.to_email} is now the owner`);
    const orgName = await this.orgName(orgId);
    if (t.to_email)
      await this.mail
        .sendOwnershipUpdate(t.to_email, { orgName, heading: 'You are now the owner', lede: `Ownership of <b>${esc(orgName)}</b> has been transferred to you.` })
        .catch(() => undefined);
    if (t.from_email)
      await this.mail
        .sendOwnershipUpdate(t.from_email, { orgName, heading: 'Ownership transferred', lede: `You transferred ownership of <b>${esc(orgName)}</b>. You are now an admin.` })
        .catch(() => undefined);
    this.log.warn(`transfer ${t.id} completed: owner ${userId} → ${t.to_user} (org ${orgId})`);
    return { ok: true };
  }

  async transferCancel(sessionId: string) {
    await this.ensureSchema();
    const { userId, orgId, role } = await this.ctx(sessionId);
    const rows = await this.records.query<Record<string, string>>(
      `SELECT * FROM account_transfer WHERE tenant = $1 AND status IN ('pending','accepted') ORDER BY created_at DESC LIMIT 1`,
      [orgId],
    );
    const t = rows[0];
    if (!t) return { ok: true };
    if (role !== 'owner' && userId !== t.to_user) throw new ForbiddenException('Only the owner or the recipient can cancel this transfer.');
    await this.records.query(`UPDATE account_transfer SET status = 'cancelled' WHERE id = $1`, [t.id]);
    return { ok: true };
  }

  /* ----------------------------------------------------------- soft-delete -- */

  async deleteStart(sessionId: string) {
    const { userId, orgId, role, loginName } = await this.ctx(sessionId);
    if (role !== 'owner') throw new ForbiddenException('Only the owner can delete the account.');
    if (!loginName || !loginName.includes('@')) throw new BadRequestException('We could not find your email to send a confirmation code.');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.deleteCodes.set(userId, { code, exp: Date.now() + 10 * 60_000, tries: 0 });
    await this.mail.sendDeleteCode(loginName, code, await this.orgName(orgId));
    return { ok: true, sentTo: maskEmail(loginName) };
  }

  async deleteConfirm(sessionId: string, code: string) {
    await this.ensureSchema();
    const { userId, orgId, role, loginName } = await this.ctx(sessionId);
    if (role !== 'owner') throw new ForbiddenException('Only the owner can delete the account.');
    const rec = this.deleteCodes.get(userId);
    if (!rec || rec.exp < Date.now()) throw new BadRequestException('Your confirmation code expired. Start again.');
    if (rec.tries >= 5) {
      this.deleteCodes.delete(userId);
      throw new BadRequestException('Too many attempts. Start again.');
    }
    if (String(code ?? '').trim() !== rec.code) {
      rec.tries++;
      throw new BadRequestException('That code is not right.');
    }
    this.deleteCodes.delete(userId);
    // Anonymise the login into an unguessable handle and free the real email, then suspend the org.
    const r1 = randomBytes(5).toString('hex');
    const r2 = randomBytes(5).toString('hex');
    const handle = `${loginName}-${r1}_verisec.dev_${r2}`;
    await this.zitadel.setUsername(userId, orgId, handle).catch((e) => this.log.warn(`soft-delete username: ${(e as Error).message}`));
    await this.zitadel.markEmailVerified(userId, `deleted_${r2}@verisec.dev`).catch((e) => this.log.warn(`soft-delete email: ${(e as Error).message}`));
    await this.zitadel.deactivateOrg(orgId).catch((e) => this.log.warn(`soft-delete deactivate: ${(e as Error).message}`));
    await this.records.query(
      `INSERT INTO account_lifecycle (tenant, status, handle, actor, at) VALUES ($1, 'deleted', $2, $3, now())
       ON CONFLICT (tenant) DO UPDATE SET status = 'deleted', handle = $2, actor = $3, at = now()`,
      [orgId, handle, userId],
    );
    this.audit.record(orgId, loginName, 'account.deleted', 'the account was closed and the sign-in anonymised');
    this.log.warn(`org ${orgId} soft-deleted by ${userId}`);
    return { ok: true };
  }
}
