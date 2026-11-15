/**
 * Running a Financial API from the Playground, and showing the request three
 * ways (the HTTP message, its schema, and client code). A photo travels as a
 * multipart upload, typed checks as a JSON body, lookups in the URL, exactly as
 * a client's own code sends them.
 */

import { serviceBase } from "@/lib/finance/api";
import { API_HOST } from "@/lib/finance/content";
import type { FinEndpoint } from "@/lib/finance/playground-catalog";

export type FinSnippetLang = "curl" | "python" | "javascript";
export const FIN_SNIPPET_LANGS: { id: FinSnippetLang; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
];

/** What the console holds for one endpoint: typed values and the picked photo. */
export interface FinFormState {
  values: Record<string, string>;
  file: File | null;
}

export type HeaderRow = { name: string; value: string; on: boolean };

export interface FinOutcome {
  ok: boolean;
  http: number;
  latencyMs: number;
  size: string;
  payload: unknown;
}

export interface FinRequest {
  method: string;
  url: string;
  path: string;
  headers: [string, string][];
  /** The body as text: multipart parts, a JSON document, or empty for GET. */
  text: string;
  at: string | null;
}

const BOUNDARY = "----VeriSecBoundary";

export function initialState(ep: FinEndpoint): FinFormState {
  const values: Record<string, string> = {};
  for (const p of ep.params) if (p.kind !== "image") values[p.name] = p.default === undefined ? "" : String(p.default);
  return { values, file: null };
}

/** The non-image parameters that carry a value, in catalog order. */
function filled(ep: FinEndpoint, state: FinFormState): [string, string][] {
  return ep.params
    .filter((p) => p.kind !== "image" && p.name !== "digits")
    .map((p) => [p.name, (state.values[p.name] ?? "").trim()] as [string, string])
    .filter(([, v]) => v !== "");
}

/** The path with its URL parameter filled in, and the query string for a lookup. */
export function pathAndQuery(ep: FinEndpoint, state: FinFormState): string {
  const path = ep.path.replace("{digits}", encodeURIComponent((state.values.digits ?? "").trim() || "{digits}"));
  if (ep.body !== "query") return path;
  const q = new URLSearchParams(filled(ep, state)).toString();
  return q ? `${path}?${q}` : path;
}

function fileLabel(ep: FinEndpoint, file: File | null): { name: string; type: string; size: string } {
  const fallback = ep.group === "Credit Card" ? "card.jpg" : "cheque.jpg";
  if (!file) return { name: fallback, type: "image/jpeg", size: "image bytes" };
  const kb = Math.max(1, Math.round(file.size / 1024));
  return { name: file.name || fallback, type: file.type || "image/jpeg", size: `${kb} KB of image` };
}

export function jsonBody(ep: FinEndpoint, state: FinFormState): Record<string, string> {
  return Object.fromEntries(filled(ep, state));
}

