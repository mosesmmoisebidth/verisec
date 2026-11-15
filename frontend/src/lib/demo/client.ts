/**
 * Client side of the public demo playground. It reads the demo menu from the Console API, loads the
 * Fingerprint device agent (so each run carries a one-time requestId the server verifies), encrypts
 * identity images in the browser before they are sent, and runs one demo API.
 *
 * Nothing here decides the limit: the Console gate does, keyed to the verified device. The browser
 * only sends a fresh requestId; the server reads the real device id from Fingerprint's servers.
 */
import { CompactEncrypt, importJWK, type JWK } from "jose";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type DemoSample = { src: string; label: string };
export type DemoProduct = {
  id: string;
  label: string;
  blurb: string;
  encrypted: boolean;
  hasBack: boolean;
  /** true: this check compares two photos of the same kind, both required. */
  pair?: boolean;
  /** true: runs on this check do not use the free requests (ALPR / ANPR). */
  unlimited?: boolean;
  samples: DemoSample[];
};
export type DemoConfig = {
  fingerprint: { key: string; region: string } | null;
  turnstile: boolean;
  /** Free runs per device, shared across every check. */
  limit: number;
  products: DemoProduct[];
};

export async function fetchDemoConfig(): Promise<DemoConfig> {
  const r = await fetch(`${API}/api/demo/config`, { cache: "no-store" });
  if (!r.ok) throw new Error("The demo is unavailable right now. Please try again.");
  return (await r.json()) as DemoConfig;
}

export type Tone = "ok" | "warn" | "bad" | "idle";

/** The server's clean answer for one check: a few fields with confidence, and what is locked. */
export type Curated = {
  check: string;
  status: { label: string; tone: Tone };
  headline: { label: string; value: string; tone?: Tone }[];
  fields: { label: string; value: string; confidence?: number; verified?: boolean }[];
  locked: string[];
  portrait?: string;
  /** ALPR / ANPR only: every vehicle, nested (its plate and the plate's country; the vehicle and its make, colour, body). */
  alpr?: AlprOut;
};

type Ranked = { name: string; confidence: number };
type Place = { code: string; name: string; state: string | null; confidence: number };
export type AlprOut = {
  image: { width: number; height: number } | null;
  /** A JPEG of the photo, only when it was sent in a format most browsers cannot show (HEIC / HEIF). */
  preview?: string;
  duration_ms: number | null;
  plates_read: number;
  vehicles_found: number;
  vehicles: {
    id: number;
    plate: {
      text: string;
      confidence: number | null;
      detection_confidence: number | null;
      characters: { char: string; confidence: number }[];
      /** 4 corners [x1,y1, x2,y2, x3,y3, x4,y4] in image pixels. */
      box: number[] | null;
      country: (Place & { alternatives: Place[] }) | null;
    } | null;
    vehicle: {
      confidence: number | null;
      box: number[] | null;
      make_model: { make: string; model: string; year: string | null; confidence: number }[];
      color: Ranked[];
      body_style: Ranked[];
    } | null;
  }[];
};

export type DemoRun = {
  ok: boolean;
  api: string;
  data: Curated | null;
  error: { code?: string; message?: string } | null;
  warnings: string[];
  latency_ms: number;
  /** Runs this device has left on this API today. */
  remaining: number;
  /** The visit pass: sent back on later runs so the security checks run once per visit, not per run. */
  pass?: string;
};

/** A refusal the gate sends (limit reached, bot, bad human check) carries a code and message. */
export type DemoRefusal = { httpStatus: number; code?: string; message: string; remaining?: number; pass?: string };

