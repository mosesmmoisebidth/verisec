// One-off: upload ONLY the standalone VeriSec static pages (vault/login/signup)
// to the live doc root over FTPS, without rebuilding or touching the Next app.
// Reuses .deploy.env credentials. Safe + additive: these are new filenames that
// do not collide with the app's index.html / _next / assets.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "basic-ftp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".deploy.env");
const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { FTP_SERVER, FTP_USERNAME, FTP_PASSWORD } = env;
const FTP_REMOTE_DIR = env.FTP_REMOTE_DIR || "/";
const missing = ["FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD"].filter((k) => !env[k]);
if (missing.length) { console.error("Missing " + missing.join(", ")); process.exit(1); }

const files = ["vault.html", "login.html", "signup.html"];

async function once(n, secure) {
  const client = new Client(90_000);
  try {
    console.log(`[try ${n}] connecting to ${FTP_SERVER} (${secure ? "FTPS" : "plain FTP"}) ...`);
    await client.access({ host: FTP_SERVER, user: FTP_USERNAME, password: FTP_PASSWORD, secure, secureOptions: { rejectUnauthorized: false } });
    if (FTP_REMOTE_DIR && FTP_REMOTE_DIR !== "/") await client.ensureDir(FTP_REMOTE_DIR);
    for (const f of files) {
      process.stdout.write(`  ↑ ${f} ... `);
      await client.uploadFrom(join(root, "public", f), f);
      console.log("ok");
    }
    console.log("DONE");
    return true;
  } catch (e) {
    console.error(`[try ${n}] FAIL: ${e.message}`);
    return false;
  } finally { client.close(); }
}

// Try FTPS first (preferred), then fall back to plain FTP if the host rejects TLS.
let ok = false;
for (const secure of [true, false]) {
  ok = await once(1, secure);
  if (ok) break;
  console.log(`  ... ${secure ? "FTPS" : "plain FTP"} did not work, ${secure ? "falling back to plain FTP" : "giving up"}.`);
}
process.exit(ok ? 0 : 1);
