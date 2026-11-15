// LOCAL TEST ONLY (delete after): run real sample documents through the real reader under one workflow, exactly as
// the browser does (DPoP-bound session, image encrypted with the server's upload key), and print what was decided.
import { readFileSync } from "node:fs";
import { CompactEncrypt, SignJWT, exportJWK, generateKeyPair, importJWK } from "jose";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const API = "https://localhost:3001";
const WEB = "https://localhost:3000";
const WORKFLOW = process.argv[2];
const ROOT = "C:/Users/Moses/Videos/RE_Hackathon_task/";
const SAMPLES = [
  ["passport", "german_passport_2024.jpg"],
  ["passport", "new_test_images/mali_passport.jpeg"],
  ["passport", "AndroidPassportReader/examples/passport_ireland.jpg"],
  ["national ID", "new_test_images/kenya_national_id.png"],
  ["national ID", "new_test_images/south_africa_national_id.jpg"],
  ["national ID", "new_test_images_v2/burundi_national_id.jpeg"],
  ["national ID", "new_test_images_v2/france_national_id.jpeg"],
  ["national ID", "new_test_images_v2/tanzania_national_id.jpeg"],
  ["licence", "new_test_images/driving_license_rwanda.jpg"],
  ["licence", "new_test_images/license_kenya.jpeg"],
  ["licence", "new_test_images/uganda_license.jpg"],
  ["not a document", "screenshots/match_face1.jpeg"],
  ["not a document", "screenshots/test1.jpeg"],
];

const login = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: WEB, "X-Captcha-Token": "XXXX.DUMMY.TOKEN.XXXX" },
  body: JSON.stringify({ email: "dialog.test@example.com", password: "Dialog-2026!x", remember: true }),
});
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

for (const [kind, rel] of SAMPLES) {
  const ses = await (await fetch(`${API}/api/kyc/sessions/dev`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, cookie }, body: JSON.stringify({ workflowId: WORKFLOW }),
  })).json();
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const { kty, crv, x, y } = await exportJWK(publicKey);
  const proof = async (htm, path, token) => {
    const ath = token ? Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).toString("base64url") : undefined;
    return new SignJWT({ htm, htu: `${API}${path}`, jti: crypto.randomUUID().replace(/-/g, ""), ...(ath ? { ath } : {}) })
      .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: { kty, crv, x, y } }).setIssuedAt().sign(privateKey);
  };
  const ex = await (await fetch(`${API}/api/kyc/sessions/exchange`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, DPoP: await proof("POST", "/api/kyc/sessions/exchange") },
    body: JSON.stringify({ clientSecret: ses.clientSecret }),
  })).json();
  const t = ex.accessToken;
  const call = async (path, body) => (await fetch(`${API}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, Authorization: `DPoP ${t}`, DPoP: await proof("POST", path, t) },
    body: JSON.stringify(body),
  })).json();
  const keys = await call("/api/kyc/keys/upload", {});
  const jwk = keys.keys.find((k) => k.alg === "RSA-OAEP-256");
  const bytes = readFileSync(ROOT + rel);
  const mime = rel.endsWith(".png") ? "image/png" : "image/jpeg";
  const front = await new CompactEncrypt(bytes).setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid: jwk.kid, cty: mime }).encrypt(await importJWK(jwk, "RSA-OAEP-256"));
  const r = await call("/api/kyc/idv/read", { front });
  const v = r.verisec ?? {};
  console.log(`${kind.padEnd(15)} ${rel.split("/").pop().padEnd(32)} -> seen as ${String(v.documentType ?? "unrecognised").padEnd(16)} ${v.accepted ? "ACCEPTED" : "REFUSED"}`);
}
