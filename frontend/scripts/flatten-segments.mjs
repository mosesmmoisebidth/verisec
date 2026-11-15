// Static export writes RSC segment payloads as nested folders
// (`__next.verify/$d$step/__PAGE__.txt`), but the client requests them flat
// (`__next.verify.$d$step.__PAGE__.txt`). A plain static server cannot map one
// to the other, so every step prefetch 404s and Continue waits on a fresh
// fetch. This writes the flat copy beside each nested one. Idempotent.
import { readdirSync, statSync, copyFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
let made = 0;

function filesUnder(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const f of filesUnder(p)) {
        const flat = join(dir, name + "." + relative(p, f).split(sep).join("."));
        if (!existsSync(flat)) {
          copyFileSync(f, flat);
          made++;
        }
      }
    } else {
      walk(p);
    }
  }
}

if (existsSync(OUT)) walk(OUT);
console.log(`flatten-segments: wrote ${made} flat segment file(s)`);
