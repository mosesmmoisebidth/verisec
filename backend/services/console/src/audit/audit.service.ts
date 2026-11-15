import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';
import { join } from 'node:path';
import { Pool } from 'pg';

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  detail: string | null;
  ip: string | null;
}

const DEFAULT_IDLE_TIMEOUT_HOURS = 24;

function normalizedIp(value: string): string {
  return value.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
}

/** Validate and match IPv4/IPv6 addresses and CIDR ranges without a third-party parser. */
export function validIpRange(value: string): boolean {
  const [address, rawPrefix, extra] = value.split('/');
  if (extra !== undefined) return false;
  const version = isIP(address ?? '');
  if (!version) return false;
  if (rawPrefix === undefined) return true;
  if (!/^\d{1,3}$/.test(rawPrefix)) return false;
  const prefix = Number(rawPrefix);
  return prefix >= 0 && prefix <= (version === 4 ? 32 : 128);
}

export function ipInRange(clientIp: string, range: string): boolean {
  const client = normalizedIp(clientIp);
  const [address, rawPrefix] = range.split('/');
  const version = isIP(address ?? '');
  if (!version || isIP(client) !== version) return false;
  try {
    const list = new BlockList();
    const family = version === 4 ? 'ipv4' : 'ipv6';
    if (rawPrefix === undefined) list.addAddress(address, family);
    else list.addSubnet(address, Number(rawPrefix), family);
    return list.check(client, family);
  } catch {
    return false;
  }
}

/**
 * A per-organisation security audit log: who did what, and when. It records the account- and
 * security-relevant actions across the console (sign-ins, settings and role changes, key events,
 * ownership transfer, deactivate/delete) so the Security tab can show them and export them.
 *
 * It owns a small Postgres pool on the same KYC database as the records store, rather than depending
 * on RecordsService, so it can be injected into any module (including auth) without a circular import.
 * Every write is fire-and-forget: an audit failure must never break the action being audited.
 */
