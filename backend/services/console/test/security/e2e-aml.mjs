// AML view test: real screenings (sanctions + birth date, PEP without birth date, a clean name)
// show their full list profiles to the operator, and the applicant learns nothing.
//   node test/security/e2e-aml.mjs [operator-email]
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
  const post = async (path, body) => {
    const r = await fetch(`${ORIGIN}${path}`, { method: 'POST', dispatcher, body: JSON.stringify(body), headers: {
      'Content-Type': 'application/json', Authorization: `DPoP ${x.accessToken}`, DPoP: await proof(path, x.accessToken) } });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  return { sid: s.sessionId, post };
}

const cases = [
  { key: 'sanctioned', body: { name: 'Vladimir Putin', dob: '1952-10-07', nationality: 'ru' } },
  { key: 'pep', body: { name: 'Paul Kagame', nationality: 'rw' } },
  { key: 'clean', body: { name: 'Aline Uwase', dob: '1990-04-12', nationality: 'rw' } },
];
const sids = {};
for (const c of cases) {
  const a = await applicant();
  const r = await a.post('/api/kyc/screen', c.body);
  sids[c.key] = a.sid;
  const text = JSON.stringify(r.json);
  const leaked = text.match(/.{0,120}(Putin|Kagame|role\.pep|dataset|program|OFAC|Q7747|Q1231345).{0,60}/i);
  check(`${c.key}: applicant response has no list details`, r.status === 200 && !leaked, `${r.json.outcome}${leaked ? `, leaked: ${leaked[0]}` : ''}`);
}

const login = await fetch(`${ORIGIN}/api/auth/login`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.argv[2] ?? 'zitadel-admin@zitadel.localhost', password: process.env.OPERATOR_PASSWORD ?? envv('ZITADEL_ADMIN_PASSWORD') }) });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const aml = async (sid) => (await (await fetch(`${ORIGIN}/api/verifications/${sid}`, { dispatcher, headers: { Cookie: cookie } })).json());
const g = (t, title) => t?.groups?.find((x) => x.title === title);
const mg = (m, title) => m?.groups?.find((x) => x.title === title);
const screen = (t, label) => g(t, 'Screening results')?.checks?.find((c) => c.label.startsWith(label));

const S = await aml(sids.sanctioned);
const top = S.aml?.matches?.[0];
check('sanctioned: confirmed match first', top?.status === 'confirmed' && /Putin/.test(top?.title), top?.title);
check('sanctioned: Sanctions screen failed', screen(S.aml, 'Sanctions')?.outcome === 'fail', screen(S.aml, 'Sanctions')?.note);
check('sanctioned: PEP screen failed', screen(S.aml, 'Politically exposed')?.outcome === 'fail');
check('sanctioned: sanction listings with programs', (mg(top, 'Sanction listings')?.facts?.length ?? 0) >= 5, `${mg(top, 'Sanction listings')?.facts?.length} listings`);
check('sanctioned: positions, relatives, associates, addresses', ['Positions held', 'Relatives', 'Close associates', 'Addresses'].every((t) => mg(top, t)));
check('sanctioned: why it matched + list sources + raw record', ['Why it matched', 'Lists', 'Raw list record'].every((t) => mg(top, t)));
check('sanctioned: critical flag + overview flag', S.side?.flags?.aml?.some((f) => f.severity === 'critical') && S.side?.flags?.overview?.some((f) => /Sanctions/.test(f.label)));
const visible = JSON.stringify({ ...S.aml, matches: (S.aml?.matches ?? []).map((m) => ({ ...m, groups: m.groups.filter((x) => x.title !== 'Raw list record') })) });
const engine = visible.match(/.{0,100}(yente|logic-v2|elasticsearch).{0,40}/i);
check('sanctioned: lists screened shown (no engine names)', /\d+ sanctions/.test(g({ groups: S.side?.groups?.aml }, 'What was screened')?.facts?.find((f) => f.term === 'Lists screened')?.detail ?? '') && !engine,
  engine ? engine[0] : '');
check('no risk reason shows as [object Object]', !JSON.stringify(S.aml).includes('[object Object]'));

const P = await aml(sids.pep);
const pm = P.aml?.matches?.find((m) => /Kagame/.test(m.title));
check('pep: Kagame is a possible match (no birth date given)', pm?.status === 'possible', pm?.title);
check('pep: PEP screen under review', screen(P.aml, 'Politically exposed')?.outcome === 'review');
check('pep: positions held listed', (mg(pm, 'Positions held')?.facts?.length ?? 0) > 0);

const C = await aml(sids.clean);
check('clean: every screen passes', (g(C.aml, 'Screening results')?.checks ?? []).length >= 9 && g(C.aml, 'Screening results').checks.every((c) => c.outcome === 'pass'));
check('clean: no confirmed or possible matches', !(C.aml?.matches ?? []).some((m) => m.status !== 'discounted'));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
