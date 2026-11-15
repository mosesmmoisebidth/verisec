// Security test: ID document read + selfie-to-portrait match, encrypted end to end.
//   node test/security/e2e-idv-face.mjs <id-image> [selfie-image]
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { extname, join } from 'node:path';
import { Agent, fetch } from 'undici';
import { CompactEncrypt, exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';

const ORIGIN = 'https://localhost:3001';
const PKI = join(process.cwd(), '..', '..', 'infra', 'pki');
const TENANT = /^KYC_TENANT_KEY=(.+)$/m.exec(readFileSync(join(PKI, '..', '.env'), 'utf8'))[1].trim();
const dispatcher = new Agent({ connect: { ca: readFileSync(join(PKI, 'dev_root.crt'), 'utf8') } });
const [idFile, selfieFile = idFile] = process.argv.slice(2);
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
const k = (await post('/api/kyc/keys/upload', {}, { token })).json.keys[0];
const key = await importJWK(k, 'RSA-OAEP-256');
const mime = (f) => (/\.png$/i.test(extname(f)) ? 'image/png' : 'image/jpeg');
const seal = (f) => new CompactEncrypt(readFileSync(f)).setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: k.kid, cty: mime(f) }).encrypt(key);

// ---- ID document read
const noSession = await fetch(`${ORIGIN}/api/kyc/idv/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', dispatcher });
check('ID read without a session -> refused', noSession.status === 401);
const plain = await post('/api/kyc/idv/read', { front: readFileSync(idFile).toString('base64') }, { token });
check('ID read with an unencrypted image -> refused', plain.status === 400);
const t0 = Date.now();
const idv = await post('/api/kyc/idv/read', { front: await seal(idFile) }, { token });
check('encrypted ID read -> engine answered', idv.status === 200 && idv.json.ok === true && !!idv.json.data,
  `${((Date.now() - t0) / 1000).toFixed(1)}s, engine ok=${idv.json.data?.ok}`);

// ---- face match
const noFace = await post('/api/kyc/face/match', { selfie: 'x', portrait: 'y' }, { token });
check('face match with non-JWE input -> refused', noFace.status === 400);
const fm = await post('/api/kyc/face/match', { selfie: await seal(selfieFile), portrait: await seal(idFile) }, { token });
check('encrypted face match -> engine answered', fm.status === 200 && typeof fm.json.code === 'number',
  `code=${fm.json.code}, similarity=${fm.json.results?.[0]?.similarity ?? 'n/a'}`);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
