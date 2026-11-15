"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw, ScanLine, Upload as UploadIcon, X } from "lucide-react";

import { FlowShell } from "@/components/verify/flow-shell";
import type { ScreenContext } from "@/lib/verify/types";
import { hydrateFlow, isSingleImageDoc, writeFlow } from "@/lib/verify/flow-store";
import { ANALYZE_MS, STABLE_TICKS, detect, loadDetector, pixelsReadable, zoomRect, type Detection } from "@/lib/verify/docdetect";
import { assessQuality, type Quality } from "@/lib/verify/quality";
import { MIN_TEXT, detectText, loadTextDetector } from "@/lib/verify/textdetect";
import { readDocumentOnce } from "@/lib/verify/idv-read-once";
import { recordDevice } from "@/lib/verify/record";
import { cn } from "@/lib/utils";

type Side = "front" | "back";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const TEXT_EVERY = 5; // re-check text presence roughly every 5 frames
const CAPTURE_TIMEOUT_MS = 70000; // give up after 70s and guide the user
const DOC_RATIO_CARD = 1.586; // ISO/IEC 7810 ID-1 (ID card, driver licence)
const DOC_RATIO_PASSPORT = 1.42; // ISO/IEC 7810 ID-3 (passport data page)
const ALIGN_AREA_MIN = 0.4; // the document must fill this fraction of the frame (i.e. sit in the guide)
const CENTER_TOL = 0.24; // the document centre must sit within this of the frame centre

// Digital zoom: enlarge the centre of the camera so a hand-held document fills
// the guide. Applied identically to the view, the detection and the capture.
function captureZoom(): number {
  try {
    const v = (window as unknown as { __RECOG_CONFIG__?: { captureZoom?: number } }).__RECOG_CONFIG__?.captureZoom;
    return typeof v === "number" && v >= 1 && v <= 3 ? v : 1.7;
  } catch {
    return 1.7;
  }
}

// How many consecutive good frames (~STABLE_TICKS * ANALYZE_MS) before the shot
// is taken. Lower = snappier, higher = steadier. Live-tunable via config so the
// capture feel can be dialled per device without a rebuild.
function captureStableTicks(): number {
  try {
    const v = (window as unknown as { __RECOG_CONFIG__?: { captureStableTicks?: number } }).__RECOG_CONFIG__
      ?.captureStableTicks;
    return typeof v === "number" && v >= 3 && v <= 30 ? Math.round(v) : STABLE_TICKS;
  } catch {
    return STABLE_TICKS;
  }
}

/** The document must actually be placed in the guide: present, whole, filling it, centred. */
function aligned(d: Detection): boolean {
  return (
    d.hasObj >= 0.9 &&
    d.inFrame &&
    d.areaFraction >= ALIGN_AREA_MIN &&
    Math.abs(d.cx - 0.5) <= CENTER_TOL &&
    Math.abs(d.cy - 0.5) <= CENTER_TOL
  );
}

// Each message names the one thing actually failing, so the applicant is never
// told to fix something that is already fine.
function guidance(d: Detection | null, q: Quality | null, readMissing: boolean): string {
  if (!d || d.hasObj < 0.5) return "Place your document in the frame";
  if (!d.inFrame) return "Fit the whole document inside the guide";
  if (d.areaFraction < ALIGN_AREA_MIN) return "Move closer to fill the guide";
  if (Math.abs(d.cx - 0.5) > CENTER_TOL || Math.abs(d.cy - 0.5) > CENTER_TOL) return "Centre the document in the guide";
  if (d.areaFraction > 0.97) return "Move back a little";
  if (q) {
    if (q.verdict === "dark") return "Find brighter, even light";
    if (q.verdict === "bright") return "Too bright, cut the light or glare";
    if (q.verdict === "glare") return "Tilt to remove the reflection";
    if (q.verdict === "blurry") return "Hold still while it focuses";
  }
  if (readMissing) return "Show the side with your details";
  return "Hold steady";
}

