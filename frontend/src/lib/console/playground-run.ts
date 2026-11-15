/**
 * Client side of the API Playground: it reads the live catalog from the Console API, encrypts every image in the
 * browser before it is sent (JWE, the private half of the key never leaves the processing side), and runs an endpoint.
 *
 * The operator's browser never sends a plaintext image. Each image field (a single face, a gallery of faces, a list
 * of frames, a document) is encrypted here, and the Console turns every one into an opaque vault token before the API
 * is called, the same end to end path the KYC flow uses.
 */
import { CompactEncrypt, importJWK, type JWK } from "jose";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type ParamKind = "image" | "images" | "string" | "number" | "integer" | "boolean" | "enum" | "string[]" | "json" | "rgb";
export type Tier = "major" | "minor" | "workflow";
export type UploadKind = "face" | "id-front" | "id-back" | "passport" | "document";
export type CheckDef = { name: string; group: string; range: [number, number] };

/** A list field (a gallery or a sequence of frames): how each item is shaped. */
export type ListSpec = {
  imageKey?: string; // where the image goes in each item (absent = the item is the image itself)
  idKey?: string;
  labelKey?: string;
  indexKey?: string;
  fields?: Param[]; // extra per-item fields
  min: number;
  max: number;
  itemLabel: string;
};

export type Param = {
  name: string;
  kind: ParamKind;
  label: string;
  required?: boolean;
  note?: string;
  path?: string;
  choices?: { value: string; label: string }[];
  default?: unknown;
  min?: number;
  max?: number;
  widget?: "chips" | "checks" | "lines";
  /** What an empty input shows. */
  placeholder?: string;
  /** `lines` holding a machine-readable zone (upper case, `<` fillers, fixed line lengths). */
  format?: "mrz";
  checks?: CheckDef[];
  upload?: UploadKind;
  token?: boolean;
  list?: ListSpec;
};

export type DocField = { field: string; note: string };
export type DocStatus = { code: string; label: string; when: string };
export type DocFailure = { code: string; message: string; fix: string };
export type EndpointDocs = {
  what: string;
  steps: string[];
  returns: DocField[];
  statuses: DocStatus[];
  failures: DocFailure[];
  limits: string[];
  envelope: string;
  notes: string[];
};

export type PgEndpoint = {
  id: string;
  name: string;
  method: string;
  path: string;
  summary: string;
  tier: Tier;
  params: Param[];
  /** Where images sit in the request body: "image", "frames[]", "gallery[].image", "images[].data". */
  images: string[];
  /** A real example response, in the API's own envelope. */
  example?: unknown;
  /** The how-to guide for this endpoint. */
  docs?: EndpointDocs | null;
};
export type PgGroup = { group: string; endpoints: PgEndpoint[] };

export async function fetchCatalog(): Promise<PgGroup[]> {
  const r = await fetch(`${API}/api/playground/catalog`, { credentials: "include", cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 401 ? "Sign in to the console to use the Playground." : "The Playground is unavailable right now.");
  return ((await r.json()) as { groups: PgGroup[] }).groups;
}

export type RunResult = {
  ok: boolean;
  data: unknown;
  error: unknown;
  warnings: string[];
  latency_ms: number;
  /** Time the images took to reach the vault, before the API call itself. */
  upload_ms?: number;
  httpStatus: number;
  request_id?: string;
};

export async function runEndpoint(id: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>, keyId?: string | null): Promise<RunResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/api/playground/run`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(extraHeaders ?? {}) },
      body: JSON.stringify({ id, body, keyId: keyId ?? undefined }),
    });
  } catch {
    return { ok: false, data: null, error: { message: "The Console API is unreachable. Check that it is running." }, warnings: [], latency_ms: 0, httpStatus: 0 };
  }
  const json = (await res.json().catch(() => null)) as (RunResult & { message?: string; status?: number }) | null;
  if (!res.ok) {
    return { ok: false, data: null, error: json ?? { message: `HTTP ${res.status}` }, warnings: [], latency_ms: json?.latency_ms ?? 0, httpStatus: res.status };
  }
  return {
    ok: !!json?.ok,
    data: json?.data ?? null,
    error: json?.error ?? null,
    warnings: Array.isArray(json?.warnings) ? json!.warnings : [],
    latency_ms: json?.latency_ms ?? 0,
    upload_ms: json?.upload_ms,
    // a run made through the gateway reports the gateway's status (402 no credits, 403 not allowed, 429 too many...)
    httpStatus: typeof json?.status === "number" && json.status > 0 ? json.status : res.status,
    request_id: json?.request_id,
  };
}

/** Pretty byte size for the response meta. */
export function byteSize(obj: unknown): string {
  const n = new Blob([JSON.stringify(obj ?? null)]).size;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ---------------------------------------------------------------- browser-side encryption -- */

let keyCache: { p: Promise<{ key: CryptoKey; kid: string }>; at: number } | null = null;
function uploadKey() {
  if (keyCache && Date.now() - keyCache.at < 5 * 60_000) return keyCache.p;
  const p = (async () => {
    const r = await fetch(`${API}/api/playground/upload-key`, { credentials: "include", cache: "no-store" });
    if (!r.ok) throw new Error("We can't accept images right now. Please try again.");
    const jwk = (((await r.json()) as { keys: JWK[] }).keys ?? []).find((k) => k.alg === "RSA-OAEP-256" && k.kty === "RSA");
    if (!jwk?.kid) throw new Error("We can't accept images right now. Please try again.");
    return { key: (await importJWK(jwk, "RSA-OAEP-256")) as CryptoKey, kid: jwk.kid };
  })();
  keyCache = { p, at: Date.now() };
  p.catch(() => {
    keyCache = null;
  });
  return p;
}

/** Encrypt one image file in the browser to a compact JWE (RSA-OAEP-256 key wrap, AES-256-GCM content). */
export async function encryptImage(file: File): Promise<string> {
  const { key, kid } = await uploadKey();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return new CompactEncrypt(bytes)
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid, cty: file.type || "application/octet-stream" })
    .encrypt(key);
}
