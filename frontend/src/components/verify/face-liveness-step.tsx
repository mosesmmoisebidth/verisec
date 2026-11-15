"use client";

/**
 * Face Verification (liveness).
 *
 * This mounts Regula's OWN web component, `<face-liveness>` (the exact WASM code
 * from @regulaforensics/vp-frontend-face-components, self-hosted at
 * public/face/regula-face.iife.js; its model WASM loads from
 * wasm.regulaforensics.com automatically). All of the camera, brightness and
 * positioning checks, the turns and avatar, and the /api/v2/liveness backend
 * calls happen INSIDE that component. We only mount it and read its result, the
 * same way Regula's own demo does:
 *
 *   element.settings = { url, livenessType }          // + our theme + no engine result screen
 *   element.addEventListener("face-liveness", handler)
 *   // success = action PROCESS_FINISHED && data.status === 1 && data.response.code === 0
 *   // selfie  = data.response.images[0]
 *
 * The dropdown picks the scenario: passive (livenessType 1), passive with blink
 * (3), or active with head turns (0), which is Regula's FaceLivenessType enum.
 */

import { recordDevice, recordLiveness, recordStoppedFaceCheck } from "@/lib/verify/record";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShieldCheck, ShieldAlert, ScanFace, Smartphone, X } from "lucide-react";
import { FaceProcessingOverlay } from "@/components/verify/face-processing";

import { FlowShell } from "@/components/verify/flow-shell";
import { FaceHandoff } from "@/components/verify/face-handoff";
import { PhoneShell } from "@/components/verify/phone-shell";
import { waitingHandoff, type PhoneDone } from "@/lib/verify/handoff";
import { Select } from "@/components/ui/select";
import type { ScreenContext } from "@/lib/verify/types";
import { readFlow, writeFlow } from "@/lib/verify/flow-store";
import { loadFaceComponent, faceReasonMsg, faceServiceUrl, fitFaceElement, whenFaceCameraReady, whenFaceCameraStuck, faceCfg, faceHostStyle, faceWorkerPath, ovalCenteringShift } from "@/lib/verify/face-runtime";
import { cn } from "@/lib/utils";

// The applicant chooses Passive or Active. What actually runs (the engine mode)
// can differ: each maps to Regula's FaceLivenessType, sent to the Face API when
// the session opens (POST /api/v2/liveness/start { type }). Values verified
// against the bundled component: ACTIVE = 0, PASSIVE = 1, BLINK = 3.
type Mode = "passive" | "active";
type EngineMode = "passive" | "active" | "blink";
const LIVENESS_TYPE: Record<EngineMode, number> = { passive: 1, active: 0, blink: 3 };
const MODE_ORDER: Mode[] = ["passive", "active"];
const MODE_LABEL: Record<Mode, string> = {
  passive: "Passive liveness, just look at the camera",
  active: "Active liveness, turn your head",
};
const MODE_HINT: Record<Mode, string> = {
  passive: "Look straight at the camera and hold still for a moment. No movement needed, the quickest check.",
  active: "Follow the prompts to turn your head. The strongest check, best against video replays and deepfakes.",
};
const MODE_OPTIONS = MODE_ORDER.map((m) => MODE_LABEL[m]);
const labelToMode = (label: string): Mode => MODE_ORDER.find((m) => MODE_LABEL[m] === label) ?? "passive";
const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODE_ORDER as string[]).includes(v);

// Retry ladder. With Passive chosen, "Try again" silently alternates Passive and
// Blink for the first three attempts, then moves to Active, the strongest check.
// With Active chosen, every attempt is Active. The applicant only ever sees the
// mode they picked; the ladder is never named on screen.
const PASSIVE_LADDER: EngineMode[] = ["passive", "blink", "passive", "active"];
const engineFor = (m: Mode, attempt: number): EngineMode =>
  m === "active" ? "active" : (PASSIVE_LADDER[Math.min(attempt, PASSIVE_LADDER.length - 1)] ?? "active");

