"use client";

/**
 * ID document read, encrypted end to end.
 *
 * The front (and back) images are encrypted IN THE BROWSER with the upload public key
 * (JWE, see document-crypto.ts) and sent through this applicant's verification session
 * (DPoP) to the Console API. Nothing between here and the document engine can read them;
 * they are decrypted in memory next to the engine only.
 */
import { encryptDocument } from "./document-crypto";
import { kycApi } from "./kyc-api";

/** The engine base URL for non-document features (runtime config, no rebuild). */
interface RecogConfig {
  verisecApi?: string;
  apiBase?: string;
}

export function apiBase(): string {
  if (typeof window !== "undefined") {
    const c = (window as unknown as { __RECOG_CONFIG__?: RecogConfig }).__RECOG_CONFIG__;
    const url = c?.verisecApi || c?.apiBase;
    if (url) return String(url).replace(/\/+$/, "");
  }
  return "";
}

/** A data URL (or bare base64 JPEG) -> raw bytes + MIME type, ready to encrypt. */
export function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;,]+)?(;base64)?,/.exec(dataUrl);
  const mime = m?.[1] || "image/jpeg";
  const b64 = m ? dataUrl.slice(m[0].length) : dataUrl;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function seal(dataUrl: string) {
  const { bytes, mime } = dataUrlBytes(dataUrl);
  return encryptDocument(bytes, mime);
}

/** Run a full document read on the front (+ optional back) images. Same response shape as before. */
export async function idvRead(frontDataUrl: string, backDataUrl?: string): Promise<unknown> {
  const [front, back] = await Promise.all([seal(frontDataUrl), backDataUrl ? seal(backDataUrl) : undefined]);
  const r = await kycApi.idvRead({ front, back });
  if (!r.ok) throw new Error(r.reason || `IDV read failed (${r.status ?? "network"})`);
  return r.data;
}
