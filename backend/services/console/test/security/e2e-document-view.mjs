// Document view test: different documents (fields, sides, MRZ or not, chip or not, malformed
// parts) all render for the operator without breaking, and only with what they really have.
//   node test/security/e2e-document-view.mjs [operator-email]
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Agent, fetch } from 'undici';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const ORIGIN = 'https://localhost:3001';
const INFRA = join(process.cwd(), '..', '..', 'infra');
const ENV = readFileSync(join(INFRA, '.env'), 'utf8');
const envv = (k) => new RegExp(`^${k}=(.+)$`, 'm').exec(ENV)?.[1]?.trim();
const dispatcher = new Agent({ connect: { ca: readFileSync(join(INFRA, 'pki', 'dev_root.crt'), 'utf8') } });
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); if (!ok) failed++; };

async function applicant() {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const proof = (path, token) => new SignJWT({ htm: 'POST', htu: `${ORIGIN}${path}`, jti: randomBytes(16).toString('hex'),
    ...(token ? { ath: createHash('sha256').update(token).digest('base64url') } : {}) })
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk }).setIssuedAt().sign(privateKey);
  const s = await (await fetch(`${ORIGIN}/api/kyc/sessions`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${envv('KYC_TENANT_KEY')}` }, body: '{}' })).json();
  const x = await (await fetch(`${ORIGIN}/api/kyc/sessions/exchange`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/json', DPoP: await proof('/api/kyc/sessions/exchange') }, body: JSON.stringify({ clientSecret: s.clientSecret }) })).json();
  const post = async (path, body) => (await fetch(`${ORIGIN}${path}`, { method: 'POST', dispatcher, body: JSON.stringify(body), headers: {
    'Content-Type': 'application/json', Authorization: `DPoP ${x.accessToken}`, DPoP: await proof(path, x.accessToken) } })).status;
  return { sid: s.sessionId, post };
}

// 1) a passport: MRZ, chip, two authenticity checks, one anomaly
const P = await applicant();
await P.post('/api/kyc/events', { type: 'document', data: {
  ok: true, outcome: 'accept', recognisedAs: 'Rwanda Passport (2019)', status: 'Genuine', decision: 'Accepted', specimen: false, sides: 1, faces: 1,
  checks: [{ label: 'Document read', outcome: 'pass' }, { label: 'MRZ checksums', outcome: 'pass', note: '4 of 4' }],
  quality: [{ label: 'Focus', outcome: 'pass' }, { label: 'Glare', outcome: 'review' }],
  verdict: { overallStatus: 1, optical: 1, mrz: 1, expiry: 1, rfid: 2, specimen: false, rfidDetails: { PA: 1, BAC: 2 } },
  authenticity: [{ label: 'UV fibres', result: 1, page: 1, elements: 3 }, { label: 'Hologram', result: 2, page: 1, elements: 0 }],
  anomalies: [{ kind: 'source-mismatch', severity: 'warn', detail: 'Given names differ between MRZ and visual zone', field: 'GIVEN_NAMES' }],
  errors: [],
  docClass: { name: 'Rwanda Passport (2019)', country: 'RWA', countryName: 'Rwanda', type: 'Passport', confidence: 0.97 },
  mrz: { format: 'TD3', rows: ['P<RWAUWASE<<ALINE<<<<<<<<<<<<<<<<<<<<<<<<<<<', 'PC12345670RWA9004122F3001015<<<<<<<<<<<<<<04'] },
} });
await P.post('/api/kyc/events', { type: 'identity', data: { name: 'Aline Uwase', dob: '1990-04-12', nationality: 'rw', documentType: 'passport', documentCountry: 'RW', fields: [
  { term: 'Surname and given names', detail: 'UWASE ALINE', key: 'SURNAME_AND_GIVEN_NAMES', outcome: 'pass', sources: ['VISUAL', 'MRZ'], crossChecked: true },
  { term: 'Document number', detail: 'PC1234567', key: 'DOCUMENT_NUMBER', mono: true, outcome: 'pass', sources: ['VISUAL', 'MRZ'], crossChecked: true },
  { term: 'Sex', detail: 'F', key: 'SEX', outcome: 'pass', sources: ['MRZ'] },
  { term: 'Date of expiry', detail: '2030-01-01', key: 'DATE_OF_EXPIRY', outcome: 'pass', sources: ['VISUAL', 'MRZ'] },
] } });

// 2) a national ID card: no MRZ, no chip, other fields, a serious error, odd/missing parts
const I = await applicant();
await I.post('/api/kyc/events', { type: 'document', data: {
  ok: false, recognisedAs: 'Rwanda ID Card', decision: 'Needs review', sides: 2,
  checks: [{ label: 'Barcode', outcome: 'fail', note: 'Barcode size params error' }, { label: 'weird', outcome: 'banana' }],
  verdict: { overallStatus: 0, text: 1, barcodeFormat: 0 },
  authenticity: 'not-an-array', anomalies: [null, 5, { kind: 'expired', severity: 'critical', detail: 'Document expired' }],
  errors: [{ area: 'cross-source', label: 'Document number', detail: 'Visual and barcode differ', severity: 'serious', critical: true, side: 'back' }],
  mrz: null,
} });
await I.post('/api/kyc/events', { type: 'identity', data: { name: 'Mucyo Moses', documentType: 'national-id', documentCountry: 'RW', fields: [
  { term: 'Identity number', detail: '1200780123753080', key: 'PERSONAL_NUMBER', mono: true, outcome: 'pass', sources: ['VISUAL', 'BARCODE'] },
  { term: 'Place of issue', detail: 'NYAGATARE / RWIMIYAGA', key: 'PLACE_OF_ISSUE', outcome: 'pending' },
  { term: 'Custom field', detail: 'something', key: 'SOMETHING_NEW' },
] } });

const login = await fetch(`${ORIGIN}/api/auth/login`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.argv[2] ?? 'zitadel-admin@zitadel.localhost', password: process.env.OPERATOR_PASSWORD ?? envv('ZITADEL_ADMIN_PASSWORD') }) });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const detail = async (sid) => { const r = await fetch(`${ORIGIN}/api/verifications/${sid}`, { dispatcher, headers: { Cookie: cookie } }); return { status: r.status, body: await r.json() }; };
const g = (tab, t) => tab?.groups?.find((x) => x.title === t);

const p = await detail(P.sid);
check('passport detail renders', p.status === 200 && !!p.body.document);
check('passport: every field shown', p.body.document.fields.length === 4, p.body.document.fields.map((x) => x.term).join(', '));
check('passport: MRZ group with both lines', g(p.body.document, 'MRZ')?.facts?.filter((x) => /^Line/.test(x.term)).length === 2);
check('passport: chip protocols shown', !!g(p.body.document, 'Chip protocols'));
check('passport: verdict by area (not-checked marked)', g(p.body.document, 'Verdict by area')?.checks?.some((c) => c.label === 'Chip (RFID)' && c.outcome === 'pending'));
check('passport: field checks carry sources', /MRZ/.test(g(p.body.document, 'Field checks')?.checks?.[0]?.note ?? ''));
check('passport: anomaly shown as a warn badge', p.body.side.flags.document.some((f) => f.severity === 'warn' && /Given names/.test(f.label)));
check('overview: personal data from the document', ['Surname and given names', 'Document number', 'Sex', 'Date of expiry'].every((t) => g({ groups: p.body.side.groups.overview }, 'Personal data')?.facts?.some((x) => x.term === t)));

const i = await detail(I.sid);
check('ID card detail renders despite malformed parts', i.status === 200 && !!i.body.document);
check('ID card: no MRZ group (document has none)', !g(i.body.document, 'MRZ'));
check('ID card: no chip group', !g(i.body.document, 'Chip protocols'));
check('ID card: unknown verdict key labelled generically', g(i.body.document, 'Verdict by area')?.checks?.some((c) => c.label === 'Barcode Format' || c.label === 'Barcode format'));
check('ID card: unknown check outcome made safe', i.body.document.metrics.every((m) => ['pass', 'fail', 'review', 'pending'].includes(m.outcome)));
check('ID card: serious error and expiry as critical badges', ['Document number', 'Document expired'].every((w) => i.body.side.flags.document.some((f) => f.severity === 'critical' && f.label.includes(w))));
check('ID card: new/unknown field still shown', i.body.document.fields.some((x) => x.term === 'Custom field'));
check('ID card: overview flags include the document issues', (i.body.side.flags.overview ?? []).some((f) => /expired/i.test(f.label)));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
