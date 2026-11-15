import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomBytes, randomUUID } from 'node:crypto';

import { RecordsService } from '../kyc/records.service';
import { VaultService } from '../kyc/vault.service';
import { WEBHOOK_EVENTS, type WebhookEventType } from '../webhooks/webhook-events';
import {
  CATALOG,
  catalogApp,
  EVENT_TITLES,
  type CatalogApp,
  type ConnectKind,
  type JsonSchema,
} from './catalog';
import { ComposioClient } from './composio.client';
import { providerFor } from './connectors';

/**
 * Integrations backend: everything the console's /api/integrations routes call.
 *
 * Multi-tenant by design: every connection, automation, source and run is stored and read
 * by `tenant` (the signed-in organisation), the same way webhooks are scoped. One organisation
 * never sees another's.
 *
 * Own apps (Slack, Discord, Figma, Google, Telegram, email) run here directly and free; the
 * marketing apps (Instagram, TikTok, Google Ads, LinkedIn; WhatsApp later) run through Composio
 * when its key is set. Connection secrets are encrypted at rest with OpenBao (VaultService),
 * never stored in the clear and never returned to the browser.
 */

// ---- response shapes the frontend expects (lib/console/integrations-api.ts) ----

export interface AppInfo {
  slug: string;
  name: string;
  logo: string;
  description: string;
  categories: string[];
  actions: number;
  triggers: number;
  auth: 'managed' | 'own' | 'none';
  /** Native apps only: how it is connected. `webhook_url`/`bot_token` are pasted, not OAuth. */
  connect?: ConnectKind;
}
export interface ActionInfo {
  slug: string;
  name: string;
  description: string;
  app: string;
  inputs?: JsonSchema;
}
export interface TriggerInfo {
  slug: string;
  name: string;
  description: string;
  app: string;
  config: JsonSchema;
  fields: string[];
}
export interface Connection {
  id: string;
  app: string;
  status: string;
  alias: string | null;
  created_at: string;
}
export interface Preset {
  id: string;
  title: string;
  app: string;
  action: string;
  arguments: Record<string, unknown>;
  ask: { name: string; label: string; hint: string; required?: boolean }[];
}
export type AutomationTrigger =
  | { kind: 'verisec'; events: string[] }
  | { kind: 'app'; app: string; slug: string; connection: string; config: Record<string, unknown> };
export interface AutomationAction {
  app: string;
  slug: string;
  connection: string | null;
  arguments: Record<string, unknown>;
}
export interface AutomationRun {
  id: number;
  event_id: string;
  event_type: string;
  status: 'done' | 'failed' | 'retrying';
  attempts: number;
  error: string | null;
  log_id: string | null;
  at: string;
}
export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  broken_reason: string | null;
  trigger: AutomationTrigger;
  action: AutomationAction;
  last_run: Pick<AutomationRun, 'status' | 'error' | 'at'> | null;
  created_at: string;
  updated_at: string;
}
export interface IntegrationSource {
  id: string;
  url: string;
  has_secret: boolean;
  created_at: string;
}
export interface IntegrationsOverview {
  composio: { configured: boolean };
  events: { type: string; title: string }[];
  presets: Preset[];
  sources: IntegrationSource[];
  connections: Connection[];
  automations: Automation[];
  apps: Record<string, AppInfo>;
  action_names: Record<string, string>;
}

