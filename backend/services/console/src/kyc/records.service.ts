import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client as Minio } from 'minio';
import { Pool } from 'pg';

import { IntelClient } from './intel.client';
import { VaultService } from './vault.service';

/** What a verification record holds, section by section (each section encrypted on its own). */
export type RecordSections = {
  identity?: Record<string, unknown>;
  document?: Record<string, unknown>;
  face?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  screening?: Record<string, unknown>;
  address?: Record<string, unknown>;
  device?: Record<string, unknown>;
  /** Where the applicant's copy of their result is emailed (kept encrypted with the record, gone on redaction). */
  delivery?: Record<string, unknown>;
  timeline?: TimelineEvent[];
};

/**
 * One try at a step, kept on the timeline so every try shows, not only the last: a document upload (accepted, or
 * refused as not the expected document), a liveness check, a face match. `fileId` is the try's own image.
 */
export type Attempt = {
  kind: 'document' | 'liveness' | 'face-match';
  /** `retake`: the right kind of document, but the photo did not pass (glare, not sharp); `not-accepted`: the check
   *  stopped it for another reason (details that do not agree, a document that could not be checked). */
  outcome: 'accepted' | 'refused' | 'retake' | 'not-accepted' | 'passed' | 'failed' | 'error' | 'cancelled';
  /** Document: what the workflow accepts, and what the reader saw on the image (null: not recognised). */
  expected?: string[];
  seen?: string | null;
  seenName?: string | null;
  country?: string | null;
  fileId?: string | null;
  /** A document's back image, when the upload had one. */
  backFileId?: string | null;
  /** Face match: the similarity reached and the one needed (0..1). */
  similarity?: number;
  threshold?: number;
  reason?: string | null;
  mode?: string | null;
  /** Document: the details the printed side and the barcode / MRZ agreed on, and how many were compared. */
  matched?: string[];
  compared?: number;
};
/** `tone`: how it went (pass, fail, review, info). `stage`: the progress stage it belongs to. */
export type TimelineEvent = { at: string; type: string; label: string; tone?: 'pass' | 'fail' | 'review' | 'info'; stage?: string; attempt?: Attempt };
export type SectionName = keyof RecordSections;

/** Plain (non-personal) columns, used for listing and filtering. */
export type RecordMeta = {
  id: string;
  reference: string;
  tenant: string;
  status: 'in_progress' | 'completed' | 'redacted' | 'disabled';
  verdict: string | null;
  score: number | null;
  document_type: string | null;
  country: string | null;
  steps: Record<string, string>;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  redacted_at: Date | null;
  /** The workflow version this verification runs (null: created before workflows, runs every check). */
  workflow_id?: string | null;
  workflow_version?: number | null;
};

