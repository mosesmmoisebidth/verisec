"use client";

/**
 * Shared runtime for the Regula face steps.
 *
 * - loads Regula's own face web component (registers <face-liveness>),
 * - calls the Regula Face-API /api/match endpoint (1:1 face match), with the
 *   exact request/response shape confirmed against the live backend:
 *     POST /api/match { images: [{ index, type, data(base64) }, ...] }
 *     -> { code, results: [{ similarity(0..1), score, firstFaceIndex, ... }], detections }
 */

import { encryptDocument } from "./document-crypto";
import { dataUrlBytes } from "./idv-client";
import { kycApi } from "./kyc-api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function faceCfg<T = string>(key: string, fallback: T): T {
  try {
    const v = (window as unknown as { __RECOG_CONFIG__?: Record<string, unknown> }).__RECOG_CONFIG__?.[key];
    return (v == null ? fallback : v) as T;
  } catch {
    return fallback;
  }
}

/**
 * Where Regula's engine (Liveness.worker.js + the ~13MB Liveness.wasm/.data)
 * is loaded from. We self-host it under public/face/wasm, because the default
 * re-downloads all of it from wasm.regulaforensics.com every single start,
 * which is what made the camera slow to appear.
 *
 * MUST be an absolute URL: the component runs `new URL(workerPath)` internally,
 * and a relative path throws "Failed to construct 'URL': Invalid URL" and the
 * engine never boots.
 */
