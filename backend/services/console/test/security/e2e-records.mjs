// Records test: one complete KYC session is stored, encrypted, and nothing personal is in clear.
//   node test/security/e2e-records.mjs
// Prints the session reference so it can be opened in the console's Verifications page.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Agent, fetch } from 'undici';
import { CompactEncrypt, exportJWK, generateKeyPair, importJWK, SignJWT } from 'jose';

const ORIGIN = 'https://localhost:3001';
const INFRA = join(process.cwd(), '..', '..', 'infra');
const ENV = readFileSync(join(INFRA, '.env'), 'utf8');
const envv = (k) => new RegExp(`^${k}=(.+)$`, 'm').exec(ENV)?.[1]?.trim();
const SAMPLES = join(process.cwd(), '..', '..', '..', '..', 'PoA_Sourcing', 'samples');
const dispatcher = new Agent({ connect: { ca: readFileSync(join(INFRA, 'pki', 'dev_root.crt'), 'utf8') } });
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); if (!ok) failed++; };

const { privateKey, publicKey } = await generateKeyPair('ES256');
const jwk = await exportJWK(publicKey);
const proof = (path, token) => new SignJWT({ htm: 'POST', htu: `${ORIGIN}${path}`, jti: randomBytes(16).toString('hex'),
  ...(token ? { ath: createHash('sha256').update(token).digest('base64url') } : {}) })
  .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk }).setIssuedAt().sign(privateKey);
let token;
const post = async (path, body, { auth } = {}) => {
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'verisec-records-test' };
  if (auth) headers.Authorization = auth;
  else if (token) { headers.Authorization = `DPoP ${token}`; headers.DPoP = await proof(path, token); }
  if (path.endsWith('/exchange')) headers.DPoP = await proof(path);
  const r = await fetch(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body), dispatcher });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

// ---- a complete applicant session
const s = await post('/api/kyc/sessions', {}, { auth: `Bearer ${envv('KYC_TENANT_KEY')}` });
const sid = s.json.sessionId;
token = (await post('/api/kyc/sessions/exchange', { clientSecret: s.json.clientSecret })).json.accessToken;
const k = (await post('/api/kyc/keys/upload', {})).json.keys[0];
const key = await importJWK(k, 'RSA-OAEP-256');
const seal = (f, mime) => new CompactEncrypt(readFileSync(join(SAMPLES, f))).setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: k.kid, cty: mime }).encrypt(key);
const front = await seal('control-id-card.png', 'image/png');

const NAME = 'Aline Uwase';
check('ID read recorded', (await post('/api/kyc/idv/read', { front })).status === 200);
await post('/api/kyc/events', { type: 'document', data: { ok: true, recognisedAs: 'Pennsylvania Driving License (2022)', checks: [{ label: 'Document read', outcome: 'pass' }] } });
check('confirmed details recorded', (await post('/api/kyc/events', { type: 'identity', data: {
  name: NAME, dob: '1990-04-12', nationality: 'rw', documentType: 'licence', documentCountry: 'Rwanda',
  fields: [{ term: 'Full name', detail: NAME }, { term: 'Date of birth', detail: '1990-04-12' }, { term: 'Document №', detail: 'RW1990041212', mono: true }],
} })).status === 200);
check('face match recorded', (await post('/api/kyc/face/match', { selfie: front, portrait: front })).status === 200);
check('liveness recorded (with encrypted selfie)', (await post('/api/kyc/events', { type: 'liveness', data: { passed: true, mode: 'passive', engine: 'passive', attempts: 1, status: 0, code: 0 }, file: front })).status === 200);
const phone = '+250788123456';
await post('/api/kyc/phone/check', { phone });
const sent = await post('/api/kyc/phone/send', { phone });
if (sent.json.testCode) check('phone verification recorded', (await post('/api/kyc/phone/verify', { phone, code: sent.json.testCode })).json.verified === true);
check('screening recorded', (await post('/api/kyc/screen', { name: NAME, dob: '1990-04-12', nationality: 'rw', documentCountry: 'rw', phone, deviceId: 'dev-test-1' })).status === 200);
const poa = await post('/api/kyc/poa/analyze', { document: await seal('utility-bill.png', 'image/png'), subject: { name: NAME, country: 'rw' } });
check('proof of address recorded', poa.status === 200, poa.json.outcome);
await post('/api/kyc/poa/confirm', { reference: poa.json.reference, address: { street: 'KG 11 Ave', building: 'House 23', sector: 'Kacyiru', district: 'Gasabo', city: 'Kigali', country: 'rw' } });
check('session completed', (await post('/api/kyc/events', { type: 'completed' })).status === 200);

// ---- what is actually stored
const sql = (q) => execFileSync('docker', ['exec', 'verisec-kycdb', 'sh', '-c', `PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U verisec_kyc -d verisec_kyc -At -c "${q}"`], { encoding: 'utf8' }).trim();
const row = sql(`select reference, status, verdict, score, document_type, country from kyc_sessions where id='${sid}'`);
console.log(`\nstored row (plain columns): ${row}`);
const raw = sql(`select row_to_json(s)::text from kyc_sessions s where id='${sid}'`);
check('no name, date of birth, phone or document number in clear in the database', !/uwase|aline|1990-04-12|788123456|RW1990041212|KG 11/i.test(raw));
check('record key stored only in wrapped form (OpenBao)', /"wrapped_key":"vault:v\d+:/.test(raw));
check('sections are ciphertext', (JSON.parse(raw).sections && Object.values(JSON.parse(raw).sections).every((v) => /^[A-Za-z0-9+/=]{40,}$/.test(v))));
check('database connection from the Console uses TLS', sql(`select count(*) from pg_stat_ssl s join pg_stat_activity a using (pid) where a.usename='verisec_kyc' and s.ssl`) !== '0');
const files = sql(`select string_agg(slot, ',') from kyc_files where session_id='${sid}'`);
check('files stored in MinIO', ['document_front', 'selfie', 'portrait', 'address_document'].every((f) => files.includes(f)), files);
const objKey = sql(`select object_key from kyc_files where session_id='${sid}' and slot='document_front' limit 1`);
const obj = execFileSync('docker', ['exec', 'verisec-minio', 'sh', '-c', `mc cat local/kyc-documents/${objKey} 2>/dev/null | head -c 60`], { encoding: 'utf8' });
check('stored file is the browser-made ciphertext (JWE)', obj.startsWith('eyJhbGciOiJSU0EtT0FFUC0yNTYi'));
const stat = JSON.parse(execFileSync('docker', ['exec', 'verisec-minio', 'mc', 'stat', '--json', `local/kyc-documents/${objKey}`], { encoding: 'utf8' }));
const sse = Object.entries(stat.metadata ?? {}).find(([k]) => /server-side-encryption/i.test(k));
check('MinIO encrypts the object at rest too (SSE)', !!sse, sse ? `${sse[0]}: ${sse[1]}` : 'no SSE header');
console.log(`\nSession reference: ${row.split('|')[0]}   (id ${sid})`);
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
