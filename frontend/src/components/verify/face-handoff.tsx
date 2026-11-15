"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Smartphone } from "lucide-react";

import { BrandedQR } from "@/components/auth/branded-qr";
import { checkHandoff, endHandoff, startHandoff, waitingHandoff, type HandoffStep, type Waiting } from "@/lib/verify/handoff";

const POLL_MS = 2500;
type View = "starting" | "waiting" | "opened" | "expired" | "error";

/**
 * A face step done on the applicant's phone, as the computer shows it (lib/verify/handoff.ts): why, a QR code of the
 * phone link, and how the phone is doing. When the phone finishes, `onDone` gets its result and the step moves on.
 * The card is the phone handoff of the design (Figma Desktop-8): the QR code centred on a soft tile, the status under it.
 */
export function FaceHandoff({
  step,
  reason,
  payload,
  onDone,
  onTryHere,
}: {
  step: HandoffStep;
  /** Why the check cannot run in this browser (empty: no reason to repeat). */
  reason: string;
  /** What the phone needs to run the step (the document photo for a face match), sealed for the phone only. */
  payload?: () => unknown;
  onDone: (result: Record<string, unknown>) => void;
  /** Offered when this browser can use a camera after all. */
  onTryHere?: () => void;
}) {
  const [wait, setWait] = useState<Waiting | null>(null);
  const [view, setView] = useState<View>("starting");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const make = useCallback(async () => {
    setView("starting");
    setError("");
    const r = await startHandoff(step, payloadRef.current?.());
    if (!r.ok) {
      setError(r.reason);
      setView("error");
      return;
    }
    setWait(r.wait);
    setView("waiting");
  }, [step]);

  // a code this tab already shows (the page was reloaded) is kept; else a new one is made
  useEffect(() => {
    const kept = waitingHandoff(step);
    if (kept) {
      setWait(kept);
      setView("waiting");
    } else void make();
  }, [make, step]);

  // how the phone is doing, every few seconds, until it is done or the code ran out
  useEffect(() => {
    if (!wait || (view !== "waiting" && view !== "opened")) return;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      const s = await checkHandoff(wait);
      if (stop) return;
      if (s?.state === "done") {
        endHandoff(false);
        doneRef.current(s.result ?? {});
        return;
      }
      if (s?.state === "expired" || s?.state === "none") {
        setView("expired");
        return;
      }
      if (s?.state === "opened") setView("opened");
      timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [wait, view]);

  const copy = async () => {
    if (!wait) return;
    try {
      await navigator.clipboard.writeText(wait.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the QR code still works */
    }
  };

  const live = !!wait && (view === "waiting" || view === "opened");
  const status =
    view === "starting"
      ? "Making your code"
      : view === "waiting"
        ? "Waiting for your phone"
        : view === "opened"
          ? "Opened on your phone. Finish the face check there."
          : view === "expired"
            ? "This code has expired. Make a new one."
            : error || "The code could not be made. Please try again.";

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex max-w-[560px] flex-col gap-1.5">
        <span className="flex items-center gap-2 text-read font-medium text-pine">
          <Smartphone aria-hidden className="size-5 shrink-0" strokeWidth={1.8} /> Use your phone for the face check
        </span>
        <p className="m-0 text-body text-quiet">
          {reason ? `${reason} ` : ""}Scan this code with your phone camera and do the face check there. This page updates by itself when you finish.
        </p>
      </div>

      <div className="flex w-full max-w-[384px] flex-col items-center gap-5 rounded-[20px] border border-card-line bg-tile px-6 py-7">
        <div className="grid size-[258px] shrink-0 place-items-center overflow-hidden rounded-tile bg-white">
          {live && wait ? (
            <BrandedQR data={wait.link} size={240} level="Q" label="QR code: scan it with your phone to do the face check" />
          ) : view === "starting" ? (
            <Loader2 aria-hidden className="size-8 animate-spin text-pine/35" strokeWidth={1.5} />
          ) : (
            <Smartphone aria-hidden className="size-8 text-pine/35" strokeWidth={1.4} />
          )}
        </div>

        <p className="m-0 flex items-center gap-2 text-center text-body text-quiet" role="status" aria-live="polite">
          {view === "opened" ? (
            <Check aria-hidden className="size-[18px] shrink-0 text-ramp-2" strokeWidth={2} />
          ) : live || view === "starting" ? (
            <Loader2 aria-hidden className="size-[18px] shrink-0 animate-spin" strokeWidth={1.7} />
          ) : null}
          {status}
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          {live ? (
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-pill bg-pine/10 px-5 text-body font-medium text-pine transition-colors hover:bg-pine/15"
            >
              {copied ? <Check aria-hidden className="size-4" strokeWidth={2} /> : <Copy aria-hidden className="size-4" strokeWidth={1.8} />}
              {copied ? "Link copied" : "Copy link"}
            </button>
          ) : null}
          {view === "expired" || view === "error" ? (
            <button
              type="button"
              onClick={() => void make()}
              className="inline-flex h-9 items-center justify-center rounded-pill bg-pine px-5 text-body font-medium text-white transition-colors hover:bg-pine/90"
            >
              Make a new code
            </button>
          ) : null}
        </div>
      </div>

      {onTryHere ? (
        <button
          type="button"
          onClick={() => {
            endHandoff();
            onTryHere();
          }}
          className="w-fit text-body font-medium text-pine underline underline-offset-4 transition-colors hover:text-pine/80"
        >
          Try on this device instead
        </button>
      ) : null}
    </div>
  );
}
