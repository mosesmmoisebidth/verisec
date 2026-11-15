// Regenerates the styled VeriSec QR codes in `public/qr/`.
//
// The plain segno grid read as a flat black square. These are on-brand: pine
// dotted modules, ring-style finder eyes, and a lime centre pill carrying the
// VeriSec "V" mark — the ePassport-handoff frame's QR. Error-correction level H
// (30% recovery) covers the modules the centre pill sits over.
//
// Run: `node scripts/qr.mjs`

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import QRCode from "qrcode";

const PINE = "#0e3228";
const LIME = "#bfeb58";
const UNIT = 9; // px per module
const QUIET = 4; // quiet-zone modules

// The VeriSec "V" mark (from components/brand/logo.tsx), drawn in pine.
const MARK_VB = "0 0 546 553";
const MARK_PATHS = [
  "M314.589 542.322C274.668 561.604 228.032 554.489 197.136 523.409C187.002 513.151 180.133 500.953 172.832 488.416L119.235 396.345L79.1904 326.453L1.04265 188.885C-1.72964 183.988 1.35061 177.519 6.46395 177.519L72.3829 177.581C74.57 177.581 76.6029 178.844 77.8042 180.907L240.599 465.129C240.846 465.56 241.123 465.93 241.431 466.299C248.608 474.616 256.401 482.194 267.306 482.594C285.603 483.303 299.803 469.564 303.777 452.53C307.473 436.79 302.853 424.53 294.813 410.545L125.549 115.728C113.351 94.5351 112.088 67.644 121.853 45.8969C132.973 21.1619 158.17 0.646909 185.646 0.523696L299.618 0C302.421 0 304.917 2.03309 305.779 5.08261L321.581 60.6824C322.936 65.4261 319.825 70.3238 315.42 70.3238H193.594C191.53 70.3546 188.634 71.4327 187.587 72.4184C186.324 73.6505 185.677 78.7023 186.694 80.4888L365.845 391.293C395.694 443.074 368.802 516.016 314.527 542.352L314.589 542.322Z",
  "M390.487 372.714L371.266 339.138L426.28 243.371L456.56 190.02C461.457 180.101 469.774 176.99 480.155 177.052L545.181 177.452L407.275 418.118C402.808 401.022 398.711 386.421 390.456 372.714H390.487Z",
];

function inFinder(r, c, n) {
  const inBlock = (r0, c0) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  return inBlock(0, 0) || inBlock(0, n - 7) || inBlock(n - 7, 0);
}

/** A ring-style finder eye: pine disc, white disc, pine centre dot. */
function finderEye(cxUnits, cyUnits, offset) {
  const cx = (offset + cxUnits) * UNIT;
  const cy = (offset + cyUnits) * UNIT;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${3.5 * UNIT}" fill="${PINE}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${2.45 * UNIT}" fill="#ffffff"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${1.5 * UNIT}" fill="${PINE}"/>`
  );
}

function renderQR(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const dim = (n + QUIET * 2) * UNIT;
  const offset = QUIET;

  // Centre logo: a 7-module pill, with an 8.4-module clear-zone so no stray
  // dots crowd its edge.
  const gridCenter = offset + n / 2; // in module units
  const clearHalf = 4.2; // modules
  const pillHalf = 3.6; // modules

  let dots = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!data[r * n + c]) continue;
      if (inFinder(r, c, n)) continue;
      const mx = offset + c + 0.5;
      const my = offset + r + 0.5;
      // Clear the square under the centre pill.
      if (Math.abs(mx - gridCenter) < clearHalf && Math.abs(my - gridCenter) < clearHalf) continue;
      dots += `<circle cx="${(mx * UNIT).toFixed(2)}" cy="${(my * UNIT).toFixed(2)}" r="${(0.42 * UNIT).toFixed(2)}"/>`;
    }
  }

  const eyes =
    finderEye(3.5, 3.5, offset) +
    finderEye(n - 3.5, 3.5, offset) +
    finderEye(3.5, n - 3.5, offset);

  // Lime centre pill + pine mark.
  const pillSide = pillHalf * 2 * UNIT;
  const pillX = (gridCenter - pillHalf) * UNIT;
  const pillY = (gridCenter - pillHalf) * UNIT;
  const markPad = 0.24 * pillSide;
  const markSize = pillSide - markPad * 2;
  const markScale = markSize / 553; // fit the taller axis of the 546x553 mark
  const markW = 546 * markScale;
  const markX = pillX + (pillSide - markW) / 2;
  const markY = pillY + markPad;

  const logo =
    `<rect x="${pillX.toFixed(2)}" y="${pillY.toFixed(2)}" ` +
    `width="${pillSide.toFixed(2)}" height="${pillSide.toFixed(2)}" rx="${(pillSide * 0.3).toFixed(2)}" fill="${LIME}"/>` +
    `<g transform="translate(${markX.toFixed(2)},${markY.toFixed(2)}) scale(${markScale.toFixed(5)})" fill="${PINE}">` +
    MARK_PATHS.map((d) => `<path d="${d}"/>`).join("") +
    `</g>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" role="img">` +
    `<rect width="${dim}" height="${dim}" rx="${(UNIT * 2.4).toFixed(0)}" fill="#ffffff"/>` +
    `<g fill="${PINE}">${dots}</g>` +
    eyes +
    logo +
    `</svg>`
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "qr");

const CODES = {
  // Specimen handoff/session links (example.com per the no-real-PII rule).
  "qr-handoff.svg": "https://vs.example/verify/h/VV-KYC-4M2T-90XQ",
  "qr-session.svg": "https://vs.example/verify/s/ses_9F3A2K9D7Q",
};

await mkdir(outDir, { recursive: true });
for (const [file, text] of Object.entries(CODES)) {
  const svg = renderQR(text);
  await writeFile(join(outDir, file), svg, "utf8");
  console.log(`wrote public/qr/${file}  (${svg.length} bytes)`);
}
