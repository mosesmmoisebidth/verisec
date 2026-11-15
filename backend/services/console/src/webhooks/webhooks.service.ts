import {
  HttpException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

import { RecordsService } from '../kyc/records.service';
import {
  DeliveryClient,
  DeliveryError,
  DeliveryState,
  type DsEndpoint,
  type DsEndpointIn,
} from './delivery.client';
import {
  cleanData,
  eventDef,
  eventsOf,
  TEST_EVENT,
  TEST_EVENT_DESCRIPTION,
  WEBHOOK_EVENTS,
  type WebhookEnv,
  type WebhookEventType,
  type WebhookPortal,
} from './webhook-events';

/**
 * Webhooks: the organisation's endpoints and the events the platform sends them.
 *
 * - Delivery (signing, retries with backoff, the attempt log) is done by the delivery server
 *   (infra "svix", self-hosted). Each organisation gets one application per environment,
 *   `org_<orgId>_live` / `org_<orgId>_test`, so one organisation never sees another's endpoints,
 *   messages or attempts. Every route here also checks the endpoint belongs to the caller's organisation.
 * - `emit()` writes the event to `webhook_outbox` first; a relay loop hands pending rows to the
 *   delivery server with an idempotency key. If the delivery server is down nothing is lost: rows wait
 *   and are sent when it is back, once.
 * - Signing secrets (whsec_) are generated here, shown once (create, rotate) and never stored by the
 *   console: only a hint (last four characters) is kept. The delivery server keeps them encrypted.
 * - Payloads carry ids, statuses, verdicts, scores and timestamps only (see `cleanData`).
 */

export interface EndpointView {
  id: string;
  url: string;
  description: string;
  env: WebhookEnv;
  portal: WebhookPortal;
  enabled: boolean;
  events: string[];
  secret_hint: string;
  created_at: string;
  updated_at: string;
  rotated_at: string | null;
}

export type DeliveryStatus = 'delivered' | 'failed' | 'pending';

export interface DeliveryView {
  /** The attempt's id (or, for a message not tried yet, the message id). */
  id: string;
  /** What Resend needs. */
  message_id: string;
  event: string;
  status: DeliveryStatus;
  response_code: number | null;
  duration_ms: number | null;
  at: string;
  /** true when the attempt came from Resend (not the schedule). */
  manual: boolean;
  /** When the next automatic retry is due, on the newest attempt of a message still being retried. */
  next_attempt_at: string | null;
}

type EndpointRow = {
  id: string;
  tenant: string;
  env: WebhookEnv;
  portal: WebhookPortal;
  secret_hint: string;
  created_by: string;
  created_at: Date;
  rotated_at: Date | null;
};

type OutboxRow = {
  id: string;
  tenant: string;
  env: WebhookEnv;
  event_type: string;
  payload: Record<string, unknown>;
  tries: number;
};

type OutboxInsert = {
  tenant: string;
  env: WebhookEnv;
  type: string;
  payload: Record<string, unknown>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id          text PRIMARY KEY,
  tenant      text NOT NULL,
  env         text NOT NULL CHECK (env IN ('live', 'test')),
  portal      text NOT NULL CHECK (portal IN ('kyc', 'fin')),
  secret_hint text NOT NULL,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  rotated_at  timestamptz
);
CREATE INDEX IF NOT EXISTS webhook_endpoints_tenant ON webhook_endpoints (tenant, portal, created_at);
CREATE TABLE IF NOT EXISTS webhook_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigserial,
  tenant      text NOT NULL,
  env         text NOT NULL CHECK (env IN ('live', 'test')),
  event_type  text NOT NULL,
  payload     json NOT NULL, -- json, not jsonb: keeps the keys in the order receivers see them (type first)
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'failed')),
  tries       integer NOT NULL DEFAULT 0,
  last_error  text,
  next_try_at timestamptz NOT NULL DEFAULT now(),
  locked_at   timestamptz,
  message_id  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX IF NOT EXISTS webhook_outbox_due ON webhook_outbox (next_try_at, seq) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS webhook_outbox_age ON webhook_outbox (created_at) WHERE status IN ('sent', 'skipped', 'failed');