export type FileSlot = 'document_front' | 'document_back' | 'selfie' | 'portrait' | 'address_document' | 'document_refused' | 'document_refused_back';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kyc_sessions (
  id            text PRIMARY KEY,
  reference     text UNIQUE NOT NULL,
  tenant        text NOT NULL,
  status        text NOT NULL DEFAULT 'in_progress',
  verdict       text,
  score         integer,
  document_type text,
  country       text,
  steps         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- envelope encryption: this record's own AES-256 key, WRAPPED by OpenBao (verisec-db).
  -- NULL after redaction = crypto-shredded: every encrypted field below becomes unreadable.
  wrapped_key   text,
  -- each section encrypted separately: AES-256-GCM, AAD = "<id>|<section>"
  sections      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- blind index of the applicant's name (keyed hash computed inside OpenBao) for search
  name_index    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  redacted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS kyc_sessions_created ON kyc_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS kyc_sessions_name ON kyc_sessions (name_index);
CREATE TABLE IF NOT EXISTS kyc_files (
  id          bigserial PRIMARY KEY,
  session_id  text NOT NULL REFERENCES kyc_sessions(id) ON DELETE CASCADE,
  slot        text NOT NULL,
  object_key  text NOT NULL,
  mime        text,
  bytes       integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_files_session ON kyc_files (session_id);
-- the AML Explorer's custom search tags, shared by the team (not personal data: words operators search by)
CREATE TABLE IF NOT EXISTS explorer_tags (
  id          bigserial PRIMARY KEY,
  tenant      text NOT NULL,
  label       text NOT NULL,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS explorer_tags_label ON explorer_tags (tenant, lower(label));
-- who looked at what (append-only)
CREATE TABLE IF NOT EXISTS kyc_access_log (
  id          bigserial PRIMARY KEY,
  session_id  text NOT NULL,
  actor       text NOT NULL,
  action      text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_access_session ON kyc_access_log (session_id, at DESC);
-- blind indexes (keyed hashes from OpenBao) of the applicant's browser key and fingerprint,
-- so the same device can be recognised across applicants without storing the identifiers
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS device_index text;
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS fp_index text;
CREATE INDEX IF NOT EXISTS kyc_sessions_device ON kyc_sessions (device_index);
CREATE INDEX IF NOT EXISTS kyc_sessions_fp ON kyc_sessions (fp_index);
-- the applicant's link and the one device it is bound to, so a verification can be resumed:
-- link_hash is SHA-256 of the link secret (never the secret), bound_key a blind index (OpenBao)
-- of the device key that first opened it, resume_until the end of the resume window
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS link_hash text;
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS link_expires_at timestamptz;
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS bound_key text;
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS resume_until timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS kyc_sessions_link ON kyc_sessions (link_hash);
-- the link's second factor: a keyed hash of the 6-digit access code the operator gives the applicant separately
-- (never the code), the wrong tries so far, and when the organisation disabled the verification
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS access_hash text;
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS access_tries integer NOT NULL DEFAULT 0;
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
-- where the access code was sent, masked (a•••@example.com): what the applicant's code screen says
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS access_hint text;
-- the dashboard: how long each API call took (route, status, time; nothing personal), per organisation
CREATE TABLE IF NOT EXISTS api_calls (
  id      bigserial PRIMARY KEY,
  tenant  text,
  method  text NOT NULL,
  route   text NOT NULL,
  status  integer NOT NULL,
  ms      integer NOT NULL,
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_calls_tenant_at ON api_calls (tenant, at DESC);
CREATE INDEX IF NOT EXISTS api_calls_at ON api_calls (at DESC);
-- the workflow the verification runs (per-workflow latency on the dashboard); none for older rows
ALTER TABLE api_calls ADD COLUMN IF NOT EXISTS workflow_id text;
-- the dashboard: the platform's health, checked every minute (uptime and incidents)
CREATE TABLE IF NOT EXISTS platform_probes (
  at    timestamptz NOT NULL DEFAULT now(),
  ok    boolean NOT NULL,
  ms    integer NOT NULL,
  down  text
);
CREATE INDEX IF NOT EXISTS platform_probes_at ON platform_probes (at DESC);
-- verification workflows: an organisation's drafts, and the numbered versions published from
-- them (a version never changes; every session is pinned to the version it was created with)
CREATE TABLE IF NOT EXISTS workflows (
  id          text PRIMARY KEY,
  tenant      text NOT NULL,
  name        text NOT NULL,
  template    text,
  status      text NOT NULL DEFAULT 'draft',
  version     integer,
  draft       jsonb NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflows_tenant ON workflows (tenant, updated_at DESC);
CREATE TABLE IF NOT EXISTS workflow_versions (
  workflow_id   text NOT NULL REFERENCES workflows(id),
  version       integer NOT NULL,
  definition    jsonb NOT NULL,
  published_by  text,
  published_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workflow_id, version)
);
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS workflow_id text;
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS workflow_version integer;
-- Test or Live. VeriSec has not opened Live yet, so every verification (old and new) is a test one.
ALTER TABLE kyc_sessions ADD COLUMN IF NOT EXISTS env text NOT NULL DEFAULT 'test';
-- An organisation's workflows are the ones it made or ran. Every organisation used to be given a
-- Standard KYC on its first visit; those copies are removed where no verification ever ran on them
-- and nobody changed them (the same check every start; nothing creates such a copy any more).
WITH seeded AS (
  SELECT w.id FROM workflows w
  JOIN workflow_versions v ON v.workflow_id = w.id AND v.version = 1
  WHERE w.created_by = 'system' AND w.template = 'standard-kyc' AND w.name = 'Standard KYC'
    AND w.status = 'active' AND w.version = 1 AND w.draft = v.definition
    AND NOT EXISTS (SELECT 1 FROM kyc_sessions s WHERE s.workflow_id = w.id)
), versions_gone AS (
  DELETE FROM workflow_versions WHERE workflow_id IN (SELECT id FROM seeded)
)
DELETE FROM workflows WHERE id IN (SELECT id FROM seeded);
-- credits (millionths; 1 credit = $1 of list price): one account per organisation (balance, and the part held
-- for open verifications), an append-only ledger of every movement, holds per verification, itemised usage
CREATE TABLE IF NOT EXISTS credit_accounts (
  org         text PRIMARY KEY,
  balance     bigint NOT NULL CHECK (balance >= 0),
  held        bigint NOT NULL DEFAULT 0 CHECK (held >= 0 AND held <= balance),
  budget      bigint CHECK (budget IS NULL OR budget >= 0),
  hard_stop   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id       bigserial PRIMARY KEY,
  org      text NOT NULL,
  at       timestamptz NOT NULL DEFAULT now(),
  kind     text NOT NULL,
  amount   bigint NOT NULL,
  hold     bigint NOT NULL DEFAULT 0,
  balance  bigint NOT NULL,
  held     bigint NOT NULL,
  ref      text,
  key_id   text,
  actor    text,
  note     text
);
CREATE INDEX IF NOT EXISTS credit_ledger_org ON credit_ledger (org, id DESC);
CREATE OR REPLACE FUNCTION credit_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'the credit ledger is append-only'; END $$;
DROP TRIGGER IF EXISTS credit_ledger_append_only ON credit_ledger;
CREATE TRIGGER credit_ledger_append_only BEFORE UPDATE OR DELETE ON credit_ledger FOR EACH ROW EXECUTE FUNCTION credit_ledger_append_only();
CREATE TABLE IF NOT EXISTS credit_holds (
  session_id  text PRIMARY KEY,
  org         text NOT NULL,
  amount      bigint NOT NULL CHECK (amount >= 0),
  ref         text,
  status      text NOT NULL DEFAULT 'open',
  charged     bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS credit_holds_open ON credit_holds (status, created_at) WHERE status = 'open';
CREATE TABLE IF NOT EXISTS credit_usage (
  id       bigserial PRIMARY KEY,
  org      text NOT NULL,
  at       timestamptz NOT NULL DEFAULT now(),
  product  text NOT NULL,
  item     text NOT NULL,
  label    text NOT NULL,
  amount   bigint NOT NULL,
  ref      text,
  key_id   text
);
CREATE INDEX IF NOT EXISTS credit_usage_org ON credit_usage (org, at DESC);
ALTER TABLE credit_ledger ADD COLUMN IF NOT EXISTS product text;
CREATE INDEX IF NOT EXISTS credit_usage_ref ON credit_usage (ref);
CREATE INDEX IF NOT EXISTS credit_usage_key ON credit_usage (key_id) WHERE key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS credit_ledger_ref ON credit_ledger (ref) WHERE kind = 'refund';

-- Per-organisation settings. retention_seconds: records older than this are crypto-shredded by the sweep.
-- apply_at: the sweep does nothing before this time, so a shorter window can give existing records a grace period.
CREATE TABLE IF NOT EXISTS org_settings (
  tenant            text PRIMARY KEY,
  retention_seconds bigint,
  apply_at          timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS apply_at timestamptz;

-- Payments (Polar, merchant of record). polar_events de-duplicates webhook deliveries: the webhook-id is stable
-- across retries, so the same delivery is acted on exactly once. verification_entitlements is a bought monthly
-- plan: a quota of full verification flows per billing period, spent before credits and reset each period (no
-- rollover). Credit top-ups are not here: they are ordinary 'top_up' rows in credit_ledger.
CREATE TABLE IF NOT EXISTS polar_events (
  id    text PRIMARY KEY,
  type  text,
  at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS verification_entitlements (
  org             text PRIMARY KEY,
  plan            text,
  subscription_id text,
  quota           integer NOT NULL DEFAULT 0 CHECK (quota >= 0),
  used            integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  period_start    timestamptz,
  period_end      timestamptz,
  status          text NOT NULL DEFAULT 'active',
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_entitlements_sub ON verification_entitlements (subscription_id);
`;

/** A query inside `RecordsService.tx` (same connection, same transaction). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TxQuery = <T = any>(text: string, args?: unknown[]) => Promise<T[]>;

/** How a session is opened and resumed (plain columns only, nothing personal). */
export type SessionBinding = {
  id: string;
  tenant: string;
  status: RecordMeta['status'];
  linkExpiresAt: number | null;
  boundKey: string | null;
  resumeUntil: number | null;
  /** Keyed hash of the link's access code (null: the link has none). */
  accessHash?: string | null;
  accessTries?: number;
  accessHint?: string | null;
};

/**
 * Verification records: Postgres for the record, local MinIO for the files.
 *
 * - Personal data never reaches Postgres in clear. Every record has its own AES-256 key
 *   (issued and wrapped by OpenBao); each section is encrypted with it (AES-256-GCM, bound to
 *   the record id and section name so ciphertext cannot be moved between records or fields).
 * - Only non-personal facts are plain columns (status, verdict, score, document type,
 *   country, timestamps). Names are searchable through a blind index, never stored in clear.
 * - Files are the browser-encrypted JWE exactly as uploaded (only the processing host can
 *   open them), kept in a private MinIO bucket that encrypts every object again (SSE) and
 *   expires them after 90 days.
 * - Redaction destroys the record's wrapped key (crypto-shredding) and deletes its files.
 * - Nothing is ever written unencrypted: if OpenBao is unavailable the write is skipped.
 */
@Injectable()
export class RecordsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Records');
  private pool: Pool | null = null;
  private readonly minio: Minio;
  private readonly bucket: string;
  private readonly keys = new Map<string, { key: Buffer; exp: number }>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private retentionTimer?: NodeJS.Timeout;
  ready = false;

  constructor(
    private readonly config: ConfigService,
    private readonly vault: VaultService,
    private readonly intel: IntelClient,
  ) {
    this.bucket = config.get<string>('KYC_MINIO_BUCKET') ?? 'kyc-documents';
    this.minio = new Minio({
      endPoint: config.get<string>('KYC_MINIO_ENDPOINT') ?? '127.0.0.1',
      port: Number(config.get<string>('KYC_MINIO_PORT') ?? 9000),
      useSSL: false, // loopback only (published on 127.0.0.1); objects are JWE + SSE anyway
      accessKey: config.get<string>('KYC_MINIO_ACCESS_KEY') ?? '',
      secretKey: config.get<string>('KYC_MINIO_SECRET_KEY') ?? '',
    });
  }

  /* ------------------------------------------------------------------ setup -- */

  async onModuleInit() {
    // The dedicated KYC database (infra/docker-compose.yml "kycdb"): TLS 1.3 only, SCRAM passwords.
    // Its certificate is verified against the dev CA; in production point KYC_DB_CA at the
    // database's CA. A plain or unverified connection is never used.
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
        max: 10,
        ssl: { ca: readFileSync(caPath, 'utf8'), servername: 'localhost', rejectUnauthorized: true, minVersion: 'TLSv1.3' },
      });
      this.pool.on('error', (e) => this.log.error(`db: ${e.message}`));
      await this.pool.query(SCHEMA);
      this.ready = true;
      this.log.log(`verification records: Postgres "${dbName}" (encrypted per record), files: MinIO "${this.bucket}"`);
      // Retention sweep: records past their organisation's keep-window are crypto-shredded.
      this.retentionTimer = setInterval(() => void this.sweepRetention().catch(() => undefined), 30_000);
      this.retentionTimer.unref();
      setTimeout(() => void this.sweepRetention().catch(() => undefined), 10_000).unref();
    } catch (e) {
      this.log.error(`records store unavailable: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    await this.pool?.end();
  }

  /* ----------------------------------------------------------- retention -- */

  /** The organisation's keep-window in seconds, or null when records are kept indefinitely. */
  async getRetention(tenant: string): Promise<number | null> {
    if (!this.pool || !tenant) return null;
    const r = await this.pool.query<{ retention_seconds: string | null }>(
      'SELECT retention_seconds FROM org_settings WHERE tenant = $1',
      [tenant],
    );
    const v = r.rows[0]?.retention_seconds;
    return v == null ? null : Number(v);
  }

  /** How many kept (not yet redacted) records are already older than a proposed window. */
  async retentionImpact(tenant: string, seconds: number): Promise<number> {
    if (!this.pool || !tenant || !(seconds > 0)) return 0;
    const r = await this.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM kyc_sessions
         WHERE tenant = $1 AND redacted_at IS NULL AND created_at < now() - ($2 || ' seconds')::interval`,
      [tenant, String(seconds)],
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  /**
   * Set the keep-window (null = keep indefinitely). `applyToExisting` false gives records that are already
   * older than the window a grace period of one window before the sweep touches them (apply_at = now + window);
   * true removes them on the sweep's next run (apply_at = now).
   */
  async setRetention(tenant: string, seconds: number | null, applyToExisting = true): Promise<void> {
    if (!this.pool || !tenant) return;
    // A grace window (keep existing records until it passes) applies only when shortening
    // without applying to existing. The interval uses its OWN text parameter ($3): reusing
    // $2 for both the integer `retention_seconds` column and `$2 || ' seconds'` makes Postgres
    // deduce inconsistent types for the parameter, and the whole save fails.
    const grace = seconds != null && !applyToExisting;
    const applyExpr = grace ? `now() + ($3 || ' seconds')::interval` : 'now()';
    await this.pool.query(
      `INSERT INTO org_settings (tenant, retention_seconds, apply_at, updated_at) VALUES ($1, $2, ${applyExpr}, now())
       ON CONFLICT (tenant) DO UPDATE SET retention_seconds = EXCLUDED.retention_seconds, apply_at = ${applyExpr}, updated_at = now()`,
      grace ? [tenant, seconds, String(seconds)] : [tenant, seconds],
    );
  }

  /** Crypto-shred every record older than its organisation's keep-window, once any grace period has passed. */
  async sweepRetention(): Promise<void> {
    if (!this.pool || !this.ready) return;
    const orgs = await this.pool
      .query<{ tenant: string; retention_seconds: string }>(
        'SELECT tenant, retention_seconds FROM org_settings WHERE retention_seconds IS NOT NULL AND retention_seconds > 0 AND (apply_at IS NULL OR apply_at <= now())',
      )
      .catch(() => ({ rows: [] as { tenant: string; retention_seconds: string }[] }));
    for (const o of orgs.rows) {
      const due = await this.pool
        .query<{ id: string }>(
          `SELECT id FROM kyc_sessions
             WHERE tenant = $1 AND redacted_at IS NULL AND created_at < now() - ($2 || ' seconds')::interval
             ORDER BY created_at LIMIT 200`,
          [o.tenant, String(Number(o.retention_seconds))],
        )
        .catch(() => ({ rows: [] as { id: string }[] }));
      for (const row of due.rows) {
        await this.redact(row.id).catch((e) =>
          this.log.warn(`retention redact ${row.id} failed: ${(e as Error).message}`),
        );
      }
      if (due.rows.length)
        this.log.log(`retention: shredded ${due.rows.length} record(s) for ${o.tenant} (keep ${o.retention_seconds}s)`);
    }
  }

  /* ------------------------------------------------------- explorer custom tags -- */

  /** The team's custom tags, newest first. */
  async listTags(tenant: string): Promise<{ id: string; label: string; created_by: string; created_at: Date }[]> {
    this.requireReady();
    const r = await this.pool!.query('SELECT id::text AS id, label, created_by, created_at FROM explorer_tags WHERE tenant = $1 ORDER BY created_at DESC LIMIT 500', [tenant]);
    return r.rows;
  }

  /** Adds a custom tag; the same words (whatever their case) are kept once. */
  async addTag(tenant: string, label: string, by: string): Promise<{ id: string; label: string }> {
    this.requireReady();
    const r = await this.pool!.query(
      `INSERT INTO explorer_tags (tenant, label, created_by) VALUES ($1, $2, $3)
       ON CONFLICT (tenant, lower(label)) DO UPDATE SET label = explorer_tags.label RETURNING id::text AS id, label`,
      [tenant, label, by],
    );
    return r.rows[0];
  }

  async removeTag(tenant: string, id: string): Promise<boolean> {
    this.requireReady();
    const r = await this.pool!.query('DELETE FROM explorer_tags WHERE tenant = $1 AND id = $2', [tenant, id]);
    return (r.rowCount ?? 0) > 0;
  }

  private requireReady() {
    if (!this.ready) throw new HttpException('The tag store is not available right now.', HttpStatus.SERVICE_UNAVAILABLE);
  }

  /* ----------------------------------------------------------- transactions -- */

  /**
   * Runs `fn` in one transaction on one connection (BEGIN ... COMMIT, ROLLBACK on any error). Unlike `query`,
   * a store that is down is an error here: money must never be treated as zero because the database is away.
   */
  async tx<T>(fn: (q: TxQuery) => Promise<T>): Promise<T> {
    if (!this.pool)
      throw new HttpException('Billing is not available right now. Try again shortly.', HttpStatus.SERVICE_UNAVAILABLE);
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(async (text, args = []) => (await c.query(text, args)).rows);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  /* -------------------------------------------------------------- dashboard -- */

  /** A plain-column query for the dashboard and its metrics (no rows when the store is down). */
  async query<T = Record<string, unknown>>(text: string, args: unknown[] = []): Promise<T[]> {
    if (!this.pool) return [];
    return (await this.pool.query(text, args)).rows as T[];
  }

  /**
   * The verifications created since `since`, newest first, each decrypted in memory for the
   * dashboard's figures (only counts leave). A few at a time so the key vault is not flooded;
   * record keys stay cached for ten minutes.
   */
  async since(since: Date, org: string | undefined, limit = 2000): Promise<{ meta: RecordMeta; data: RecordSections }[]> {
    if (!this.pool) return [];
    const args: unknown[] = [since];
    let where = 'created_at >= $1';
    if (org !== undefined) {
      args.push(org);
      where += ` AND tenant = $${args.length}`;
    }
    args.push(limit);
    const rows = (
      await this.pool.query(
        `SELECT id, reference, tenant, status, verdict, score, document_type, country, steps, wrapped_key, sections, created_at, updated_at, completed_at, redacted_at,
                workflow_id, workflow_version
         FROM kyc_sessions WHERE ${where} ORDER BY created_at DESC LIMIT $${args.length}`,
        args,
      )
    ).rows as (RecordMeta & { wrapped_key: string | null; sections: Record<string, string> | null })[];
    const out: { meta: RecordMeta; data: RecordSections }[] = new Array(rows.length);
    let next = 0;
    const worker = async () => {
      while (next < rows.length) {
        const i = next++;
        const r = rows[i];
        const data: RecordSections = {};
        const key = r.wrapped_key ? await this.keyFor(r.id, r.wrapped_key).catch(() => null) : null;
        if (key) {
          for (const [name, blob] of Object.entries(r.sections ?? {})) {
            try {
              (data as Record<string, unknown>)[name] = this.open(key, r.id, name, blob);
            } catch {
              // a section that does not open is left out of the figures
            }
          }
        }
        const { wrapped_key: _w, sections: _s, ...meta } = r;
        out[i] = { meta: meta as RecordMeta, data };
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, rows.length) }, worker));
    return out;
  }

  /** `otherPeopleOnDevice` for many records in one query (the dashboard's device figures). */
  async otherPeopleMany(ids: string[]): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    if (!ids.length || !this.pool) return m;
    try {
      const r = await this.pool.query(
        `SELECT s.id, count(DISTINCT o.name_index) AS n
           FROM kyc_sessions s JOIN kyc_sessions o
             ON o.id <> s.id AND o.redacted_at IS NULL
            AND ((s.device_index IS NOT NULL AND o.device_index = s.device_index) OR (s.fp_index IS NOT NULL AND o.fp_index = s.fp_index))
          WHERE s.id = ANY($1) AND s.name_index IS NOT NULL AND o.name_index IS NOT NULL AND o.name_index <> s.name_index
          GROUP BY s.id`,
        [ids],
      );
      for (const row of r.rows) m.set(row.id, Number(row.n));
    } catch (e) {
      this.log.error(`device people: ${(e as Error).message}`);
    }
    return m;
  }

  /* ------------------------------------------------------------- encryption -- */

  private async keyFor(id: string, wrapped: string | null): Promise<Buffer | null> {
    const hit = this.keys.get(id);
    if (hit && hit.exp > Date.now()) return hit.key;
    if (!wrapped) return null;
    const key = await this.vault.unwrap(wrapped);
    if (key) this.keys.set(id, { key, exp: Date.now() + 10 * 60_000 });
    return key;
  }

  private seal(key: Buffer, id: string, section: string, value: unknown): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(`${id}|${section}`));
    const ct = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
  }

  private open(key: Buffer, id: string, section: string, blob: string): unknown {
    const b = Buffer.from(blob, 'base64');
    const d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    d.setAAD(Buffer.from(`${id}|${section}`));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  }

  /** Serialise writes per record (read-modify-write of encrypted sections). */
  private exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(id, next);
    void next.finally(() => {
      if (this.locks.get(id) === next) this.locks.delete(id);
    });
    return next;
  }

  /* ---------------------------------------------------------------- writing -- */

  /** Records a new session; returns the reference it is filed under. */
  async start(
    id: string,
    reference: string,
    tenant: string,
    link?: { hash: string; expiresAt: number; access?: string; hint?: string },
    workflow?: { id: string; version: number },
  ): Promise<string> {
    if (!this.pool) return reference;
    const dk = await this.vault.dataKey();
    if (!dk) {
      this.log.error('no data key (OpenBao unavailable): session not recorded');
      return reference;
    }
    this.keys.set(id, { key: dk.key, exp: Date.now() + 10 * 60_000 });
    const timeline = [{ at: new Date().toISOString(), type: 'created', label: 'Session created' }];
    // A reference is unique across the platform. When the one asked for is already taken (by this
    // organisation or any other), a short suffix keeps it the operator's own without revealing
    // whose it was; the caller shows the reference actually stored.
    let ref = reference;
    for (let attempt = 0; ; attempt++) {
      try {
        await this.pool.query(
          `INSERT INTO kyc_sessions (id, reference, tenant, wrapped_key, sections, link_hash, link_expires_at, workflow_id, workflow_version, access_hash, access_hint)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
          [
            id,
            ref,
            tenant,
            dk.wrapped,
            { timeline: this.seal(dk.key, id, 'timeline', timeline) },
            link?.hash ?? null,
            link ? new Date(link.expiresAt) : null,
            workflow?.id ?? null,
            workflow?.version ?? null,
            link?.access ?? null,
            link?.hint ?? null,
          ],
        );
        return ref;
      } catch (e) {
        if ((e as { constraint?: string }).constraint !== 'kyc_sessions_reference_key' || attempt >= 4) throw e;
        ref = `${reference}-${randomBytes(2).toString('hex').toUpperCase()}`;
      }
    }
  }

  /* ------------------------------------------------------- opening and resuming -- */

  /** A session found by its id or by the hash of its link secret (null if unknown). */
  async binding(by: { id?: string; linkHash?: string }): Promise<SessionBinding | null> {
    if (!this.pool || (!by.id && !by.linkHash)) return null;
    try {
      const r = (
        await this.pool.query(
          `SELECT id, tenant, status, link_expires_at, bound_key, resume_until, access_hash, access_tries, access_hint FROM kyc_sessions WHERE ${by.id ? 'id' : 'link_hash'} = $1`,
          [by.id ?? by.linkHash],
        )
      ).rows[0];
      if (!r) return null;
      const t = (d: Date | null) => (d ? new Date(d).getTime() : null);
      return {
        id: r.id,
        tenant: r.tenant,
        status: r.status,
        linkExpiresAt: t(r.link_expires_at),
        boundKey: r.bound_key,
        resumeUntil: t(r.resume_until),
        accessHash: r.access_hash ?? null,
        accessTries: Number(r.access_tries ?? 0),
        accessHint: r.access_hint ?? null,
      };
    } catch (e) {
      this.log.error(`session lookup: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Bind a session to the device that opened it first. Atomic: of two devices opening the same
   * link at once only one wins. Returns false when another device holds it already.
   */
  async bindDevice(id: string, boundKey: string, resumeUntil: number): Promise<boolean> {
    if (!this.pool) return true;
    const r = await this.pool.query(
      `UPDATE kyc_sessions SET bound_key = $2, resume_until = $3 WHERE id = $1 AND (bound_key IS NULL OR bound_key = $2)`,
      [id, boundKey, new Date(resumeUntil)],
    );
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * A new link for an unfinished verification (the team continues it, or sends it on): the new link's hash, a fresh
   * access code and an empty device binding replace the old ones in one statement, so the earlier link and the device
   * that held it stop working at once. Returns the earlier link's hash (to drop it from memory), or false when the
   * verification is no longer in progress.
   */
  async relink(id: string, link: { hash: string; expiresAt: number; access: string; hint: string }): Promise<{ oldHash: string | null } | false> {
    if (!this.pool) return false;
    const r = await this.pool.query(
      `WITH old AS (SELECT id, link_hash FROM kyc_sessions WHERE id = $1 FOR UPDATE)
       UPDATE kyc_sessions s SET link_hash = $2, link_expires_at = $3, access_hash = $4, access_hint = $5, access_tries = 0,
              bound_key = NULL, resume_until = NULL, updated_at = now()
         FROM old WHERE s.id = old.id AND s.status = 'in_progress'
       RETURNING old.link_hash AS old_hash`,
      [id, link.hash, new Date(link.expiresAt), link.access, link.hint],
    );
    return r.rowCount ? { oldHash: (r.rows[0]?.old_hash as string | null) ?? null } : false;
  }

  /**
   * The latest try of a kind turned out differently after it was recorded (a document the read accepted, which the
   * document check then stopped for glare or blur): its outcome, reason, tone and words change in place, so the
   * timeline keeps one entry per upload. Returns that try (its image ids), or null when there is none.
   */
  async amendLastTry(
    id: string | undefined,
    kind: Attempt['kind'],
    attempt: Partial<Attempt>,
    event: Partial<Pick<TimelineEvent, 'tone' | 'label'>> = {},
  ): Promise<Attempt | null> {
    if (!id || !this.pool) return null;
    let found: Attempt | null = null;
    await this.exclusive(id, async () => {
      const row = (await this.pool!.query('SELECT wrapped_key, sections FROM kyc_sessions WHERE id = $1', [id])).rows[0];
      if (!row?.wrapped_key || !row.sections?.timeline) return;
      const key = await this.keyFor(id, row.wrapped_key);
      if (!key) return this.log.error(`cannot unwrap key for ${id}: try not updated`);
      const tl = this.open(key, id, 'timeline', row.sections.timeline) as TimelineEvent[];
      const i = tl.map((e) => e.attempt?.kind).lastIndexOf(kind);
      if (i < 0) return;
      tl[i] = { ...tl[i]!, ...event, attempt: { ...tl[i]!.attempt!, ...attempt } };
      found = tl[i]!.attempt!;
      const sections = { ...row.sections, timeline: this.seal(key, id, 'timeline', tl) };
      await this.pool!.query('UPDATE kyc_sessions SET sections = $2, updated_at = now() WHERE id = $1', [id, sections]);
    }).catch((e) => this.log.error(`record ${id}: ${(e as Error).message}`));
    return found;
  }

  /**
   * Merge data into one section of a record, plus optional plain facts and a timeline entry.
   * Never throws: recording must not break the applicant's flow.
   */
  async put(
    id: string | undefined,
    section: SectionName | null,
    value: Record<string, unknown> | null,
    opts: { event?: Omit<TimelineEvent, 'at'>; meta?: Partial<Pick<RecordMeta, 'verdict' | 'score' | 'document_type' | 'country' | 'status'>>; step?: string; name?: string } = {},
  ) {
    if (!id || !this.pool) return;
    await this.exclusive(id, async () => {
      const row = (await this.pool!.query('SELECT wrapped_key, sections FROM kyc_sessions WHERE id = $1', [id])).rows[0];
      if (!row || !row.wrapped_key) return;
      const key = await this.keyFor(id, row.wrapped_key);
      if (!key) return this.log.error(`cannot unwrap key for ${id}: not recorded`);
      const sections: Record<string, string> = row.sections ?? {};
      if (section && value) {
        const prev = sections[section] ? (this.open(key, id, section, sections[section]) as Record<string, unknown>) : {};
        sections[section] = this.seal(key, id, section, { ...prev, ...value });
      }
      if (opts.event) {
        const tl = sections.timeline ? (this.open(key, id, 'timeline', sections.timeline) as RecordSections['timeline'])! : [];
        tl.push({ at: new Date().toISOString(), ...opts.event });
        sections.timeline = this.seal(key, id, 'timeline', tl);
      }
      const m = opts.meta ?? {};
      const nameIndex = opts.name ? await this.vault.blindIndex(opts.name) : null;
      await this.pool!.query(
        `UPDATE kyc_sessions SET sections = $2, updated_at = now(),
           verdict = COALESCE($3, verdict), score = COALESCE($4, score),
           document_type = COALESCE($5, document_type), country = COALESCE($6, country),
           status = COALESCE($7, status),
           completed_at = CASE WHEN $7 = 'completed' THEN now() ELSE completed_at END,
           steps = CASE WHEN $8::text IS NULL THEN steps ELSE steps || jsonb_build_object($8::text, now()) END,
           name_index = COALESCE($9, name_index)
         WHERE id = $1`,
        [id, sections, m.verdict ?? null, m.score ?? null, m.document_type ?? null, m.country ?? null, m.status ?? null, opts.step ?? null, nameIndex],
      );
    }).catch((e) => this.log.error(`record ${id}: ${(e as Error).message}`));
  }

  /**
   * Store the device blind indexes for a record and count OTHER records seen with the same
   * browser key / fingerprint (redacted records excluded). Raw identifiers never reach the DB.
   */
  async linkDevice(id: string, deviceId: string | null, fingerprint: string | null) {
    const none = { sameDevice: 0, sameFingerprint: 0 };
    if (!this.pool) return none;
    try {
      const [dev, fp] = await Promise.all([
        deviceId ? this.vault.blindIndex(`device:${deviceId}`) : null,
        fingerprint ? this.vault.blindIndex(`fp:${fingerprint}`) : null,
      ]);
      await this.pool.query(
        'UPDATE kyc_sessions SET device_index = COALESCE($2, device_index), fp_index = COALESCE($3, fp_index) WHERE id = $1',
        [id, dev, fp],
      );
      const count = async (col: 'device_index' | 'fp_index', v: string | null) =>
        v ? Number((await this.pool!.query(`SELECT count(*) FROM kyc_sessions WHERE ${col} = $1 AND id <> $2 AND redacted_at IS NULL`, [v, id])).rows[0].count) : 0;
      return { sameDevice: await count('device_index', dev), sameFingerprint: await count('fp_index', fp) };
    } catch (e) {
      this.log.error(`device link ${id}: ${(e as Error).message}`);
      return none;
    }
  }

  /**
   * How many OTHER PEOPLE used this session's device: sessions sharing its browser key or
   * fingerprint whose applicant has a different name. The same person's earlier or abandoned
   * sessions never count, and while this applicant's name is not known yet nothing is counted
   * (a device can only be "shared" between two known, different people).
   */
  async otherPeopleOnDevice(id: string | undefined): Promise<number> {
    if (!id || !this.pool) return 0;
    try {
      const r = await this.pool.query(
        `SELECT count(DISTINCT o.name_index) AS n
           FROM kyc_sessions s JOIN kyc_sessions o
             ON o.id <> s.id AND o.redacted_at IS NULL
            AND ((s.device_index IS NOT NULL AND o.device_index = s.device_index) OR (s.fp_index IS NOT NULL AND o.fp_index = s.fp_index))
          WHERE s.id = $1 AND s.name_index IS NOT NULL AND o.name_index IS NOT NULL AND o.name_index <> s.name_index`,
        [id],
      );
      return Number(r.rows[0]?.n ?? 0);
    } catch (e) {
      this.log.error(`device people ${id}: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Keep an uploaded file (still the browser-made JWE) in MinIO. */
  /** Keeps one encrypted image of the record. Returns its id (every image stays, so each try keeps its own). */
  async addFile(id: string | undefined, slot: FileSlot, jwe: string): Promise<string | null> {
    if (!id || !this.pool) return null;
    try {
      let mime: string | null = null;
      try {
        mime = (JSON.parse(Buffer.from(jwe.split('.')[0], 'base64url').toString('utf8')) as { cty?: string }).cty ?? null;
      } catch {}
      const key = `sessions/${id}/${slot}-${randomBytes(8).toString('hex')}.jwe`;
      const body = Buffer.from(jwe, 'utf8');
      await this.minio.putObject(this.bucket, key, body, body.length, { 'Content-Type': 'application/jose' });
      const r = await this.pool.query(
        'INSERT INTO kyc_files (session_id, slot, object_key, mime, bytes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [id, slot, key, mime, body.length],
      );
      return r.rows[0]?.id != null ? String(r.rows[0].id) : null;
    } catch (e) {
      this.log.error(`file ${slot} for ${id}: ${(e as Error).message}`);
      return null;
    }
  }

  /** An image kept as a try becomes the verification's own (a document the read accepted). */
  async moveFile(id: string | undefined, fileId: string | null | undefined, slot: FileSlot) {
    if (!id || !fileId || !this.pool) return;
    await this.pool
      .query('UPDATE kyc_files SET slot = $3 WHERE session_id = $1 AND id = $2', [id, fileId, slot])
      .catch((e) => this.log.error(`file ${fileId} for ${id}: ${(e as Error).message}`));
  }

  /* ---------------------------------------------------------------- reading -- */

  async list(q: { search?: string; verdict?: string; limit: number; offset: number; org?: string }) {
    if (!this.pool) throw new HttpException({ ok: false, reason: 'Records store unavailable' }, HttpStatus.SERVICE_UNAVAILABLE);
    const where: string[] = [];
    const args: unknown[] = [];
    // an operator sees only their organisation's records
    if (q.org !== undefined) {
      args.push(q.org);
      where.push(`tenant = $${args.length}`);
    }
    if (q.search) {
      const idx = await this.vault.blindIndex(q.search);
      args.push(q.search.toUpperCase(), idx);
      where.push(`(reference = $${args.length - 1} OR name_index = $${args.length})`);
    }
    if (q.verdict) {
      args.push(q.verdict);
      where.push(`verdict = $${args.length}`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number((await this.pool.query(`SELECT count(*) FROM kyc_sessions ${w}`, args)).rows[0].count);
    args.push(q.limit, q.offset);
    const rows = (
      await this.pool.query(
        `SELECT id, reference, tenant, status, verdict, score, document_type, country, steps, wrapped_key, sections, created_at, updated_at, completed_at, redacted_at,
                workflow_id, workflow_version
         FROM kyc_sessions ${w} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
        args,
      )
    ).rows;
    const live = Number(
      (
        await this.pool.query(
          `SELECT count(*) FROM kyc_sessions WHERE status = 'in_progress' AND updated_at > now() - interval '1 hour'${q.org !== undefined ? ' AND tenant = $1' : ''}`,
          q.org !== undefined ? [q.org] : [],
        )
      ).rows[0].count,
    );
    return { total, live, rows: await Promise.all(rows.map((r) => this.decodeIdentity(r))) };
  }

  /**
   * Every verification in the organisation, with its identity section opened, for an Excel export. Capped so a
   * very large tenant cannot build an unbounded file. The caller decides what to keep and what to blur.
   */
  async exportVerifications(org: string | undefined, limit = 10000) {
    if (!this.pool) throw new HttpException({ ok: false, reason: 'Records store unavailable' }, HttpStatus.SERVICE_UNAVAILABLE);
    const args: unknown[] = [];
    let w = '';
    if (org !== undefined) {
      args.push(org);
      w = 'WHERE tenant = $1';
    }
    args.push(Math.min(Math.max(limit, 1), 50000));
    const rows = (
      await this.pool.query(
        `SELECT id, reference, tenant, status, verdict, score, document_type, country, steps, wrapped_key, sections,
                created_at, updated_at, completed_at, redacted_at, workflow_id, workflow_version
         FROM kyc_sessions ${w} ORDER BY created_at DESC LIMIT $${args.length}`,
        args,
      )
    ).rows;
    return Promise.all(rows.map((r) => this.decodeIdentity(r)));
  }

  /** For the list: only the identity section is opened. */
  private async decodeIdentity(r: RecordMeta & { wrapped_key: string | null; sections: Record<string, string> }) {
    let identity: Record<string, unknown> | null = null;
    const key = r.wrapped_key ? await this.keyFor(r.id, r.wrapped_key) : null;
    if (key && r.sections?.identity) identity = this.open(key, r.id, 'identity', r.sections.identity) as Record<string, unknown>;
    const { wrapped_key: _w, sections: _s, ...meta } = r;
    return { meta: meta as RecordMeta, identity };
  }

  /** The whole record, decrypted in memory for an authorised operator. */
  async get(id: string): Promise<{ meta: RecordMeta; data: RecordSections; files: { slot: string; mime: string | null }[] } | null> {
    if (!this.pool) return null;
    const r = (await this.pool.query('SELECT * FROM kyc_sessions WHERE id = $1 OR reference = $1', [id])).rows[0];
    if (!r) return null;
    const data: RecordSections = {};
    const key = r.wrapped_key ? await this.keyFor(r.id, r.wrapped_key) : null;
    if (key) for (const [name, blob] of Object.entries(r.sections ?? {})) (data as Record<string, unknown>)[name] = this.open(key, r.id, name, blob as string);
    const files = (await this.pool.query('SELECT DISTINCT ON (slot) slot, mime FROM kyc_files WHERE session_id = $1 ORDER BY slot, created_at DESC', [r.id])).rows;
    const { wrapped_key: _w, sections: _s, name_index: _n, ...meta } = r;
    return { meta, data, files };
  }

  /** A stored file, opened on the processing host (the only place that can) for display. */
  async file(id: string, slot: string): Promise<{ mime: string; data: Buffer } | null> {
    if (!this.pool) return null;
    const f = (await this.pool.query('SELECT object_key FROM kyc_files WHERE session_id = $1 AND slot = $2 ORDER BY created_at DESC LIMIT 1', [id, slot])).rows[0];
    return f ? this.openFile(f.object_key) : null;
  }

  /** One try's own image, by its id (only within this record). */
  async fileById(id: string, fileId: string): Promise<{ mime: string; data: Buffer } | null> {
    if (!this.pool || !/^\d{1,18}$/.test(fileId)) return null;
    const f = (await this.pool.query('SELECT object_key FROM kyc_files WHERE session_id = $1 AND id = $2', [id, fileId])).rows[0];
    return f ? this.openFile(f.object_key) : null;
  }

  private async openFile(objectKey: string): Promise<{ mime: string; data: Buffer } | null> {
    const f = { object_key: objectKey };
    const stream = await this.minio.getObject(this.bucket, f.object_key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const env = await this.intel.post<{ mime: string; data: string }>('/v1/vault/open', { jwe: Buffer.concat(chunks).toString('utf8') }, 30_000);
    if (!env.ok || !env.data) return null;
    return { mime: env.data.mime || 'application/octet-stream', data: Buffer.from(env.data.data, 'base64') };
  }

  async logAccess(id: string, actor: string, action: string) {
    await this.pool?.query('INSERT INTO kyc_access_log (session_id, actor, action) VALUES ($1, $2, $3)', [id, actor, action]).catch(() => undefined);
  }

  /** What one person did to verification records (the append-only access log), newest first. */
  async accessByActor(actors: string[], limit = 30): Promise<{ action: string; at: Date; reference: string | null }[]> {
    if (!this.pool || !actors.length) return [];
    return (
      await this.pool.query(
        `SELECT l.action, l.at, s.reference FROM kyc_access_log l LEFT JOIN kyc_sessions s ON s.id = l.session_id
          WHERE l.actor = ANY($1) ORDER BY l.at DESC LIMIT $2`,
        [actors, limit],
      )
    ).rows;
  }

  async accessLog(id: string) {
    return (await this.pool?.query('SELECT actor, action, at FROM kyc_access_log WHERE session_id = $1 ORDER BY at DESC LIMIT 50', [id]))?.rows ?? [];
  }

  /** One wrong access code on a link: the wrong tries so far (the link locks at the limit). */
  async accessMiss(id: string): Promise<number> {
    if (!this.pool) return 0;
    const r = await this.pool.query('UPDATE kyc_sessions SET access_tries = access_tries + 1 WHERE id = $1 RETURNING access_tries', [id]);
    return Number(r.rows[0]?.access_tries ?? 0);
  }

  /** The organisation stops a verification (its link and any open session), or lets it go on again. */
  async setDisabled(id: string, disabled: boolean): Promise<boolean> {
    if (!this.pool) return false;
    const r = await this.pool.query(
      disabled
        ? `UPDATE kyc_sessions SET status = 'disabled', disabled_at = now(), updated_at = now() WHERE id = $1 AND status = 'in_progress'`
        : `UPDATE kyc_sessions SET status = 'in_progress', disabled_at = NULL, updated_at = now() WHERE id = $1 AND status = 'disabled'`,
      [id],
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** Irreversible: crypto-shred the record and its files, then take it out of the organisation's records. */
  async remove(id: string): Promise<boolean> {
    if (!this.pool) return false;
    await this.redact(id);
    const r = await this.pool.query('DELETE FROM kyc_sessions WHERE id = $1', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  /** Irreversible: destroy the record's key (crypto-shred) and its files. */
  async redact(id: string) {
    if (!this.pool) return false;
    const files = (await this.pool.query('SELECT object_key FROM kyc_files WHERE session_id = $1', [id])).rows;
    for (const f of files) await this.minio.removeObject(this.bucket, f.object_key).catch(() => undefined);
    await this.pool.query('DELETE FROM kyc_files WHERE session_id = $1', [id]);
    const r = await this.pool.query(
      `UPDATE kyc_sessions SET wrapped_key = NULL, sections = '{}'::jsonb, name_index = NULL, device_index = NULL, fp_index = NULL, link_hash = NULL, bound_key = NULL, resume_until = NULL, status = 'redacted', redacted_at = now(), updated_at = now() WHERE id = $1`,
      [id],
    );
    this.keys.delete(id);
    return (r.rowCount ?? 0) > 0;
  }
}