export function faceWorkerPath(): string {
  const raw = String(faceCfg("faceWorkerPath", "/face/wasm") || "/face/wasm").replace(/\/+$/, "");
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function faceServiceUrl(): string {
  return String(faceCfg("faceServiceUrl", "https://face.verisec.mmose.me")).replace(/\/+$/, "");
}

/** Regula's recommended 1:1 verification threshold on the 0..1 similarity. */
export function matchThreshold(): number {
  const v = faceCfg<number>("faceMatchThreshold", 0.75);
  return typeof v === "number" && v > 0 && v <= 1 ? v : 0.75;
}

const num = (key: string, fallback: number, min: number, max: number): number => {
  const v = faceCfg<number>(key, fallback);
  return typeof v === "number" && v >= min && v <= max ? v : fallback;
};

/**
 * Absolute box for the oversized camera host inside the visible frame.
 *
 * Regula sizes its guide oval from the camera window's WIDTH, so we render the
 * window at `frame x faceZoom` and let the frame clip it. That decouples the
 * circle (faceZoom) from the box (faceFrameWidth/Height).
 *
 * Vertically the oval is NOT centred in Regula's window, it sits at roughly 35%
 * from the top, so centring the oversized window symmetrically leaves the circle
 * riding high in the frame. We offset `top` so the oval lands on the frame's
 * centre instead (`faceOvalCenterY` tunes that ratio).
 */
export function faceHostStyle(measured?: { width: number; height: number }): { width: string; height: string; left: string; top: string } {
  // the box's real size when it is known (a narrow screen's full-screen camera), else the configured frame
  const frameW = measured?.width || num("faceFrameWidth", 400, 120, 1200);
  const frameH = measured?.height || num("faceFrameHeight", 300, 120, 900);
  const zoom = num("faceZoom", 1.7, 1, 3);
  const ovalY = num("faceOvalCenterY", 0.35, 0.05, 0.95);
  const winW = frameW * zoom;
  const winH = frameH * zoom;
  return {
    width: `${winW}px`,
    height: `${winH}px`,
    left: `${-(winW - frameW) / 2}px`,
    top: `${frameH / 2 - ovalY * winH}px`,
  };
}

/** Regula's guide oval (the largest ellipse/circle in its shadow root), once the camera is drawn. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function guideOval(faceEl: any): Element | null {
  const sr = faceEl?.shadowRoot as ShadowRoot | null | undefined;
  if (!sr) return null;
  let best: Element | null = null;
  let area = 0;
  for (const c of sr.querySelectorAll("ellipse, circle")) {
    const r = (c as Element).getBoundingClientRect();
    if (r.width > 24 && r.height > 24 && r.width * r.height > area) {
      area = r.width * r.height;
      best = c as Element;
    }
  }
  return best;
}

/**
 * How far down (px) the camera host must move so Regula's guide oval sits at the box's vertical centre.
 * Measured from what is actually on screen (the oval's real place shifts with the box's size and Regula's
 * version), so it is right on every device instead of relying on a fixed ratio. Null until the oval exists.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ovalCenteringShift(faceEl: any, boxEl: HTMLElement | null): number | null {
  if (!boxEl) return null;
  const oval = guideOval(faceEl);
  if (!oval) return null;
  const o = oval.getBoundingClientRect();
  const b = boxEl.getBoundingClientRect();
  if (o.height === 0 || b.height === 0) return null;
  return b.top + b.height / 2 - (o.top + o.height / 2);
}

let componentPromise: Promise<void> | null = null;
/** Loads Regula's face component once (registers <face-liveness>). */
export function loadFaceComponent(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.customElements?.get("face-liveness")) return Promise.resolve();
  if (componentPromise) return componentPromise;
  componentPromise = new Promise<void>((resolve, reject) => {
    const src = faceCfg("faceComponentUrl", "/face/regula-face.iife.js");
    const done = () => resolve();
    const fail = () => {
      componentPromise = null;
      reject(new Error("face component failed to load"));
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[data-face="${src}"]`);
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", fail);
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.dataset.face = src;
    el.addEventListener("load", done);
    el.addEventListener("error", fail);
    document.head.appendChild(el);
  });
  return componentPromise;
}

/** Human message for a face-component error reason. */
export function faceReasonMsg(reason?: string): string {
  switch (reason) {
    case "CAMERA_PERMISSION_DENIED":
      return "Camera access was blocked. Please allow the camera and try again.";
    case "NO_CAMERA":
    case "INCORRECT_CAMERA_ID":
      return "No camera was found. Please use a device with a camera.";
    case "BAD_FACE_QUALITY":
      return "The face image quality was too low. Find better light and try again.";
    case "BAD_FRAME_SIZE":
      return "The camera resolution is too low for this check.";
    case "TIMEOUT_ERROR":
      return "We ran out of time waiting for a clear view of your face. Move a little closer, put your whole face in the circle, and try again.";
    case "HTTP_NOT_SUPPORTED":
      return "This check needs a secure (HTTPS) connection.";
    case "CONNECTION_ERROR":
      return "We could not reach the verification service. Check your connection and try again.";
    default:
      // The common cause here is the engine giving up while waiting for a good
      // fit (Regula's own default is a 60s positioning timeout), so say what to
      // actually do rather than a dead end the person cannot act on.
      return "We could not confirm your face. Move a little closer, put your whole face in the circle, and try again.";
  }
}

/**
 * Make Regula's face component fill its host box.
 *
 * On desktop Regula sizes its shadow-DOM window to a fixed 640x360 (it only
 * switches to width/height:100% under a 640px VIEWPORT media query), so inside a
 * narrower column the window overflows to the right and the capture circle,
 * which is centered inside that 640px window, sits off-center. We give the
 * element a block 100% box and inject one style into its shadow root forcing the
 * window to fill, exactly the responsive layout Regula itself uses on small
 * screens. Idempotent; retries until the shadow root exists.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fitFaceElement(el: any): void {
  try {
    el.style.display = "block";
    el.style.width = "100%";
    el.style.height = "100%";
  } catch {
    /* ignore */
  }
  // Display-only (the captured selfie and the liveness detection run on the RAW
  // camera stream, so none of this touches them):
  //  1. fill the frame (Regula's window is a fixed 640px on desktop),
  //  2. object-fit:contain, exactly like Regula's own demo, so the camera is at
  //     natural scale and the head fits the oval (cover zooms it out of range),
  //  3. paint Regula's mask OUTSIDE the oval a solid grey. The mask rects live
  //     inside <defs> and are untouched, so the oval stays cut out and the
  //     camera inside the circle stays clear.
  // Two persistence details, both learned the hard way:
  //  - target `>rect` and NOT `rect[fill="white"]`: Regula rewrites that fill
  //    attribute between states, which made the grey flicker away,
  //  - never add backdrop-filter: on an SVG rect the browser applies it to the
  //    whole element box and IGNORES the oval mask, frosting the circle too.
  const buildCss = () => {
    const outColor = faceCfg("faceOutsideColor", "#bcc2c9");
    const outOpacity = faceCfg<number>("faceOutsideOpacity", 1);
    return (
      // the outer box gives the rounded frame and clips it; Regula's own window is flat and see-through, so once the
      // oval is centred (which can leave the window's top edge inside the box) there is no visible seam or notch
      '[class*="_window_"]{width:100%!important;height:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;}' +
      '[class*="_videoContainer_"]{background:transparent!important;border-radius:0!important;}' +
      "video{object-fit:contain!important;background:transparent!important;}" +
      `[class*="_backgroundSvg_"]>rect{fill:${outColor}!important;fill-opacity:${outOpacity}!important;}`
    );
  };

  let tries = 0;
  let observer: MutationObserver | null = null;
  const inject = () => {
    const sr = el?.shadowRoot as ShadowRoot | null | undefined;
    if (sr) {
      if (!sr.querySelector("style[data-vs-fill]")) {
        const st = document.createElement("style");
        st.setAttribute("data-vs-fill", "");
        st.textContent = buildCss();
        sr.appendChild(st);
      }
      // Regula re-renders its shadow tree as it moves between screens, which can
      // drop our style and let the grey revert. Watch for that and put it back,
      // so the grey is the same on every state.
      if (!observer) {
        observer = new MutationObserver(() => {
          if (!el?.isConnected) {
            observer?.disconnect();
            observer = null;
            return;
          }
          const root = el.shadowRoot as ShadowRoot | null;
          if (root && !root.querySelector("style[data-vs-fill]")) {
            const again = document.createElement("style");
            again.setAttribute("data-vs-fill", "");
            again.textContent = buildCss();
            root.appendChild(again);
          }
        });
        observer.observe(sr, { childList: true, subtree: true });
      }
      return;
    }
    if (tries++ < 40) setTimeout(inject, 75);
  };
  inject();
}

/**
 * Calls `cb` once Regula's live camera is actually showing (a <video> with real
 * dimensions in the shadow root), or after `timeoutMs` as a safety net so a
 * covering "please wait" overlay can never trap the camera. Returns a canceller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function whenFaceCameraReady(el: any, cb: () => void, timeoutMs = 9000): () => void {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cb();
  };
  const poll = () => {
    if (done) return;
    if (!el || !el.isConnected) {
      done = true;
      return;
    }
    const v = el.shadowRoot ? (el.shadowRoot.querySelector("video") as HTMLVideoElement | null) : null;
    if ((v && v.videoWidth > 0 && v.videoHeight > 0) || Date.now() - started > timeoutMs) {
      finish();
      return;
    }
    timer = setTimeout(poll, 200);
  };
  poll();
  return () => {
    done = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Calls `onStuck` when Regula's live camera has NEVER come on (a playing picture) `ms` after the component was
 * mounted. "Preparing the camera" covers the download of the face engine (about 7 MB) and the camera start; a browser
 * that blocks either (Tor Browser's safer levels turn the engine's technology off) leaves the component waiting for
 * good, as does a camera permission question nobody answers. Once the camera has been on, this stands down for good,
 * so it never cuts into a check in progress. Returns a canceller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function whenFaceCameraStuck(el: any, onStuck: () => void, ms = 90_000): () => void {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const poll = () => {
    if (done) return;
    if (!el || !el.isConnected) {
      done = true;
      return;
    }
    const v = el.shadowRoot ? (el.shadowRoot.querySelector("video") as HTMLVideoElement | null) : null;
    if (v && v.videoWidth > 0 && v.videoHeight > 0 && !v.paused && v.readyState >= 2) {
      done = true; // the camera came on: the component's own timing takes over
      return;
    }
    if (Date.now() - started >= ms) {
      done = true;
      onStuck();
      return;
    }
    timer = setTimeout(poll, 500);
  };
  poll();
  return () => {
    done = true;
    if (timer) clearTimeout(timer);
  };
}

const stripDataUrl = (d: string): string => {
  const i = d.indexOf(",");
  return d.startsWith("data:") && i >= 0 ? d.slice(i + 1) : d;
};

export interface MatchResult {
  ok: boolean; // service produced a usable result
  matched: boolean; // similarity >= threshold
  similarity: number; // 0..1
  score: number;
  threshold: number;
  facesFound: number; // detections that found a face
  code: number;
  raw: unknown;
}

/**
 * 1:1 match of a live selfie against the document portrait via Regula's Face-API.
 * `selfie` and `portrait` are data URLs or bare base64.
 * Image types are Regula's ImageSource: 1 = live, 3 = document printed.
 */
/** `liveness`: whether the selfie passed the passive check first (kept on the record for resuming). */
export async function matchFaces(selfie: string, portrait: string, liveness?: boolean): Promise<MatchResult> {
  // Both images are encrypted here in the browser and matched through the verification
  // session; only the face engine's host can decrypt them (see document-crypto.ts).
  const asDataUrl = (x: string) => (x.startsWith("data:") ? x : `data:image/jpeg;base64,${stripDataUrl(x)}`);
  const seal = (x: string) => {
    const { bytes, mime } = dataUrlBytes(asDataUrl(x));
    return encryptDocument(bytes, mime);
  };
  const [sealedSelfie, sealedPortrait] = await Promise.all([seal(selfie), seal(portrait)]);
  const r = await kycApi.faceMatch({ selfie: sealedSelfie, portrait: sealedPortrait, liveness });
  if (!r.ok) throw new Error(r.reason || `match failed (${r.status ?? "network"})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = r.data;
  const result = Array.isArray(d?.results) ? d.results[0] : undefined;
  const similarity = typeof result?.similarity === "number" ? result.similarity : 0;
  const facesFound = Array.isArray(d?.detections)
    ? d.detections.filter((x: { faces?: unknown[] }) => Array.isArray(x.faces) && x.faces.length > 0).length
    : 0;
  const threshold = matchThreshold();
  return {
    ok: d?.code === 0 && !!result,
    matched: d?.code === 0 && !!result && similarity >= threshold,
    similarity,
    score: typeof result?.score === "number" ? result.score : 0,
    threshold,
    facesFound,
    code: typeof d?.code === "number" ? d.code : -1,
    raw: d,
  };
}
