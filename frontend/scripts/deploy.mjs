// One-command local deploy: build the static export, then upload out/ to cPanel
// over secure FTP. No GitHub Actions / billing required.
//
//   npm run deploy
//
// Credentials are read from web/.deploy.env (gitignored). Create it once:
//
//   FTP_SERVER=ftp.mmose.tech
//   FTP_USERNAME=deploy@verivision.mmose.tech
//   FTP_PASSWORD=your-password
//   FTP_REMOTE_DIR=/
//
// FTP_REMOTE_DIR is relative to where the FTP account logs in. If the account is
// scoped to the verivision.mmose.tech document root, use "/".

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "basic-ftp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// --- load .deploy.env (simple KEY=VALUE, falls back to process.env) ----------
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
if (missing.length) {
  console.error(`\n  Missing ${missing.join(", ")}. Add them to web/.deploy.env — see scripts/deploy.mjs header.\n`);
  process.exit(1);
}

// --- 1. build the static export ----------------------------------------------
console.log("→ Building static export (NEXT_EXPORT=1) ...");
execSync("npx next build", { cwd: root, stdio: "inherit", env: { ...env, NEXT_EXPORT: "1" } });

// --- 2. upload out/ over FTPS ------------------------------------------------
const localDir = join(root, "out");
if (!existsSync(localDir)) {
  console.error("\n  out/ not found — the build did not produce a static export.\n");
  process.exit(1);
}

// The shared host's FTPS endpoint is occasionally slow/flaky on the control or
// passive-data connection, so use a generous timeout, print live progress
// (flushed each file), and retry the whole upload a few times before giving up.
const ATTEMPTS = 4;

async function uploadOnce(n) {
  const client = new Client(90_000);
  client.ftp.verbose = false;
  let lastName = "";
  client.trackProgress((info) => {
    if (info.name && info.name !== lastName) {
      lastName = info.name;
      process.stdout.write(`   ↑ ${info.name}\n`);
    }
  });
  try {
    console.log(`→ [try ${n}/${ATTEMPTS}] Connecting to ${FTP_SERVER} (FTPS) ...`);
    await client.access({
      host: FTP_SERVER,
      user: FTP_USERNAME,
      password: FTP_PASSWORD,
      secure: true, // explicit FTPS
      secureOptions: { rejectUnauthorized: false }, // tolerate shared-host certs
    });
    console.log(`→ Uploading out/ → ${FTP_REMOTE_DIR} ...`);
    await client.ensureDir(FTP_REMOTE_DIR);
    // Mirror the folder. Hashed Next chunks have unique names, so overwriting in
    // place is safe; index.html / config.js / .htaccess are always refreshed.
    await client.uploadFromDir(localDir);
    console.log("\n✓ Deployed. Live in a few seconds at https://verivision.mmose.tech\n");
    return true;
  } catch (err) {
    console.error(`✗ [try ${n}/${ATTEMPTS}] ${err.message}`);
    return false;
  } finally {
    client.close();
  }
}

let ok = false;
for (let n = 1; n <= ATTEMPTS && !ok; n++) {
  ok = await uploadOnce(n);
  if (!ok && n < ATTEMPTS) await new Promise((r) => setTimeout(r, 4000));
}
if (!ok) {
  console.error("\n✗ Deploy failed after all attempts.\n");
  process.exit(1);
}
