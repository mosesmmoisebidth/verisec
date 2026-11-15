/**
 * Encrypts a document IN THE BROWSER before it is uploaded (JWE compact serialization).
 *
 *   key wrap: RSA-OAEP-256 with the upload public key (RSA-4096; the private half never
 *             leaves OpenBao on the processing server)
 *   content:  AES-256-GCM with a fresh random key per file
 *
 * Every hop in between (proxies, the Console API, logs, the document store) only ever holds
 * ciphertext. The file type travels inside the protected header (`cty`), so it is
 * integrity-protected too.
 */
import { CompactEncrypt, importJWK, type JWK } from "jose";

import { kycApi } from "./kyc-api";

// The in-flight request itself is shared, so images encrypted together (front + back) fetch the key once.
let cached: { p: Promise<{ key: CryptoKey; kid: string }>; at: number } | null = null;

function uploadKey() {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.p;
  const p = (async () => {
    const r = await kycApi.uploadKey();
    if (!r.ok) throw new Error(r.reason);
    const jwk = (r.data.keys as JWK[]).find((k) => k.alg === "RSA-OAEP-256" && k.kty === "RSA");
    if (!jwk?.kid) throw new Error("We can't accept documents right now. Please try again.");
    return { key: (await importJWK(jwk, "RSA-OAEP-256")) as CryptoKey, kid: jwk.kid };
  })();
  cached = { p, at: Date.now() };
  p.catch(() => {
    cached = null; // a failed fetch is not remembered
  });
  return p;
}

export async function encryptDocument(bytes: Uint8Array, mime: string): Promise<string> {
  const { key, kid } = await uploadKey();
  return new CompactEncrypt(bytes)
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid, cty: mime })
    .encrypt(key);
}
