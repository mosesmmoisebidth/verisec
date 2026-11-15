// Operator access test: records are only readable by a signed-in console operator.
//   node test/security/operator-api.mjs [email]      (password from OPERATOR_PASSWORD or the local Zitadel admin)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Agent, fetch } from 'undici';

const ORIGIN = 'https://localhost:3001';
const INFRA = join(process.cwd(), '..', '..', 'infra');
const ENV = readFileSync(join(INFRA, '.env'), 'utf8');
const dispatcher = new Agent({ connect: { ca: readFileSync(join(INFRA, 'pki', 'dev_root.crt'), 'utf8') } });
const email = process.argv[2] ?? 'zitadel-admin@zitadel.localhost';
const password = process.env.OPERATOR_PASSWORD ?? /^ZITADEL_ADMIN_PASSWORD=(.+)$/m.exec(ENV)?.[1]?.trim();
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); if (!ok) failed++; };

check('list without signing in -> refused', (await fetch(`${ORIGIN}/api/verifications`, { dispatcher })).status === 401);
check('forged session cookie -> refused', (await fetch(`${ORIGIN}/api/verifications`, { dispatcher, headers: { Cookie: 'vs_session={"sessionId":"123","sessionToken":"x"}' } })).status === 401);

const login = await fetch(`${ORIGIN}/api/auth/login`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const signedIn = login.status < 300 && /vs_session=/.test(cookie);
check(`operator signs in (${email})`, signedIn, signedIn ? '' : `HTTP ${login.status} ${JSON.stringify(await login.json().catch(() => ({}))).slice(0, 120)}`);
if (signedIn) {
  const list = await (await fetch(`${ORIGIN}/api/verifications`, { dispatcher, headers: { Cookie: cookie } })).json();
  check('operator sees the stored verifications', list.total > 0, `${list.total} record(s); newest ${list.rows?.[0]?.reference} ${list.rows?.[0]?.applicant} ${list.rows?.[0]?.verdict}`);
  const id = list.rows?.[0]?.id;
  const det = await (await fetch(`${ORIGIN}/api/verifications/${id}`, { dispatcher, headers: { Cookie: cookie } })).json();
  check('detail decrypts for the operator', det.applicant === list.rows[0].applicant && !!det.overview, `tabs: ${['document', 'face', 'aml', 'deviceIp', 'contact', 'address'].filter((t) => det[t]).join(', ')}`);
  const img = await fetch(`${ORIGIN}/api/verifications/${id}/files/document_front`, { dispatcher, headers: { Cookie: cookie } });
  const bytes = Buffer.from(await img.arrayBuffer());
  check('stored ID photo opens for the operator', img.status === 200 && bytes.subarray(1, 4).toString() === 'PNG', `${img.headers.get('content-type')}, ${bytes.length} bytes`);
  check('the view is recorded in the access log', (det.access ?? []).some((a) => /viewed record/.test(a.action)), det.access?.[0]?.actor);
  const byName = await (await fetch(`${ORIGIN}/api/verifications?q=${encodeURIComponent('aline  UWASE')}`, { dispatcher, headers: { Cookie: cookie } })).json();
  check('search by name works through the blind index (no decryption)', byName.total > 0, `${byName.total} match(es)`);
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
