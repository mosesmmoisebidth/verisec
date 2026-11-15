/**
 * Capture quality checks: focus, exposure, glare.
 *
 * Ported to the browser from the MIT-licensed KYC document-QA libraries
 * blur-score, exposure-score and glare-score (Vijay Misal). The originals decode
 * with `sharp` (Node only); here the same algorithms run on canvas pixels so the
 * gate works live, per frame, BEFORE a photo is taken. Everything is measured on
 * the document region (from the detected corners), never the whole scene.
 *
 * Thresholds are tuned for ID capture: focus is stricter than the library
 * default, and the exposure band is widened because documents are legitimately
 * bright.
 */

import { srcSize, zoomRect, type Corner, type FrameSource } from "@/lib/verify/docdetect";

export type Verdict = "dark" | "bright" | "glare" | "blurry" | "ok";

export interface Quality {
  focus: number; // 0..1, higher is sharper
  meanLuma: number;
  focusOk: boolean;
  exposureOk: boolean;
  glareOk: boolean;
  ok: boolean;
  verdict: Verdict;
}

const PROC_W = 512; // region is measured at this working width
const BLUR_CALIB = 60; // blur-score's calibration constant
// Focus gate: score = v/(v+60). 0.70 => Laplacian variance >= ~140. A sharp ID
// filling the frame reads in the thousands, so this rejects soft/blurry frames
// while passing a genuinely crisp one. Live-tunable via config.captureFocusMin.
const FOCUS_MIN_DEFAULT = 0.76;
const MEAN_MIN = 62;
const MEAN_MAX = 225;
const CLIP_HI_MAX = 0.18; // fraction of pixels >= 251 (blown highlights)
const CLIP_LO_MAX = 0.55; // fraction of pixels <= 4 (crushed shadows)
const SAT = 245; // glare saturation cutoff
const MIN_HOTSPOT = 40; // minimum cluster size to count as a hotspot
const DELTA_L = 15; // specular hotspots sit above a darker surround by this much
const GLARE_AREA_MAX = 0.03; // specular area may cover at most this fraction

function focusMin(): number {
  try {
    const v = (window as unknown as { __RECOG_CONFIG__?: { captureFocusMin?: number } }).__RECOG_CONFIG__
      ?.captureFocusMin;
    return typeof v === "number" && v > 0 && v < 1 ? v : FOCUS_MIN_DEFAULT;
  } catch {
    return FOCUS_MIN_DEFAULT;
  }
}

let qc: HTMLCanvasElement | null = null;
function canvasFor(w: number, h: number): HTMLCanvasElement {
  if (!qc) qc = document.createElement("canvas");
  if (qc.width !== w) qc.width = w;
  if (qc.height !== h) qc.height = h;
  return qc;
}

function insetBBox(corners: Corner[]) {
  let minx = 1;
  let miny = 1;
  let maxx = 0;
  let maxy = 0;
  for (const p of corners) {
    minx = Math.min(minx, p.x);
    miny = Math.min(miny, p.y);
    maxx = Math.max(maxx, p.x);
    maxy = Math.max(maxy, p.y);
  }
  const iw = (maxx - minx) * 0.06;
  const ih = (maxy - miny) * 0.06;
  return {
    x0: Math.max(0, minx + iw),
    y0: Math.max(0, miny + ih),
    x1: Math.min(1, maxx - iw),
    y1: Math.min(1, maxy - ih),
  };
}

