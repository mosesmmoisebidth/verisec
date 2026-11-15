/**
 * Browser client for the two scanning services.
 *
 * The MICR API and the Card API are SEPARATE services with separate base
 * URLs. Both are read from the runtime config (`public/config.js`), so a
 * deploy points the portal at them without a rebuild:
 *
 *   window.__RECOG_CONFIG__.micrApiBase = "https://micr.example.com"
 *   window.__RECOG_CONFIG__.cardApiBase = "https://card.example.com"
 *
 * With neither set and the portal running on localhost, it talks to the
 * services' local dev ports (8061, 8062). Anywhere else, unset means the
 * service is treated as unreachable and each screen says so.
 */

import type {
  BinRecord,
  CardResponse,
  CardStats,
  ChequeDeepRead,
  ChequeResponse,
  ChequeStats,
  FinProduct,
  ListResponse,
  LogEntry,
  ScanResponse,
  ScanSource,
} from "./types";
import type { ApiEnv } from "@/lib/console/types";

export type FinService = "micr" | "card";

const LOCAL_PORT: Record<FinService, number> = { micr: 8061, card: 8062 };
const CONFIG_KEY: Record<FinService, string> = { micr: "micrApiBase", card: "cardApiBase" };

export function serviceBase(service: FinService): string | null {
  if (typeof window === "undefined") return null;
  const cfg = (window as unknown as { __RECOG_CONFIG__?: Record<string, unknown> }).__RECOG_CONFIG__;
  const configured = cfg?.[CONFIG_KEY[service]];
  if (typeof configured === "string" && configured.trim()) return configured.trim().replace(/\/+$/, "");
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return `http://127.0.0.1:${LOCAL_PORT[service]}`;
  return null;
}

export function serviceOf(product: FinProduct): FinService {
  return product === "cheque" ? "micr" : "card";
}

/** A stored deep read as its MICR record (same id, image and status), so history
 * lists and the detail view treat every cheque scan the same way. */
function asChequeRecord(r: ChequeResponse | ChequeDeepRead): ChequeResponse {
  return r.object === "cheque_read" ? r.micr : r;
}

/** Scan ids carry their service: `chq_…` from MICR, `crd_…` from Card. */
export function productOfId(id: string): FinProduct | null {
  if (id.startsWith("chq_")) return "cheque";
  if (id.startsWith("crd_")) return "card";
  return null;
}

export class FinApiError extends Error {
  constructor(
    /** `offline`: not configured or no answer. `http`: the service said no. */
    readonly kind: "offline" | "http",
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FinApiError";
  }
}

async function call<T>(service: FinService, path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const base = serviceBase(service);
  if (!base) {
    throw new FinApiError("offline", 0, "not_configured", "This service isn't configured for this site.");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, signal: ctrl.signal });
  } catch {
    throw new FinApiError("offline", 0, "unreachable", "The service didn't respond.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string } } | null = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    // The sign-in check answers 401 in its own shape; say what happened, not the code.
    if (res.status === 401) {
      throw new FinApiError("http", 401, "unauthorized", "Your session has ended. Sign in again to continue.");
    }
    throw new FinApiError(
      "http",
      res.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `The request failed (${res.status}).`,
    );
  }
  return (await res.json()) as T;
}

interface ReadOptions {
  source?: ScanSource;
  env?: ApiEnv;
}

function headers(opts: ReadOptions): HeadersInit {
  return { "X-VeriSec-Source": opts.source ?? "playground", "X-VeriSec-Env": opts.env ?? "test" };
}

/** A read spawns the engine, so it gets a long timeout. */
const READ_TIMEOUT = 120_000;

let lastWarmAt = 0;

export const finApi = {
  readCheque(image: Blob, name: string, opts: ReadOptions & { format?: "auto" | "e13b" | "cmc7" } = {}) {
    const form = new FormData();
    form.append("image", image, name);
    form.append("format", opts.format ?? "auto");
    return call<ChequeResponse>("micr", "/v2/cheques/micr", { method: "POST", body: form, headers: headers(opts) }, READ_TIMEOUT);
  },

  /** Deep read: MICR + the Qwen vision reader + bank resolved. Slower (PP-OCR +
   * an LLM call), so it gets a longer timeout than a plain MICR read. */
  readChequeDeep(image: Blob, name: string, opts: ReadOptions & { format?: "auto" | "e13b" | "cmc7" } = {}) {
    const form = new FormData();
    form.append("image", image, name);
    form.append("format", opts.format ?? "auto");
    return call<ChequeDeepRead>("micr", "/v2/cheques/read", { method: "POST", body: form, headers: headers(opts) }, 300_000);
  },

  /** Wake both engines ahead of a read so it overlaps the user picking a file: the
   * deep-read model's connection, and (after an idle spell) each engine and its
   * lookups back into memory. Returns at once; failures are ignored (the read still
   * works, it just starts cold). One shared throttle for every caller (portal
   * shell, playground), so navigating between pages doesn't send a ping per page. */
  warmChequeDeep(minGapMs = 30_000) {
    if (Date.now() - lastWarmAt < minGapMs) return Promise.resolve(null);
    lastWarmAt = Date.now();
    void call<{ ok: boolean; state: string }>("card", "/v2/cards/warm", { method: "POST" }, 5_000).catch(() => null);
    return call<{ ok: boolean; state: string }>("micr", "/v2/cheques/warm", { method: "POST" }, 5_000).catch(() => null);
  },

  readCard(image: Blob, name: string, opts: ReadOptions = {}) {
    const form = new FormData();
    form.append("image", image, name);
    return call<CardResponse>("card", "/v2/cards/read", { method: "POST", body: form, headers: headers(opts) }, READ_TIMEOUT);
  },

  listCheques(limit = 200) {
    return call<ListResponse<ChequeResponse | ChequeDeepRead>>("micr", `/v2/cheques?limit=${limit}`).then(
      (list): ListResponse<ChequeResponse> => ({ ...list, data: list.data.map(asChequeRecord) }),
    );
  },

  listCards(limit = 200) {
    return call<ListResponse<CardResponse>>("card", `/v2/cards?limit=${limit}`);
  },

  getScan(id: string): Promise<ScanResponse> {
    const product = productOfId(id);
    if (product === "cheque")
      return call<ChequeResponse | ChequeDeepRead>("micr", `/v2/cheques/${encodeURIComponent(id)}`).then(asChequeRecord);
    if (product === "card") return call<CardResponse>("card", `/v2/cards/${encodeURIComponent(id)}`);
    return Promise.reject(new FinApiError("http", 404, "not_found", "That isn't a scan id."));
  },

  chequeStats(days: number) {
    return call<ChequeStats>("micr", `/v2/cheques/stats?days=${days}`);
  },

  cardStats(days: number) {
    return call<CardStats>("card", `/v2/cards/stats?days=${days}`);
  },

  bin(digits: string) {
    return call<BinRecord>("card", `/v2/bin/${encodeURIComponent(digits)}`);
  },

  health(service: FinService) {
    return call<{ status: string; engine: string; bins?: number }>(service, "/health", {}, 5_000);
  },

  logs(service: FinService, limit = 50) {
    return call<{ data: LogEntry[] }>(service, `/v2/logs?limit=${limit}`);
  },

  /** Absolute URL of a cheque's stored image, or null when unreachable. */
  chequeImageUrl(r: ChequeResponse): string | null {
    const base = serviceBase("micr");
    return base ? `${base}${r.image.url}` : null;
  },
};

/** Newest first, across both services. */
export function byNewest(a: ScanResponse, b: ScanResponse): number {
  return b.created_at.localeCompare(a.created_at);
}
