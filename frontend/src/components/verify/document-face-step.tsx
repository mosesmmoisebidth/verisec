"use client";

/**
 * Selfie to document face match (Document stage, right after Confirm Details).
 *
 * The applicant takes a passive selfie (Regula's own <face-liveness> component,
 * livenessType 1 = PASSIVE, selfie only), and that live frame is matched 1:1
 * against the portrait read from the document, through the Face-API /api/match
 * endpoint. Two gates, both must pass to continue:
 *   - liveness: the passive check confirms a real, present person (this is what
 *     stops someone holding the printed ID photo up to the camera, which would
 *     otherwise match the document portrait perfectly),
 *   - match: the two faces are the same person (similarity >= threshold).
 * Results are shown the same structured way as Confirm Details: a decision, the
 * two faces side by side, and the exact percentages.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, ScanFace, ShieldAlert, ShieldCheck, ShieldQuestion, Smartphone, X } from "lucide-react";
import { FaceProcessingOverlay } from "@/components/verify/face-processing";

import { FlowShell } from "@/components/verify/flow-shell";
import { FaceHandoff } from "@/components/verify/face-handoff";
import { PhoneShell } from "@/components/verify/phone-shell";
import { waitingHandoff, type PhoneDone } from "@/lib/verify/handoff";
import type { ScreenContext } from "@/lib/verify/types";
import { hydrateFlow, readFlow, writeFlow } from "@/lib/verify/flow-store";
import { documentPortrait } from "@/lib/verify/idv";
import { loadFaceComponent, faceReasonMsg, faceServiceUrl, matchFaces, fitFaceElement, whenFaceCameraReady, whenFaceCameraStuck, faceCfg, faceHostStyle, faceWorkerPath, ovalCenteringShift } from "@/lib/verify/face-runtime";
import { cn } from "@/lib/utils";

type Tone = "pass" | "fail" | "idle";
type Phase = "intro" | "loading" | "running" | "matching" | "result" | "error";

interface MatchState {
  similarity: number; // 0..1
  score: number;
  threshold: number;
  matched: boolean; // similarity >= threshold
  facesFound: number;
  livenessConfirmed: boolean;
  selfie: string; // data URL, the captured live frame
  portrait: string; // data URL, the document photo
}

const RECAPTURE = "/verify/document-front";
const pct = (v: number) => `${Math.floor(Math.max(0, Math.min(1, v)) * 100)}%`;
const toDataUrl = (s: string) => (s.startsWith("data:") ? s : `data:image/jpeg;base64,${s}`);

// a browser that cannot take the selfie says so and moves the match to the phone (handoff.ts); it never leaves a spinner
const NO_CAMERA = "This browser doesn't allow camera access, so the selfie can't be taken here.";
const ENGINE_OFF = "This browser has turned off something the selfie check needs, so it can't run here.";
const CAMERA_DID_NOT_START = "The camera didn't start. Allow camera access if your browser asks, then try again, or use your phone.";
const CAMERA_DID_NOT_START_PHONE = "The camera didn't start. Allow camera access if your browser asks, then try again.";
const SEND_FAILED = "Your face matched, but we couldn't send it to your computer. Check your connection and try again.";

/** `phone`: this runs on the applicant's phone for a computer that has no usable camera (handoff.ts). */
export function DocumentFaceStepClient({ ctx, phone }: { ctx: ScreenContext; phone?: { portrait: string; onPassed: PhoneDone } }) {
  const router = useRouter();
  const next = ctx.screen.next?.to;
  const onPhone = !!phone;
  const givenPortrait = phone?.portrait;
  // this browser cannot take the selfie: the match moves to the phone, with why (null: it runs here)
  const [phoneWhy, setPhoneWhy] = useState<string | null>(null);
  // on the phone: the passed match is on its way to the computer, or got there
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const stuckCancelRef = useRef<null | (() => void)>(null);
  const canRunHere = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof WebAssembly === "object";
  useEffect(() => {
    if (onPhone) return;
    if (!navigator.mediaDevices?.getUserMedia) setPhoneWhy(NO_CAMERA);
    else if (typeof WebAssembly !== "object") setPhoneWhy(ENGINE_OFF);
    else if (waitingHandoff("face-match")) setPhoneWhy("");
  }, [onPhone]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [portrait, setPortrait] = useState<string | null>(null);
  const [noPortrait, setNoPortrait] = useState(false);
  const [result, setResult] = useState<MatchState | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  // the face check is being decided (the component sent its result request): our overlay covers the frame
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Runtime config only exists in the browser; reading it during render made the
  // server and client HTML differ, so React discarded the markup and re-rendered
  // (hydration error #418), remounting the camera mid-start. Apply after mount.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elRef = useRef<any>(null);
  const cameraCancelRef = useRef<null | (() => void)>(null);
  const portraitRef = useRef<string | null>(null);

  // A narrow screen (any device, by the CSS breakpoint) gives the selfie camera the whole screen while it runs: in
  // the card's small box the oval sat under the step header and a head did not fit. Layout only; the match is unchanged.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Resolve the document portrait once, from the read stored on Confirm Details (on the phone: sent by the computer).
  useEffect(() => {
    if (givenPortrait) {
      setPortrait(givenPortrait);
      portraitRef.current = givenPortrait;
      return;
    }
    let live = true;
    // the read may be in IndexedDB (a phone's full-size photos do not fit session storage)
    void hydrateFlow().then((flow) => {
      if (!live) return;
      if (!flow.idvResult) {
        setNoPortrait(true);
        return;
      }
      try {
        const p = documentPortrait(flow.idvResult);
        if (p) {
          setPortrait(p);
          portraitRef.current = p;
        } else {
          setNoPortrait(true);
        }
      } catch {
        setNoPortrait(true);
      }
    });
    return () => {
      live = false;
    };
  }, [givenPortrait]);

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

  const runMatch = useCallback(
    async (selfie: string, livenessConfirmed: boolean) => {
      const docPortrait = portraitRef.current;
      if (!docPortrait) {
        setNoPortrait(true);
        setPhase("error");
        return;
      }
      setPhase("matching");
      try {
        const m = await matchFaces(selfie, docPortrait, livenessConfirmed);
        if (!m.ok || m.facesFound < 2) {
          setErrorMsg(
            m.facesFound < 2
              ? "We could not find a clear face in one of the photos. Please try the selfie again in good light."
              : "We could not complete the face match. Please try again.",
          );
          setPhase("error");
          return;
        }
        const state: MatchState = {
          similarity: m.similarity,
          score: m.score,
          threshold: m.threshold,
          matched: m.matched,
          facesFound: m.facesFound,
          livenessConfirmed,
          selfie: toDataUrl(selfie),
          portrait: docPortrait,
        };
        writeFlow({
          faceMatch: {
            matched: state.matched && state.livenessConfirmed,
            similarity: state.similarity,
            score: state.score,
            threshold: state.threshold,
            selfie: state.selfie,
            at: Date.now(),
          },
        });
        setResult(state);
        setPhase("result");
        // on the phone, a match that passed goes back to the computer (it is on the record already)
        if (phone && state.matched && state.livenessConfirmed) {
          setSending(true);
          const ok = await phone
            .onPassed({
              similarity: state.similarity,
              score: state.score,
              threshold: state.threshold,
              matched: state.matched,
              facesFound: state.facesFound,
              livenessConfirmed: state.livenessConfirmed,
              selfie: state.selfie,
            })
            .catch(() => false);
          setSending(false);
          setSent(ok);
          if (!ok) {
            setErrorMsg(SEND_FAILED);
            setPhase("error");
          }
        }
      } catch {
        setErrorMsg("We could not reach the matching service. Check your connection and try again.");
        setPhase("error");
      }
    },
    [phone],
  );

  const start = useCallback(async () => {
    setErrorMsg("");
    setResult(null);
    setCameraReady(false);
    // no camera access here at all (Tor Browser switches it off for every website), or no WebAssembly for the face
    // engine: the match moves to the phone
    const blocked = !navigator.mediaDevices?.getUserMedia ? NO_CAMERA : typeof WebAssembly !== "object" ? ENGINE_OFF : null;
    if (blocked) {
      if (phone) {
        setErrorMsg(blocked);
        setPhase("error");
      } else {
        setPhoneWhy(blocked);
        setPhase("intro");
      }
      return;
    }
    setPhase("loading");
    try {
      await loadFaceComponent();
    } catch {
      setErrorMsg("We could not start the camera. Please check your connection and try again.");
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

    // Passive liveness (livenessType 1 = selfie only), same settings and theme as
    // the later Face Verification step. We hide the engine's own start/result
    // screens and drive the match ourselves.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el as any).settings = {
      url: faceServiceUrl(),
      // Self-hosted engine (~13MB); the default CDN fetch is what made the
      // camera take so long to appear on this step.
      workerPath: faceWorkerPath(),
      // Regula defaults to a 60s positioning timeout, which means a long dead
      // wait before it gives up. Fail faster so the person can retry.
      timeoutInterval: faceCfg<number>("faceTimeoutMs", 30000),
      livenessType: 1,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onEvent = (e: any) => {
      const action = e?.detail?.action;
      const data = e?.detail?.data;
      if (action === "PROCESSING_REQUEST") setProcessing(true);
      else if (action === "PRESS_RETRY_BUTTON") setProcessing(false);
      if (action === "PROCESS_FINISHED") {
        setProcessing(false);
        const response = data?.status === 1 ? data?.response : null;
        const selfie = response && Array.isArray(response.images) ? response.images[0] : undefined;
        if (response && selfie) {
          teardown();
          void runMatch(selfie, response.code === 0);
        } else {
          setErrorMsg(faceReasonMsg(data?.reason));
          setPhase("error");
          teardown();
        }
      } else if (action === "CLOSE" || action === "RETRY_COUNTER_EXCEEDED") {
        setPhase("intro");
        teardown();
      }
    };
    el.addEventListener("face-liveness", onEvent);
    // the camera has to come on: a browser that keeps it waiting for good says so and offers another try
    stuckCancelRef.current = whenFaceCameraStuck(
      el,
      () => {
        setErrorMsg(phone ? CAMERA_DID_NOT_START_PHONE : CAMERA_DID_NOT_START);
        setPhase("error");
        teardown();
      },
      faceCfg<number>("faceCameraStartMs", 90_000),
    );
    setPhase("running");
  }, [runMatch, teardown, phone]);

  const full = compact && (phase === "loading" || phase === "running");
  // full screen: size the camera window from the box's real size (so the oval sits centred and the head fits), and
  // stop the page behind it scrolling.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // the camera window is sized from the box's REAL size in both layouts (see the liveness step); a hidden box
    // keeps the last size
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

  // Keep Regula's guide oval centred in the box the whole time the camera runs (see the liveness step: its spot
  // moves between Regula's own states, so it is checked continuously, not once).
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

  const canProceed = phase === "result" && !!result && result.matched && result.livenessConfirmed;
  const nav = {
    onNext: () => {
      if (canProceed && next) router.push(`/verify/${next}`);
    },
    nextDisabled: !canProceed,
    loading: phase === "matching",
  };

  const asideSlot = phase === "result" && result ? <MatchSummary r={result} /> : null;

  // the phone did the match (it only hands back one that passed): recorded there, kept here like one made here
  const onPhoneDone = useCallback((r: Record<string, unknown>) => {
    const docPortrait = portraitRef.current;
    if (!docPortrait) return;
    const num = (v: unknown) => (typeof v === "number" ? v : 0);
    const state: MatchState = {
      similarity: num(r.similarity),
      score: num(r.score),
      threshold: num(r.threshold),
      matched: r.matched === true,
      facesFound: num(r.facesFound),
      livenessConfirmed: r.livenessConfirmed === true,
      selfie: typeof r.selfie === "string" ? r.selfie : "",
      portrait: docPortrait,
    };
    writeFlow({
      faceMatch: {
        matched: state.matched && state.livenessConfirmed,
        similarity: state.similarity,
        score: state.score,
        threshold: state.threshold,
        selfie: state.selfie,
        at: Date.now(),
      },
    });
    setPhoneWhy(null);
    setResult(state);
    setPhase("result");
  }, []);

  const Shell = phone ? PhoneShell : FlowShell;
  return (
    <Shell ctx={ctx} nav={nav} asideSlot={asideSlot} wide>
      <div className="flex w-full flex-col gap-5">
        {phoneWhy !== null && !phone && portrait ? (
          <FaceHandoff
            step="face-match"
            reason={phoneWhy}
            payload={() => ({ portrait: portraitRef.current })}
            onDone={onPhoneDone}
            onTryHere={canRunHere() ? () => setPhoneWhy(null) : undefined}
          />
        ) : null}

        {noPortrait ? (
          <Callout tone="warn" title="We need your document first.">
            <span className="block">We could not find a photo from your document to match against.</span>
            <Link href="/verify/document-review" className="mt-2 inline-block font-medium underline underline-offset-2">
              Go back to your document
            </Link>
          </Callout>
        ) : null}

        {!noPortrait && phase === "intro" && phoneWhy === null ? (
          <div className="flex flex-col gap-4">
            {portrait ? (
              <div className="flex items-center gap-3 rounded-well bg-pine/5 px-4 py-3.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={portrait}
                  alt="Document photo"
                  className="size-14 shrink-0 rounded-tile border border-card-line bg-white object-cover"
                />
                <div className="flex min-w-0 flex-col">
                  <span className="text-read font-medium text-pine">We will match against this</span>
                  <span className="text-eyebrow text-quiet">The photo read from your document</span>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={start}
              className="inline-flex h-11 w-fit items-center gap-2 rounded-pill bg-pine px-6 text-body font-medium text-white shadow-cta transition-colors hover:bg-pine/90"
            >
              <ScanFace className="size-5" strokeWidth={1.8} /> Take selfie
            </button>
          </div>
        ) : null}

        {/* The camera frame, on screen the whole time we load and run: a status
            line above it, our spinner waiting inside it, and the engine's camera
            filling it once live. The host stays mounted so `start()` finds it.
            On a narrow screen it is drawn at the page level, full-screen (see
            MaybePortal / liveness step), so the oval is big enough to frame a head. */}
        <MaybePortal on={compact}>
        <div
          className={cn(
            // On a phone the selfie camera opens as a clean, centred card over a soft frosted backdrop — big
            // enough to frame a head, with room around it so it never fills the whole screen edge to edge.
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
              <span className="text-body font-medium text-pine">Match your face</span>
              <button
                type="button"
                aria-label="Stop the face match"
                onClick={() => {
                  teardown();
                  setPhase("intro");
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
                : "Look straight at the camera inside the frame."}
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
            {/* Oversized and clipped by the frame so the oval fills more of the
                box; config.faceZoom controls fill and camera zoom together. */}
            <div ref={hostRef} className="absolute" style={hostStyle} />
            {processing ? <FaceProcessingOverlay /> : null}
            {!cameraReady ? (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-white">
                <Loader2 className="size-9 animate-spin text-pine/35" strokeWidth={1.5} />
              </div>
            ) : null}
          </div>
        </div>
        </MaybePortal>

        {phase === "matching" ? (
          <p className="m-0 flex items-center gap-2.5 rounded-well bg-pine/5 px-4 py-4 text-read text-quiet">
            <Loader2 className="size-4 animate-spin" /> Matching your face to your document.
          </p>
        ) : null}

        {phase === "result" && result && phone && result.matched && result.livenessConfirmed ? (
          <p className="m-0 flex items-center gap-2.5 rounded-well bg-pass-tint/70 px-4 py-3.5 text-read font-medium text-ramp-2">
            <ShieldCheck aria-hidden className="size-5 shrink-0" strokeWidth={1.8} />
            {sent ? "Done. Go back to your computer to continue. You can close this page." : sending ? "Sending the result to your computer." : "Face matched."}
          </p>
        ) : null}
        {phase === "result" && result ? <MatchResult r={result} onRetry={start} onPhone={!!phone} /> : null}

        {phase === "error" && phoneWhy === null ? (
          <div className="flex flex-col gap-3 rounded-well bg-caution-tint/60 px-4 py-3.5">
            <span className="flex items-center gap-2 text-read font-medium text-caution">
              <ShieldAlert aria-hidden className="size-5 shrink-0" strokeWidth={1.9} /> {errorMsg}
            </span>
            {!noPortrait ? (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={start}
                  className="inline-flex h-9 w-fit items-center justify-center rounded-pill bg-pine px-5 text-body font-medium text-white transition-colors hover:bg-pine/90"
                >
                  Try again
                </button>
                {!phone ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneWhy("");
                      setPhase("intro");
                    }}
                    className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-pill bg-pine/10 px-5 text-body font-medium text-pine transition-colors hover:bg-pine/15"
                  >
                    <Smartphone aria-hidden className="size-4" strokeWidth={1.8} /> Use my phone instead
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

/* -------------------------------- result --------------------------------- */

function MatchResult({ r, onRetry, onPhone }: { r: MatchState; onRetry: () => void; onPhone?: boolean }) {
  const pass = r.matched && r.livenessConfirmed;
  const title = pass
    ? "Face matched"
    : !r.livenessConfirmed
      ? "We could not confirm a live person"
      : "This face does not match your document";
  const sub = pass
    ? "Your selfie matches the photo on your document. You can continue."
    : !r.livenessConfirmed
      ? "Please look straight at the camera in good light, with only your face in view, and try again."
      : "The selfie and the document photo look like different people. Try again, or go back and check the document.";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {!pass ? (
        <div className="flex flex-col gap-3 rounded-well bg-caution-tint/60 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-caution" strokeWidth={1.9} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="m-0 text-read font-semibold text-caution">{title}</p>
              <p className="m-0 text-body text-caution/85">{sub}</p>
            </div>
          </div>
          <div className="pl-[30px] flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 items-center justify-center rounded-pill bg-pine px-5 text-body font-medium text-white transition-colors hover:bg-pine/90"
            >
              Try the selfie again
            </button>
            {!onPhone ? (
              <Link
                href={RECAPTURE}
                className="inline-flex h-9 items-center justify-center rounded-pill bg-pine/10 px-5 text-body font-medium text-pine transition-colors hover:bg-pine/15"
              >
                Re-take document
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-well bg-pass-tint/70 px-4 py-3.5">
          <ShieldCheck aria-hidden className="size-5 text-ramp-2" strokeWidth={1.8} />
          <span className="text-read font-medium text-ramp-2">{sub}</span>
        </div>
      )}

      <Section title="Match details">
        <ul className="m-0 grid grid-cols-1 gap-1.5 p-0 sm:grid-cols-2">
          <DetailRow label="Face match" value={pct(r.similarity)} tone={r.matched ? "pass" : "fail"} strong />
          <DetailRow label="Passes at" value={pct(r.threshold)} tone="idle" />
          <DetailRow label="Liveness" value={r.livenessConfirmed ? "Confirmed" : "Not confirmed"} tone={r.livenessConfirmed ? "pass" : "fail"} />
          <DetailRow label="Decision" value={pass ? "Match" : "No match"} tone={pass ? "pass" : "fail"} />
        </ul>
      </Section>

      <Section title="Faces compared">
        <div className="grid grid-cols-2 gap-3">
          <Figure src={r.selfie} label="Your selfie" />
          <Figure src={r.portrait} label="Document photo" />
        </div>
      </Section>
    </div>
  );
}

function MatchSummary({ r }: { r: MatchState }) {
  const pass = r.matched && r.livenessConfirmed;
  const tone: Tone = pass ? "pass" : "fail";
  const Icon = pass ? ShieldCheck : r.livenessConfirmed ? ShieldAlert : ShieldQuestion;
  return (
    <div className="flex flex-col gap-4 rounded-well border border-card-line bg-tile/50 p-4">
      <div
        className={cn(
          "flex flex-col gap-1 rounded-tile px-3.5 py-3",
          pass ? "bg-pass-tint/70" : "bg-caution-tint/70",
        )}
      >
        <span className="text-eyebrow tracking-[0.4px] text-pine/60 uppercase">Face match</span>
        <span className={cn("flex items-center gap-2 text-read font-semibold", pass ? "text-ramp-2" : "text-caution")}>
          <Icon aria-hidden className="size-5" strokeWidth={1.8} />
          {pass ? "Matched" : "Not matched"}
        </span>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Face src={r.selfie} label="Selfie" />
        <span className={cn("text-read font-semibold", pass ? "text-ramp-2" : "text-caution")}>{pct(r.similarity)}</span>
        <Face src={r.portrait} label="Document" />
      </div>

      <dl className="m-0 flex flex-col gap-1.5 border-t border-divider pt-3">
        <SummaryRow label="Similarity" value={pct(r.similarity)} />
        <SummaryRow label="Passes at" value={pct(r.threshold)} />
        <SummaryRow label="Liveness" value={r.livenessConfirmed ? "Confirmed" : "Not confirmed"} />
      </dl>
    </div>
  );
}

/* -------------------------------- pieces --------------------------------- */

function DetailRow({ label, value, tone, strong }: { label: string; value: string; tone: Tone; strong?: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-2 rounded-tile border bg-white px-3.5 py-2.5",
        tone === "fail" ? "border-caution/55 bg-caution-tint/15" : "border-card-line",
      )}
    >
      <span className="text-eyebrow text-quiet">{label}</span>
      <span className="flex items-center gap-2">
        <span className={cn(strong ? "text-read font-semibold" : "text-read font-medium", tone === "fail" ? "text-caution" : "text-pine")}>
          {value}
        </span>
        <ToneDot tone={tone} />
      </span>
    </li>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-eyebrow text-quiet">{label}</dt>
      <dd className="m-0 text-body font-medium text-pine">{value}</dd>
    </div>
  );
}

function Figure({ src, label }: { src: string; label: string }) {
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className="h-40 w-full rounded-tile border border-card-line bg-white object-contain" />
      <figcaption className="text-eyebrow text-quiet">{label}</figcaption>
    </figure>
  );
}

function Face({ src, label }: { src: string; label: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label}
      title={label}
      className="size-16 shrink-0 rounded-tile border border-card-line bg-white object-cover"
    />
  );
}

function ToneDot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-label={`check ${tone}`}
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        tone === "pass" ? "bg-ramp-3" : tone === "fail" ? "bg-caution" : "bg-pine/25",
      )}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 text-eyebrow font-medium tracking-[0.4px] text-pine/71 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Callout({ tone, title, children }: { tone: "fail" | "warn"; title: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "m-0 flex flex-col gap-1 rounded-well px-4 py-4",
        tone === "fail" ? "bg-caution-tint/70 text-caution" : "bg-pine/5 text-pine/80",
      )}
    >
      <p className="m-0 flex items-center gap-2 text-read font-medium">
        <AlertTriangle aria-hidden className="size-4 shrink-0" strokeWidth={1.9} />
        {title}
      </p>
      <div className="text-read">{children}</div>
    </div>
  );
}

/**
 * On a narrow screen the camera is drawn at the page level (document.body): the step's card makes its own frame for
 * `position: fixed`, so a full-screen camera inside it would only be card-sized. Same host node the whole time (the
 * switch happens at load, before any capture starts).
 */
function MaybePortal({ on, children }: { on: boolean; children: ReactNode }) {
  return on && typeof document !== "undefined" ? createPortal(children, document.body) : <>{children}</>;
}
