/**
 * Document detector.
 *
 * Runs a small on-device model (DocAligner point-regression, ~4.7MB, Apache-2.0)
 * fully in the browser to find a document in the live camera and return its four
 * corners plus a presence score. The capture step uses this to auto-shoot only
 * when a real document is framed and held steady; Regula still does the reading.
 *
 * No license, no server call. The model AND the runtime are served from our own
 * origin (public/models and public/ort), so nothing depends on an external CDN
 * being reachable. If the local runtime is somehow missing, it falls back to the
 * CDN. Both are overridable via window.__RECOG_CONFIG__ (docalignerModelUrl,
 * ortDir).
 *
 * Client-only. Call loadDetector() from inside an effect.
 */

// onnxruntime-web UMD build (exposes window.ort). Pinned for reproducibility.
const ORT_VER = "1.19.2";
const LOCAL_ORT_DIR = "/ort/"; // self-hosted under public/ort
const CDN_ORT_DIR = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;

function ortCfgBool(key: string, fallback: boolean): boolean {
  try {
    const v = (window as unknown as { __RECOG_CONFIG__?: Record<string, unknown> }).__RECOG_CONFIG__?.[key];
    return typeof v === "boolean" ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Execution providers, best first. Default is multi-threaded WASM, which is
 * fast (session load ~0.8s, inference ~50ms with 4 threads) and RELIABLE.
 *
 * WebGPU is OFF by default: although it runs off the main thread, its session
 * creation here is flaky, it intermittently hangs for 8s+, which froze the
 * "Checking your photo" step on upload. Opt back in with `ortWebgpu: true` only
 * if that is fixed. Threading (from cross-origin isolation) already keeps things
 * smooth and quick.
 */
export function pickExecutionProviders(): string[] {
  try {
    const useGpu = ortCfgBool("ortWebgpu", false) && typeof navigator !== "undefined" && !!(navigator as unknown as { gpu?: unknown }).gpu;
    return useGpu ? ["webgpu", "wasm"] : ["wasm"];
  } catch {
    return ["wasm"];
  }
}

function ortDir(): string {
  try {
    const v = (window as unknown as { __RECOG_CONFIG__?: { ortDir?: string } }).__RECOG_CONFIG__?.ortDir?.trim();
    const d = v && v.length > 0 ? v : LOCAL_ORT_DIR;
    return d.endsWith("/") ? d : `${d}/`;
  } catch {
    return LOCAL_ORT_DIR;
  }
}

const DEFAULT_MODEL_URL = "/models/docaligner.onnx";
const INPUT_SIZE = 256; // model expects [1,3,256,256]

// Auto-capture gate. A shot is taken only when ALL hold for STABLE_TICKS frames.
export const HAS_OBJ_MIN = 0.9; // model's document-present score
export const AREA_MIN = 0.15; // document must fill at least this fraction of frame
export const MARGIN = 0.03; // all four corners must sit within the frame (+ margin)
export const STABLE_TICKS = 8; // ~1s of good frames at ANALYZE_MS
export const ANALYZE_MS = 120;

export interface Corner {
  x: number; // normalized 0..1 of the video frame
  y: number;
}
export interface Detection {
  hasObj: number;
  corners: Corner[]; // TL, TR, BR, BL
  areaFraction: number;
  inFrame: boolean;
  good: boolean;
  cx: number; // document centroid, normalized 0..1
  cy: number;
}

function modelUrl(): string {
  try {
    const cfg = (window as unknown as { __RECOG_CONFIG__?: { docalignerModelUrl?: string } }).__RECOG_CONFIG__;
    const u = cfg?.docalignerModelUrl?.trim();
    return u && u.length > 0 ? u : DEFAULT_MODEL_URL;
  } catch {
    return DEFAULT_MODEL_URL;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-ort="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") resolve();
      else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("failed to load runtime")));
      }
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.dataset.ort = src;
    el.addEventListener("load", () => {
      el.dataset.loaded = "1";
      resolve();
    });
    el.addEventListener("error", () => reject(new Error("failed to load runtime")));
    document.head.appendChild(el);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ortRef: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ortPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sessionPromise: Promise<any> | null = null;

