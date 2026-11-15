/**
 * API keys, from the browser to the console (/api/keys), which relays to the key service beside the API gateway.
 * Every rule is enforced there; this module only carries requests and the service's answers. A secret appears in
 * exactly two answers (create and rotate) and is never stored here.
 */

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type KeyEnv = "test" | "live";
export type KeyStatus = "active" | "revoked" | "expired";

export interface KeyRow {
  id: string;
  name: string;
  /** Masked by the service: prefix + last four. */
  key: string;
  env: KeyEnv;
  products: string[];
  permissions: string[];
  /** The preset's name, or "Custom, N permissions". */
  scope: string;
  rate_per_min: number;
  ip_allow: string[];
  expires_at: string | null;
  spend_cap: number | null;
  created_at: string;
  created_by: string;
  last_used_at: string | null;
  status: KeyStatus;
  revoked_at: string | null;
  /** While a rotation's grace window runs, the previous secret still works until this time. */
  rotating_until: string | null;
}

export interface CatalogPermission {
  id: string;
  section: string;
  label: string;
  sensitive: boolean;
  soon: boolean;
  /** Whether the signed-in person's role may grant it. */
  allowed: boolean;
}

export interface KeysCatalog {
  role: string;
  can_manage: boolean;
  environments: { id: KeyEnv; name: string; available: boolean; reason: string | null }[];
  products: { id: string; name: string; available: boolean; reason: string | null }[];
  sections: { id: string; name: string }[];
  permissions: CatalogPermission[];
  presets: { id: string; name: string; permissions: string[] }[];
  rate: { min: number; max: number; default: number; options: number[] };
  grace_hours: number[];
  max_ips: number;
  spend_cap_note: string;
  /** Every product API with its price per call (millionths of a credit) and the one permission it needs. */
  apis?: { id: string; method: string; path: string; product: string; permission: string; price: number; label: string; dynamic: boolean }[];
}

export interface KeyEvent {
  key_id: string | null;
  actor: string;
  action: string;
  detail: Record<string, unknown>;
  at: string;
}

export interface KeyInput {
  name?: string;
  env?: KeyEnv;
  products?: string[];
  permissions?: string[];
  rate_per_min?: number;
  ip_allow?: string[];
  expires_at?: string | null;
  spend_cap?: number | null;
}

export class KeysError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Whether two-factor sign-in is set up on the account (with code "mfa_required"). */
    readonly hasTwoFactor?: boolean,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API}/api/keys${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new KeysError(0, "unreachable", "The console could not be reached. Check your connection and try again.");
  }
  const data = (await r.json().catch(() => null)) as (T & { code?: string; message?: string | string[]; hasTwoFactor?: boolean }) | null;
  if (!r.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
    throw new KeysError(r.status, data?.code ?? (r.status === 401 ? "unauthorized" : "error"), message || "Something went wrong. Try again.", data?.hasTwoFactor);
  }
  return data as T;
}

/** One call made with a key (or a Playground run on its behalf), as the gateway saw it. */
export type KeyCall = { key_id: string; source: "key" | "playground"; method: string; path: string; status: number; ms: number; at: string };
export type KeyCallsPage = { total: number; page: number; size: number; calls: KeyCall[] };

/** Confirm two-factor sign-in on this session with the authenticator's code (no signing out). */
export async function stepUpTwoFactor(code: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const r = await fetch(`${API}/api/auth/mfa/step-up`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (r.ok) return { ok: true };
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: typeof j?.message === "string" ? j.message : "That code didn't work. Try again." };
  } catch {
    return { ok: false, message: "The console could not be reached. Check your connection and try again." };
  }
}

export const keysApi = {
  catalog: () => call<KeysCatalog>("GET", "/catalog"),
  list: () => call<{ keys: KeyRow[] }>("GET", ""),
  create: (input: KeyInput) => call<{ key: KeyRow; secret: string }>("POST", "", input),
  edit: (id: string, input: KeyInput) => call<{ key: KeyRow }>("PATCH", `/${id}`, input),
  rotate: (id: string, graceHours: number) => call<{ key: KeyRow; secret: string }>("POST", `/${id}/rotate`, { grace_hours: graceHours }),
  revoke: (id: string) => call<{ key: KeyRow }>("POST", `/${id}/revoke`),
  events: (id?: string) => call<{ events: KeyEvent[] }>("GET", `/events${id ? `?key_id=${encodeURIComponent(id)}` : ""}`),
  logs: (q: { page?: number; size?: number; keyId?: string; outcome?: "ok" | "error" }) => {
    const p = new URLSearchParams();
    if (q.page) p.set("page", String(q.page));
    if (q.size) p.set("size", String(q.size));
    if (q.keyId) p.set("key_id", q.keyId);
    if (q.outcome) p.set("outcome", q.outcome);
    return call<KeyCallsPage>("GET", `/logs?${p.toString()}`);
  },
};
