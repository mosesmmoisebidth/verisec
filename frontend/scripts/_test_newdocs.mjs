import { readFileSync } from "node:fs";
import { CompactEncrypt, SignJWT, exportJWK, generateKeyPair, importJWK } from "jose";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const API = process.env.TUN, WEB = process.env.TUN, ROOT = "C:/Users/Moses/Videos/RE_Hackathon_task/";
const login = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, "X-Captcha-Token": "XXXX.DUMMY.TOKEN.XXXX" }, body: JSON.stringify({ email: "dialog.test@example.com", password: "Dialog-2026!x", remember: true }) });
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
for (const rel of process.argv.slice(2)) {
  const made = await (await fetch(`${API}/api/verifications/sessions`, { method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, cookie }, body: JSON.stringify({ email: "nd@example.com" }) })).json();
  const clientSecret = new URL(made.link).searchParams.get("session");
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const { kty, crv, x, y } = await exportJWK(publicKey);
  const proof = async (htm, path, token) => { const ath = token ? Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).toString("base64url") : undefined; return new SignJWT({ htm, htu: `${API}${path}`, jti: crypto.randomUUID().replace(/-/g, ""), ...(ath ? { ath } : {}) }).setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: { kty, crv, x, y } }).setIssuedAt().sign(privateKey); };
  const ex = await (await fetch(`${API}/api/kyc/sessions/exchange`, { method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, DPoP: await proof("POST", "/api/kyc/sessions/exchange") }, body: JSON.stringify({ clientSecret, accessCode: made.accessCode }) })).json();
  const t = ex.accessToken;
  const call = async (path, body) => (await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, Authorization: `DPoP ${t}`, DPoP: await proof("POST", path, t) }, body: JSON.stringify(body) })).json();
  const jwk = (await call("/api/kyc/keys/upload", {})).keys.find((k) => k.alg === "RSA-OAEP-256");
  const mime = rel.endsWith(".png") ? "image/png" : "image/jpeg";
  const front = await new CompactEncrypt(readFileSync(ROOT + rel)).setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid: jwk.kid, cty: mime }).encrypt(await importJWK(jwk, "RSA-OAEP-256"));
  const r = await call("/api/kyc/idv/read", { front });
  let o = r; while (o && !o.ContainerList) o = o.data;
  const cands = (o?.ContainerList?.List ?? []).filter((c) => c.result_type === 9).map((c) => { const f = c.OneCandidate?.FDSIDList || {}; return `${c.OneCandidate?.DocumentName} [${f.ICAOCode||"?"} ${f.dYear||"?"}]`; });
  console.log(`${rel}\n   -> ${cands.join(" | ") || "UNRECOGNISED"}  | accepted=${r.verisec?.accepted} type=${r.verisec?.documentType}`);
}