/**
 * A translucent layout template of the document itself (ICAO 9303): for a
 * passport, the portrait box on the left, data-field lines on the right and the
 * two MRZ lines across the bottom; for a card, portrait + chip + field lines.
 * The applicant lines their real document up with it. It is a GENERIC silhouette
 * (no country artwork), which is what identity apps use and avoids reproducing a
 * real document. Turns green once every check passes.
 */
function DocTemplate({ variant, good }: { variant: "passport" | "card"; good: boolean }) {
  const col = good ? "#c6f24e" : "#ffffff";
  // A little person silhouette so the portrait area reads instantly.
  const portrait = (cx: number, headY: number, r: number) => (
    <>
      <circle cx={cx} cy={headY} r={r} fill={col} opacity="0.4" />
      <path d={`M${cx - r * 1.7} ${headY + r * 3.4} a${r * 1.7} ${r * 1.5} 0 0 1 ${r * 3.4} 0 z`} fill={col} opacity="0.32" />
    </>
  );
  if (variant === "passport") {
    return (
      <svg viewBox="0 0 142 100" preserveAspectRatio="none" className="absolute inset-[4%]" aria-hidden>
        {/* header: type + code */}
        <rect x="8" y="7" width="66" height="6" rx="3" fill={col} opacity="0.6" />
        <rect x="112" y="7" width="22" height="6" rx="3" fill={col} opacity="0.45" />
        {/* portrait */}
        <rect x="8" y="20" width="42" height="52" rx="4" fill="none" stroke={col} strokeWidth="2.2" opacity="0.9" />
        {portrait(29, 38, 8)}
        {/* fields: label + value pairs */}
        <rect x="58" y="22" width="24" height="4" rx="2" fill={col} opacity="0.45" />
        <rect x="58" y="29" width="74" height="5" rx="2.5" fill={col} opacity="0.7" />
        <rect x="58" y="41" width="24" height="4" rx="2" fill={col} opacity="0.45" />
        <rect x="58" y="48" width="60" height="5" rx="2.5" fill={col} opacity="0.7" />
        <rect x="58" y="60" width="44" height="5" rx="2.5" fill={col} opacity="0.6" />
        {/* machine-readable zone: two mono lines */}
        <line x1="8" y1="82" x2="134" y2="82" stroke={col} strokeWidth="6" strokeDasharray="2.6 1.8" opacity="0.7" />
        <line x1="8" y1="91" x2="134" y2="91" stroke={col} strokeWidth="6" strokeDasharray="2.6 1.8" opacity="0.7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 158 100" preserveAspectRatio="none" className="absolute inset-[4%]" aria-hidden>
      {/* header: country / title + emblem */}
      <rect x="8" y="8" width="86" height="7" rx="3.5" fill={col} opacity="0.6" />
      <circle cx="140" cy="15" r="9" fill="none" stroke={col} strokeWidth="1.8" opacity="0.65" />
      {/* portrait */}
      <rect x="8" y="24" width="46" height="54" rx="4" fill="none" stroke={col} strokeWidth="2.2" opacity="0.9" />
      {portrait(31, 44, 9)}
      {/* chip */}
      <rect x="62" y="70" width="18" height="13" rx="2.5" fill={col} opacity="0.5" />
      {/* fields: label + value pairs */}
      <rect x="62" y="24" width="28" height="4" rx="2" fill={col} opacity="0.45" />
      <rect x="62" y="31" width="84" height="5" rx="2.5" fill={col} opacity="0.7" />
      <rect x="62" y="43" width="28" height="4" rx="2" fill={col} opacity="0.45" />
      <rect x="62" y="50" width="66" height="5" rx="2.5" fill={col} opacity="0.7" />
      {/* signature line */}
      <line x1="92" y1="76" x2="150" y2="76" stroke={col} strokeWidth="1.6" strokeDasharray="2 2" opacity="0.55" />
    </svg>
  );
}

/**
 * The alignment guide: the document template at its real aspect ratio (ISO/IEC
 * 7810 ID-1 for cards, ID-3 for passports) with corner brackets that turn green
 * once every check passes, and the area outside dimmed to draw the eye in.
 */
function DocOverlay({ ratio, good, variant }: { ratio: number; good: boolean; variant: "passport" | "card" }) {
  const stroke = good ? "border-lime" : "border-white/90";
  const brackets = [
    "top-[-2px] left-[-2px] border-t-[4px] border-l-[4px] rounded-tl-[18px]",
    "top-[-2px] right-[-2px] border-t-[4px] border-r-[4px] rounded-tr-[18px]",
    "bottom-[-2px] left-[-2px] border-b-[4px] border-l-[4px] rounded-bl-[18px]",
    "bottom-[-2px] right-[-2px] border-b-[4px] border-r-[4px] rounded-br-[18px]",
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center">
      <div
        className="relative w-[93%] rounded-[16px]"
        style={{ aspectRatio: String(ratio), boxShadow: "0 0 0 9999px rgba(20,38,28,0.5)" }}
      >
        {brackets.map((b) => (
          <span key={b} className={cn("absolute size-11 transition-colors", stroke, b)} />
        ))}
        <DocTemplate variant={variant} good={good} />
      </div>
    </div>
  );
}

type FailReason = "ok" | "no-document" | "dark" | "bright" | "glare" | "blurry" | "unreadable";

// The FINAL still-image gate is deliberately lenient on sharpness: live capture
// already held the sharpness bar, and the saved JPEG is a touch softer, so this
// only rejects a genuinely blurry image. Tunable via config.validateFocusMin.
function validateFocusMin(): number {
  try {
    const v = (window as unknown as { __RECOG_CONFIG__?: { validateFocusMin?: number } }).__RECOG_CONFIG__
      ?.validateFocusMin;
    return typeof v === "number" && v > 0 && v < 1 ? v : 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Never let the on-device check hang the upload. If a model stalls (a bad GPU
 * driver, a slow first compile, anything), we let the photo through after this
 * budget rather than freezing on "Checking your photo": Confirm Details re-reads
 * the document through Regula anyway and is the real gate, so nothing unsafe
 * slips past, the applicant just isn't blocked by a stuck client check.
 */
const VALIDATE_BUDGET_MS = 6000;
function withBudget<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * Final gate before the SDK: on the finished image (captured OR uploaded), run
 * the same models used live: is a document present (DocAligner), is it clear
 * (focus/exposure/glare), and is there readable text (PP-OCR). Uploads otherwise
 * skip every check, so this is what stops a blurry shot or a no-ID photo.
 */
function validateStill(dataUrl: string): Promise<FailReason> {
  return withBudget(validateStillInner(dataUrl), VALIDATE_BUDGET_MS, "ok");
}

async function validateStillInner(dataUrl: string): Promise<FailReason> {
  const img = new Image();
  img.src = dataUrl;
  try {
    await img.decode();
  } catch {
    return "no-document";
  }
  // the browser hides pixels from the page (Tor Browser, strict privacy modes): the checks below would only see a
  // blank picture, so the server's read of the original file decides instead
  if (!pixelsReadable()) return "ok";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any;
  try {
    session = await loadDetector();
  } catch {
    return "ok"; // models unavailable: do not block the applicant
  }
  const d = await detect(session, img, 1);
  // A still only needs a document PRESENT (not filling a live guide).
  if (!d || d.hasObj < 0.9 || !d.inFrame || d.areaFraction < 0.12) return "no-document";
  const q = assessQuality(img, d.corners, 1);
  if (q) {
    if (!q.exposureOk) return q.verdict === "bright" ? "bright" : "dark";
    if (!q.glareOk) return "glare";
    if (q.focus < validateFocusMin()) return "blurry"; // lenient: clearly-blurry only
  }
  try {
    const ts = await loadTextDetector();
    const cover = await detectText(ts, img, d.corners, 1);
    if (cover < MIN_TEXT) return "unreadable";
  } catch {
    /* readability model optional */
  }
  return "ok";
}

function reasonMsg(r: FailReason): string {
  switch (r) {
    case "no-document":
      return "We couldn't find a document in that image. Make sure the ID fills the frame, then try again.";
    case "dark":
      return "That image is too dark. Please use better light and try again.";
    case "bright":
      return "That image is too bright. Please cut the light or glare and try again.";
    case "glare":
      return "There's glare on the document. Please remove the reflection and try again.";
    case "blurry":
      return "That image is too blurry. Please retake it sharper.";
    case "unreadable":
      return "The text isn't clear enough to read. Please retake it sharper.";
    default:
      return "We couldn't use that image. Please try again.";
  }
}

// Perceptual hash (dHash). Two images of the SAME document side hash almost the
// same, so the same photo (or the same side twice) can't be used for both sides.
const SAME_SIDE_MAX = 10; // Hamming distance at or below this = same side / duplicate

async function dHash(dataUrl: string): Promise<Uint8Array> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const W = 9;
  const H = 8;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const bits = new Uint8Array((W - 1) * H); // 64 bits
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return bits;
  g.drawImage(img, 0, 0, W, H);
  const { data } = g.getImageData(0, 0, W, H);
  let idx = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      const j = (y * W + x + 1) * 4;
      const l1 = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      const l2 = 0.299 * data[j]! + 0.587 * data[j + 1]! + 0.114 * data[j + 2]!;
      bits[idx++] = l1 > l2 ? 1 : 0;
    }
  }
  return bits;
}

