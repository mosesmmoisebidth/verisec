import { Logger } from '@nestjs/common';

/**
 * A thin client for Composio, used only for the apps we do not run ourselves
 * (Instagram, TikTok, Google Ads, LinkedIn; WhatsApp later). Composio has already been
 * approved by those platforms, so a customer connects their own account in one click
 * through it; we never register or get reviewed by each platform.
 *
 * Configured by one environment key, COMPOSIO_API_KEY, shared by every organisation.
 * Without it `configured` is false and the screen shows "not switched on yet": the own
 * connectors (Slack, Discord, Figma, Google, Telegram, email) still work.
 *
 * Each organisation is a Composio "entity" (entityId = the VeriSec org id), so one
 * organisation never sees another's connected accounts.
 */

const BASE = (process.env.COMPOSIO_BASE_URL ?? 'https://backend.composio.dev').replace(/\/$/, '');

export interface ComposioConnection {
  id: string;
  app: string;
  status: string;
  alias: string | null;
  created_at: string;
}

export class ComposioClient {
  private readonly log = new Logger('Composio');
  private readonly key: string;

  constructor() {
    this.key = process.env.COMPOSIO_API_KEY ?? '';
  }

  get configured(): boolean {
    return !!this.key;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.key) throw new Error('composio_not_configured');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          'x-api-key': this.key,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.log.warn(`${method} ${path}: HTTP ${res.status} ${detail.slice(0, 200)}`);
        throw new Error(`composio_http_${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Start a connection: where to send the person to sign in, and the pending connection id. */
  async initiateConnection(entityId: string, app: string, redirectUrl: string) {
    return this.call<{ redirectUrl?: string; redirect_url?: string; connectedAccountId?: string; connection_id?: string }>(
      'POST',
      '/api/v1/connectedAccounts',
      { entityId, appName: app, redirectUri: redirectUrl },
    );
  }

  async listConnections(entityId: string): Promise<ComposioConnection[]> {
    const r = await this.call<{ items?: Array<Record<string, unknown>> }>(
      'GET',
      `/api/v1/connectedAccounts?entityId=${encodeURIComponent(entityId)}`,
    );
    return (r.items ?? []).map((c) => ({
      id: String(c.id ?? ''),
      app: String((c.appName as string) ?? (c.appUniqueId as string) ?? ''),
      status: String(c.status ?? 'ACTIVE'),
      alias: (c.alias as string) ?? null,
      created_at: String(c.createdAt ?? new Date().toISOString()),
    }));
  }

  async deleteConnection(id: string): Promise<void> {
    await this.call('DELETE', `/api/v1/connectedAccounts/${encodeURIComponent(id)}`);
  }

  /** Run an app action for a connected account (used when an automation fires). */
  async executeAction(
    connectedAccountId: string,
    action: string,
    input: Record<string, unknown>,
  ): Promise<{ successful: boolean; error: string | null; data: unknown }> {
    const r = await this.call<{ successful?: boolean; successfull?: boolean; error?: string; data?: unknown }>(
      'POST',
      `/api/v2/actions/${encodeURIComponent(action)}/execute`,
      { connectedAccountId, input },
    );
    return {
      successful: Boolean(r.successful ?? r.successfull ?? false),
      error: r.error ?? null,
      data: r.data ?? null,
    };
  }
}