/**
 * Loads the shared onnxruntime-web runtime once. Reused by every model.
 * Tries our own origin first, then the CDN, so a blocked or slow CDN cannot
 * stop the scanner from starting.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadOrt(): Promise<any> {
  if (ortPromise) return ortPromise;
  ortPromise = (async () => {
    const dirs = [...new Set([ortDir(), CDN_ORT_DIR])];
    let lastErr: unknown;
    for (const dir of dirs) {
      try {
        await loadScript(`${dir}ort.min.js`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ort = (window as any).ort;
        if (!ort?.InferenceSession) throw new Error("runtime unavailable");
        ort.env.wasm.wasmPaths = dir;
        // With cross-origin isolation (COOP+COEP → SharedArrayBuffer) we can run
        // the model MULTI-THREADED and, via proxy, OFF the main thread. That is
        // several times faster AND keeps the cursor/buttons smooth, since the
        // inference no longer blocks the UI thread. Falls back to 1 thread on the
        // main thread when the page is not isolated.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isolated = typeof SharedArrayBuffer !== "undefined" && (self as any).crossOriginIsolated === true;
        const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
        ort.env.wasm.numThreads = isolated ? Math.max(2, Math.min(cores, 4)) : 1;
        ort.env.wasm.simd = true;
        // proxy (off-main-thread) would remove UI jank entirely, but the UMD
        // build's proxy worker fails to load its wasm backend ("no available
        // backend"), so it is OFF by default. Multi-threading already shortens
        // each inference enough to keep things smooth. Off-thread would need the
        // ESM onnxruntime build, a larger change; left behind the `ortProxy` flag.
        ort.env.wasm.proxy = ortCfgBool("ortProxy", false);
        ortRef = ort;
        return ort;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("detector runtime unavailable");
  })().catch((err) => {
    ortPromise = null; // allow a later retry
    throw err;
  });
  return ortPromise;
}

/** Loads the runtime and the presence model once; returns the inference session. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadDetector(): Promise<any> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const ort = await loadOrt();
    return ort.InferenceSession.create(modelUrl(), { executionProviders: pickExecutionProviders(), graphOptimizationLevel: "all" });
  })().catch((err) => {
    sessionPromise = null; // allow a later retry
    throw err;
  });
  return sessionPromise;
}

// Scratch canvas reused for every frame, kept off the DOM.
let work: HTMLCanvasElement | null = null;
function workCanvas(): HTMLCanvasElement {
  if (!work) {
    work = document.createElement("canvas");
    work.width = INPUT_SIZE;
    work.height = INPUT_SIZE;
  }
  return work;
}

/**
 * The centred crop of the source for a given digital zoom. Everything (display,
 * detection, capture) uses the same rect so what the applicant sees is exactly
 * what gets measured and saved.
 */
export function zoomRect(vw: number, vh: number, zoom: number) {
  const z = Math.max(1, zoom);
  const sw = vw / z;
  const sh = vh / z;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
}

function shoelaceArea(p: Corner[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    a += p[i]!.x * p[j]!.y - p[j]!.x * p[i]!.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Runs one detection on the current video frame. Returns null if the frame is
 * not ready. Coordinates are normalized (0..1) to the full video frame.
 */
// A live camera, a still image, or a canvas can all be analysed.
let readable: boolean | null = null;

/**
 * Can this page read back the pixels it draws? Some browsers hide them to stop fingerprinting (Tor Browser and other
 * strict privacy modes give a blank or scrambled picture instead). Every in-browser check reads pixels, so on such a
 * browser it would judge a blank picture and refuse every photo: the checks then step aside and the server's read of
 * the original file decides. The few levels of noise some browsers add still count as readable. Asked once per page.
 */
export function pixelsReadable(): boolean {
  if (readable !== null) return readable;
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return (readable = false);
    // two known colours: a blank, white or random placeholder cannot match both
    g.fillStyle = "rgb(20,180,60)";
    g.fillRect(0, 0, 8, 4);
    g.fillStyle = "rgb(200,40,120)";
    g.fillRect(0, 4, 8, 4);
    const d = g.getImageData(0, 0, 8, 8).data;
    const at = (k: number) => d[k] ?? -1;
    const near = (i: number, r: number, gr: number, b: number) =>
      Math.abs(at(i) - r) <= 8 && Math.abs(at(i + 1) - gr) <= 8 && Math.abs(at(i + 2) - b) <= 8 && at(i + 3) >= 247;
    readable = near(0, 20, 180, 60) && near(63 * 4, 200, 40, 120);
  } catch {
    readable = false;
  }
  return readable;
}

export type FrameSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export function srcSize(s: FrameSource): { w: number; h: number } {
  const w =
    (s as HTMLVideoElement).videoWidth || (s as HTMLImageElement).naturalWidth || (s as HTMLCanvasElement).width || 0;
  const h =
    (s as HTMLVideoElement).videoHeight || (s as HTMLImageElement).naturalHeight || (s as HTMLCanvasElement).height || 0;
  return { w, h };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function detect(session: any, video: FrameSource, zoom = 1): Promise<Detection | null> {
  const { w: vw, h: vh } = srcSize(video);
  if (!vw || !vh) return null;

  const c = workCanvas();
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  const { sx, sy, sw, sh } = zoomRect(vw, vh, zoom);
  g.drawImage(video, sx, sy, sw, sh, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = g.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  const plane = INPUT_SIZE * INPUT_SIZE;
  const f = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    f[p] = data[i]! / 255; // R
    f[plane + p] = data[i + 1]! / 255; // G
    f[2 * plane + p] = data[i + 2]! / 255; // B
  }

  const ort = ortRef;
  const tensor = new ort.Tensor("float32", f, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const out = await session.run({ img: tensor });
  const pts = out.points.data as Float32Array;
  const hasObj = (out.has_obj.data as Float32Array)[0] ?? 0;

  const corners: Corner[] = [
    { x: pts[0]!, y: pts[1]! },
    { x: pts[2]!, y: pts[3]! },
    { x: pts[4]!, y: pts[5]! },
    { x: pts[6]!, y: pts[7]! },
  ];
  const areaFraction = shoelaceArea(corners);
  const inFrame = corners.every((p) => p.x >= -MARGIN && p.x <= 1 + MARGIN && p.y >= -MARGIN && p.y <= 1 + MARGIN);
  const good = hasObj >= HAS_OBJ_MIN && areaFraction >= AREA_MIN && inFrame;
  const cx = (corners[0]!.x + corners[1]!.x + corners[2]!.x + corners[3]!.x) / 4;
  const cy = (corners[0]!.y + corners[1]!.y + corners[2]!.y + corners[3]!.y) / 4;

  return { hasObj, corners, areaFraction, inFrame, good, cx, cy };
}