// Plain-language results. A confirmed run means a genuine person, present now,
// and no spoof; that is all we show. No age, IDs or other personal data.
const PASS_RESULTS = [
  "Real person, present at the camera",
  "No photo, screen or mask detected",
  "Face captured clearly",
];
// What to check when a run is NOT confirmed. The engine returns only pass or
// fail, not per-signal reasons, so these are the actionable causes. Keyed by the
// applicant's choice so the ladder stays invisible.
const FAIL_TIP: Record<Mode, string> = {
  passive: "Look straight at the camera, follow any prompt you see, and hold still for a moment.",
  active: "Follow the on-screen prompts and turn your head slowly when asked.",
};
const COMMON_FAIL_TIPS = [
  "Use even light on your face, avoid strong backlight or shadows behind you.",
  "Keep your whole face inside the circle, and take off hats or sunglasses.",
  "Make sure only one person is in view, looking straight at the camera.",
];
const failReasons = (m: Mode): string[] => [FAIL_TIP[m], ...COMMON_FAIL_TIPS];

type Phase = "choose" | "loading" | "running" | "done" | "error";

// a browser that cannot run the face check says so and moves it to the phone (handoff.ts); it never leaves a spinner
const NO_CAMERA = "This browser doesn't allow camera access, so the face check can't run here.";
const ENGINE_OFF = "This browser has turned off something the face check needs, so it can't run here.";
const CAMERA_DID_NOT_START = "The face check didn't start. Allow camera access if your browser asks, then try again, or use your phone.";
const CAMERA_DID_NOT_START_PHONE = "The face check didn't start. Allow camera access if your browser asks, then try again.";
const SEND_FAILED = "Your face check passed, but we couldn't send it to your computer. Check your connection and try again.";

