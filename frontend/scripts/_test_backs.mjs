import { readFileSync } from "node:fs";
import { CompactEncrypt, SignJWT, exportJWK, generateKeyPair, importJWK } from "jose";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const API = process.env.TUN, WEB = process.env.TUN;
const ROOT = "C:/Users/Moses/Videos/RE_Hackathon_task/";
const login = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, "X-Captcha-Token": "XXXX.DUMMY.TOKEN.XXXX" }, body: JSON.stringify({ email: "dialog.test@example.com", password: "Dialog-2026!x", remember: true }) });
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
for (const rel of ["new_test_images_v2/california_image.jpeg", "new_test_images_v2/argentina_image.jpeg"]) {
  const made = await (await fetch(`${API}/api/verifications/sessions`, { method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, cookie }, body: JSON.stringify({ email: "backtest@example.com" }) })).json();
  const clientSecret = new URL(made.link).searchParams.get("session");
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const { kty, crv, x, y } = await exportJWK(publicKey);
  const proof = async (htm, path, token) => { const ath = token ? Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).toString("base64url") : undefined; return new SignJWT({ htm, htu: `${API}${path}`, jti: crypto.randomUUID().replace(/-/g, ""), ...(ath ? { ath } : {}) }).setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: { kty, crv, x, y } }).setIssuedAt().sign(privateKey); };
  const ex = await (await fetch(`${API}/api/kyc/sessions/exchange`, { method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, DPoP: await proof("POST", "/api/kyc/sessions/exchange") }, body: JSON.stringify({ clientSecret, accessCode: made.accessCode }) })).json();
  const t = ex.accessToken;
  const call = async (path, body) => (await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: WEB, Authorization: `DPoP ${t}`, DPoP: await proof("POST", path, t) }, body: JSON.stringify(body) })).json();
  const k = await call("/api/kyc/keys/upload", {}); if (!k.keys) { console.log("made:", made.reference, made.accessSentTo, "code?", !!made.accessCode, "| exchange:", JSON.stringify(ex).slice(0,200), "| keys:", JSON.stringify(k).slice(0,200)); process.exit(1); }
  const jwk = k.keys.find((k) => k.alg === "RSA-OAEP-256");
  const enc = async (p) => new CompactEncrypt(readFileSync(ROOT + p)).setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid: jwk.kid, cty: "image/jpeg" }).encrypt(await importJWK(jwk, "RSA-OAEP-256"));
  // send the back image as the FRONT of a read so the engine processes it as page 0
  const r = await call("/api/kyc/idv/read", { front: await enc(rel) });
  let o = r; while (o && !o.ContainerList) o = o.data;
  const L = o?.ContainerList?.List ?? [];
  const cls = L.filter((c) => c.result_type === 9).map((c) => c.OneCandidate?.DocumentName);
  console.log(`\n=== ${rel} ===`);
  console.log("classified as:", fds.join(" | ") || "UNRECOGNISED", "| accepted:", r.verisec?.accepted, "| type:", r.verisec?.documentType);
  for (const c of L) {
    if (c.result_type === 5) for (const b of c.DocBarCodeInfo?.pArrayFields ?? []) console.log(`  barcode: format ${b.bcType_DECODE}, read result ${b.bcCodeResult} (${b.bcCodeResult === 0 ? "OK" : "fail"}), PDF417 ${b.bcPDF417INFO?.bcRow}x${b.bcPDF417INFO?.bcColumn} ecc ${b.bcPDF417INFO?.bcErrorLevel}`);
    if (c.result_type === 20) for (const g of c.AuthenticityCheckList?.List ?? []) console.log(`  security type ${g.Type}: ${g.Result === 1 ? "PASS" : g.Result === 0 ? "FAIL" : "not done"} | ${(g.List ?? []).map((e) => `el${e.ElementType} r${e.ElementResult} diag${e.ElementDiagnose}`).join("; ")}`);
    if (c.result_type === 18) console.log(`  barcode text fields read: ${(c.DocVisualExtendedInfo?.pArrayFields ?? []).length}`);
  }
}
