/**
 * Text-presence detector (readability layer).
 *
 * Runs a small PP-OCR text-detection model (DBNet-style, ~2.4MB, self-hosted)
 * in the browser to confirm the framed document actually carries readable text,
 * so we do not auto-capture a blank side, the wrong side, or a non-document. It
 * returns the fraction of the region the model marks as text; a real ID reads
 * around 0.10, a face or blank surface reads 0.
 *
 * This complements the focus/exposure/glare trio (which judges how clearly the
 * document is seen); this judges that there is genuine text content to read.
 *
 * Client-only. Shares the onnxruntime-web runtime with the presence detector.
 */

import { loadOrt, pickExecutionProviders, srcSize, zoomRect, type Corner, type FrameSource } from "@/lib/verify/docdetect";

const DEFAULT_MODEL_URL = "/models/ppocr_det.onnx";
const TW = 480; // model input width (multiple of 32)
const TH = 320; // model input height (multiple of 32)
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

// A region with at least this fraction marked as text counts as readable.
export const MIN_TEXT = 0.02;

function modelUrl(): string {
  try {
    const cfg = (window as unknown as { __RECOG_CONFIG__?: { ppocrModelUrl?: string } }).__RECOG_CONFIG__;
    const u = cfg?.ppocrModelUrl?.trim();
    return u && u.length > 0 ? u : DEFAULT_MODEL_URL;
  } catch {
    return DEFAULT_MODEL_URL;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sessionPromise: Promise<any> | null = null;

/** Loads the text-detection model once; returns the inference session. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadTextDetector(): Promise<any> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const ort = await loadOrt();
    return ort.InferenceSession.create(modelUrl(), { executionProviders: pickExecutionProviders(), graphOptimizationLevel: "all" });
  })().catch((err) => {
    sessionPromise = null;
    throw err;
  });
  return sessionPromise;
}

let tc: HTMLCanvasElement | null = null;
function cropCanvas(): HTMLCanvasElement {
  if (!tc) {
    tc = document.createElement("canvas");
    tc.width = TW;
    tc.height = TH;
  }
  return tc;
}

/**
 * Returns the fraction of the detected document region the model marks as text
 * (0..1). Compare against MIN_TEXT. Operates on the document crop only.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function detectText(session: any, video: FrameSource, corners: Corner[], zoom = 1): Promise<number> {
  const { w: vw, h: vh } = srcSize(video);
  if (!vw || !vh) return 0;

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
  // Corners are normalized to the zoomed crop; map them back to video pixels.
  const zr = zoomRect(vw, vh, zoom);
  const sx = Math.max(0, zr.sx + minx * zr.sw);
  const sy = Math.max(0, zr.sy + miny * zr.sh);
  const sw = Math.min(vw - sx, (maxx - minx) * zr.sw);
  const sh = Math.min(vh - sy, (maxy - miny) * zr.sh);
  if (sw < 8 || sh < 8) return 0;

  const cv = cropCanvas();
  const g = cv.getContext("2d", { willReadFrequently: true });
  if (!g) return 0;
  g.drawImage(video, sx, sy, sw, sh, 0, 0, TW, TH);
  const { data } = g.getImageData(0, 0, TW, TH);

  const plane = TW * TH;
  const f = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    f[p] = (data[i]! / 255 - MEAN[0]) / STD[0];
    f[plane + p] = (data[i + 1]! / 255 - MEAN[1]) / STD[1];
    f[2 * plane + p] = (data[i + 2]! / 255 - MEAN[2]) / STD[2];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ort = (window as any).ort;
  const tensor = new ort.Tensor("float32", f, [1, 3, TH, TW]);
  const inName = session.inputNames[0];
  const out = await session.run({ [inName]: tensor });
  const map = out[session.outputNames[0]].data as Float32Array;

  let c = 0;
  for (let i = 0; i < map.length; i++) if (map[i]! > 0.5) c++;
  return map.length ? c / map.length : 0;
}
