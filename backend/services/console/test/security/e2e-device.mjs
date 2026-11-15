// Device & IP test: signals are analysed, scored, stored encrypted, and the applicant learns nothing.
//   node test/security/e2e-device.mjs [operator-email]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

/** One applicant browser: its own DPoP key, its own session. */
async function applicant() {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const proof = (path, token) => new SignJWT({ htm: 'POST', htu: `${ORIGIN}${path}`, jti: randomBytes(16).toString('hex'),
    ...(token ? { ath: createHash('sha256').update(token).digest('base64url') } : {}) })
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk }).setIssuedAt().sign(privateKey);
  const s = await (await fetch(`${ORIGIN}/api/kyc/sessions`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${envv('KYC_TENANT_KEY')}` }, body: '{}' })).json();
  const x = await (await fetch(`${ORIGIN}/api/kyc/sessions/exchange`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/json', DPoP: await proof('/api/kyc/sessions/exchange') }, body: JSON.stringify({ clientSecret: s.clientSecret }) })).json();
  const post = async (path, body, extra = {}) => {
    const r = await fetch(`${ORIGIN}${path}`, { method: 'POST', dispatcher, body: typeof body === 'string' ? body : JSON.stringify(body), headers: {
      'Content-Type': 'application/json', Authorization: `DPoP ${x.accessToken}`, DPoP: await proof(path, x.accessToken),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'Sec-CH-UA-Platform': '"Windows"', 'Accept-Language': 'en-US,en;q=0.9,rw;q=0.8', ...extra } });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  return { sid: s.sessionId, post };
}

const signals = (over = {}) => ({
  schema_version: 2, userAgent: 'test', platform: 'Win32', languages: ['en-US', 'rw-RW'], hardwareConcurrency: 8, deviceMemory: 8,
  touchSupport: false, devicePixelRatio: 1, screen: { width: 1920, height: 1080 }, locale: { timeZone: 'Africa/Kigali' },
  storage: { incognitoSuspected: false }, gpu: { renderer: 'ANGLE (NVIDIA GeForce RTX 3060)' },
  webrtc: { supported: true, publicIps: [] }, fingerprint: { visitorId: 'fp' + randomBytes(10).toString('hex'), confidence: 0.6 },
  integrity: { platform: 'web', capture: { videoInputCount: 1, labelsVisible: true, matchedPatterns: [], virtualCameraSuspected: false },
    environment: { automationDetected: false, emulator: false, virtualMachine: false, tampering: [], devtoolsSuspected: false } },
  ...over,
});

// ---- applicant A: clean browser, but WebRTC reveals a Tor exit, and a spoofed X-Forwarded-For
const A = await applicant();
const sharedFp = 'fpshared' + randomBytes(6).toString('hex');
const r1 = await A.post('/api/kyc/device', { stage: 'open', signals: signals({ fingerprint: { visitorId: sharedFp }, webrtc: { supported: true, publicIps: ['185.220.101.1'] } }) }, { 'X-Forwarded-For': '8.8.8.8' });
check('device report accepted', r1.status === 200);
check('applicant response reveals nothing', JSON.stringify(r1.json) === '{"ok":true}', JSON.stringify(r1.json));
check('oversized report refused (413)', (await A.post('/api/kyc/device', { stage: 'open', signals: { blob: 'x'.repeat(70_000) } })).status === 413);
check('invalid stage refused (400)', (await A.post('/api/kyc/device', { stage: 'hack', signals: {} })).status === 400);
check('non-object signals refused (400)', (await A.post('/api/kyc/device', { stage: 'open', signals: 'x' })).status === 400);
const anon = await fetch(`${ORIGIN}/api/kyc/device`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/json' }, body: '{"stage":"open","signals":{}}' });
check('no session token -> refused', anon.status === 401);

// ---- applicant B: a different browser key but the same fingerprint, virtual camera, automation
const B = await applicant();
await B.post('/api/kyc/device', { stage: 'camera', signals: signals({ fingerprint: { visitorId: sharedFp },
  integrity: { capture: { videoInputCount: 2, labelsVisible: true, matchedPatterns: ['obs virtual camera'], virtualCameraSuspected: true },
    environment: { automationDetected: true, headlessSignals: ['webdriver'], emulator: false, virtualMachine: false, tampering: ['navigator.webdriver'] } } }) });

// ---- nothing in clear in the database
const sql = (q) => execFileSync('docker', ['exec', 'verisec-kycdb', 'sh', '-c', `PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U verisec_kyc -d verisec_kyc -At -c "${q}"`], { encoding: 'utf8' }).trim();
const raw = sql(`select row_to_json(s)::text from kyc_sessions s where id='${A.sid}'`);
check('no IP, fingerprint or user agent in clear in the database', !/185\.220|fpshared|Chrome\/140|Africa\/Kigali/.test(raw));
check('device identifiers stored only as blind indexes', /"device_index":"[^"]{20,}"/.test(raw) && /"fp_index":"[^"]{20,}"/.test(raw));

// ---- what the operator sees
const email = process.argv[2] ?? 'zitadel-admin@zitadel.localhost';
const login = await fetch(`${ORIGIN}/api/auth/login`, { method: 'POST', dispatcher, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: process.env.OPERATOR_PASSWORD ?? envv('ZITADEL_ADMIN_PASSWORD') }) });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
check('operator signs in', /vs_session=/.test(cookie), `HTTP ${login.status}`);
const detail = async (sid) => (await fetch(`${ORIGIN}/api/verifications/${sid}`, { dispatcher, headers: { Cookie: cookie } })).json();
const detA = await detail(A.sid);
const detB = await detail(B.sid);
const a = detA.deviceIp;
const b = detB.deviceIp;
const sideG = (d, title) => d?.side?.groups?.['device-ip']?.find((x) => x.title === title);
const risk = (d) => sideG(d, 'Device risk')?.facts?.find((f) => f.term === 'Risk score')?.detail;
const reasons = (d) => (sideG(d, 'What raised the risk score')?.checks ?? []).map((c) => ({ label: c.label, points: Number(String(c.note).replace('+', '')) }));
const grp = (t, title) => t?.devices?.[0]?.groups?.find((g) => g.title === title);
const gfact = (t, title, term) => grp(t, title)?.facts?.find((f) => f.term === term)?.detail;
const gcheck = (t, title, label) => grp(t, title)?.checks?.find((c) => c.label === label);
check('spoofed X-Forwarded-For ignored (IP is the real peer)', /^(127\.0\.0\.1|::1)/.test(gfact(a, 'Summary', 'IP') ?? ''), gfact(a, 'Summary', 'IP'));
check('WebRTC leak detected (Tor exit address)', reasons(detA).some((r) => /Tor|proxy/.test(r.label)) && /185\.220\.101\.1/.test(gcheck(a, 'Checks', 'WebRTC address matches the connection')?.note ?? ''),
  reasons(detA).map((r) => r.label).join('; '));
check('browser parsed (Chrome on Windows)', /Chrome/.test(gfact(a, 'Summary', 'Device browser') ?? '') && /Windows/.test(gfact(a, 'Summary', 'Device OS') ?? ''),
  `${gfact(a, 'Summary', 'Device browser')} / ${gfact(a, 'Summary', 'Device OS')}`);
check('B: virtual camera + automation + same fingerprint as A', ['Virtual camera', 'Automated', 'Same device'].every((w) => reasons(detB).some((r) => r.label.includes(w))), risk(detB));
check('B scored high', /\(high/.test(risk(detB) ?? ''), risk(detB));
check('B flags shown as critical badges', (detB.side?.flags?.['device-ip'] ?? []).some((f) => f.severity === 'critical'), (detB.side?.flags?.['device-ip'] ?? []).map((f) => f.label).join('; '));
check('device data grouped (Summary, Checks, IP intelligence, Hardware, Locale, Raw)',
  ['Summary', 'Checks', 'IP intelligence', 'Hardware & browser', 'Locale', 'Raw device data'].every((t) => grp(a, t)),
  (a?.devices?.[0]?.groups ?? []).map((g) => g.title).join(', '));
check('raw device data kept for the operator', (grp(a, 'Raw device data')?.raw ?? '').includes('Africa/Kigali'));
check('overview shows the device flags', (detA.side?.flags?.overview ?? []).some((f) => /Tor|proxy/.test(f.label)));
console.log(`\nA: ${risk(detA)}   B: ${risk(detB)}`);
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
