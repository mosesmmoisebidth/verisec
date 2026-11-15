"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { dropSession, forgetResumable } from "@/lib/verify/dpop";
import { clearFlow } from "@/lib/verify/flow-store";
import { screenAllowed, stepLabel, usePlan } from "@/lib/verify/plan";
import type { ResumeFacts } from "@/lib/verify/kyc-api";
import { applyResume, dismissResume, findResume, RESUME_SCREEN, RESUME_STEP } from "@/lib/verify/resume";
import { cn } from "@/lib/utils";

/** `screens`: when given, a step this verification's workflow leaves out is not listed (the same rule as the rail). */
type Step = { id: string; title: string; optional?: boolean; caption?: string; screens?: string[] };

/** "7 Oct, 09:12" in the applicant's own time. */
function short(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * "Welcome back": shown when this device started a verification earlier and this tab has none
 * of its own yet (a closed tab, the link opened again, a new day). It lists the steps with the
 * finished ones ticked and continues at the first unfinished one, with the saved answers put
 * back into the tab (see lib/verify/resume.ts). Renders nothing otherwise.
 *
 * A native `<dialog>` like the tip modals: focus trap, Escape and the top layer are the
 * platform's. Closing it keeps this tab as it is and does not ask again here.
 */
export function ResumeGate({ steps: all }: { steps: Step[] }) {
  // only the steps this verification's workflow has, named as the rail names them
  const plan = usePlan();
  const steps = all
    .filter((s) => !s.screens || s.screens.some((x) => screenAllowed(plan, x)))
    .map((s) => ({ ...s, title: stepLabel(s.id, s.title, s.caption ?? "", plan).title }));
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const [facts, setFacts] = useState<ResumeFacts | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let live = true;
    findResume()
      .then((f) => {
        if (live && f) setFacts(f);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (facts && ref.current && !ref.current.open) {
      ref.current.showModal();
      // the way forward takes the focus, not the demo-only "start a new one"
      continueRef.current?.focus();
    }
  }, [facts]);

  if (!facts?.next) return null;
  const next = facts.next;
  const at = steps.findIndex((s) => s.id === RESUME_STEP[next]);
  const started = short(facts.startedAt);

  // Every screen reads the tab's answers when it opens, so the saved ones go in first. Already on
  // that screen (opened on its own): load it again so it reads them.
  const open = (path: string) => {
    if (window.location.pathname.replace(/\/$/, "") === path) window.location.reload();
    else router.push(path);
  };
  const go = () => {
    setLeaving(true);
    applyResume(facts);
    ref.current?.close();
    open(`/verify/${RESUME_SCREEN[next]}`);
  };
  // Demo sessions only: leave the earlier verification as it is and begin another one.
  const restart = () => {
    setLeaving(true);
    forgetResumable();
    dropSession();
    clearFlow();
    ref.current?.close();
    open("/verify/start");
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="resume-title"
      onCancel={() => dismissResume()}
      className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-[20px] border border-divider bg-white p-0 text-pine shadow-[0_4px_6px_-4px_rgb(0_0_0/0.1),0_10px_15px_-3px_rgb(0_0_0/0.1)] backdrop:bg-pine/18 backdrop:backdrop-blur-[7.6px]"
    >
      <div className="flex max-h-[88dvh] flex-col gap-5 overflow-y-auto p-[25px]">
        <header className="flex flex-col gap-1.5">
          <h2 id="resume-title" className="m-0 text-[20px] leading-7 font-medium text-pine">
            Welcome back
          </h2>
          <p className="m-0 text-body text-quiet">
            Your progress is saved{started ? ` from ${started}` : ""}. Continue where you left off.
          </p>
        </header>

        <ol className="m-0 flex list-none flex-col p-0" aria-label="Your progress">
          {steps.map((s, i) => {
            const state = i < at ? (s.optional ? "optional" : "done") : i === at ? "next" : "todo";
            const last = i === steps.length - 1;
            return (
              <li key={s.id} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-pill text-caption font-medium",
                      state === "done" && "bg-pine text-lime",
                      state === "next" && "bg-pine text-lime ring-4 ring-lime/40",
                      (state === "todo" || state === "optional") && "border border-step-ring bg-step-idle text-pine/47",
                    )}
                  >
                    {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  {!last ? <span aria-hidden className={cn("my-1 w-px flex-1 min-h-3", i < at ? "bg-pine" : "bg-step-ring")} /> : null}
                </div>
                <div className={cn("flex min-w-0 flex-1 items-start justify-between gap-3", last ? "pb-0" : "pb-3")}>
                  <span className={cn("text-step leading-7", state === "todo" || state === "optional" ? "text-pine/55" : "font-medium text-pine")}>
                    {s.title}
                  </span>
                  <span
                    className={cn(
                      "mt-1 shrink-0 rounded-pill px-2 py-0.5 text-[11px] leading-4",
                      state === "done" && "bg-pass-tint text-positive",
                      state === "next" && "bg-lime text-pine",
                      state === "optional" && "bg-pine/8 text-pine/70",
                      state === "todo" && "hidden",
                    )}
                  >
                    {state === "done" ? "Done" : state === "next" ? "Continue here" : state === "optional" ? "Optional" : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
          {facts.canRestart ? (
            <button
              type="button"
              onClick={restart}
              disabled={leaving}
              className="text-body text-quiet underline underline-offset-4 transition-colors hover:text-pine disabled:opacity-50"
            >
              Start a new verification
            </button>
          ) : (
            <span />
          )}
          <button
            ref={continueRef}
            type="button"
            onClick={go}
            disabled={leaving}
            className="group inline-flex h-11 items-center gap-2.5 rounded-pill bg-pine px-6 text-body font-medium text-white shadow-cta transition-[background-color,transform] hover:bg-pine/90 active:scale-[0.97] disabled:opacity-70"
          >
            Continue
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.8} />
          </button>
        </footer>
      </div>
    </dialog>
  );
}