const err = (status: number, code: string, message: string) =>
  new HttpException({ error: { code, message } }, status);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS integration_connections (
  id          text PRIMARY KEY,
  tenant      text NOT NULL,
  app         text NOT NULL,
  provider    text NOT NULL CHECK (provider IN ('native', 'composio')),
  status      text NOT NULL DEFAULT 'ACTIVE',
  alias       text,
  external_id text,
  secret      text,            -- OpenBao ciphertext; never plaintext
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_connections_tenant ON integration_connections (tenant, created_at);
CREATE TABLE IF NOT EXISTS integration_oauth_state (
  state      text PRIMARY KEY,
  tenant     text NOT NULL,
  app        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_automations (
  id         text PRIMARY KEY,
  tenant     text NOT NULL,
  name       text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  broken     text,
  trigger    json NOT NULL,
  action     json NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_automations_tenant ON integration_automations (tenant, created_at);
CREATE TABLE IF NOT EXISTS integration_runs (
  id            bigserial PRIMARY KEY,
  tenant        text NOT NULL,
  automation_id text NOT NULL,
  event_id      text NOT NULL,
  event_type    text NOT NULL,
  status        text NOT NULL,
  attempts      integer NOT NULL DEFAULT 1,
  error         text,
  log_id        text,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_runs_automation ON integration_runs (tenant, automation_id, at DESC);
CREATE TABLE IF NOT EXISTS integration_sources (
  id         text PRIMARY KEY,
  tenant     text NOT NULL,
  url        text NOT NULL,
  has_secret boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

@Injectable()
export class IntegrationsService {
  private readonly log = new Logger('Integrations');
  private readonly composio = new ComposioClient();
  private records: RecordsService | null = null;
  private vaultRef: VaultService | null = null;
  private schemaReady = false;

  constructor(private readonly moduleRef: ModuleRef) {}

  /** The canonical public origin (what the OAuth apps are registered against). */
  private origin(): string {
    return (process.env.KYC_PUBLIC_ORIGIN ?? 'https://verisec.dev').replace(/\/$/, '');
  }

  private get db(): RecordsService {
    const found =
      this.records ?? this.moduleRef.get<RecordsService>(RecordsService, { strict: false });
    this.records = found;
    return found;
  }

  private get vault(): VaultService {
    const found =
      this.vaultRef ?? this.moduleRef.get<VaultService>(VaultService, { strict: false });
    this.vaultRef = found;
    return found;
  }

  private async ensureSchema(): Promise<boolean> {
    if (this.schemaReady) return true;
    if (!this.db?.ready) return false;
    try {
      await this.db.query(SCHEMA);
      this.schemaReady = true;
      return true;
    } catch (e) {
      this.log.error(`integration tables: ${(e as Error).message}`);
      return false;
    }
  }

  // ---- catalogue ----

  private appInfo(a: CatalogApp): AppInfo {
    return {
      slug: a.slug,
      name: a.name,
      logo: '',
      description: a.description,
      categories: a.categories,
      actions: a.actions.length,
      triggers: 0,
      auth: a.auth,
      connect: a.provider === 'native' ? a.connect : undefined,
    };
  }

  private appsMap(): Record<string, AppInfo> {
    const out: Record<string, AppInfo> = {};
    for (const a of CATALOG) out[a.slug] = this.appInfo(a);
    return out;
  }

  private actionNames(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const a of CATALOG) for (const act of a.actions) out[`${a.slug}.${act.slug}`] = act.name;
    return out;
  }

  private presets(): Preset[] {
    // A few ready-made automations to start from. The customer still connects the app first.
    return [
      {
        id: 'slack-declined',
        title: 'Tell Slack when a verification is declined',
        app: 'slack',
        action: 'send_message',
        arguments: { text: 'Verification {{data.id}} was declined.' },
        ask: [{ name: 'text', label: 'Message', hint: 'Event fields: {{data.id}}, {{data.verdict}}', required: true }],
      },
      {
        id: 'sheets-approved',
        title: 'Log every approval to a Google Sheet',
        app: 'googlesheets',
        action: 'append_row',
        arguments: {},
        ask: [{ name: 'spreadsheet_id', label: 'Spreadsheet ID', hint: 'From the sheet URL', required: true }],
      },
    ];
  }

  // ---- overview ----

  async overview(tenant: string): Promise<IntegrationsOverview> {
    await this.ensureSchema();
    const [connections, automations, sources] = await Promise.all([
      this.listConnections(tenant),
      this.listAutomations(tenant),
      this.listSources(tenant),
    ]);
    return {
      composio: { configured: this.composio.configured },
      events: WEBHOOK_EVENTS.filter((e) => e.portal === 'kyc').map((e) => ({
        type: e.name,
        title: EVENT_TITLES[e.name as WebhookEventType] ?? e.name,
      })),
      presets: this.presets(),
      sources,
      connections,
      automations,
      apps: this.appsMap(),
      action_names: this.actionNames(),
    };
  }

  // ---- apps / actions ----

  apps(search?: string, _cursor?: string) {
    const q = (search ?? '').trim().toLowerCase();
    const items = CATALOG.filter(
      (a) => !q || a.name.toLowerCase().includes(q) || a.slug.includes(q),
    ).map((a) => this.appInfo(a));
    return { items, next: null as string | null, total: items.length };
  }

  app(slug: string) {
    const a = catalogApp(slug);
    if (!a) throw err(404, 'not_found', 'Unknown app.');
    const actions: ActionInfo[] = a.actions.map((act) => ({
      slug: `${a.slug}.${act.slug}`,
      name: act.name,
      description: act.description,
      app: a.slug,
      inputs: act.inputs,
    }));
    const triggers: TriggerInfo[] = [];
    return { app: this.appInfo(a), actions, triggers };
  }

  actions(slug: string, _query?: string) {
    return { items: this.app(slug).actions };
  }

  action(slug: string): ActionInfo {
    const [app, act] = slug.split('.');
    const found = this.app(app).actions.find((x) => x.slug === slug);
    if (!found) throw err(404, 'not_found', `Unknown action ${act}.`);
    return found;
  }

  // ---- connections ----

  private async listConnections(tenant: string): Promise<Connection[]> {
    if (!(await this.ensureSchema())) return [];
    const rows = await this.db.query<{
      id: string;
      app: string;
      status: string;
      alias: string | null;
      created_at: Date;
    }>(
      'SELECT id, app, status, alias, created_at FROM integration_connections WHERE tenant = $1 ORDER BY created_at DESC',
      [tenant],
    );
    return rows.map((r) => ({
      id: r.id,
      app: r.app,
      status: r.status,
      alias: r.alias,
      created_at: new Date(r.created_at).toISOString(),
    }));
  }

  /** Begin a connection: where to send the person to sign in, one click. */
  async connect(tenant: string, app: string): Promise<{ redirect_url: string; connection_id: string }> {
    await this.ensureSchema();
    const a = catalogApp(app);
    if (!a) throw err(404, 'not_found', 'Unknown app.');
    const origin = this.origin();
    const callback = `${origin}/api/integrations/callback/${a.slug}`;

    if (a.provider === 'composio') {
      if (!this.composio.configured) throw err(409, 'composio_not_configured', 'Integrations are not switched on yet.');
      const back = `${origin}/settings/notifications?connected=${a.slug}`;
      const r = await this.composio.initiateConnection(tenant, a.slug, back);
      const redirect = r.redirectUrl ?? r.redirect_url;
      const id = r.connectedAccountId ?? r.connection_id ?? randomUUID();
      if (!redirect) throw err(502, 'error', 'Could not start the connection.');
      return { redirect_url: redirect, connection_id: id };
    }

    const provider = providerFor(a.slug);
    if (!provider) throw err(400, 'error', 'This app cannot be connected yet.');
    if (!provider.configured()) throw err(409, 'not_configured', `${a.name} is not set up on this console yet.`);
    if (!provider.oauth || !provider.authorizeUrl) {
      // Telegram and the like: no OAuth. The screen collects the chat id (handled separately).
      throw err(409, 'manual_connect', `${a.name} is connected from its own screen.`);
    }
    const state = randomBytes(24).toString('base64url');
    await this.db.query(
      'INSERT INTO integration_oauth_state (state, tenant, app) VALUES ($1, $2, $3)',
      [state, tenant, a.slug],
    );
    return { redirect_url: provider.authorizeUrl(callback, state), connection_id: state };
  }

  /**
   * Connect a native app that is set up by pasting a value (no OAuth): Microsoft Teams and
   * Google Chat paste an incoming-webhook URL. The value is encrypted at rest like any secret.
   */
  async connectManual(tenant: string, app: string, value: string): Promise<{ connection_id: string; app: string }> {
    await this.ensureSchema();
    const a = catalogApp(app);
    if (!a) throw err(404, 'not_found', 'Unknown app.');
    if (a.provider !== 'native' || !a.connect || a.connect === 'oauth') {
      throw err(400, 'error', `${a.name} is not connected by pasting a value.`);
    }
    const v = value.trim();
    if (!v) throw err(400, 'error', 'Paste the value first.');
    if (a.connect === 'webhook_url' && !/^https:\/\/\S+$/i.test(v)) {
      throw err(400, 'invalid', 'That does not look like a webhook URL. It should start with https://');
    }
    const secret =
      a.connect === 'webhook_url' ? { webhook_url: v } : a.connect === 'bot_token' ? { chat_id: v } : { value: v };
    const sealed = await this.vault.seal(secret);
    if (!sealed) throw err(503, 'encryption_unavailable', 'Could not store the connection securely. Try again shortly.');
    const id = randomUUID();
    await this.db.query(
      `INSERT INTO integration_connections (id, tenant, app, provider, status, alias, secret)
       VALUES ($1, $2, $3, 'native', 'ACTIVE', $4, $5)`,
      [id, tenant, app, null, sealed],
    );
    return { connection_id: id, app };
  }

  /** The OAuth callback: exchange the code and store the connection. Returns the app slug for the redirect. */
  async completeOAuth(appSlug: string, code: string, state: string): Promise<string> {
    await this.ensureSchema();
    const rows = await this.db.query<{ tenant: string; app: string }>(
      'SELECT tenant, app FROM integration_oauth_state WHERE state = $1',
      [state],
    );
    const pending = rows[0];
    if (!pending || pending.app !== appSlug) throw err(400, 'bad_state', 'The sign-in could not be verified. Try again.');
    await this.db.query('DELETE FROM integration_oauth_state WHERE state = $1', [state]);

    const provider = providerFor(appSlug);
    if (!provider?.exchange) throw err(400, 'error', 'This app cannot be connected.');
    const callback = `${this.origin()}/api/integrations/callback/${appSlug}`;
    const result = await provider.exchange(code, callback);

    const sealed = await this.vault.seal(result.secret);
    if (!sealed) throw err(503, 'encryption_unavailable', 'Could not store the connection securely. Try again shortly.');
    await this.db.query(
      `INSERT INTO integration_connections (id, tenant, app, provider, status, alias, secret)
       VALUES ($1, $2, $3, 'native', 'ACTIVE', $4, $5)`,
      [randomUUID(), pending.tenant, appSlug, result.alias, sealed],
    );
    return appSlug;
  }

  async disconnect(tenant: string, id: string): Promise<void> {
    await this.ensureSchema();
    const rows = await this.db.query<{ provider: string; external_id: string | null }>(
      'SELECT provider, external_id FROM integration_connections WHERE tenant = $1 AND id = $2',
      [tenant, id],
    );
    const row = rows[0];
    if (!row) return;
    if (row.provider === 'composio' && row.external_id) {
      await this.composio.deleteConnection(row.external_id).catch(() => undefined);
    }
    await this.db.query('DELETE FROM integration_connections WHERE tenant = $1 AND id = $2', [tenant, id]);
  }

  // ---- sources (VeriSec webhook endpoints that feed the integrations) ----

  private async listSources(tenant: string): Promise<IntegrationSource[]> {
    if (!(await this.ensureSchema())) return [];
    const rows = await this.db.query<{ id: string; url: string; has_secret: boolean; created_at: Date }>(
      'SELECT id, url, has_secret, created_at FROM integration_sources WHERE tenant = $1 ORDER BY created_at',
      [tenant],
    );
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      has_secret: r.has_secret,
      created_at: new Date(r.created_at).toISOString(),
    }));
  }

  async createSource(tenant: string): Promise<IntegrationSource> {
    await this.ensureSchema();
    const id = randomUUID();
    const url = `${this.origin()}/api/integrations/events/${id}`;
    await this.db.query('INSERT INTO integration_sources (id, tenant, url) VALUES ($1, $2, $3)', [id, tenant, url]);
    return { id, url, has_secret: false, created_at: new Date().toISOString() };
  }

  async setSourceSecret(tenant: string, id: string, secret: string): Promise<IntegrationSource> {
    await this.ensureSchema();
    const sealed = await this.vault.seal({ secret });
    if (!sealed) throw err(503, 'encryption_unavailable', 'Could not store the secret.');
    const rows = await this.db.query<{ id: string; url: string; created_at: Date }>(
      'UPDATE integration_sources SET has_secret = true WHERE tenant = $1 AND id = $2 RETURNING id, url, created_at',
      [tenant, id],
    );
    if (!rows[0]) throw err(404, 'not_found', 'Unknown source.');
    return { id: rows[0].id, url: rows[0].url, has_secret: true, created_at: new Date(rows[0].created_at).toISOString() };
  }

  async removeSource(tenant: string, id: string): Promise<void> {
    await this.ensureSchema();
    await this.db.query('DELETE FROM integration_sources WHERE tenant = $1 AND id = $2', [tenant, id]);
  }

  // ---- automations ----

  private rowToAutomation(r: {
    id: string;
    name: string;
    enabled: boolean;
    broken: string | null;
    trigger: AutomationTrigger;
    action: AutomationAction;
    created_at: Date;
    updated_at: Date;
    last_status?: string | null;
    last_error?: string | null;
    last_at?: Date | null;
  }): Automation {
    return {
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      broken_reason: r.broken,
      trigger: r.trigger,
      action: r.action,
      last_run:
        r.last_status && r.last_at
          ? { status: r.last_status as AutomationRun['status'], error: r.last_error ?? null, at: new Date(r.last_at).toISOString() }
          : null,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    };
  }

  private async listAutomations(tenant: string): Promise<Automation[]> {
    if (!(await this.ensureSchema())) return [];
    const rows = await this.db.query<any>(
      `SELECT a.*, r.status AS last_status, r.error AS last_error, r.at AS last_at
         FROM integration_automations a
         LEFT JOIN LATERAL (
           SELECT status, error, at FROM integration_runs
            WHERE tenant = a.tenant AND automation_id = a.id ORDER BY at DESC LIMIT 1
         ) r ON true
        WHERE a.tenant = $1 ORDER BY a.created_at DESC`,
      [tenant],
    );
    return rows.map((r) => this.rowToAutomation(r));
  }

  async createAutomation(
    tenant: string,
    body: { name?: string; trigger: AutomationTrigger; action: AutomationAction },
  ): Promise<Automation> {
    await this.ensureSchema();
    if (!body?.trigger || !body?.action) throw err(400, 'invalid', 'An automation needs a trigger and an action.');
    const id = randomUUID();
    const name = (body.name ?? '').toString().slice(0, 120) || 'Automation';
    const rows = await this.db.query<any>(
      `INSERT INTO integration_automations (id, tenant, name, trigger, action)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, tenant, name, JSON.stringify(body.trigger), JSON.stringify(body.action)],
    );
    return this.rowToAutomation(rows[0]);
  }

  async updateAutomation(
    tenant: string,
    id: string,
    patch: { name?: string; enabled?: boolean; events?: string[]; arguments?: Record<string, unknown> },
  ): Promise<Automation> {
    await this.ensureSchema();
    const rows = await this.db.query<any>('SELECT * FROM integration_automations WHERE tenant = $1 AND id = $2', [tenant, id]);
    const row = rows[0];
    if (!row) throw err(404, 'not_found', 'Unknown automation.');
    const trigger: AutomationTrigger = row.trigger;
    const action: AutomationAction = row.action;
    if (patch.events && trigger.kind === 'verisec') trigger.events = patch.events;
    if (patch.arguments) action.arguments = patch.arguments;
    const updated = await this.db.query<any>(
      `UPDATE integration_automations
          SET name = COALESCE($3, name),
              enabled = COALESCE($4, enabled),
              trigger = $5, action = $6, updated_at = now()
        WHERE tenant = $1 AND id = $2 RETURNING *`,
      [tenant, id, patch.name ?? null, typeof patch.enabled === 'boolean' ? patch.enabled : null, JSON.stringify(trigger), JSON.stringify(action)],
    );
    return this.rowToAutomation(updated[0]);
  }

  async removeAutomation(tenant: string, id: string): Promise<void> {
    await this.ensureSchema();
    await this.db.query('DELETE FROM integration_automations WHERE tenant = $1 AND id = $2', [tenant, id]);
  }

  async testAutomation(tenant: string, id: string): Promise<{ ok: boolean; error: string | null; log_id: string | null }> {
    await this.ensureSchema();
    const rows = await this.db.query<any>('SELECT * FROM integration_automations WHERE tenant = $1 AND id = $2', [tenant, id]);
    const row = rows[0];
    if (!row) throw err(404, 'not_found', 'Unknown automation.');
    const sample = { id: 'test_' + randomBytes(4).toString('hex'), verdict: 'approved', status: 'completed' };
    const res = await this.runAction(tenant, row.action as AutomationAction, 'webhook.test', sample);
    await this.logRun(tenant, id, 'test_' + sample.id, 'webhook.test', res.ok ? 'done' : 'failed', res.error);
    return { ok: res.ok, error: res.error, log_id: null };
  }

  async runs(tenant: string, id: string, limit = 25): Promise<{ runs: AutomationRun[] }> {
    await this.ensureSchema();
    const rows = await this.db.query<any>(
      `SELECT id, event_id, event_type, status, attempts, error, log_id, at
         FROM integration_runs WHERE tenant = $1 AND automation_id = $2 ORDER BY at DESC LIMIT $3`,
      [tenant, id, Math.min(Math.max(1, limit), 100)],
    );
    return {
      runs: rows.map((r) => ({
        id: Number(r.id),
        event_id: r.event_id,
        event_type: r.event_type,
        status: r.status,
        attempts: r.attempts,
        error: r.error,
        log_id: r.log_id,
        at: new Date(r.at).toISOString(),
      })),
    };
  }

  // ---- the runner: on a VeriSec event, run the matching automations ----

  /** session key -> the tail of its in-flight delivery chain, so one verification's events run in order. */
  private readonly eventChains = new Map<string, Promise<unknown>>();

  /** Called when a VeriSec event happens for an organisation (wired from the KYC side). */
  async onEvent(tenant: string, type: WebhookEventType, data: Record<string, unknown>, eventId?: string): Promise<void> {
    if (!(await this.ensureSchema())) return;
    const id = eventId ?? randomUUID();
    // Deliver a single verification's events one at a time. Several fire almost together (the decision emits
    // `verification.completed` and then the verdict), and for a sheet that keeps ONE row per verification they
    // must not run at once — otherwise each sees no existing row and appends its own, giving duplicate lines.
    const key = `${tenant}:${id}`;
    const prior = this.eventChains.get(key) ?? Promise.resolve();
    const run = prior.catch(() => undefined).then(async () => {
      const rows = await this.db.query<any>(
        `SELECT * FROM integration_automations WHERE tenant = $1 AND enabled = true`,
        [tenant],
      );
      for (const row of rows) {
        const trigger = row.trigger as AutomationTrigger;
        if (trigger.kind !== 'verisec' || !trigger.events.includes(type)) continue;
        const res = await this.runAction(tenant, row.action as AutomationAction, type, data);
        await this.logRun(tenant, row.id, id, type, res.ok ? 'done' : 'failed', res.error);
      }
    });
    this.eventChains.set(key, run);
    void run.finally(() => {
      if (this.eventChains.get(key) === run) this.eventChains.delete(key);
    });
    await run;
  }

  private async runAction(
    tenant: string,
    action: AutomationAction,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<{ ok: boolean; error: string | null }> {
    const app = catalogApp(action.app);
    if (!app) return { ok: false, error: 'unknown_app' };
    const input = this.fillTemplate(action.arguments ?? {}, eventType, data);
    // Give native connectors the event itself, so they can build a sensible default (a file name,
    // a summary) when the automation didn't spell one out. Ignored by apps that don't need it.
    (input as Record<string, unknown>).__event = data;
    (input as Record<string, unknown>).__event_type = eventType;

    if (app.provider === 'composio') {
      if (!this.composio.configured) return { ok: false, error: 'composio_not_configured' };
      if (!action.connection) return { ok: false, error: 'not_connected' };
      const rows = await this.db.query<{ external_id: string | null }>(
        'SELECT external_id FROM integration_connections WHERE tenant = $1 AND id = $2',
        [tenant, action.connection],
      );
      const ext = rows[0]?.external_id;
      if (!ext) return { ok: false, error: 'not_connected' };
      try {
        const r = await this.composio.executeAction(ext, action.slug, input);
        return { ok: r.successful, error: r.error };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }

    const provider = providerFor(action.app);
    if (!provider) return { ok: false, error: 'no_provider' };
    const rows = await this.db.query<{ secret: string | null }>(
      'SELECT secret FROM integration_connections WHERE tenant = $1 AND id = $2',
      [tenant, action.connection ?? ''],
    );
    const sealed = rows[0]?.secret;
    const secret = sealed ? await this.vault.open<Record<string, unknown>>(sealed) : null;
    if (!secret) return { ok: false, error: 'not_connected' };
    const actionSlug = action.slug.includes('.') ? action.slug.split('.')[1] : action.slug;
    try {
      const r = await provider.send(actionSlug, secret, input);
      return { ok: r.ok, error: r.error };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Replace {{event.type}} and {{data.<field>}} in every string argument. */
  private fillTemplate(
    args: Record<string, unknown>,
    eventType: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const sub = (s: string) =>
      s.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path: string) => {
        if (path === 'event.type') return eventType;
        if (path.startsWith('data.')) {
          const v = data[path.slice(5)];
          return v === undefined || v === null ? '' : String(v);
        }
        return '';
      });
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) out[k] = typeof v === 'string' ? sub(v) : v;
    return out;
  }

  private async logRun(
    tenant: string,
    automationId: string,
    eventId: string,
    eventType: string,
    status: 'done' | 'failed' | 'retrying',
    error: string | null,
  ): Promise<void> {
    await this.db
      .query(
        `INSERT INTO integration_runs (tenant, automation_id, event_id, event_type, status, error)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenant, automationId, eventId, eventType, status, error],
      )
      .catch(() => undefined);
  }
}