/** Measures focus, exposure and glare on the detected document region. */
export function assessQuality(video: FrameSource, corners: Corner[], zoom = 1): Quality | null {
  const { w: vw, h: vh } = srcSize(video);
  if (!vw || !vh) return null;

  const W = PROC_W;
  const H = Math.max(2, Math.round(PROC_W * (vh / vw)));
  const cv = canvasFor(W, H);
  const g = cv.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  const { sx, sy, sw, sh } = zoomRect(vw, vh, zoom);
  g.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);

  const bb = insetBBox(corners);
  const rx = Math.max(0, Math.round(bb.x0 * W));
  const ry = Math.max(0, Math.round(bb.y0 * H));
  const w = Math.max(2, Math.min(Math.round((bb.x1 - bb.x0) * W), W - rx));
  const h = Math.max(2, Math.min(Math.round((bb.y1 - bb.y0) * H), H - ry));
  const { data } = g.getImageData(rx, ry, w, h);
  const n = w * h;

  const gray = new Float32Array(n);
  let sum = 0;
  let clipHi = 0;
  let clipLo = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    gray[p] = l;
    sum += l;
    if (l >= 251) clipHi++;
    if (l <= 4) clipLo++;
  }
  const meanLuma = sum / n;

  // Focus: variance of the Laplacian, normalized (blur-score).
  let lm = 0;
  let cnt = 0;
  const lap = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const v = 4 * gray[p]! - gray[p - 1]! - gray[p + 1]! - gray[p - w]! - gray[p + w]!;
      lap[p] = v;
      lm += v;
      cnt++;
    }
  }
  lm /= cnt || 1;
  let vs = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const d = lap[y * w + x]! - lm;
      vs += d * d;
    }
  }
  const varLap = vs / (cnt || 1);
  const focus = varLap / (varLap + BLUR_CALIB);
  const focusOk = focus >= focusMin();

  // Exposure: mean luminance in band + clipping guards (exposure-score).
  const exposureOk =
    meanLuma >= MEAN_MIN && meanLuma <= MEAN_MAX && clipHi / n < CLIP_HI_MAX && clipLo / n < CLIP_LO_MAX;

  // Glare: clusters of saturated pixels sitting above a darker surround
  // (glare-score). Skipped when overexposed, which exposure already catches.
  let glareOk = true;
  if (meanLuma <= MEAN_MAX) {
    const sat = new Uint8Array(n);
    for (let p = 0; p < n; p++) sat[p] = gray[p]! >= SAT ? 1 : 0;
    const seen = new Uint8Array(n);
    const stack: number[] = [];
    let specArea = 0;
    for (let start = 0; start < n; start++) {
      if (!sat[start] || seen[start]) continue;
      const comp: number[] = [];
      let sumIn = 0;
      stack.length = 0;
      stack.push(start);
      seen[start] = 1;
      while (stack.length) {
        const q = stack.pop()!;
        comp.push(q);
        sumIn += gray[q]!;
        const qx = q % w;
        const qy = (q / w) | 0;
        if (qx > 0 && sat[q - 1] && !seen[q - 1]) {
          seen[q - 1] = 1;
          stack.push(q - 1);
        }
        if (qx < w - 1 && sat[q + 1] && !seen[q + 1]) {
          seen[q + 1] = 1;
          stack.push(q + 1);
        }
        if (qy > 0 && sat[q - w] && !seen[q - w]) {
          seen[q - w] = 1;
          stack.push(q - w);
        }
        if (qy < h - 1 && sat[q + w] && !seen[q + w]) {
          seen[q + w] = 1;
          stack.push(q + w);
        }
      }
      const area = comp.length;
      if (area < MIN_HOTSPOT) continue;
      let minx = w;
      let miny = h;
      let maxx = 0;
      let maxy = 0;
      for (const c of comp) {
        const cx = c % w;
        const cy = (c / w) | 0;
        if (cx < minx) minx = cx;
        if (cx > maxx) maxx = cx;
        if (cy < miny) miny = cy;
        if (cy > maxy) maxy = cy;
      }
      const pad = 2;
      let ringSum = 0;
      let ringN = 0;
      for (let x = Math.max(0, minx - pad); x <= Math.min(w - 1, maxx + pad); x++) {
        if (miny - pad >= 0) {
          ringSum += gray[(miny - pad) * w + x]!;
          ringN++;
        }
        if (maxy + pad < h) {
          ringSum += gray[(maxy + pad) * w + x]!;
          ringN++;
        }
      }
      for (let y = Math.max(0, miny - pad); y <= Math.min(h - 1, maxy + pad); y++) {
        if (minx - pad >= 0) {
          ringSum += gray[y * w + (minx - pad)]!;
          ringN++;
        }
        if (maxx + pad < w) {
          ringSum += gray[y * w + (maxx + pad)]!;
          ringN++;
        }
      }
      const ringMean = ringN ? ringSum / ringN : 255;
      const inMean = sumIn / area;
      if (inMean - ringMean >= DELTA_L) specArea += area;
    }
    glareOk = specArea / n < GLARE_AREA_MAX;
  } else {
    glareOk = false;
  }

  const ok = focusOk && exposureOk && glareOk;
  let verdict: Verdict = "ok";
  if (!exposureOk) verdict = meanLuma < MEAN_MIN ? "dark" : "bright";
  else if (!glareOk) verdict = "glare";
  else if (!focusOk) verdict = "blurry";

  return { focus, meanLuma, focusOk, exposureOk, glareOk, ok, verdict };
}