/** The request as it goes over the wire, for the Request panel. */
export function requestFor(ep: FinEndpoint, state: FinFormState, extra: HeaderRow[], at: string | null): FinRequest {
  const path = pathAndQuery(ep, state);
  const headers: [string, string][] = [
    ["Host", API_HOST.replace(/^https?:\/\//, "")],
    ["Authorization", "Bearer YOUR_API_KEY"],
  ];
  let text = "";
  if (ep.body === "multipart") {
    headers.push(["Content-Type", `multipart/form-data; boundary=${BOUNDARY}`]);
    const f = fileLabel(ep, state.file);
    const parts = [`--${BOUNDARY}`, `Content-Disposition: form-data; name="image"; filename="${f.name}"`, `Content-Type: ${f.type}`, "", `<${f.size}>`];
    for (const [k, v] of filled(ep, state)) parts.push(`--${BOUNDARY}`, `Content-Disposition: form-data; name="${k}"`, "", v);
    parts.push(`--${BOUNDARY}--`);
    text = parts.join("\n");
  } else if (ep.body === "json") {
    headers.push(["Content-Type", "application/json"]);
    text = JSON.stringify(jsonBody(ep, state), null, 2);
  }
  headers.push(["Accept", "application/json"]);
  for (const h of extra) if (h.on && h.name.trim() && h.value.trim()) headers.push([h.name.trim(), h.value.trim()]);
  return { method: ep.method, url: `${API_HOST}${path}`, path, headers, text, at };
}

/** Every field the endpoint accepts: where it goes, its type, whether it is required, its default. */
export function requestSchema(ep: FinEndpoint): Record<string, unknown> {
  const where = { multipart: "form", json: "body", query: "query", path: "path" }[ep.body];
  const fields: Record<string, unknown> = {};
  for (const p of ep.params) {
    fields[p.name] = {
      in: p.name === "digits" ? "path" : p.kind === "image" ? "form (file)" : where,
      type: p.kind === "image" ? "JPG, PNG or BMP, up to 10 MB" : p.kind === "enum" ? (p.choices ?? []).map((c) => c.value).join(" | ") : "string",
      required: !!p.required,
      ...(p.default !== undefined && p.kind !== "image" ? { default: p.default } : {}),
      ...(p.note ? { note: p.note } : {}),
    };
  }
  return {
    method: ep.method,
    url: `${API_HOST}${ep.path}`,
    headers: {
      Authorization: { required: true, value: "Bearer YOUR_API_KEY" },
      ...(ep.body === "multipart" ? { "Content-Type": { required: true, value: "multipart/form-data" } } : {}),
      ...(ep.body === "json" ? { "Content-Type": { required: true, value: "application/json" } } : {}),
      "X-VeriSec-Env": { required: false, value: "test | live", default: "test" },
      "X-VeriSec-Source": { required: false, value: "api | sdk", default: "api" },
    },
    fields,
  };
}

/* ----------------------------------------------------------------------------
   Client code, updated as the request is edited
---------------------------------------------------------------------------- */

function py(value: string): string {
  return JSON.stringify(value);
}

export function snippetFor(lang: FinSnippetLang, ep: FinEndpoint, state: FinFormState, extra: HeaderRow[]): string {
  const path = pathAndQuery(ep, state);
  const url = `${API_HOST}${ep.body === "query" ? ep.path : path}`;
  const fields = filled(ep, state);
  const f = fileLabel(ep, state.file).name;
  const extraHeaders = extra.filter((h) => h.on && h.name.trim() && h.value.trim()).map((h) => [h.name.trim(), h.value.trim()] as [string, string]);

  if (lang === "curl") {
    const lines = [`curl ${ep.method === "GET" ? "" : `-X ${ep.method} `}"${API_HOST}${path}"`, `  -H "Authorization: Bearer YOUR_API_KEY"`];
    for (const [k, v] of extraHeaders) lines.push(`  -H "${k}: ${v}"`);
    if (ep.body === "multipart") {
      lines.push(`  -F "image=@${f}"`);
      for (const [k, v] of fields) lines.push(`  -F "${k}=${v}"`);
    } else if (ep.body === "json") {
      lines.push(`  -H "Content-Type: application/json"`, `  -d '${JSON.stringify(jsonBody(ep, state))}'`);
    }
    return lines.join(" \\\n");
  }

  if (lang === "python") {
    const headerItems = [`"Authorization": "Bearer YOUR_API_KEY"`, ...extraHeaders.map(([k, v]) => `${py(k)}: ${py(v)}`)];
    const args = [`    ${py(url)},`, `    headers={${headerItems.join(", ")}},`];
    if (ep.body === "multipart") {
      args.push(`    files={"image": open(${py(f)}, "rb")},`);
      if (fields.length) args.push(`    data={${fields.map(([k, v]) => `${py(k)}: ${py(v)}`).join(", ")}},`);
    } else if (ep.body === "json") {
      args.push(`    json={${fields.map(([k, v]) => `${py(k)}: ${py(v)}`).join(", ")}},`);
    } else if (ep.body === "query" && fields.length) {
      args.push(`    params={${fields.map(([k, v]) => `${py(k)}: ${py(v)}`).join(", ")}},`);
    }
    args.push("    timeout=60,");
    return ["import requests", "", `res = requests.${ep.method.toLowerCase()}(`, ...args, ")", "print(res.json())"].join("\n");
  }

  const hdr = [`Authorization: "Bearer YOUR_API_KEY"`, ...extraHeaders.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)];
  if (ep.body === "multipart") {
    return [
      "const form = new FormData();",
      `form.append("image", photo); // a File or Blob: ${f}`,
      ...fields.map(([k, v]) => `form.append(${JSON.stringify(k)}, ${JSON.stringify(v)});`),
      "",
      `const res = await fetch(${JSON.stringify(url)}, {`,
      `  method: "${ep.method}",`,
      `  headers: { ${hdr.join(", ")} },`,
      "  body: form,",
      "});",
      "console.log(await res.json());",
    ].join("\n");
  }
  if (ep.body === "json") {
    return [
      `const res = await fetch(${JSON.stringify(url)}, {`,
      `  method: "${ep.method}",`,
      `  headers: { ${[...hdr, `"Content-Type": "application/json"`].join(", ")} },`,
      `  body: JSON.stringify(${JSON.stringify(jsonBody(ep, state))}),`,
      "});",
      "console.log(await res.json());",
    ].join("\n");
  }
  return [`const res = await fetch(${JSON.stringify(`${API_HOST}${path}`)}, {`, `  headers: { ${hdr.join(", ")} },`, "});", "console.log(await res.json());"].join("\n");
}

/* ----------------------------------------------------------------------------
   Sending it
---------------------------------------------------------------------------- */

function byteSize(text: string): string {
  const n = new Blob([text]).size;
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

/**
 * Where a run made as an API key goes: the public gateway on this site (`/v2/...`),
 * the same entrance as a customer's own code. Only when the portal itself reaches
 * the engines through that gateway (`.../fin-api/...`); a local setup that talks to
 * the engines directly has no gateway, so it returns null there.
 */
export function keyedBase(): string | null {
  const b = serviceBase("micr");
  const i = b ? b.indexOf("/fin-api/") : -1;
  if (!b || i < 0) return null;
  return b.slice(0, i) || (typeof window !== "undefined" ? window.location.origin : null);
}

/** Short-lived Playground tokens (10 minutes), one per key, minted by the console. */
const tokens = new Map<string, { token: string; until: number }>();

async function playgroundToken(keyId: string): Promise<string> {
  const hit = tokens.get(keyId);
  if (hit && hit.until - Date.now() > 30_000) return hit.token;
  let r: Response;
  try {
    r = await fetch(`${AUTH_API}/api/keys/${encodeURIComponent(keyId)}/playground-token`, { method: "POST", credentials: "include", cache: "no-store" });
  } catch {
    throw new Error("The console could not be reached. Check your connection and try again.");
  }
  const j = (await r.json().catch(() => null)) as { token?: string; expires_at?: string; message?: string | string[] } | null;
  if (!r.ok || !j?.token) {
    const m = Array.isArray(j?.message) ? j?.message.join(" ") : j?.message;
    throw new Error(m || "This key couldn't be used for a run. Try again, or choose another key.");
  }
  tokens.set(keyId, { token: j.token, until: Date.parse(j.expires_at ?? "") || Date.now() + 9 * 60_000 });
  return j.token;
}

/**
 * Runs the endpoint, marked as a Playground call. With a key (on a site that has the
 * gateway) it goes through the public entrance as that key: its permissions, rate
 * limit, IP allow-list, expiry, spend cap and credits apply. Without one it uses the
 * signed-in session, test environment.
 */
export async function runFin(ep: FinEndpoint, state: FinFormState, extra: HeaderRow[], key?: { id: string; env: string } | null): Promise<FinOutcome> {
  const keyed = key ? keyedBase() : null;
  const base = keyed ?? serviceBase(ep.service);
  if (!base) throw new Error("The service isn't reachable from this page.");
  const headers: Record<string, string> = { Accept: "application/json", "X-VeriSec-Source": "playground", "X-VeriSec-Env": key?.env === "live" ? "live" : "test" };
  if (keyed && key) headers.Authorization = `Bearer ${await playgroundToken(key.id)}`;
  for (const h of extra) if (h.on && h.name.trim() && h.value.trim()) headers[h.name.trim()] = h.value.trim();
  const init: RequestInit = { method: ep.method, headers };
  if (ep.body === "multipart") {
    const form = new FormData();
    if (state.file) form.append("image", state.file, state.file.name);
    for (const [k, v] of filled(ep, state)) form.append(k, v);
    init.body = form;
  } else if (ep.body === "json") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(jsonBody(ep, state));
  }
  const started = performance.now();
  const res = await fetch(`${base}${pathAndQuery(ep, state)}`, init);
  const text = await res.text();
  const latencyMs = performance.now() - started;
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    /* not JSON: shown as text */
  }
  return { ok: res.ok, http: res.status, latencyMs, size: byteSize(text), payload };
}
