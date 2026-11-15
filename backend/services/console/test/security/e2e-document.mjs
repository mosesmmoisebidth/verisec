// Security test: end-to-end document encryption + tokenisation (steps 5 and 6).
//   node test/security/e2e-document.mjs <file>     (Console API on https://localhost:3001)
// Acts like the browser: opens a DPoP session, encrypts the file with the upload public key
// (JWE), sends only ciphertext, and checks what each layer can and cannot see.
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { extname, join } from 'node:path';
import { Agent, fetch } from 'undici';
import { CompactEncrypt, exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';

const ORIGIN = 'https://localhost:3001';
const PKI = join(process.cwd(), '..', '..', 'infra', 'pki');
const TENANT = /^KYC_TENANT_KEY=(.+)$/m.exec(readFileSync(join(PKI, '..', '.env'), 'utf8'))[1].trim();
const dispatcher = new Agent({ connect: { ca: readFileSync(join(PKI, 'dev_root.crt'), 'utf8') } });
const file = process.argv[2];
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); if (!ok) failed++; };

const { privateKey, publicKey } = await generateKeyPair('ES256');
const jwk = await exportJWK(publicKey);
const proof = (path, token) => new SignJWT({ htm: 'POST', htu: `${ORIGIN}${path}`, jti: randomBytes(16).toString('hex'),
  ...(token ? { ath: createHash('sha256').update(token).digest('base64url') } : {}) })
  .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk }).setIssuedAt().sign(privateKey);
const post = async (path, body, { token, auth } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  if (token) { headers.Authorization = `DPoP ${token}`; headers.DPoP = await proof(path, token); }
  if (path.endsWith('/exchange')) headers.DPoP = await proof(path);
  const r = await fetch(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body), dispatcher });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

const s = await post('/api/kyc/sessions', {}, { auth: `Bearer ${TENANT}` });
const token = (await post('/api/kyc/sessions/exchange', { clientSecret: s.json.clientSecret })).json.accessToken;

const keys = await post('/api/kyc/keys/upload', {}, { token });
const k = keys.json.keys?.[0];
check('upload public key served (RSA-OAEP-256, RSA-4096)', k?.alg === 'RSA-OAEP-256' && Buffer.from(k.n, 'base64url').length === 512, k?.kid);
check('the served key has NO private part', k && !('d' in k) && !('p' in k));

const bytes = readFileSync(file);
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf' }[extname(file).toLowerCase()];
const jwe = await new CompactEncrypt(bytes).setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: k.kid, cty: mime })
  .encrypt(await importJWK(k, 'RSA-OAEP-256'));
check('what leaves the browser is ciphertext only', !jwe.includes(bytes.subarray(0, 64).toString('base64url').slice(0, 40)) && jwe.split('.').length === 5,
  `${(jwe.length / 1024).toFixed(0)} KB JWE`);

const plainAttempt = await post('/api/kyc/poa/analyze', { document: bytes.toString('base64') }, { token });
check('an unencrypted upload is refused by the Console', plainAttempt.status === 400);

const tampered = jwe.split('.'); tampered[3] = tampered[3].slice(0, -4) + (tampered[3].endsWith('AAAA') ? 'BBBB' : 'AAAA');
const t = await post('/api/kyc/poa/analyze', { document: tampered.join('.'), subject: { name: 'UWASE Aline', country: 'rw' } }, { token });
check('a tampered ciphertext is rejected (AES-GCM integrity)', t.status >= 400, `HTTP ${t.status}`);

const r = await post('/api/kyc/poa/analyze', { document: jwe, filename: 'x', subject: { name: 'UWASE Aline', country: 'rw' } }, { token });
check('the processing side decrypts and analyses it', r.status === 200 && !!r.json.outcome, `${r.json.outcome} / ${(r.json.checks ?? []).map((c) => c.value).join(', ')}`);
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