export async function runDemo(
  api: string,
  opts: { fpRequestId: string | null; body: Record<string, unknown>; captchaToken?: string; pass?: string },
): Promise<DemoRun> {
  let res: Response;
  try {
    res = await fetch(`${API}/api/demo/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.captchaToken ? { "X-Captcha-Token": opts.captchaToken } : {}) },
      body: JSON.stringify({ api, fpRequestId: opts.fpRequestId, body: opts.body, ...(opts.pass ? { pass: opts.pass } : {}) }),
    });
  } catch {
    throw { httpStatus: 0, message: "We could not reach the demo. Check your connection and try again." } as DemoRefusal;
  }
  const json = (await res.json().catch(() => null)) as (DemoRun & { code?: string; message?: string }) | null;
  if (!res.ok) {
    throw {
      httpStatus: res.status,
      code: json?.code,
      message: json?.message ?? "The demo could not run. Please try again.",
      remaining: json?.remaining,
      pass: typeof json?.pass === "string" ? json.pass : undefined,
    } as DemoRefusal;
  }
  return {
    ok: !!json?.ok,
    api: json?.api ?? api,
    data: (json?.data as Curated | null) ?? null,
    error: json?.error ?? null,
    warnings: Array.isArray(json?.warnings) ? json!.warnings : [],
    latency_ms: json?.latency_ms ?? 0,
    remaining: typeof json?.remaining === "number" ? json.remaining : 0,
    pass: typeof json?.pass === "string" ? json.pass : undefined,
  };
}

/* ------------------------------------------------------------------ visit pass -- */

const PASS_KEY = "vs_demo_pass";

/** When a pass stops working (ms), read from its signed body; 0 when it cannot be read. */
function passExpiry(pass: string): number {
  try {
    const body = pass.slice(0, pass.indexOf("."));
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { e?: unknown };
    return typeof json.e === "number" ? json.e : 0;
  } catch {
    return 0;
  }
}

/** The visit pass for this tab, if it still has a minute or more left. */
export function loadPass(): string | null {
  try {
    const p = sessionStorage.getItem(PASS_KEY);
    return p && passExpiry(p) - Date.now() > 60_000 ? p : null;
  } catch {
    return null;
  }
}

export function savePass(pass: string | null): void {
  try {
    if (pass) sessionStorage.setItem(PASS_KEY, pass);
    else sessionStorage.removeItem(PASS_KEY);
  } catch {
    /* storage unavailable: the pass lives in memory for this page only */
  }
}

export function passUsable(pass: string | null): pass is string {
  return !!pass && passExpiry(pass) - Date.now() > 60_000;
}

export async function fetchQuota(fpRequestId: string | null): Promise<{ limit: number; remaining: number }> {
  const r = await fetch(`${API}/api/demo/quota`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fpRequestId }),
  });
  if (!r.ok) throw new Error("quota unavailable");
  return (await r.json()) as { limit: number; remaining: number };
}

/* ------------------------------------------------------------------ Fingerprint device agent -- */

let agentPromise: Promise<{ get: () => Promise<{ requestId: string }> }> | null = null;

/** Load the Fingerprint Pro agent from its CDN (no bundled dependency); cached for the page. */
async function loadAgent(key: string, region: string) {
  if (!agentPromise) {
    agentPromise = (async () => {
      // webpackIgnore keeps this a real browser import of Fingerprint's CDN, not a bundled module
      const mod = (await import(/* webpackIgnore: true */ `https://fpjscdn.net/v3/${encodeURIComponent(key)}`)) as {
        load: (opts?: { region?: string }) => Promise<{ get: () => Promise<{ requestId: string }> }>;
      };
      return mod.load(region && region !== "us" && region !== "global" ? { region } : {});
    })();
    agentPromise.catch(() => {
      agentPromise = null;
    });
  }
  return agentPromise;
}

/**
 * A fresh one-time requestId for the next run, or null when the agent cannot load (an ad blocker, no
 * key). On null the server falls back to limiting by IP, so the demo still works.
 */
export async function deviceRequestId(fp: { key: string; region: string } | null): Promise<string | null> {
  if (!fp?.key) return null;
  try {
    const agent = await loadAgent(fp.key, fp.region);
    const r = await agent.get();
    return r.requestId ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ images -- */

let keyCache: { p: Promise<{ key: CryptoKey; kid: string }>; at: number } | null = null;
function uploadKey() {
  if (keyCache && Date.now() - keyCache.at < 5 * 60_000) return keyCache.p;
  const p = (async () => {
    const r = await fetch(`${API}/api/demo/upload-key`, { cache: "no-store" });
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

/** Encrypt one image to a compact JWE for the identity engines (same path as the signed-in Playground). */
export async function encryptImage(file: Blob): Promise<string> {
  const { key, kid } = await uploadKey();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return new CompactEncrypt(bytes)
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid, cty: file.type || "application/octet-stream" })
    .encrypt(key);
}

/** A cheque or card photo goes to the reading services as base64 (a data URL). */
export function toDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/** Fetch a bundled sample image as a Blob (so a sample runs exactly like an upload). */
export async function sampleBlob(src: string): Promise<Blob> {
  const r = await fetch(src, { cache: "force-cache" });
  if (!r.ok) throw new Error("Could not load the sample image.");
  return r.blob();
}

/* ------------------------------------------------------------------ image formats -- */

/** Formats the plate reader takes as they are; anything else is converted to JPEG first. */
const AS_IS = new Set(["image/jpeg", "image/jpg", "image/png", "image/bmp"]);
const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
const formatOf = (f: File) => (f.type.split("/")[1] || f.name.split(".").pop() || "image").replace(/^x-/, "").toUpperCase();

/**
 * The upload as the plate reader wants it. JPEG, PNG and BMP pass through untouched. A newer format the browser can
 * open (WebP, AVIF, GIF, TIFF, and HEIC on Safari) is converted to JPEG right here, before anything is sent, so the
 * preview, the boxes and the engine all use the same picture. A HEIC photo the browser cannot open is sent as it is:
 * the server converts it and sends back a preview (`pending` until then).
 */
export async function toEngineImage(file: File): Promise<{ blob: Blob; name: string; note: string | null; pending: boolean }> {
  if (AS_IS.has(file.type.toLowerCase())) return { blob: file, name: file.name, note: null, pending: false };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff"; // transparent areas (PNG-like formats) become white, as in a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (blob) return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", note: `Converted from ${formatOf(file)} to JPG`, pending: false };
  } catch {
    /* the browser cannot open this format */
  }
  if (isHeic(file)) return { blob: file, name: file.name, note: "HEIC photo: converted to JPG on our server when you run it", pending: true };
  return { blob: file, name: file.name, note: null, pending: false };
}
