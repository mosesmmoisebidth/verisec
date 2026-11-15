/**
 * Integrations, from the browser to the console (/api/integrations). The console backend
 * forwards these calls to the integrations service with its own token and the signed-in
 * organisation, so nothing here can reach another organisation's apps or automations.
 *
 * The service runs on Composio, which signs people in to their apps and runs each app's
 * actions. App tokens and VeriSec signing secrets never come back out of it.
 */

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type JsonSchema = {
  type?: string | string[];
  description?: string;
  title?: string;
  default?: unknown;
  enum?: unknown[];
  examples?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
};

export interface AppInfo {
  slug: string;
  name: string;
  logo: string;
  description: string;
  categories: string[];
  actions: number;
  triggers: number;
  /** `managed`: anyone can connect it; `own`: VeriSec must set up its sign-in first; `none`: nothing to connect. */
  auth: "managed" | "own" | "none";
  /** Native apps only: how it is connected. `webhook_url`/`bot_token` are pasted, not a one-click sign-in. */
  connect?: "oauth" | "webhook_url" | "bot_token" | "service_account" | "token";
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
  /** Fields its events carry, for `{{data.<field>}}`. */
  fields: string[];
}

export interface Connection {
  id: string;
  app: string;
  status: "INITIALIZING" | "INITIATED" | "ACTIVE" | "FAILED" | "EXPIRED" | "INACTIVE" | string;
  alias: string | null;
  created_at: string;
}

export interface Preset {
  id: string;
  title: string;
  app: string;
  action: string;
  arguments: Record<string, unknown>;
  /** How the form names these fields; `required` ones must be filled in. */
  ask: { name: string; label: string; hint: string; required?: boolean }[];
}

export type AutomationTrigger =
  | { kind: "verisec"; events: string[] }
  | { kind: "app"; app: string; slug: string; connection: string; config: Record<string, unknown> };

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
  status: "done" | "failed" | "retrying";
  attempts: number;
  /** The app's or Composio's answer when it did not work. */
  error: string | null;
  log_id: string | null;
  at: string;
}

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  /** Why it was turned off by itself (the account was disconnected or expired). */
  broken_reason: string | null;
  trigger: AutomationTrigger;
  action: AutomationAction;
  last_run: Pick<AutomationRun, "status" | "error" | "at"> | null;
  created_at: string;
  updated_at: string;
}

/** Where VeriSec sends events for the integrations: one per environment, behind a webhook endpoint. */
export interface IntegrationSource {
  id: string;
  /** The URL registered as a VeriSec webhook endpoint. */
  url: string;
  has_secret: boolean;
  created_at: string;
}

export interface IntegrationsOverview {
  composio: { configured: boolean };
  /** VeriSec events an automation can start on. */
  events: { type: string; title: string }[];
  presets: Preset[];
  sources: IntegrationSource[];
  connections: Connection[];
  automations: Automation[];
  /** Name, logo and sign-in kind of every app the page shows. */
  apps: Record<string, AppInfo>;
  /** Names of the actions the automations use. */
  action_names: Record<string, string>;
}

export class IntegrationsError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API}/api/integrations${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new IntegrationsError(0, "unreachable", "The console could not be reached. Check your connection and try again.");
  }
  if (r.status === 204) return undefined as T;
  const data = (await r.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null;
  if (!r.ok) {
    throw new IntegrationsError(
      r.status,
      data?.error?.code ?? (r.status === 401 ? "unauthorized" : r.status === 404 ? "not_found" : "error"),
      r.status === 404 && !data?.error ? "Integrations are not available on this console yet." : data?.error?.message || "Something went wrong. Try again.",
    );
  }
  return data as T;
}

const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return s ? `?${s}` : "";
};
const aut = (id: string) => `/automations/${encodeURIComponent(id)}`;

export const integrationsApi = {
  overview: () => call<IntegrationsOverview>("GET", ""),

  createSource: () => call<IntegrationSource>("POST", "/sources"),
  setSourceSecret: (id: string, secret: string) => call<IntegrationSource>("PUT", `/sources/${encodeURIComponent(id)}/secret`, { secret }),
  removeSource: (id: string) => call<void>("DELETE", `/sources/${encodeURIComponent(id)}`),

  apps: (search?: string, cursor?: string) => call<{ items: AppInfo[]; next: string | null; total: number }>("GET", `/apps${q({ search, cursor })}`),
  app: (slug: string) => call<{ app: AppInfo; actions: ActionInfo[]; triggers: TriggerInfo[] }>("GET", `/apps/${encodeURIComponent(slug)}`),
  actions: (slug: string, query?: string) => call<{ items: ActionInfo[] }>("GET", `/apps/${encodeURIComponent(slug)}/actions${q({ query })}`),
  action: (slug: string) => call<ActionInfo>("GET", `/actions/${encodeURIComponent(slug)}`),

  /** Where to send the person to sign in to `app`; they come back to /integrations?connected=<app>. */
  connect: (app: string) => call<{ redirect_url: string; connection_id: string }>("POST", "/connections", { app }),
  /** Connect an app set up by pasting a value (Teams / Google Chat webhook URL). */
  connectManual: (app: string, value: string) =>
    call<{ connection_id: string; app: string }>("POST", "/connections/manual", { app, value }),
  disconnect: (id: string) => call<void>("DELETE", `/connections/${encodeURIComponent(id)}`),

  createAutomation: (body: { name?: string; trigger: AutomationTrigger; action: AutomationAction }) => call<Automation>("POST", "/automations", body),
  updateAutomation: (id: string, patch: { name?: string; enabled?: boolean; events?: string[]; arguments?: Record<string, unknown> }) =>
    call<Automation>("PATCH", aut(id), patch),
  removeAutomation: (id: string) => call<void>("DELETE", aut(id)),
  testAutomation: (id: string) => call<{ ok: boolean; error: string | null; log_id: string | null }>("POST", `${aut(id)}/test`),
  runs: (id: string, limit = 25) => call<{ runs: AutomationRun[] }>("GET", `${aut(id)}/runs?limit=${limit}`),
};
