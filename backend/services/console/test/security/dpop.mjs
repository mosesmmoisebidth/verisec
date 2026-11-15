// Security test: DPoP session tokens (RFC 9449) on the Console API.
//   node test/security/dpop.mjs            (Console API running on https://localhost:3001)
// Each case prints PASS/FAIL; exit code 1 if any fails.
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Agent, fetch } from 'undici';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const ORIGIN = process.env.KYC_ORIGIN ?? 'https://localhost:3001';
const PKI = process.env.VERISEC_PKI ?? join(process.cwd(), '..', '..', 'infra', 'pki');
const env = readFileSync(join(PKI, '..', '.env'), 'utf8');
const TENANT = /^KYC_TENANT_KEY=(.+)$/m.exec(env)?.[1]?.trim();
const dispatcher = new Agent({ connect: { ca: readFileSync(join(PKI, 'dev_root.crt'), 'utf8') } });
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

async function device() {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  return {
    proof: (htm, path, token, overrides = {}) =>
      new SignJWT({
        htm, htu: `${ORIGIN}${path}`, jti: randomBytes(16).toString('hex'),
        ...(token ? { ath: createHash('sha256').update(token).digest('base64url') } : {}), ...overrides,
      })
        .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk })
        .setIssuedAt(overrides.iat)
        .sign(privateKey),
  };
}

async function call(path, { token, proof, body = {}, auth } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `DPoP ${token}`;
  if (auth) headers.Authorization = auth;
  if (proof) headers.DPoP = proof;
  const r = await fetch(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body), dispatcher });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

async function openSession(dev) {
  const s = await call('/api/kyc/sessions', { auth: `Bearer ${TENANT}` });
  const x = await call('/api/kyc/sessions/exchange', {
    proof: await dev.proof('POST', '/api/kyc/sessions/exchange'),
    body: { clientSecret: s.json.clientSecret },
  });
  return { secret: s.json.clientSecret, token: x.json.accessToken, status: x.status };
}

const PHONE = '/api/kyc/phone/check';
const body = { phone: '+250788123456' };

// 1. no session at all
check('no token -> refused', (await call(PHONE, { body })).status === 401);

// 2. tenant endpoint needs the tenant key
check('create session without tenant key -> refused', (await call('/api/kyc/sessions')).status === 401);
check('create session with a wrong tenant key -> refused',
  (await call('/api/kyc/sessions', { auth: 'Bearer vtk_wrong' })).status === 401);

// 3. the legitimate path
const alice = await device();
const a = await openSession(alice);
check('tenant opens session, device exchanges link secret for a bound token', a.status === 200 && !!a.token);
const ok = await call(PHONE, { token: a.token, proof: await alice.proof('POST', PHONE, a.token), body });
check('token + fresh proof from the same device -> allowed', ok.status === 200, `HTTP ${ok.status}`);

// 4. link secret is single use
const again = await call('/api/kyc/sessions/exchange', {
  proof: await alice.proof('POST', '/api/kyc/sessions/exchange'), body: { clientSecret: a.secret },
});
check('re-using the link secret -> refused', again.status === 401, again.json.error);

// 5. stolen token, attacker's own key
const mallory = await device();
const stolen = await call(PHONE, { token: a.token, proof: await mallory.proof('POST', PHONE, a.token), body });
check('stolen token used from another device -> refused', stolen.status === 401, stolen.json.error);

// 6. stolen token with no proof
check('stolen token without any proof -> refused', (await call(PHONE, { token: a.token, body })).status === 401);

// 7. captured request replayed (same proof twice)
const p = await alice.proof('POST', PHONE, a.token);
await call(PHONE, { token: a.token, proof: p, body });
const replay = await call(PHONE, { token: a.token, proof: p, body });
check('replaying a captured request -> refused', replay.status === 401, replay.json.error);

// 8. proof made for a different endpoint
const wrongUrl = await call(PHONE, { token: a.token, proof: await alice.proof('POST', '/api/kyc/email/check', a.token), body });
check('proof for another URL -> refused', wrongUrl.status === 401, wrongUrl.json.error);

// 9. proof made for a different method
const wrongMethod = await call(PHONE, { token: a.token, proof: await alice.proof('GET', PHONE, a.token), body });
check('proof for another method -> refused', wrongMethod.status === 401, wrongMethod.json.error);

// 10. old proof (captured 5 minutes ago)
const old = await call(PHONE, {
  token: a.token, proof: await alice.proof('POST', PHONE, a.token, { iat: Math.floor(Date.now() / 1000) - 300 }), body,
});
check('proof older than 60s -> refused', old.status === 401, old.json.error);

// 11. proof not bound to this token (ath of another token)
const b = await openSession(alice);
const unbound = await call(PHONE, { token: a.token, proof: await alice.proof('POST', PHONE, b.token), body });
check('proof bound to a different token -> refused', unbound.status === 401, unbound.json.error);

// 12. forged token (signed with a guessed key)
const forged = await new SignJWT({ scope: 'kyc.applicant', cnf: { jkt: 'x' } })
  .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' }).setSubject('ses_x').setIssuer('verisec-console')
  .setAudience('verisec-kyc').setExpirationTime('1h').sign(new TextEncoder().encode('guess'));
const f = await call(PHONE, { token: forged, proof: await alice.proof('POST', PHONE, forged), body });
check('forged token -> refused', f.status === 401, f.json.error);

// 13. reviewer reports need the tenant key
const rep = await fetch(`${ORIGIN}/api/kyc/reports/KYC-TEST`, { dispatcher });
check('reviewer report without tenant key -> refused', rep.status === 401);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
