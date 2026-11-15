// VeriSec transport-security test suite, run from the outside (this PC).
//   cd backend/services/console && node test/security/run-all.mjs
// Needs: OpenSSL 3.5+ on PATH (post-quantum check), the Console API on https://localhost:3001.
// Server-side checks (engine isolation, stored data): run `verisec-security-check` on the server.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { Agent, fetch } from 'undici';

const HOST = '169.58.135.108';
const SITES = ['api.verisec.mmose.me', 'face.verisec.mmose.me', 'verisec.mmose.me'];
const PKI = join(process.cwd(), '..', '..', 'infra', 'pki');
let failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); if (!ok) failed++; };
const section = (t) => console.log(`\n=== ${t}`);

const tcpOpen = (port) => new Promise((res) => {
  const s = connect({ host: HOST, port, timeout: 4000 });
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('timeout', () => { s.destroy(); res(false); });
  s.on('error', () => res(false));
});
const openssl = (args, input = '') => spawnSync('openssl', args, { input, encoding: 'utf8', timeout: 20000 });

// ---------------------------------------------------------------- layer 1
section('Layer 1  exposure: only 22, 80, 443 (and the CA on 9443) answer from the internet');
for (const p of [8030, 8443, 41101, 41443, 8083, 18081, 5000, 9000, 9001, 8040, 8050, 8060, 18040, 18060, 8200, 6390, 6379]) {
  check(`port ${p} closed from outside`, !(await tcpOpen(p)));
}
check('port 443 open (HTTPS entry)', await tcpOpen(443));
check('port 9443 open (certificate authority, requires auth)', await tcpOpen(9443));

// ---------------------------------------------------------------- layer 2
section('Layer 2  transport: TLS 1.3 only, post-quantum key exchange, HSTS');
for (const h of SITES) {
  const t12 = openssl(['s_client', '-connect', `${h}:443`, '-servername', h, '-tls1_2'], '');
  check(`${h}: TLS 1.2 refused`, !/Cipher is (?!\(NONE\))/.test(t12.stdout));
  const pq = openssl(['s_client', '-connect', `${h}:443`, '-servername', h, '-tls1_3', '-groups', 'X25519MLKEM768:X25519'], '');
  check(`${h}: TLS 1.3 + X25519MLKEM768`, /Negotiated TLS1\.3 group: X25519MLKEM768/.test(pq.stdout + pq.stderr));
}
const hs = await fetch(`https://${SITES[2]}/`).catch(() => null);
check('HSTS header (2 years)', !!hs && /max-age=63072000/.test(hs.headers.get('strict-transport-security') ?? ''));
const redir = await fetch(`http://${SITES[2]}/`, { redirect: 'manual' }).catch(() => null);
check('plain http redirects to https', !!redir && [301, 308].includes(redir.status));

// ---------------------------------------------------------------- layer 3
section('Layer 3  mTLS: the global API only talks to the Console identity');
const req = 'GET /health HTTP/1.1\r\nHost: api.verisec.mmose.me\r\nConnection: close\r\n\r\n';
const base = ['s_client', '-quiet', '-connect', 'api.verisec.mmose.me:443', '-servername', 'api.verisec.mmose.me'];
const none = openssl(base, req);
check('no client certificate -> refused in the handshake', !/HTTP\/1\.1 200/.test(none.stdout) && /certificate required|alert/.test(none.stderr));
const other = openssl([...base, '-cert', join(PKI, '..', 'certs', 'localhost-cert.pem'), '-key', join(PKI, '..', 'certs', 'localhost-key.pem')], req);
check('certificate from another CA -> refused', !/HTTP\/1\.1 200/.test(other.stdout));
const good = openssl([...base, '-cert', join(PKI, 'console.crt'), '-key', join(PKI, 'console.key'), '-cert_chain', join(PKI, 'console.crt')], req);
check('Console certificate -> accepted', /HTTP\/1\.1 200/.test(good.stdout) && /"transport":"mtls"/.test(good.stdout));
const leaf = execFileSync('openssl', ['x509', '-in', join(PKI, 'console.crt'), '-noout', '-enddate'], { encoding: 'utf8' });
const hoursLeft = (Date.parse(leaf.split('=')[1]) - Date.now()) / 3.6e6;
check('Console certificate is short-lived (<= 24h)', hoursLeft > 0 && hoursLeft <= 24.1, `${hoursLeft.toFixed(1)}h left`);

