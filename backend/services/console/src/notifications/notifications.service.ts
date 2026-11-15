import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

import type { Capability } from '../auth/roles';

export type Tone = 'info' | 'success' | 'warning' | 'danger';

export type NotificationInput = {
  org: string;
  /** For one person only (their sign-ins, their role); otherwise the team, filtered by `audience`. */
  user?: string | null;
  /** What a member's role must allow to see it (Billing sees credits, not verifications). */
  audience?: Capability;
  kind: string;
  tone: Tone;
  title: string;
  body: string;
  href?: string;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notifications (
  id        bigserial PRIMARY KEY,
  org       text NOT NULL,
  user_id   text,
  audience  text,
  kind      text NOT NULL,
  tone      text NOT NULL,
  title     text NOT NULL,
  body      text NOT NULL,
  href      text,
  stack     text NOT NULL UNIQUE,
  count     integer NOT NULL DEFAULT 1,
  first_at  timestamptz NOT NULL DEFAULT now(),
  last_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_org_last ON notifications (org, last_at DESC);
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id bigint NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
  user_id         text NOT NULL,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
`;

// what one person may see: their own, and the team's that their role allows
const VISIBLE = `n.org = $1 AND (n.user_id = $2 OR (n.user_id IS NULL AND (n.audience IS NULL OR n.audience = ANY($3::text[]))))`;
const UNREAD = `NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = $2 AND r.read_at >= n.last_at)`;

/**
 * The bell: few, important notifications, stacked. The same sentence for the same people is ONE notification with a
 * count (the fourth "New sign-in from Chrome on Windows" raises its count to 4 and brings it back as unread); nothing
 * routine is sent (every sign-in, every approved verification). Read state is per person. Kept 60 days.
 * Notifying never fails the action that caused it.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Notifications');
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    // the KYC database, with the records store's own connection rules (TLS 1.3, verified certificate)
    const url = new URL(this.config.get<string>('KYC_DB_URL') ?? 'postgres://verisec_kyc@127.0.0.1:5433/verisec_kyc');
    const caPath = this.config.get<string>('KYC_DB_CA') ?? join(process.cwd(), '..', '..', 'infra', 'pki', 'dev_root.crt');
    try {
      this.pool = new Pool({
        host: url.hostname,
        port: Number(url.port || 5432),
        user: decodeURIComponent(url.username),
        password: this.config.get<string>('KYC_DB_PASSWORD') ?? '',
        database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'verisec_kyc',
        max: 3,
        ssl: { ca: readFileSync(caPath, 'utf8'), servername: 'localhost', rejectUnauthorized: true, minVersion: 'TLSv1.3' },
      });
      this.pool.on('error', (e) => this.log.error(`db: ${e.message}`));
      await this.pool.query(SCHEMA);
      this.log.log('notifications ready');
    } catch (e) {
      this.pool = null;
      this.log.error(`notifications unavailable: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  /** Records (or stacks onto) a notification. Fire and forget: never throws. */
  notify(n: NotificationInput): void {
    if (!this.pool || !n.org) return;
    const user = n.user ?? null;
    const audience = user ? null : (n.audience ?? null);
    const stack = createHash('sha256').update([n.org, user ?? '', audience ?? '', n.kind, n.title, n.body].join('\u0000')).digest('hex');
    void this.pool
      .query(
        `INSERT INTO notifications (org, user_id, audience, kind, tone, title, body, href, stack)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (stack) DO UPDATE SET count = notifications.count + 1, last_at = now(), tone = EXCLUDED.tone, href = EXCLUDED.href`,
        [n.org, user, audience, n.kind, n.tone, n.title.slice(0, 120), n.body.slice(0, 300), n.href ?? null, stack],
      )
      .then(() => {
        if (Math.random() < 0.01) void this.pool?.query(`DELETE FROM notifications WHERE last_at < now() - interval '60 days'`);
      })
      .catch((e: Error) => this.log.warn(`not recorded (${n.kind}): ${e.message}`));
  }

  async list(org: string, user: string, caps: Capability[], limit = 30) {
    if (!this.pool) return { unread: 0, items: [] };
    const args = [org, user, caps];
    const [rows, unread] = await Promise.all([
      this.pool.query<{ id: string; kind: string; tone: Tone; title: string; body: string; href: string | null; count: number; last_at: Date; unread: boolean }>(
        `SELECT n.id, n.kind, n.tone, n.title, n.body, n.href, n.count, n.last_at, ${UNREAD} AS unread
         FROM notifications n WHERE ${VISIBLE} ORDER BY n.last_at DESC LIMIT ${Math.min(100, Math.max(1, limit))}`,
        args,
      ),
      this.pool.query<{ n: string }>(`SELECT count(*) AS n FROM notifications n WHERE ${VISIBLE} AND ${UNREAD}`, args),
    ]);
    return {
      unread: Number(unread.rows[0]?.n ?? 0),
      items: rows.rows.map((r) => ({
        id: String(r.id),
        kind: r.kind,
        tone: r.tone,
        title: r.title,
        body: r.body,
        href: r.href,
        count: r.count,
        at: r.last_at.toISOString(),
        unread: r.unread,
      })),
    };
  }

  /** Marks one (`id`) or everything this person can see as read, up to now. */
  async read(org: string, user: string, caps: Capability[], id?: string) {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO notification_reads (notification_id, user_id, read_at)
       SELECT n.id, $2, now() FROM notifications n WHERE ${VISIBLE}${id ? ' AND n.id = $4' : ''}
       ON CONFLICT (notification_id, user_id) DO UPDATE SET read_at = now()`,
      id ? [org, user, caps, id] : [org, user, caps],
    );
  }
}