@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Audit');
  private pool?: Pool;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = new URL(this.config.get<string>('KYC_DB_URL') ?? 'postgres://verisec_kyc@127.0.0.1:5433/verisec_kyc');
    const dbName = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'verisec_kyc';
    const caPath = this.config.get<string>('KYC_DB_CA') ?? join(process.cwd(), '..', '..', 'infra', 'pki', 'dev_root.crt');
    try {
      this.pool = new Pool({
        host: url.hostname,
        port: Number(url.port || 5432),
        user: decodeURIComponent(url.username),
        password: this.config.get<string>('KYC_DB_PASSWORD') ?? '',
        database: dbName,
        max: 4,
        ssl: { ca: readFileSync(caPath, 'utf8'), servername: 'localhost', rejectUnauthorized: true, minVersion: 'TLSv1.3' },
      });
      this.pool.on('error', (e) => this.log.error(`db: ${e.message}`));
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tenant  text NOT NULL,
          at      timestamptz NOT NULL DEFAULT now(),
          actor   text NOT NULL,
          action  text NOT NULL,
          detail  text,
          ip      text
        );
        CREATE INDEX IF NOT EXISTS audit_log_tenant_at ON audit_log (tenant, at DESC);
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
        CREATE TABLE IF NOT EXISTS org_session_activity (
          tenant       text NOT NULL,
          session_hash char(64) NOT NULL,
          last_seen    timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (tenant, session_hash)
        );
        CREATE INDEX IF NOT EXISTS org_session_activity_last_seen ON org_session_activity (last_seen);
      `);
      this.ready = true;
      this.log.log('security audit log ready');
    } catch (e) {
      this.log.error(`audit log unavailable: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  /** Enforce an organisation's IP allow-list and idle timeout on every protected request. */
  async checkSessionAccess(
    tenant: string,
    sessionId: string,
    clientIp: string,
  ): Promise<'allowed' | 'ip_denied' | 'idle_expired'> {
    if (!this.pool || !this.ready) throw new Error('security policy store unavailable');
    const rows = await this.pool.query<{ session_timeout_hours: number | null; session_timeout_configured: boolean; ip_allowlist: unknown }>(
      'SELECT session_timeout_hours, session_timeout_configured, ip_allowlist FROM org_security WHERE tenant = $1',
      [tenant],
    );
    const settings = rows.rows[0];
    const allowed = Array.isArray(settings?.ip_allowlist)
      ? (settings.ip_allowlist as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    if (allowed.length && !allowed.some((range) => ipInRange(clientIp, range))) return 'ip_denied';

    const sessionHash = createHash('sha256').update(sessionId).digest('hex');
    const activity = await this.pool.query<{ last_seen: Date }>(
      'SELECT last_seen FROM org_session_activity WHERE tenant = $1 AND session_hash = $2',
      [tenant, sessionHash],
    );
    const lastSeen = activity.rows[0]?.last_seen;
    const timeoutHours = settings
      ? settings.session_timeout_hours ?? (settings.session_timeout_configured ? null : DEFAULT_IDLE_TIMEOUT_HOURS)
      : DEFAULT_IDLE_TIMEOUT_HOURS;
    if (timeoutHours != null && lastSeen && Date.now() - lastSeen.getTime() > timeoutHours * 60 * 60_000) {
      await this.pool.query('DELETE FROM org_session_activity WHERE tenant = $1 AND session_hash = $2', [tenant, sessionHash]);
      return 'idle_expired';
    }
    await this.pool.query(
      `INSERT INTO org_session_activity (tenant, session_hash, last_seen) VALUES ($1, $2, now())
       ON CONFLICT (tenant, session_hash) DO UPDATE SET last_seen = now()`,
      [tenant, sessionHash],
    );
    return 'allowed';
  }

  async securitySettings(tenant: string): Promise<{
    sessionTimeoutHours: number | null;
    ipAllowlist: string[];
    ssoIdpId: string | null;
    ssoName: string | null;
  }> {
    if (!this.pool || !this.ready) throw new Error('security policy store unavailable');
    const r = await this.pool.query<{
      session_timeout_hours: number | null;
      ip_allowlist: unknown;
      sso_idp_id: string | null;
      sso_name: string | null;
    }>('SELECT session_timeout_hours, ip_allowlist, sso_idp_id, sso_name FROM org_security WHERE tenant = $1', [tenant]);
    const row = r.rows[0];
    return {
      sessionTimeoutHours: row?.session_timeout_hours ?? null,
      ipAllowlist: Array.isArray(row?.ip_allowlist)
        ? (row.ip_allowlist as unknown[]).filter((v): v is string => typeof v === 'string')
        : [],
      ssoIdpId: row?.sso_idp_id ?? null,
      ssoName: row?.sso_name ?? null,
    };
  }

  async setSso(tenant: string, idpId: string | null, name: string | null): Promise<void> {
    if (!this.pool || !this.ready) throw new Error('security policy store unavailable');
    await this.pool.query(
      `INSERT INTO org_security (tenant, sso_idp_id, sso_name, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (tenant) DO UPDATE SET sso_idp_id = $2, sso_name = $3, updated_at = now()`,
      [tenant, idpId, name],
    );
  }

  /** Record one action. Never throws — a failed audit write is logged, not propagated. */
  record(tenant: string | undefined, actor: string, action: string, detail?: string, ip?: string): void {
    if (!this.pool || !this.ready || !tenant) return;
    void this.pool
      .query('INSERT INTO audit_log (tenant, actor, action, detail, ip) VALUES ($1, $2, $3, $4, $5)', [
        tenant,
        (actor || 'unknown').slice(0, 200),
        action.slice(0, 120),
        detail ? detail.slice(0, 500) : null,
        ip ? ip.slice(0, 64) : null,
      ])
      .catch((e) => this.log.warn(`audit write failed: ${(e as Error).message}`));
  }

  /** The most recent entries for an organisation (newest first). */
  async list(tenant: string, limit = 100): Promise<AuditEntry[]> {
    if (!tenant) return [];
    if (!this.pool || !this.ready) throw new Error('audit log unavailable');
    const r = await this.pool
      .query<{ at: Date; actor: string; action: string; detail: string | null; ip: string | null }>(
        'SELECT at, actor, action, detail, ip FROM audit_log WHERE tenant = $1 ORDER BY at DESC LIMIT $2',
        [tenant, Math.min(Math.max(limit, 1), 5000)],
      );
    return r.rows.map((x) => ({ at: x.at.toISOString(), actor: x.actor, action: x.action, detail: x.detail, ip: x.ip }));
  }
}
