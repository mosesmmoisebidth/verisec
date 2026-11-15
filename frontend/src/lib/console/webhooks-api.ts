/**
 * Webhooks, from the browser to the console (/api/webhooks). Every rule (https for live endpoints,
 * allowed events per portal, limits, which organisation owns what) is enforced there; this module only
 * carries requests and the console's answers.
 *
 * A signing secret appears in exactly two answers (create and rotate) and is never stored here; lists
 * carry only a hint of it.
 */

import type { DeliveryStatus, WebhookPortal } from "./types";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type WebhookEnv = "test" | "live";

export interface WebhookEndpointRow {
  id: string;
  url: string;
  description: string;
  env: WebhookEnv;
  portal: WebhookPortal;
  enabled: boolean;
  /** Subscribed event names, in catalogue order. */
  events: string[];
  /** e.g. `whsec_••••••••Ab3x`; the whole secret is never listed. */
  secret_hint: string;
  created_at: string;
  updated_at: string;
  rotated_at: string | null;
}

export interface WebhookEventType {
  name: string;
  description: string;
}

export interface WebhookDelivery {
  id: string;
  /** What Resend sends again. */
  message_id: string;
  event: string;
  status: DeliveryStatus;
  response_code: number | null;
  duration_ms: number | null;
  at: string;
  /** Sent by Resend rather than the schedule. */
  manual: boolean;
  /** Set while the event is still being retried. */
  next_attempt_at: string | null;
}

export interface NewEndpoint {
  url: string;
  env: WebhookEnv;
  portal: WebhookPortal;
  events: string[];
  description?: string;
}

export interface EndpointPatch {
  url?: string;
  description?: string;
  events?: string[];
  enabled?: boolean;
}

export class WebhooksError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API}/api/webhooks${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new WebhooksError(0, "unreachable", "The console could not be reached. Check your connection and try again.");
  }
  if (r.status === 204) return undefined as T;
  const data = (await r.json().catch(() => null)) as (T & { code?: string; message?: string | string[] }) | null;
  if (!r.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
    throw new WebhooksError(
      r.status,
      data?.code ?? (r.status === 401 ? "unauthorized" : r.status === 404 ? "not_found" : "error"),
      r.status === 404 && !data?.code ? "Webhooks are not available on this console yet." : message || "Something went wrong. Try again.",
    );
  }
  return data as T;
}

const q = (portal: WebhookPortal) => `?portal=${encodeURIComponent(portal)}`;
const ep = (id: string) => `/endpoints/${encodeURIComponent(id)}`;

export const webhooksApi = {
  eventTypes: (portal: WebhookPortal) => call<{ event_types: WebhookEventType[] }>("GET", `/event-types${q(portal)}`),
  list: (portal: WebhookPortal) => call<{ endpoints: WebhookEndpointRow[]; max_endpoints: number }>("GET", `/endpoints${q(portal)}`),
  create: (input: NewEndpoint) => call<{ endpoint: WebhookEndpointRow; secret: string }>("POST", "/endpoints", input),
  update: (id: string, patch: EndpointPatch) => call<{ endpoint: WebhookEndpointRow }>("PATCH", ep(id), patch),
  remove: (id: string) => call<void>("DELETE", ep(id)),
  rotate: (id: string) =>
    call<{ endpoint: WebhookEndpointRow; secret: string; previous_secret_valid_until: string }>("POST", `${ep(id)}/rotate`),
  test: (id: string) => call<{ sent: boolean; message_id: string }>("POST", `${ep(id)}/test`),
  deliveries: (id: string, limit = 25) => call<{ deliveries: WebhookDelivery[] }>("GET", `${ep(id)}/deliveries?limit=${limit}`),
  resend: (id: string, messageId: string) =>
    call<{ resent: boolean }>("POST", `${ep(id)}/deliveries/${encodeURIComponent(messageId)}/resend`),
};