function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

async function isSameSide(a: string, b: string): Promise<boolean> {
  // hidden pixels make every photo look alike: no comparison here (the server compares the front and back it reads)
  if (!pixelsReadable()) return false;
  try {
    const [ha, hb] = await Promise.all([dHash(a), dHash(b)]);
    return hammingDistance(ha, hb) <= SAME_SIDE_MAX;
  } catch {
    return false;
  }
}

export function DocumentCaptureClient({ front, back }: { front: ScreenContext; back: ScreenContext }) {
  const router = useRouter();
  // The chosen document type and any prior captures are read AFTER mount, so the
  // first client render matches the server-rendered HTML (no hydration gap).
  const [hydrated, setHydrated] = useState(false);
  const [single, setSingle] = useState(false);
  const [images, setImages] = useState<{ front?: string; back?: string }>({});
  const [side, setSide] = useState<Side>("front");
  const [pending, setPending] = useState<string | null>(null);
  const [engineLoading, setEngineLoading] = useState(true);
  // Only two things drive the live view: whether the frame is good (the guide
  // turns green) and one line of guidance text. Storing just these, and updating
  // them ONLY when they change, keeps the ~8 fps detection loop from re-rendering
  // the whole component every tick (that was the capture-screen lag).
  const [good, setGood] = useState(false);
  const [guidanceText, setGuidanceText] = useState("Place your document in the frame");
  const [camError, setCamError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [checking, setChecking] = useState(false);
  const [mode, setMode] = useState<"capture" | "upload">("capture");
  const [verifying, setVerifying] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Guaranteed camera shutdown: stop any live stream when this screen unmounts
  // (navigating to Confirm Details) so the camera light never stays on.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  const required: Side[] = single ? ["front"] : ["front", "back"];
  const allDone = hydrated && required.every((s) => !!images[s]);
  // The camera runs ONLY in capture mode. Choosing Upload closes it entirely.
  const showCamera = hydrated && mode === "capture" && !allDone && !pending && !images[side] && !timedOut;
  const ctx = side === "front" ? front : back;
  const docRatio = single ? DOC_RATIO_PASSPORT : DOC_RATIO_CARD;
  const zoom = captureZoom();
  const stableTicks = captureStableTicks();
  const label = (s: Side) => (single ? "Document" : s === "front" ? "Front" : "Back");

  // Start reading the document the moment every side it needs is accepted, so the read runs while
  // the applicant looks at their photos and Continue rarely waits. A retake changes the images and
  // starts a fresh read; Continue and Confirm Details pick up whichever read matches.
  useEffect(() => {
    if (allDone && images.front) readDocumentOnce(images.front, single ? undefined : images.back).catch(() => undefined);
  }, [allDone, images.front, images.back, single]);

  useEffect(() => {
    let live = true;
    void hydrateFlow().then((f) => {
      if (!live) return;
      const sng = isSingleImageDoc(f.docType);
      const req: Side[] = sng ? ["front"] : ["front", "back"];
      const docs = f.documents ?? {};
      setSingle(sng);
      setImages(docs);
      setSide(req.find((s) => !docs[s]) ?? "front");
      setHydrated(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const persist = (next: { front?: string; back?: string }) => {
    setImages(next);
    writeFlow({ documents: next });
  };

  const advance = (next: { front?: string; back?: string }) => {
    persist(next);
    const missing = required.find((s) => !next[s]);
    if (missing) setSide(missing);
  };

  // Own the camera while a side still needs a photo. The model decides when to
  // shoot: only when a real document is framed and held steady.
  useEffect(() => {
    if (!showCamera) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let ticks = 0;
    let busy = false;
    let shot = false;
    // Last values pushed to React, so we only re-render on an actual change.
    let lastGood = false;
    let lastGuide = "";

    setEngineLoading(true);
    setGood(false);
    setCamError(null);

    // Readability model loads in the background; capture waits for it unless it fails.
    let textSession: unknown = null;
    let textReady = false;
    let textFailed = false;
    let textOk = false;
    let sinceText = 0;
    loadTextDetector()
      .then((s) => {
        textSession = s;
        textReady = true;
      })
      .catch(() => {
        textFailed = true;
      });

    const grabFullFrame = (): string => {
      const v = videoRef.current!;
      const { sx, sy, sw, sh } = zoomRect(v.videoWidth, v.videoHeight, zoom);
      const c = document.createElement("canvas");
      c.width = Math.round(sw);
      c.height = Math.round(sh);
      c.getContext("2d")?.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.92);
    };

    (async () => {
      let session;
      try {
        session = await loadDetector();
      } catch {
        if (!cancelled) {
          setEngineLoading(false);
          setCamError("The document scanner could not start. Please use Upload.");
        }
        return;
      }
      if (cancelled) return;
      // the live scanner and its photo both need the camera's pixels: a browser that hides them can only upload
      if (!pixelsReadable()) {
        setEngineLoading(false);
        setCamError("The document scanner could not start. Please use Upload.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        // If the effect was torn down (navigation, side done) WHILE getUserMedia
        // was resolving, its cleanup already ran with no stream to stop. Stop this
        // just-acquired stream now so the camera never stays on. This is the leak
        // that a full page reload used to hide and client navigation exposed.
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        recordDevice("camera"); // camera labels are readable now: virtual camera check
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        setEngineLoading(false);
        setCamError(
          name === "NotAllowedError"
            ? "Camera blocked. Allow access, or use Upload."
            : "No camera. Use Upload instead.",
        );
        return;
      }
      if (!cancelled) setEngineLoading(false);
      const startedAt = Date.now();

      timer = window.setInterval(async () => {
        const v = videoRef.current;
        if (!v || busy || shot || cancelled) return;
        busy = true;
        try {
          // Give up after a while and send the applicant to fix their conditions.
          if (Date.now() - startedAt > CAPTURE_TIMEOUT_MS) {
            shot = true;
            window.clearInterval(timer);
            stream?.getTracks().forEach((t) => t.stop());
            setTimedOut(true);
            return;
          }
          const d = await detect(session, v, zoom);
          if (cancelled || !d) return;
          const q = d.hasObj >= 0.5 ? assessQuality(v, d.corners, zoom) : null;
          const baseGood = aligned(d) && !!q && q.ok;

          // Readability: confirm real text is present, on a light cadence.
          if (baseGood) {
            if (textReady && (!textOk || sinceText >= TEXT_EVERY)) {
              try {
                const cover = await detectText(textSession, v, d.corners, zoom);
                textOk = cover >= MIN_TEXT;
              } catch {
                textOk = false;
              }
              sinceText = 0;
            } else {
              sinceText += 1;
            }
          } else {
            textOk = false;
            sinceText = 0;
          }
          const textGate = textFailed ? true : textReady && textOk;
          const isGood = baseGood && textGate;
          const readMissing = baseGood && textReady && !textOk;

          // Push to React only when something visible actually changed.
          const text = guidance(d, q, readMissing);
          if (isGood !== lastGood) {
            lastGood = isGood;
            setGood(isGood);
          }
          if (text !== lastGuide) {
            lastGuide = text;
            setGuidanceText(text);
          }
          if (isGood) {
            ticks += 1;
            if (ticks >= stableTicks) {
              shot = true;
              window.clearInterval(timer);
              setPending(grabFullFrame());
            }
          } else {
            ticks = 0;
          }
        } finally {
          busy = false;
        }
      }, ANALYZE_MS);
    })();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    // Intentionally NOT keyed on `side`: switching Front/Back keeps the one live
    // camera running, so there is no restart flash between sides. `stableTicks`
    // is a static config value, so listing it never restarts the camera.
  }, [showCamera, zoom, stableTicks]);

  // Validate the finished image (present + clear + readable) AND confirm it is not
  // the same side as the other one, before it is allowed through to the SDK.
  const finalize = async (dataUrl: string): Promise<boolean> => {
    setUploadError(null);
    setChecking(true);
    const r = await validateStill(dataUrl);
    if (r !== "ok") {
      setChecking(false);
      setUploadError(reasonMsg(r));
      return false;
    }
    const other = side === "front" ? images.back : images.front;
    if (other && (await isSameSide(dataUrl, other))) {
      setChecking(false);
      setUploadError(
        side === "front"
          ? "This looks like the same side as the back. Please use the front of your document."
          : "This looks like the same side as the front. Please use the back of your document.",
      );
      return false;
    }
    setChecking(false);
    return true;
  };

  const usePending = async () => {
    if (!pending || checking) return;
    if (!(await finalize(pending))) {
      setPending(null);
      return;
    }
    advance({ ...images, [side]: pending });
    writeFlow({ captureMode: "capture" });
    setPending(null);
  };

  const onUpload = (file?: File | null) => {
    setUploadError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setUploadError("Only JPG, PNG or WEBP images are allowed (no PDFs or other files).");
      if (uploadRef.current) uploadRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      if (uploadRef.current) uploadRef.current.value = "";
      if (!(await finalize(dataUrl))) return;
      advance({ ...images, [side]: dataUrl });
      writeFlow({ captureMode: "upload" });
      setPending(null);
    };
    reader.readAsDataURL(file);
  };

  const retake = (s: Side) => {
    setPending(null);
    setUploadError(null);
    setSide(s);
    persist({ ...images, [s]: undefined });
  };

  // Continue: read the document once here and store the result, purely so Confirm
  // Details does not have to read it again. Confirm Details is the single source
  // of truth for the front/back judgement (same-side, mismatch, quality, retry),
  // so this does NOT gate. If the read fails, we still move on and Confirm Details
  // reads again and surfaces anything wrong. A passport (single) has no back, so
  // it proceeds straight through and is read on Confirm Details.
  const proceed = async () => {
    if (!allDone || verifying) return;
    writeFlow({ documents: images });
    if (single) {
      router.push("/verify/document-review");
      return;
    }
    setVerifying(true);
    try {
      const res = await readDocumentOnce(images.front!, images.back);
      // a new read: Confirm Details still has to record it on the verification
      writeFlow({ idvResult: res, idvProcessed: false });
    } catch {
      /* leave idvResult unset; Confirm Details will read again and handle it */
    }
    router.push("/verify/document-review");
  };

  const nav = {
    onNext: proceed,
    nextDisabled: !allDone,
    loading: verifying,
  };

  return (
    <FlowShell ctx={ctx} nav={nav}>
      <div className="flex w-full flex-col gap-4">
        {allDone ? (
          /* Everything captured: no way to add more; only Continue or Retake a side. */
          <div className="flex flex-col gap-3">
            <div className={cn("grid gap-3", single ? "grid-cols-1" : "grid-cols-2")}>
              {required.map((s) => (
                <div key={s} className="flex flex-col gap-1.5">
                  <span className="text-field font-medium text-pine/82">{label(s)}</span>
                  <div className="relative aspect-[3/2] overflow-hidden rounded-tile border border-pine/20 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={images[s]} alt={label(s)} className="absolute inset-0 size-full object-contain" />
                    <button
                      type="button"
                      onClick={() => retake(s)}
                      className="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-pill bg-white/92 px-2.5 py-1 text-eyebrow font-medium text-pine shadow-sm hover:bg-white"
                    >
                      <RefreshCw className="size-3.5" strokeWidth={1.9} /> Retake
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {verifying ? (
              <p className="m-0 flex items-center gap-2 rounded-well bg-pine/5 px-4 py-2.5 text-read text-quiet">
                <Loader2 className="size-4 animate-spin" /> Please wait, preparing your details
              </p>
            ) : (
              <p className="m-0 flex items-center gap-2 rounded-well bg-pass-tint/60 px-4 py-2.5 text-read text-ramp-2">
                <Check className="size-4" strokeWidth={2.4} />
                {single ? "Document captured" : "Front and back captured"}. Continue when you're ready.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Side switch (cards) + Capture / Upload mode toggle */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {!single ? (
                <div className="flex items-center gap-2">
                  {required.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setPending(null);
                        setUploadError(null);
                        setSide(s);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-body font-medium transition-colors",
                        side === s ? "bg-pine text-white" : "bg-pine/8 text-pine/70 hover:bg-pine/12",
                      )}
                    >
                      {images[s] ? <Check className="size-3.5" strokeWidth={2.6} /> : null}
                      {label(s)}
                    </button>
                  ))}
                </div>
              ) : (
                <span />
              )}
              <div className="inline-flex rounded-pill bg-pine/8 p-1">
                {(["capture", "upload"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setPending(null);
                      setUploadError(null);
                      // The toggle only switches the view. The file picker opens from
                      // the upload area itself, never from the toggle.
                    }}
                    className={cn(
                      "rounded-pill px-4 py-1.5 text-body font-medium transition-colors",
                      mode === m ? "bg-white text-pine shadow-sm" : "text-pine/60 hover:text-pine",
                    )}
                  >
                    {m === "capture" ? "Take a photo" : "Upload"}
                  </button>
                ))}
              </div>
            </div>

            {/* The frame shows exactly one thing: the saved image, a pending shot,
                the upload area, or the camera. Camera never runs in Upload mode. */}
            <div
              className="relative flex w-full items-center justify-center overflow-hidden rounded-tile bg-pine/5"
              style={{ aspectRatio: String(docRatio) }}
            >
              {images[side] ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={images[side]} alt={label(side)} className="absolute inset-0 size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => retake(side)}
                    className="absolute top-2.5 right-2.5 z-20 inline-flex items-center gap-1.5 rounded-pill bg-white/92 px-3 py-1.5 text-eyebrow font-medium text-pine shadow-sm backdrop-blur transition-colors hover:bg-white"
                  >
                    <X className="size-3.5" strokeWidth={2} /> Remove
                  </button>
                </>
              ) : pending ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pending} alt={label(side)} className="absolute inset-0 size-full object-cover" />
              ) : mode === "upload" ? (
                <button
                  type="button"
                  onClick={() => uploadRef.current?.click()}
                  className="group flex size-full cursor-pointer flex-col items-center justify-center gap-2 rounded-tile border-2 border-dashed border-pine/25 px-6 text-center transition-colors hover:border-pine/45 hover:bg-pine/[0.05] focus-visible:border-pine focus-visible:outline-none"
                >
                  <UploadIcon aria-hidden className="size-9 text-pine/70 transition-transform group-hover:-translate-y-0.5" strokeWidth={1.4} />
                  <span className="text-field font-medium text-pine">Click to upload your {label(side).toLowerCase()}</span>
                  <span className="text-eyebrow text-pine/55">JPG, PNG or WEBP</span>
                </button>
              ) : timedOut ? (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <ScanLine className="size-[46px] text-pine" strokeWidth={1.3} />
                  <p className="m-0 max-w-[34ch] text-field text-pine">
                    We couldn&apos;t get a clear read. Move to a brighter spot, put the document on a flat, dark
                    surface, then try again.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTimedOut(false)}
                    className="inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-5 text-body font-medium text-pine shadow-cta transition-[filter] hover:brightness-95"
                  >
                    <RefreshCw className="size-4" strokeWidth={1.9} /> Try again
                  </button>
                </div>
              ) : camError ? (
                <div className="flex flex-col items-center gap-2 px-6 text-center">
                  <ScanLine className="size-[52px] text-pine" strokeWidth={1.3} />
                  <p className="m-0 max-w-[32ch] text-field text-pine">{camError}</p>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="absolute inset-0 size-full object-cover"
                    style={{ transform: `scale(${zoom})` }}
                  />
                  <DocOverlay ratio={docRatio} good={good} variant={single ? "passport" : "card"} />

                  {/* Just text at the bottom. The frame stays as-is while the camera loads. */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
                    <span className="text-center text-eyebrow font-semibold text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.72)]">
                      {engineLoading ? "Please wait" : guidanceText}
                    </span>
                  </div>
                </>
              )}

              {checking ? (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-pine/35 backdrop-blur-[2px]">
                  <Loader2 className="size-6 animate-spin text-white" />
                  <span className="text-eyebrow font-medium text-white">Checking your photo</span>
                </div>
              ) : null}
            </div>

            {uploadError ? (
              <p className="m-0 rounded-well bg-caution-tint/60 px-4 py-2.5 text-read text-caution">{uploadError}</p>
            ) : null}

            {pending && !images[side] ? (
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="inline-flex h-9 items-center gap-2 rounded-pill bg-pine/10 px-5 text-body font-medium text-pine transition-colors hover:bg-pine/15"
                >
                  <RefreshCw className="size-4" strokeWidth={1.8} /> Retake
                </button>
                <button
                  type="button"
                  onClick={usePending}
                  className="inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-6 text-body font-medium text-pine shadow-cta transition-[filter] hover:brightness-95"
                >
                  <Check className="size-4" strokeWidth={2.4} /> Use photo
                </button>
              </div>
            ) : !images[side] && !pending && mode === "capture" && !camError && !timedOut ? (
              <p className="m-0 text-eyebrow text-pine/60">
                The photo is taken automatically once the {label(side).toLowerCase()} is clear and steady.
              </p>
            ) : null}

            <input
              ref={uploadRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                onUpload(e.target.files?.[0] ?? null);
                // Clear it so choosing the same file again still fires onChange.
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
    </FlowShell>
  );
}