/** `phone`: this runs on the applicant's phone for a computer that has no usable camera (handoff.ts). */
export function FaceLivenessStepClient({ ctx, phone }: { ctx: ScreenContext; phone?: { onPassed: PhoneDone } }) {
  const router = useRouter();
  const next = ctx.screen.next?.to;
  const onPhone = !!phone;
  // this browser cannot run the face check: it moves to the phone, with why (null: it runs here)
  const [phoneWhy, setPhoneWhy] = useState<string | null>(null);
  // on the phone: the passed result is on its way to the computer, or got there
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const canRunHere = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof WebAssembly === "object";
  useEffect(() => {
    if (onPhone) return;
    if (!navigator.mediaDevices?.getUserMedia) setPhoneWhy(NO_CAMERA);
    else if (typeof WebAssembly !== "object") setPhoneWhy(ENGINE_OFF);
    else if (waitingHandoff("liveness")) setPhoneWhy("");
  }, [onPhone]);

  const [mode, setMode] = useState<Mode>("passive");
  const [phase, setPhase] = useState<Phase>("choose");
  const [confirmed, setConfirmed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  // the face check is being decided (the component sent its result request): our overlay covers the frame
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Frame sizing comes from runtime config, which only exists in the browser.
  // Reading it during render made the server HTML and the client HTML differ,
  // and React threw that mismatch away and re-rendered (hydration error #418),
  // which remounted the camera mid-start. So it is applied AFTER mount only.
  const [frameStyle, setFrameStyle] = useState<React.CSSProperties>({});
  const [boxStyle, setBoxStyle] = useState<React.CSSProperties>({});
  const [hostStyle, setHostStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    setFrameStyle({ maxWidth: `${faceCfg<number>("faceFrameWidth", 400)}px` });
    setBoxStyle({ height: `${faceCfg<number>("faceFrameHeight", 320)}px` });
    setHostStyle(faceHostStyle() as React.CSSProperties);
  }, []);

  const hostRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // A narrow screen (the CSS breakpoint, the same on any device) gives the camera the whole screen while it runs:
  // the card's small box sat under the step header there, and the head did not fit. Layout only: nothing here
  // changes how the check runs or what it decides.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elRef = useRef<any>(null);
  const cameraCancelRef = useRef<null | (() => void)>(null);
  const stuckCancelRef = useRef<null | (() => void)>(null);
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  // Attempts made with the current choice; drives the retry ladder.
  const attemptRef = useRef(0);

  const teardown = useCallback(() => {
    cameraCancelRef.current?.();
    cameraCancelRef.current = null;
    stuckCancelRef.current?.();
    stuckCancelRef.current = null;
    setCameraReady(false);
    setProcessing(false);
    const el = elRef.current;
    if (el) {
      try {
        el.remove();
      } catch {
        /* ignore */
      }
      elRef.current = null;
    }
    if (hostRef.current) hostRef.current.innerHTML = "";
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    setErrorMsg("");
    setConfirmed(false);
    setCameraReady(false);
    // no camera access in this browser at all (Tor Browser switches it off for every website), or no WebAssembly for
    // the face engine (Tor Browser's safer levels): the try is recorded and the check moves to the phone
    const blocked = !navigator.mediaDevices?.getUserMedia ? NO_CAMERA : typeof WebAssembly !== "object" ? ENGINE_OFF : null;
    if (blocked) {
      recordStoppedFaceCheck("error", blocked === NO_CAMERA ? "This browser does not allow camera access" : "This browser has WebAssembly turned off");
      if (phone) {
        setErrorMsg(blocked);
        setPhase("error");
      } else {
        setPhoneWhy(blocked);
        setPhase("choose");
      }
      return;
    }
    setPhase("loading");
    try {
      await loadFaceComponent();
    } catch {
      setErrorMsg("We could not start the face check. Please check your connection and try again.");
      setPhase("error");
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    teardown();

    const el = document.createElement("face-liveness");
    host.appendChild(el);
    elRef.current = el;
    // Fill the frame (Regula's window is a fixed 640px on desktop otherwise), and
    // keep our own overlay up until the live camera is actually showing.
    fitFaceElement(el);
    cameraCancelRef.current = whenFaceCameraReady(el, () => setCameraReady(true));

    // Settings exactly as Regula's demo: url + livenessType. We add our theme via
    // `customization`, hide the engine's own start/result screens (we drive the
    // flow), and take a single attempt.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el as any).settings = {
      url: faceServiceUrl(),
      // Self-hosted engine (~13MB). Regula's default pulls Liveness.wasm +
      // Liveness.data from wasm.regulaforensics.com on every start, which is
      // what made the camera take so long to appear.
      workerPath: faceWorkerPath(),
      // Regula defaults to a 60s positioning timeout, which means a long dead
      // wait before it gives up. Fail faster so the person can retry.
      timeoutInterval: faceCfg<number>("faceTimeoutMs", 30000),
      livenessType: LIVENESS_TYPE[engineFor(modeRef.current, attemptRef.current)],
      startScreen: false,
      finishScreen: false,
      closeDisabled: false,
      copyright: false,
      retryCount: 1,
      customization: {
        fontFamily: "inherit",
        cameraScreenSectorActive: "#c6f24e",
        cameraScreenSectorTarget: "#dbe9b0",
        cameraScreenStrokeNormal: "#1f3b2c",
        cameraScreenStrokeWidth: 3,
        processingScreenProgress: "#1f3b2c",
        onboardingScreenStartButtonBackground: "#1f3b2c",
        retryScreenRetryButtonBackground: "#1f3b2c",
      },
    };

    // this run ended (with a result or not): a later "close" from the component is not another try
    let ended = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onEvent = (e: any) => {
      const action = e?.detail?.action;
      const data = e?.detail?.data;
      if (action === "PROCESSING_REQUEST") setProcessing(true);
      else if (action === "PRESS_RETRY_BUTTON") setProcessing(false);
      if (action === "PROCESS_FINISHED") {
        setProcessing(false);
        ended = true;
        const ok = data?.status === 1 && data?.response; // operation produced a result
        const response = data?.response;
        const passed = ok && response.code === 0; // liveness confirmed
        if (ok) {
          writeFlow({
            faceMode: modeRef.current,
            faceEngine: engineFor(modeRef.current, attemptRef.current),
            faceAttempts: attemptRef.current + 1,
            faceResult: {
              code: response.code,
              status: response.status,
              tag: response.tag,
              transactionId: response.transactionId,
              type: response.type,
              image: Array.isArray(response.images) ? response.images[0] : undefined,
            },
          });
          const outcome = {
            passed: !!passed,
            mode: modeRef.current,
            engine: engineFor(modeRef.current, attemptRef.current),
            attempts: attemptRef.current + 1,
            status: response.status,
            code: response.code,
            transactionId: response.transactionId,
          };
          // the verification record (selfie encrypted in the browser before it leaves)
          const recorded = recordLiveness(outcome, Array.isArray(response.images) ? response.images[0] : undefined);
          // the device report again, now that the selfie camera is known (a virtual camera used, or not)
          const reported = recordDevice("final");
          // on the phone, a passed check goes back to the computer once it is on the record
          if (phone && passed) {
            setSending(true);
            void Promise.all([recorded, reported])
              .then(() => phone.onPassed({ ...outcome, tag: response.tag, type: response.type }))
              .catch(() => false)
              .then((ok) => {
                setSending(false);
                setSent(ok);
                if (!ok) {
                  setErrorMsg(SEND_FAILED);
                  setPhase("error");
                }
              });
          }
          setConfirmed(!!passed);
          setPhase("done");
          teardown();
        } else {
          // no result: still a try, so it goes on the record
          recordStoppedFaceCheck("error", faceReasonMsg(data?.reason));
          setErrorMsg(faceReasonMsg(data?.reason));
          setPhase("error");
          teardown();
        }
      } else if (action === "CLOSE" || action === "RETRY_COUNTER_EXCEEDED") {
        if (!ended) recordStoppedFaceCheck(action === "CLOSE" ? "cancelled" : "error", action === "CLOSE" ? undefined : "Too many tries in a row");
        ended = true;
        setPhase("choose");
        teardown();
      }
    };
    el.addEventListener("face-liveness", onEvent);
    // the camera has to come on: when the browser keeps it waiting for good, the step says so and offers another try
    stuckCancelRef.current = whenFaceCameraStuck(
      el,
      () => {
        if (ended) return;
        ended = true;
        recordStoppedFaceCheck("error", "The camera did not start");
        setErrorMsg(phone ? CAMERA_DID_NOT_START_PHONE : CAMERA_DID_NOT_START);
        setPhase("error");
        teardown();
      },
      faceCfg<number>("faceCameraStartMs", 90_000),
    );
    setPhase("running");
  }, [teardown, phone]);

  // First run of a choice starts the ladder at the bottom; each "Try again"
  // moves one step up it (see PASSIVE_LADDER).
  const begin = useCallback(() => {
    attemptRef.current = 0;
    void start();
  }, [start]);
  const retry = useCallback(() => {
    attemptRef.current += 1;
    void start();
  }, [start]);

  const full = compact && (phase === "loading" || phase === "running");
  // full screen: the camera window is sized from the box's real size (so the oval sits in its middle and the head
  // fits), and the page behind it does not scroll
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // the camera window is sized from the box's REAL size in both layouts (the inline box is taller than the
    // configured frame, which let a sliver of camera show above the mask on tablets); a hidden box keeps the last size
    const fit = () => {
      if (box.clientWidth > 0 && box.clientHeight > 0)
        setHostStyle(faceHostStyle({ width: box.clientWidth, height: box.clientHeight }) as React.CSSProperties);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    if (!full) return () => ro.disconnect();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      ro.disconnect();
      document.body.style.overflow = prev;
    };
  }, [full]);

  // Keep Regula's guide oval centred in the box, measured from what is actually on screen. Its spot shifts with
  // the box size AND between Regula's own states (centre your face, move away, hold steady, processing), so this
  // keeps checking the whole time the camera runs instead of once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.ovalShift = "0";
    host.style.transform = "";
    if (!cameraReady) return;
    let cancelled = false;
    let timer = 0;
    const tick = () => {
      if (cancelled) return;
      const s = ovalCenteringShift(elRef.current, boxRef.current);
      if (s != null && Math.abs(s) > 1) {
        const next = Number(host.dataset.ovalShift || 0) + s;
        host.dataset.ovalShift = String(next);
        host.style.transform = `translateY(${next}px)`;
      }
      timer = window.setTimeout(tick, 150);
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cameraReady, full, hostStyle]);

  const canProceed = phase === "done" && confirmed;
  const nav = {
    onNext: () => {
      if (canProceed && next) router.push(`/verify/${next}`);
    },
    nextDisabled: !canProceed,
  };

  // Prefill mode from a previous run.
  useEffect(() => {
    const f = readFlow();
    if (isMode(f.faceMode)) setMode(f.faceMode);
  }, []);

  // the phone did the check (it only hands back a passed one): recorded there, kept here like a check run here
  const onPhoneDone = useCallback((r: Record<string, unknown>) => {
    const n = (v: unknown) => (typeof v === "number" ? v : undefined);
    const s = (v: unknown) => (typeof v === "string" ? v : undefined);
    writeFlow({
      faceMode: s(r.mode) ?? modeRef.current,
      faceEngine: s(r.engine),
      faceAttempts: n(r.attempts),
      faceResult: { code: n(r.code) ?? 0, status: n(r.status) ?? 0, tag: s(r.tag), transactionId: s(r.transactionId), type: n(r.type) },
    });
    setPhoneWhy(null);
    setConfirmed(r.passed === true);
    setPhase("done");
  }, []);

  const Shell = phone ? PhoneShell : FlowShell;
  return (
    <Shell ctx={ctx} nav={nav} wide>
      <div className="flex w-full flex-col gap-5">
        {phoneWhy !== null && !phone ? (
          <FaceHandoff step="liveness" reason={phoneWhy} onDone={onPhoneDone} onTryHere={canRunHere() ? () => setPhoneWhy(null) : undefined} />
        ) : null}

        {phase === "choose" && phoneWhy === null ? (
          <div className="flex flex-col gap-4">
            <div className="flex max-w-[460px] flex-col gap-1.5">
              <span className="text-field font-medium text-pine/82">Liveness check</span>
              <Select
                label="Liveness check"
                options={MODE_OPTIONS}
                value={MODE_LABEL[mode]}
                onValueChange={(label) => {
                  setMode(labelToMode(label));
                  attemptRef.current = 0;
                }}
                block
                menuFixed
                className="h-11 w-full rounded-well border border-divider bg-white pr-9 pl-3.5 text-field text-pine"
              />
              <span className="text-eyebrow text-quiet">{MODE_HINT[mode]}</span>
            </div>

            <button
              type="button"
              onClick={begin}
              className="inline-flex h-11 w-fit items-center gap-2 rounded-pill bg-pine px-6 text-body font-medium text-white shadow-cta transition-colors hover:bg-pine/90"
            >
              <ScanFace className="size-5" strokeWidth={1.8} /> Start face check
            </button>
          </div>
        ) : null}

        {/* The camera frame. It is on screen the whole time we load and run, so
            the box never pops in: a status line sits above it, our own spinner
            waits inside it, and the engine's camera fills it once it is live.
            The host stays mounted (not conditionally removed) so `start()` can
            always find it. */}
        <MaybePortal on={compact}>
        <div
          className={cn(
            // On a phone the camera opens as a clean, centred card over a soft frosted backdrop — large enough
            // to frame a head, but with room around it so it never fills the whole screen edge to edge.
            full
              ? "fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-white/90 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[10px]"
              : // centred on a tablet's single column; beside the explainer (right) on a desktop
                "mx-auto flex w-full flex-col gap-3 lg:mr-0 lg:ml-auto",
            phase === "loading" || phase === "running" ? "" : "hidden",
          )}
          style={full ? undefined : frameStyle}
        >
          {full ? (
            <div className="flex w-full max-w-[400px] items-center justify-between gap-3">
              <span className="text-body font-medium text-pine">Face check</span>
              <button
                type="button"
                aria-label="Stop the face check"
                onClick={() => {
                  teardown();
                  setPhase("choose");
                }}
                className="grid size-10 place-items-center rounded-pill bg-pine/8 text-pine transition-colors hover:bg-pine/12"
              >
                <X aria-hidden className="size-5" strokeWidth={1.8} />
              </button>
            </div>
          ) : null}
          <p className={cn("m-0 flex items-center gap-2 text-body text-quiet", full && "w-full max-w-[400px]")}>
            {!cameraReady ? <Loader2 className="size-4 shrink-0 animate-spin" strokeWidth={1.8} /> : null}
            {!cameraReady
              ? phase === "loading"
                ? "Starting the camera."
                : "Getting the camera ready, one moment."
              : processing
                ? "Please wait, checking your face."
                : "Look at the camera and follow the guide inside the frame."}
          </p>

          <div
            ref={boxRef}
            className={cn(
              // the box grey matches Regula's own mask grey, so centring the oval never leaves a visible seam
              "relative w-full overflow-hidden border border-divider bg-[#bcc2c9]",
              full ? "h-[58vh] max-h-[540px] max-w-[400px] rounded-[26px] shadow-flow" : "rounded-well",
            )}
            style={full ? undefined : boxStyle}
          >
            {/* The camera host is oversized past the frame and clipped by it, so
                the fixed ~45%-of-view guide oval fills more of the box without
                the box growing. config.faceZoom controls how much it fills (and,
                unavoidably, the camera zoom); config.faceFrameWidth is the box. */}
            <div ref={hostRef} className="absolute" style={hostStyle} />
            {/* Our spinner covers the wait, then reveals the camera. */}
            {processing ? <FaceProcessingOverlay /> : null}
            {!cameraReady ? (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-white">
                <Loader2 className="size-9 animate-spin text-pine/35" strokeWidth={1.5} />
              </div>
            ) : null}
          </div>
        </div>
        </MaybePortal>

        {phase === "done" ? (
          confirmed ? (
            <div className="flex flex-col gap-3 rounded-well bg-pass-tint/70 px-4 py-4">
              <span className="flex items-center gap-2.5 text-read font-medium text-ramp-2">
                <ShieldCheck aria-hidden className="size-5 shrink-0" strokeWidth={1.8} />{" "}
                {phone
                  ? sent
                    ? "Liveness confirmed. Go back to your computer to continue. You can close this page."
                    : sending
                      ? "Liveness confirmed. Sending the result to your computer."
                      : "Liveness confirmed."
                  : "Liveness confirmed. You can continue."}
              </span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {PASS_RESULTS.map((r) => (
                  <li key={r} className="flex items-center gap-2.5 text-body text-pine">
                    <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-lime text-pine">
                      <Check aria-hidden className="size-3" strokeWidth={3} />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-well bg-caution-tint/60 px-4 py-4">
              <span className="flex items-center gap-2 text-read font-medium text-caution">
                <ShieldAlert aria-hidden className="size-5 shrink-0" strokeWidth={1.9} /> We could not confirm liveness.
              </span>
              <p className="m-0 text-body text-caution/85">The check ran, but we could not confirm a genuine, live person. This is usually one of these. Please fix and try again:</p>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {failReasons(mode).map((r) => (
                  <li key={r} className="flex gap-2 text-body text-caution/85">
                    <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-caution/60" />
                    {r}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={retry}
                className="inline-flex h-9 w-fit items-center justify-center rounded-pill bg-pine px-5 text-body font-medium text-white transition-colors hover:bg-pine/90"
              >
                Try again
              </button>
            </div>
          )
        ) : null}

        {phase === "error" && phoneWhy === null ? (
          <div className="flex flex-col gap-3 rounded-well bg-caution-tint/60 px-4 py-3.5">
            <span className="flex items-center gap-2 text-read font-medium text-caution">
              <ShieldAlert aria-hidden className="size-5 shrink-0" strokeWidth={1.9} /> {errorMsg}
            </span>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={retry}
                className="inline-flex h-9 w-fit items-center justify-center rounded-pill bg-pine px-5 text-body font-medium text-white transition-colors hover:bg-pine/90"
              >
                Try again
              </button>
              {!phone ? (
                <button
                  type="button"
                  onClick={() => {
                    setPhoneWhy("");
                    setPhase("choose");
                  }}
                  className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-pill bg-pine/10 px-5 text-body font-medium text-pine transition-colors hover:bg-pine/15"
                >
                  <Smartphone aria-hidden className="size-4" strokeWidth={1.8} /> Use my phone instead
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

/**
 * On a narrow screen the camera is drawn at the page level (document.body): the step's card makes its own frame
 * for `position: fixed`, so a full-screen camera inside it was only card-sized. The host node is the same one the
 * whole time it is used (the switch happens right after the page loads, before any check starts).
 */
function MaybePortal({ on, children }: { on: boolean; children: ReactNode }) {
  return on && typeof document !== "undefined" ? createPortal(children, document.body) : <>{children}</>;
}
