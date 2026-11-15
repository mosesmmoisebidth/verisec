/**
 * Generates `public/backdrop.svg` — the flowing line field behind the applicant
 * flow (Figma layer `52805301_9330688 1`).
 *
 * The frame ships it as ~60 hand-drawn vector paths. Reproducing them by hand
 * would be 250KB of literal path data pasted into a component and impossible to
 * adjust; this derives the same figure from the thing that actually makes it —
 * a field of horizontal lines pushed through a few rotational warps — so the
 * look is a handful of numbers rather than a wall of coordinates.
 *
 * It is written to `public/` rather than inlined for one reason: the flow has
 * eighteen pages, and inlining would put the whole field into every one of them
 * (~1.6MB across the static export). As a file it is fetched once and cached.
 *
 *     node scripts/backdrop.mjs
 *
 * Re-run it after changing anything below and commit the result — nothing in
 * the build regenerates it.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "backdrop.svg");

/* ---------------------------------------------------------------------------
   Figure
--------------------------------------------------------------------------- */

const W = 1536;
const H = 1024;

/** Line spacing. The frame draws ~12px at this width. */
const SPACING = 12.5;
/** Drawn well past the frame so a warped line still crosses the whole width. */
const OVER_Y = 280;
const OVER_X = 420;
/** Points per line. Enough that the tightest curl stays smooth once splined. */
const SAMPLES = 42;

const STROKE = "#bfeb58";
const GROUND = "#f2f2f2";

/**
 * Rotational warps. Each spins the plane around its centre, by `k` radians at
 * the centre, falling off as a gaussian over `r`. Two or three of these is what
 * separates "wavy lines" from the frame's contour-map feel: a swirl compresses
 * lines on one side and fans them on the other, which is where the light and
 * dark bands in the figure come from.
 */
const SWIRLS = [
  { cx: 1330, cy: 165, r: 540, k: 1.32 },
  { cx: 1390, cy: 690, r: 470, k: -0.92 },
  { cx: 700, cy: 780, r: 640, k: 0.52 },
  { cx: 300, cy: 300, r: 610, k: -0.4 },
];

/**
 * The global roll, and the more important half of the figure.
 *
 * Each term carries a `y` component, so neighbouring lines roll at slightly
 * different phases — they spread apart and draw together as they cross the
 * frame. That divergence is what produces the pale and dense bands; a roll in
 * `x` alone just moves every line in lockstep and reads as corduroy.
 */
function roll(x, y) {
  return (
    52 * Math.sin(x / 425 + y / 1450) +
    21 * Math.sin(x / 168 + y / 920 + 1.1) +
    9 * Math.cos(x / 88 - y / 690)
  );
}

function warp(x, y) {
  let px = x;
  let py = y + roll(x, y);
  for (const s of SWIRLS) {
    const dx = px - s.cx;
    const dy = py - s.cy;
    const a = s.k * Math.exp(-(dx * dx + dy * dy) / (2 * s.r * s.r));
    const c = Math.cos(a);
    const n = Math.sin(a);
    px = s.cx + dx * c - dy * n;
    py = s.cy + dx * n + dy * c;
  }
  return [px, py];
}

/* ---------------------------------------------------------------------------
   Path building
--------------------------------------------------------------------------- */

/** One decimal. Two is invisible at this scale and costs 20% of the file. */
const r = (n) => {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
};

/**
 * Catmull-Rom through the samples, emitted as cubics. A polyline would facet
 * visibly inside the swirls, where a 50px step turns through a real angle.
 */
function spline(pts) {
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d +=
      `C${r(p1[0] + (p2[0] - p0[0]) / 6)} ${r(p1[1] + (p2[1] - p0[1]) / 6)}` +
      ` ${r(p2[0] - (p3[0] - p1[0]) / 6)} ${r(p2[1] - (p3[1] - p1[1]) / 6)}` +
      ` ${r(p2[0])} ${r(p2[1])}`;
  }
  return d;
}

const paths = [];
for (let y = -OVER_Y; y <= H + OVER_Y; y += SPACING) {
  const pts = [];
  for (let i = 0; i <= SAMPLES; i++) {
    pts.push(warp(-OVER_X + (i / SAMPLES) * (W + OVER_X * 2), y));
  }
  paths.push(spline(pts));
}

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ` +
  `width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">` +
  `<rect width="${W}" height="${H}" fill="${GROUND}"/>` +
  `<g fill="none" stroke="${STROKE}" stroke-width="1.55" stroke-linecap="round">` +
  paths.map((d) => `<path d="${d}"/>`).join("") +
  `</g></svg>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log(`backdrop.svg — ${paths.length} lines, ${(svg.length / 1024).toFixed(1)}KB`);