// the Console's own hop: Node 24 (OpenSSL 3.5) negotiates the post-quantum group with our client certificate
const n24 = readdirSync(join(process.env.LOCALAPPDATA, 'nvm')).filter((d) => d.startsWith('v24.')).sort().pop();
if (n24) {
  const node24 = join(process.env.LOCALAPPDATA, 'nvm', n24, 'node.exe');
  const probe = spawnSync(node24, ['-e', `const t=require('tls'),f=require('fs');const s=t.connect({host:'api.verisec.mmose.me',port:443,servername:'api.verisec.mmose.me',cert:f.readFileSync(${JSON.stringify(join(PKI, 'console.crt'))}),key:f.readFileSync(${JSON.stringify(join(PKI, 'console.key'))}),minVersion:'TLSv1.3'},()=>{console.log(s.getEphemeralKeyInfo().name);s.end()});`], { encoding: 'utf8', timeout: 20000 });
  check('Console -> API hop (Node 24): post-quantum key exchange', probe.stdout.trim() === 'X25519MLKEM768', probe.stdout.trim() || probe.stderr.trim().slice(0, 80));
} else check('Node 24 installed for the Console', false);

// local HTTPS
const local = new Agent({ connect: { ca: readFileSync(join(PKI, 'dev_root.crt'), 'utf8') } });
const cons = await fetch('https://localhost:3001/api/kyc/phone/check', { method: 'POST', dispatcher: local }).catch(() => null);
check('Console API serves HTTPS', !!cons);
check('Console API: no x-powered-by, no-store', !!cons && !cons.headers.get('x-powered-by') && cons.headers.get('cache-control') === 'no-store');
const plain = await fetch('http://localhost:3001/api/kyc/phone/check', { method: 'POST' }).then(() => true).catch(() => false);
check('Console API has no plaintext listener', !plain);

// ---------------------------------------------------------------- layers 4-6
for (const [title, file, extra] of [
  ['Layer 4  DPoP: device-bound session tokens', 'dpop.mjs', []],
  ['Layers 5-6  browser encryption + tokenisation', 'e2e-document.mjs', [join(process.cwd(), '..', '..', '..', '..', 'PoA_Sourcing', 'samples', 'utility-bill.png')]],
  ['Layers 5-6  ID document read + face match, encrypted end to end', 'e2e-idv-face.mjs', [join(process.cwd(), '..', '..', '..', '..', 'PoA_Sourcing', 'samples', 'control-id-card.png')]],
  ['Storage  verification records encrypted in Postgres + MinIO', 'e2e-records.mjs', []],
  ['Storage  records readable only by signed-in operators', 'operator-api.mjs', []],
  ['Storage  operator view copes with any document (MRZ or not, odd data)', 'e2e-document-view.mjs', []],
  ['AML      full list profiles for operators, nothing to the applicant', 'e2e-aml.mjs', []],
  ['Device   device & IP analysis scored, stored encrypted, hidden from applicant', 'e2e-device.mjs', []],
]) {
  section(title);
  const r = spawnSync(process.execPath, [join('test', 'security', file), ...extra], { encoding: 'utf8', timeout: 300000 });
  process.stdout.write(r.stdout.replace(/\n(ALL PASSED|\d+ FAILED)\n?$/, '\n'));
  if (r.status !== 0) failed++;
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL LAYERS PASSED');
process.exit(failed ? 1 : 0);