`;

/** Endpoints per organisation and portal. */
const MAX_ENDPOINTS = 20;
const MAX_URL = 2048;
const MAX_DESCRIPTION = 120;
/** How long the previous secret keeps signing after a rotation (the delivery server's window). */
const ROTATION_GRACE_HOURS = 24;
/** One test event per endpoint every few seconds. */
const TEST_COOLDOWN_MS = 3000;
/** Outbox rows kept after they are done. */
const OUTBOX_KEEP_DAYS = 30;
/** Rows held in memory while the database cannot take them. */
const BUFFER_MAX = 1000;

/** Every endpoint listens on ALL; a test event goes only to the endpoint's own channel. */
const ALL_CHANNEL = 'all';
const channelOf = (endpointId: string) => `ep.${endpointId}`;

const ENDPOINT_ID = /^whep_[a-f0-9]{20}$/;
const MESSAGE_ID = /^msg_[A-Za-z0-9]{10,64}$/;

const fail = (status: number, code: string, message: string) =>
  new HttpException({ statusCode: status, code, message }, status);
const unavailable = () =>
  fail(
    503,
    'unavailable',
    'Webhooks are not available right now. Try again in a minute.',
  );
const bad = (code: string, message: string) => fail(400, code, message);

/** The organisation's application on the delivery server, per environment. */
export function appUidOf(tenant: string, env: WebhookEnv): string {
  const safe = /^[A-Za-z0-9_-]{1,200}$/.test(tenant)
    ? tenant
    : 'h' + createHash('sha256').update(tenant).digest('hex').slice(0, 40);
  return `org_${safe}_${env}`;
}

const newSecret = () => 'whsec_' + randomBytes(24).toString('base64');
const hintOf = (secret: string) => `whsec_••••••••${secret.slice(-4)}`;

/* ------------------------------------------------------------ address rules -- */

function v4Parts(host: string): number[] | null {
  if (isIP(host) !== 4) return null;
  return host.split('.').map(Number);
}

function isLoopback(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1') return true;
  const p = v4Parts(host.replace(/^::ffff:/, ''));
  return p !== null && p[0] === 127;
}

function isPrivate(host: string): boolean {
  if (host === '0.0.0.0' || host === '::') return true;
  if (/\.(internal|local|lan|home\.arpa|localdomain)$/.test(host)) return true;
  const ip = isIP(host);
  if (ip === 0) return !host.includes('.'); // a single-label name only resolves on an internal network
  if (ip === 6) {
    if (host.startsWith('::ffff:')) return isPrivate(host.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(host);
  }
  const [a, b] = v4Parts(host)!;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

@Injectable()
export class WebhooksService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger('Webhooks');
  /** DEV ONLY (WEBHOOKS_LOOPBACK_ALIAS): test endpoints on this computer are reached through this host. */
  private readonly loopbackAlias: string | null;
  private records: RecordsService | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private again = false;
  private schemaReady = false;
  private typesReady = false;
  private lastSweep = 0;
  private readonly buffer: OutboxInsert[] = [];
  private readonly lastTest = new Map<string, number>();

  constructor(
    private readonly ds: DeliveryClient,
    private readonly moduleRef: ModuleRef,
    config: ConfigService,
  ) {
    this.loopbackAlias =
      (config.get<string>('WEBHOOKS_LOOPBACK_ALIAS') ?? '').trim() || null;
  }

  /* ================================================================ emit ===== */

  /**
   * Queue an event for the organisation's endpoints. Never throws and never waits on delivery:
   * the event is written to the outbox and the relay sends it. `data` is reduced to the allowed,
   * non-personal fields (ids, status, verdict, score, counts, timestamps).
   */
  async emit(
    tenant: string,
    type: WebhookEventType,
    data: Record<string, unknown>,
    env: WebhookEnv = 'test',
  ): Promise<void> {
    try {
      if (!tenant || typeof tenant !== 'string') return;
      if (!eventDef(type)) {
        this.log.warn(`emit: unknown event type "${String(type)}" ignored`);
        return;
      }
      if (env !== 'live' && env !== 'test') {
        this.log.warn(`emit: unknown environment for ${type} ignored`);
        return;
      }
      const clean = cleanData(data);
      if (clean.dropped.length)
        this.log.warn(
          `emit ${type}: left out ${clean.dropped.join(', ')} (not allowed in a webhook payload)`,
        );
      const payload = {
        type,
        timestamp: new Date().toISOString(),
        environment: env,
        data: clean.data,
      };
      const row: OutboxInsert = { tenant, env, type, payload };
      if (!(await this.insertOutbox(row))) this.hold(row);
      this.kick();
    } catch (e) {
      this.log.error(`emit ${String(type)}: ${(e as Error).message}`);
    }
  }

  private async insertOutbox(row: OutboxInsert): Promise<boolean> {
    if (!(await this.ensureSchema())) return false;
    try {
      const r = await this.db.query(
        `INSERT INTO webhook_outbox (tenant, env, event_type, payload) VALUES ($1, $2, $3, $4::json) RETURNING id`,
        [row.tenant, row.env, row.type, JSON.stringify(row.payload)],
      );
      return r.length > 0;
    } catch (e) {
      this.log.error(`outbox write: ${(e as Error).message}`);
      return false;
    }
  }

  /** Keeps an event in memory until the database is back (bounded). */
  private hold(row: OutboxInsert) {
    if (this.buffer.length >= BUFFER_MAX) {
      const lost = this.buffer.shift();
      this.log.error(
        `outbox buffer full: dropped one ${lost?.type} event (database unavailable)`,
      );
    }
    this.buffer.push(row);
  }

  /* ======================================================== relay loop ====== */

  onApplicationBootstrap() {
    if (!this.ds.configured)
      this.log.warn(
        'delivery server not configured (SVIX_URL / SVIX_TOKEN): events are queued, not sent',
      );
    this.timer = setInterval(() => this.kick(), 2000);
    this.timer.unref();
    this.kick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private kick() {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    void (async () => {
      try {
        do {
          this.again = false;
          await this.relay();
        } while (this.again);
      } catch (e) {
        this.log.error(`relay: ${(e as Error).message}`);
      } finally {
        this.running = false;
      }
    })();
  }

  private get db(): RecordsService {
    const found =
      this.records ??
      this.moduleRef.get<RecordsService>(RecordsService, { strict: false });
    this.records = found;
    return found;
  }

  private async ensureSchema(): Promise<boolean> {
    if (this.schemaReady) return true;
    if (!this.db.ready) return false;
    try {
      await this.db.query(SCHEMA);
      this.schemaReady = true;
      this.log.log(
        `webhooks: outbox ready, delivery ${this.ds.configured ? 'configured' : 'NOT configured'}`,
      );
      return true;
    } catch (e) {
      this.log.error(`webhook tables: ${(e as Error).message}`);
      return false;
    }
  }

  private async ensureTypes(): Promise<void> {
    if (this.typesReady) return;
    for (const e of WEBHOOK_EVENTS)
      await this.ds.ensureEventType(e.name, e.description);
    await this.ds.ensureEventType(TEST_EVENT, TEST_EVENT_DESCRIPTION);
    this.typesReady = true;
  }

  private async relay(): Promise<void> {
    if (!(await this.ensureSchema())) return;
    // events held in memory while the database was away
    while (this.buffer.length) {
      if (!(await this.insertOutbox(this.buffer[0]))) return;
      this.buffer.shift();
    }
    if (!this.ds.configured) return;
    try {
      await this.ensureTypes();
    } catch {
      return; // delivery server unreachable: rows stay pending
    }
    // rows claimed by a run that never finished (crash, restart) go back in the queue
    await this.db.query(
      `UPDATE webhook_outbox SET status = 'pending', locked_at = NULL
        WHERE status = 'sending' AND locked_at < now() - interval '2 minutes'`,
    );
    for (let round = 0; round < 8; round++) {
      const rows = await this.db.query<OutboxRow>(
        `UPDATE webhook_outbox o SET status = 'sending', locked_at = now(), tries = o.tries + 1
          WHERE o.id IN (SELECT id FROM webhook_outbox
                          WHERE status = 'pending' AND next_try_at <= now()
                          ORDER BY seq LIMIT 25 FOR UPDATE SKIP LOCKED)
          RETURNING o.id::text AS id, o.tenant, o.env, o.event_type, o.payload, o.tries`,
      );
      if (!rows.length) break;
      for (const row of rows) await this.relayOne(row);
    }
    if (Date.now() - this.lastSweep > 3600_000) {
      this.lastSweep = Date.now();
      await this.db.query(
        `DELETE FROM webhook_outbox WHERE status IN ('sent', 'skipped', 'failed')
          AND created_at < now() - make_interval(days => $1)`,
        [OUTBOX_KEEP_DAYS],
      );
    }
  }

  private async relayOne(row: OutboxRow): Promise<void> {
    const has = await this.db.query(
      'SELECT 1 FROM webhook_endpoints WHERE tenant = $1 AND env = $2 LIMIT 1',
      [row.tenant, row.env],
    );
    if (!has.length) {
      await this.db.query(
        `UPDATE webhook_outbox SET status = 'skipped', last_error = 'no endpoint', locked_at = NULL, sent_at = now() WHERE id = $1`,
        [row.id],
      );
      return;
    }
    const app = appUidOf(row.tenant, row.env);
    try {
      const msg = await this.ds.sendMessage(
        app,
        {
          eventType: row.event_type,
          eventId: `evt_${row.id.replace(/-/g, '')}`,
          payload: row.payload,
          channels: [ALL_CHANNEL],
          application: { uid: app, name: app },
        },
        `outbox-${row.id}`,
      );
      await this.markSent(row.id, msg.id);
    } catch (e) {
      const status = e instanceof DeliveryError ? e.status : 0;
      if (status === 409) {
        // the same event id was accepted before (a retry after a lost answer): already sent
        await this.markSent(row.id, null);
        return;
      }
      if (status === 422) this.typesReady = false; // e.g. event types wiped: register again
      const permanent =
        status >= 400 && status < 500 && status !== 408 && status !== 429;
      const detail =
        e instanceof DeliveryError
          ? `${e.status} ${e.code}`
          : (e as Error).message;
      if (permanent && row.tries >= 5) {
        await this.db.query(
          `UPDATE webhook_outbox SET status = 'failed', last_error = $2, locked_at = NULL WHERE id = $1`,
          [row.id, detail.slice(0, 300)],
        );
        this.log.error(
          `outbox ${row.id} (${row.event_type}) gave up: ${detail}`,
        );
        return;
      }
      const wait = Math.min(5 * 2 ** Math.max(0, row.tries - 1), 900);
      await this.db.query(
        `UPDATE webhook_outbox SET status = 'pending', last_error = $2, locked_at = NULL,
                next_try_at = now() + make_interval(secs => $3) WHERE id = $1`,
        [row.id, detail.slice(0, 300), wait],
      );
    }
  }

  private async markSent(id: string, messageId: string | null) {
    await this.db.query(
      `UPDATE webhook_outbox SET status = 'sent', message_id = COALESCE($2, message_id), last_error = NULL,
              locked_at = NULL, sent_at = now() WHERE id = $1`,
      [id, messageId],
    );
  }

  /* =================================================== endpoint management == */

  catalog(portal: WebhookPortal) {
    return {
      event_types: eventsOf(portal).map(({ name, description }) => ({
        name,
        description,
      })),
    };
  }

  async list(tenant: string, portal: WebhookPortal) {
    const rows = await this.q<EndpointRow>(
      `SELECT id, tenant, env, portal, secret_hint, created_by, created_at, rotated_at
         FROM webhook_endpoints WHERE tenant = $1 AND portal = $2 ORDER BY created_at`,
      [tenant, portal],
    );
    const endpoints: EndpointView[] = [];
    if (rows.length) {
      const envs = [...new Set(rows.map((r) => r.env))];
      const remote = new Map<string, DsEndpoint>();
      for (const env of envs) {
        const eps = await this.call(() =>
          this.ds.listEndpoints(appUidOf(tenant, env)),
        );
        for (const ep of eps) remote.set(`${env}:${ep.uid ?? ep.id}`, ep);
      }
      for (const r of rows) {
        const ep = remote.get(`${r.env}:${r.id}`);
        if (ep) endpoints.push(this.view(r, ep));
        else {
          // removed on the delivery side: drop our record of it too
          await this.q('DELETE FROM webhook_endpoints WHERE id = $1', [r.id]);
          this.log.warn(`endpoint ${r.id} no longer exists; record removed`);
        }
      }
    }
    return { endpoints, max_endpoints: MAX_ENDPOINTS };
  }

  async create(
    tenant: string,
    who: string,
    body: {
      url?: unknown;
      description?: unknown;
      events?: unknown;
      env?: unknown;
      portal?: unknown;
    },
  ) {
    const portal = portalOf(body.portal);
    const env = envOf(body.env);
    const url = this.checkUrl(body.url, env);
    const events = checkEvents(body.events, portal);
    const description = descriptionOf(body.description);
    const [{ n }] = await this.q<{ n: number }>(
      'SELECT count(*)::int AS n FROM webhook_endpoints WHERE tenant = $1 AND portal = $2',
      [tenant, portal],
    );
    if (n >= MAX_ENDPOINTS)
      throw fail(
        409,
        'limit_reached',
        `You can have up to ${MAX_ENDPOINTS} endpoints. Delete one to add another.`,
      );

    const id = 'whep_' + randomBytes(10).toString('hex');
    const secret = newSecret();
    const app = appUidOf(tenant, env);
    await this.call(() => this.ensureTypes());
    await this.call(() => this.ds.ensureApp(app, app));
    const ep = await this.call(() =>
      this.ds.createEndpoint(app, {
        uid: id,
        url: url.target,
        description,
        disabled: false,
        eventTypes: [...events, TEST_EVENT],
        channels: [ALL_CHANNEL, channelOf(id)],
        secret,
        metadata: metadataOf(portal, url),
      }),
    );
    let row: EndpointRow;
    try {
      [row] = await this.q<EndpointRow>(
        `INSERT INTO webhook_endpoints (id, tenant, env, portal, secret_hint, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, tenant, env, portal, secret_hint, created_by, created_at, rotated_at`,
        [id, tenant, env, portal, hintOf(secret), who],
      );
    } catch (e) {
      await this.ds.deleteEndpoint(app, id).catch(() => undefined);
      throw e;
    }
    this.log.log(`endpoint ${id} added (${portal}, ${env}) by ${who}`);
    return { endpoint: this.view(row, ep), secret };
  }

  async update(
    tenant: string,
    id: string,
    body: {
      url?: unknown;
      description?: unknown;
      events?: unknown;
      enabled?: unknown;
    },
  ) {
    const row = await this.own(tenant, id);
    const patch: Partial<DsEndpointIn> = {};
    if (body.url !== undefined) {
      const url = this.checkUrl(body.url, row.env);
      patch.url = url.target;
      patch.metadata = metadataOf(row.portal, url);
    }
    if (body.description !== undefined)
      patch.description = descriptionOf(body.description);
    if (body.events !== undefined)
      patch.eventTypes = [...checkEvents(body.events, row.portal), TEST_EVENT];
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean')
        throw bad('enabled_invalid', 'enabled must be true or false.');
      patch.disabled = !body.enabled;
    }
    if (!Object.keys(patch).length)
      throw bad('nothing_to_change', 'Nothing to change.');
    if (patch.eventTypes) await this.call(() => this.ensureTypes());
    const ep = await this.call(() =>
      this.ds.patchEndpoint(appUidOf(tenant, row.env), row.id, patch),
    );
    return { endpoint: this.view(row, ep) };
  }

  async remove(tenant: string, id: string) {
    const row = await this.own(tenant, id);
    await this.call(() =>
      this.ds.deleteEndpoint(appUidOf(tenant, row.env), row.id),
    );
    await this.q(
      'DELETE FROM webhook_endpoints WHERE id = $1 AND tenant = $2',
      [row.id, tenant],
    );
    this.log.log(`endpoint ${row.id} deleted`);
  }

  /** A new signing secret, shown once. The previous one keeps signing for 24 hours. */
  async rotate(tenant: string, id: string) {
    const row = await this.own(tenant, id);
    const secret = newSecret();
    const app = appUidOf(tenant, row.env);
    await this.call(() => this.ds.rotateSecret(app, row.id, secret));
    const [updated] = await this.q<EndpointRow>(
      `UPDATE webhook_endpoints SET secret_hint = $2, rotated_at = now() WHERE id = $1
       RETURNING id, tenant, env, portal, secret_hint, created_by, created_at, rotated_at`,
      [row.id, hintOf(secret)],
    );
    const ep = await this.call(() => this.ds.getEndpoint(app, row.id));
    return {
      endpoint: this.view(updated, ep),
      secret,
      previous_secret_valid_until: new Date(
        Date.now() + ROTATION_GRACE_HOURS * 3600_000,
      ).toISOString(),
    };
  }

  /** Sends `webhook.test` to this endpoint only. */
  async test(tenant: string, id: string) {
    const row = await this.own(tenant, id);
    const app = appUidOf(tenant, row.env);
    const ep = await this.call(() => this.ds.getEndpoint(app, row.id));
    if (ep.disabled)
      throw fail(
        409,
        'endpoint_disabled',
        'Turn this endpoint on to send it a test event.',
      );
    const last = this.lastTest.get(row.id) ?? 0;
    if (Date.now() - last < TEST_COOLDOWN_MS)
      throw fail(
        429,
        'too_soon',
        'A test event was just sent. Wait a few seconds.',
      );
    this.lastTest.set(row.id, Date.now());
    await this.call(() => this.ensureTypes());
    const msg = await this.call(() =>
      this.ds.sendMessage(app, {
        eventType: TEST_EVENT,
        payload: {
          type: TEST_EVENT,
          timestamp: new Date().toISOString(),
          environment: row.env,
          data: {
            endpoint_id: row.id,
            message: 'This is a test event from the VeriSec console.',
          },
        },
        channels: [channelOf(row.id)],
      }),
    );
    return { sent: true, message_id: msg.id };
  }

  /**
   * For the dashboard: the organisation's webhook messages since `since`, by how delivery went: delivered, still
   * being retried, or failed for good (from the delivery server's own state of each message).
   */
  async deliveryStats(tenant: string, since: Date): Promise<{ delivered: number; retried: number; failed: number }> {
    const out = { delivered: 0, retried: 0, failed: 0 };
    const rows = await this.q<{ id: string; env: 'test' | 'live' }>(`SELECT id, env FROM webhook_endpoints WHERE tenant = $1`, [tenant]).catch(
      () => [] as { id: string; env: 'test' | 'live' }[],
    );
    for (const row of rows) {
      const msgs = await this.ds.messagesByEndpoint(appUidOf(tenant, row.env), row.id, 250).catch(() => []);
      for (const m of msgs) {
        if (+new Date(m.timestamp) < +since) continue;
        if (m.status === DeliveryState.Success) out.delivered += 1;
        else if (m.status === DeliveryState.Fail) out.failed += 1;
        else if (m.nextAttempt) out.retried += 1;
      }
    }
    return out;
  }

  /** Recent attempts (newest first), plus events still waiting for their first try. */
  async deliveries(tenant: string, id: string, limitRaw?: string) {
    const row = await this.own(tenant, id);
    const limit = Math.min(Math.max(Number(limitRaw) || 25, 1), 100);
    const app = appUidOf(tenant, row.env);
    const [attempts, messages] = await this.call(() =>
      Promise.all([
        this.ds.attemptsByEndpoint(app, row.id, limit),
        this.ds.messagesByEndpoint(app, row.id, 100),
      ]),
    );
    const typeOf = new Map(messages.map((m) => [m.id, m.eventType]));
    const msgOf = new Map(messages.map((m) => [m.id, m]));
    // attempts on older messages: look their event type up (a few at most)
    const unknown = [
      ...new Set(attempts.map((a) => a.msgId).filter((m) => !typeOf.has(m))),
    ].slice(0, 10);
    await Promise.all(
      unknown.map(async (m) => {
        const msg = await this.ds.getMessage(app, m).catch(() => null);
        if (msg) typeOf.set(m, msg.eventType);
      }),
    );

    const seen = new Set<string>();
    const rows: DeliveryView[] = [];
    for (const a of [...attempts].sort((x, y) =>
      y.timestamp.localeCompare(x.timestamp),
    )) {
      const newest = !seen.has(a.msgId);
      seen.add(a.msgId);
      const msg = msgOf.get(a.msgId);
      const retrying =
        newest &&
        msg !== undefined &&
        (msg.status === DeliveryState.Pending ||
          msg.status === DeliveryState.Sending);
      rows.push({
        id: a.id,
        message_id: a.msgId,
        event: typeOf.get(a.msgId) ?? 'unknown',
        status: statusOf(a.status),
        response_code: a.responseStatusCode > 0 ? a.responseStatusCode : null,
        duration_ms:
          typeof a.responseDurationMs === 'number'
            ? a.responseDurationMs
            : null,
        at: a.timestamp,
        manual: a.triggerType === 1,
        next_attempt_at: retrying ? (msg.nextAttempt ?? null) : null,
      });
    }
    for (const m of messages) {
      if (seen.has(m.id)) continue;
      if (
        m.status !== DeliveryState.Pending &&
        m.status !== DeliveryState.Sending
      )
        continue;
      rows.push({
        id: m.id,
        message_id: m.id,
        event: m.eventType,
        status: 'pending',
        response_code: null,
        duration_ms: null,
        at: m.timestamp,
        manual: false,
        next_attempt_at: m.nextAttempt ?? null,
      });
    }
    rows.sort((x, y) => y.at.localeCompare(x.at));
    return { deliveries: rows.slice(0, limit) };
  }

  /** Sends the same event (same id and payload) to this endpoint again, now. */
  async resend(tenant: string, id: string, messageId: string) {
    const row = await this.own(tenant, id);
    if (typeof messageId !== 'string' || !MESSAGE_ID.test(messageId))
      throw fail(404, 'not_found', 'That delivery was not found.');
    try {
      await this.ds.resend(appUidOf(tenant, row.env), messageId, row.id);
    } catch (e) {
      if (e instanceof DeliveryError && e.status === 404)
        throw fail(404, 'not_found', 'That delivery was not found.');
      this.down(e);
    }
    return { resent: true };
  }

  /* ============================================================= helpers ==== */

  private view(r: EndpointRow, ep: DsEndpoint): EndpointView {
    return {
      id: r.id,
      url: ep.metadata?.display_url || ep.url,
      description: ep.description ?? '',
      env: r.env,
      portal: r.portal,
      enabled: !ep.disabled,
      // in catalogue order (the delivery server keeps its own order)
      events: eventsOf(r.portal)
        .map((e) => e.name)
        .filter((n) => (ep.eventTypes ?? []).includes(n)),
      secret_hint: r.secret_hint,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: ep.updatedAt,
      rotated_at: r.rotated_at ? new Date(r.rotated_at).toISOString() : null,
    };
  }

  /** The endpoint, only when it belongs to this organisation. */
  private async own(tenant: string, id: string): Promise<EndpointRow> {
    if (typeof id !== 'string' || !ENDPOINT_ID.test(id))
      throw fail(404, 'not_found', 'That endpoint was not found.');
    const [row] = await this.q<EndpointRow>(
      `SELECT id, tenant, env, portal, secret_hint, created_by, created_at, rotated_at
         FROM webhook_endpoints WHERE id = $1 AND tenant = $2`,
      [id, tenant],
    );
    if (!row) throw fail(404, 'not_found', 'That endpoint was not found.');
    return row;
  }

  /** A query on the webhook tables; 503 while the database is not available. */
  private async q<T = Record<string, unknown>>(
    sql: string,
    args: unknown[] = [],
  ): Promise<T[]> {
    if (!(await this.ensureSchema())) throw unavailable();
    try {
      return await this.db.query<T>(sql, args);
    } catch (e) {
      this.log.error(`webhook tables: ${(e as Error).message}`);
      throw unavailable();
    }
  }

  /** A delivery-server call; its failures become the console's own words. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      return this.down(e);
    }
  }

  private down(e: unknown): never {
    if (e instanceof HttpException) throw e;
    if (e instanceof DeliveryError) {
      this.log.error(`delivery server: ${e.status} ${e.code} ${e.message}`);
      if (e.status === 404)
        throw fail(404, 'not_found', 'That endpoint was not found.');
      if (e.status === 422 || e.status === 400)
        throw bad(
          'rejected',
          'That endpoint could not be saved. Check the address and try again.',
        );
    } else this.log.error(`delivery server: ${(e as Error).message}`);
    throw unavailable();
  }

  /**
   * https for live, http or https for test; no user name or password in it; no private or internal
   * address. A loopback address (127.0.0.1, localhost) is allowed only for TEST endpoints on a dev
   * machine (WEBHOOKS_LOOPBACK_ALIAS), where the delivery server reaches this computer through the alias.
   */
  private checkUrl(
    raw: unknown,
    env: WebhookEnv,
  ): { shown: string; target: string } {
    if (typeof raw !== 'string' || !raw.trim())
      throw bad(
        'url_required',
        'Enter the address that should receive events.',
      );
    const s = raw.trim();
    if (s.length > MAX_URL)
      throw bad('url_too_long', 'That address is too long.');
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      throw bad(
        'url_invalid',
        'Enter a full address, for example https://api.example.com/webhooks.',
      );
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:')
      throw bad(
        'url_scheme',
        'The address must start with https:// (or http:// for a test endpoint).',
      );
    if (env === 'live' && u.protocol !== 'https:')
      throw bad('https_required', 'Live endpoints must use https://.');
    if (u.username || u.password)
      throw bad(
        'url_credentials',
        'Remove the user name and password from the address.',
      );
    u.hash = '';
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (isLoopback(host)) {
      if (env === 'test' && this.loopbackAlias) {
        const target = new URL(u.toString());
        target.hostname = this.loopbackAlias;
        return { shown: u.toString(), target: target.toString() };
      }
      throw bad(
        'url_private',
        env === 'live'
          ? 'Live endpoints need a public address.'
          : 'This address is on your own computer, which our servers cannot reach. Use a public address.',
      );
    }
    if (isPrivate(host))
      throw bad(
        'url_private',
        'Use a public address. Private and internal network addresses cannot receive webhooks.',
      );
    return { shown: u.toString(), target: u.toString() };
  }
}

/* ------------------------------------------------------------ input rules -- */

function portalOf(v: unknown): WebhookPortal {
  if (v === undefined || v === null || v === '') return 'kyc';
  if (v === 'kyc' || v === 'fin') return v;
  throw bad('portal_invalid', 'portal must be kyc or fin.');
}

function envOf(v: unknown): WebhookEnv {
  if (v === 'live' || v === 'test') return v;
  throw bad('env_invalid', 'Choose Test or Live.');
}

function descriptionOf(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string')
    throw bad('description_invalid', 'The description must be text.');
  const d = v.trim();
  if (d.length > MAX_DESCRIPTION)
    throw bad(
      'description_too_long',
      `Keep the description under ${MAX_DESCRIPTION} characters.`,
    );
  return d;
}

function checkEvents(v: unknown, portal: WebhookPortal): string[] {
  if (!Array.isArray(v))
    throw bad('events_required', 'Choose at least one event.');
  const names = new Set(v.filter((x): x is string => typeof x === 'string'));
  if (!names.size) throw bad('events_required', 'Choose at least one event.');
  const catalog = eventsOf(portal).map((e) => e.name);
  const unknown = [...names].filter((n) => !catalog.includes(n));
  if (unknown.length)
    throw bad(
      'events_unknown',
      `Not an event you can subscribe to here: ${unknown.slice(0, 3).join(', ')}.`,
    );
  return catalog.filter((n) => names.has(n));
}

function metadataOf(
  portal: WebhookPortal,
  url: { shown: string; target: string },
): Record<string, string> {
  return url.shown === url.target
    ? { portal }
    : { portal, display_url: url.shown };
}

function statusOf(s: DeliveryState): DeliveryStatus {
  if (s === DeliveryState.Success) return 'delivered';
  if (s === DeliveryState.Fail) return 'failed';
  return 'pending';
}
