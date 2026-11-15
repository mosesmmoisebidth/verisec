import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

/**
 * The public demo's usage counters and attempt log, in Postgres so the per-device limit survives a
 * restart and holds across more than one Console instance (an in-memory counter would reset and
 * could be beaten by a reconnect). It owns a small pool on the same KYC database as the records and
 * audit stores, so it can run without depending on those services.
 *
 * `demo_usage` counts, per day, how many times a subject (a Fingerprint device, or an IP address
 * when the device could not be verified) has run each demo API. `demo_attempts` records every run
 * we are asked to make, with the device, IP, network block and the device's risk signals, so an
 * abuser who hides behind VPNs or blocks the device agent can still be seen.
 */

export type Attempt = {
  api: string;
  visitorId: string | null;
  ip: string | null;
  ipBlock: string | null;
  vpn?: boolean;
  proxy?: boolean;
  tor?: boolean;
  incognito?: boolean;
  bot?: boolean;
  outcome: 'ok' | 'blocked_limit' | 'blocked_bot' | 'blocked_vpn' | 'blocked_device' | 'engine_error';
  ua: string | null;
};

@Injectable()
export class DemoStore implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Demo');
  private pool?: Pool;
  ready = false;

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
        CREATE TABLE IF NOT EXISTS demo_usage (
          subject text NOT NULL,
          api     text NOT NULL,
          day     date NOT NULL DEFAULT current_date,
          n       int  NOT NULL DEFAULT 0,
          PRIMARY KEY (subject, api, day)
        );
        CREATE TABLE IF NOT EXISTS demo_attempts (
          id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          at         timestamptz NOT NULL DEFAULT now(),
          api        text,
          visitor_id text,
          ip         text,
          ip_block   text,
          vpn        boolean,
          proxy      boolean,
          tor        boolean,
          incognito  boolean,
          bot        boolean,
          outcome    text,
          ua         text
        );
        CREATE INDEX IF NOT EXISTS demo_attempts_at ON demo_attempts (at DESC);
        CREATE INDEX IF NOT EXISTS demo_attempts_block ON demo_attempts (ip_block, at DESC);
      `);
      this.ready = true;
      this.log.log('demo usage store ready');
    } catch (e) {
      this.log.error(`demo usage store unavailable: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.pool?.end().catch(() => undefined);
  }

  /**
   * Record one use of `api` by `subject` for today, but only while the subject is still under
   * `limit`. Atomic: the row is inserted or its count raised in one statement, and a subject already
   * at the limit is not raised past it. Returns the new count and whether the use was allowed. Fails
   * closed: when the store cannot be reached (`failed`), no run is allowed, so an outage can never
   * hand out free runs that are not counted.
   */
  async take(subject: string, api: string, limit: number): Promise<{ allowed: boolean; count: number; failed?: boolean }> {
    if (!this.pool) return { allowed: false, count: 0, failed: true };
    try {
      const r = await this.pool.query<{ n: number }>(
        `INSERT INTO demo_usage (subject, api, day, n) VALUES ($1, $2, current_date, 1)
         ON CONFLICT (subject, api, day) DO UPDATE SET n = demo_usage.n + 1
           WHERE demo_usage.n < $3
         RETURNING n`,
        [subject, api, limit],
      );
      if (r.rows.length) return { allowed: true, count: r.rows[0].n };
      // nothing returned: the row is already at the limit
      const cur = await this.pool.query<{ n: number }>(
        `SELECT n FROM demo_usage WHERE subject = $1 AND api = $2 AND day = current_date`,
        [subject, api],
      );
      return { allowed: false, count: cur.rows[0]?.n ?? limit };
    } catch (e) {
      this.log.error(`take failed (demo refused): ${(e as Error).message}`);
      return { allowed: false, count: 0, failed: true };
    }
  }

  /** Give a use back (the engine failed on our side, not the visitor's). */
  async giveBack(subject: string, api: string): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `UPDATE demo_usage SET n = GREATEST(0, n - 1) WHERE subject = $1 AND api = $2 AND day = current_date`,
        [subject, api],
      );
    } catch {
      /* a failed refund is not worth surfacing */
    }
  }

  /** Today's counts for a subject across the given APIs: `{ [api]: n }` (missing = 0), or null when the store cannot be read. */
  async counts(subject: string, apis: string[]): Promise<Record<string, number> | null> {
    const out: Record<string, number> = {};
    if (!this.pool) return null;
    if (!apis.length) return out;
    try {
      const r = await this.pool.query<{ api: string; n: number }>(
        `SELECT api, n FROM demo_usage WHERE subject = $1 AND day = current_date AND api = ANY($2)`,
        [subject, apis],
      );
      for (const row of r.rows) out[row.api] = row.n;
      return out;
    } catch (e) {
      this.log.error(`counts failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** Fire-and-forget: an attempt log entry never blocks or breaks a run. */
  logAttempt(a: Attempt): void {
    if (!this.pool) return;
    this.pool
      .query(
        `INSERT INTO demo_attempts (api, visitor_id, ip, ip_block, vpn, proxy, tor, incognito, bot, outcome, ua)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [a.api, a.visitorId, a.ip, a.ipBlock, a.vpn ?? null, a.proxy ?? null, a.tor ?? null, a.incognito ?? null, a.bot ?? null, a.outcome, a.ua?.slice(0, 400) ?? null],
      )
      .catch(() => undefined);
  }
}
