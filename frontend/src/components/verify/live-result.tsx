"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Mail, Minus, ShieldCheck, X } from "lucide-react";

import { TenantText } from "@/components/verify/tenant";
import { completeVerification } from "@/lib/verify/record";
import type { ApplicantOutcome } from "@/lib/verify/kyc-api";
import type { Panel, Verdict } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

type ResultPanel = Extract<Panel, { kind: "result" }>;

const STYLE: Record<Verdict, { bg: string; ink: string; dot: string; glyph: string }> = {
  Verified: { bg: "bg-pass-tint", ink: "text-ramp-2", dot: "bg-ramp-3", glyph: "✓" },
  "Needs review": { bg: "bg-caution-tint", ink: "text-caution", dot: "bg-caution", glyph: "!" },
  Declined: { bg: "bg-danger-tint", ink: "text-danger", dot: "bg-danger", glyph: "✕" },
};

const OUTCOME_WORD: Record<ApplicantOutcome["checks"][number]["outcome"], string> = {
  pass: "Passed",
  fail: "Not passed",
  review: "Being reviewed",
  pending: "Not completed",
  done: "Completed",
};

/**
 * The applicant's real result: the server decides when the flow ends (POST /api/kyc/events "completed") and answers
 * with the verdict and ONLY this workflow's checks. Nothing on this screen comes from sample data.
 */
export function LiveResult({ panel }: { panel: ResultPanel }) {
  const [state, setState] = useState<{ phase: "loading" } | { phase: "ready"; outcome: ApplicantOutcome } | { phase: "none" }>({
    phase: "loading",
  });

  useEffect(() => {
    let live = true;
    void completeVerification().then((outcome) => {
      if (live) setState(outcome ? { phase: "ready", outcome } : { phase: "none" });
    });
    return () => {
      live = false;
    };
  }, []);

  if (state.phase === "loading") {
    return (
      <p className="m-0 flex items-center gap-2.5 rounded-well bg-pine/5 px-4 py-4 text-read text-quiet">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Please wait, getting your result.
      </p>
    );
  }

  if (state.phase === "none" || state.outcome.verdict === "In progress") {
    return (
      <div className="flex flex-col gap-1 rounded-well bg-pine/5 px-4 py-4">
        <p className="m-0 text-read font-medium text-pine">Your verification is not finished yet</p>
        <p className="m-0 text-read text-quiet">
          Please finish it on the device where you started it, or open the link you were sent again.
        </p>
      </div>
    );
  }

  const { outcome } = state;
  const verdict = outcome.verdict as Verdict;
  const style = STYLE[verdict];
  const copy = panel.outcomes[verdict];

  return (
    <div className="flex flex-col gap-6">
      <div className={cn("flex flex-col gap-4 rounded-tile p-6", style.bg)}>
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className={cn("grid size-11 shrink-0 place-items-center rounded-pill text-[20px] font-bold text-white", style.dot)}>
            {style.glyph}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className={cn("text-[22px] leading-7 font-medium", style.ink)}>{copy.title}</span>
            <span className="text-eyebrow text-quiet">Reference {outcome.reference}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="m-0 text-field font-medium text-pine">{copy.heading}</p>
          <p className="m-0 text-read text-quiet">
            <TenantText text={copy.body} />
          </p>
        </div>
        {outcome.reasons.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 rounded-well bg-white/70 p-4">
            {outcome.reasons.map((r) => (
              <li key={r} className="text-read text-pine">
                {r}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {outcome.emailedTo ? (
        <p className="m-0 flex items-center gap-2.5 rounded-well bg-pine/5 px-4 py-3 text-read text-quiet">
          <Mail aria-hidden className="size-4 shrink-0 text-pine/60" strokeWidth={1.8} />
          A copy of this result is being sent to {outcome.emailedTo}.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-eyebrow font-medium tracking-[0.4px] text-pine/71 uppercase">Your checks</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {outcome.checks.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-tile border border-card-line bg-white px-4 py-3">
              <span className="text-read text-pine">{c.label}</span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 text-eyebrow font-medium",
                  c.outcome === "pass" || c.outcome === "done"
                    ? "text-ramp-2"
                    : c.outcome === "fail"
                      ? "text-danger"
                      : c.outcome === "review"
                        ? "text-caution"
                        : "text-quiet",
                )}
              >
                {c.outcome === "pass" || c.outcome === "done" ? (
                  <Check aria-hidden className="size-4" strokeWidth={2.4} />
                ) : c.outcome === "fail" ? (
                  <X aria-hidden className="size-4" strokeWidth={2.4} />
                ) : (
                  <Minus aria-hidden className="size-4" strokeWidth={2.4} />
                )}
                {OUTCOME_WORD[c.outcome]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {verdict === "Verified" ? (
        <div className="flex items-center gap-4 rounded-tile bg-pine p-5 text-lime">
          <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-lime text-pine">
            <ShieldCheck aria-hidden className="size-6" strokeWidth={1.8} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-eyebrow tracking-[1px] text-lime/70 uppercase">Trust Seal</span>
            <span className="text-[18px] leading-6 font-semibold text-white">Verified by VeriSec</span>
            <span className="text-body text-lime/75">Reference {outcome.reference}</span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-eyebrow font-medium tracking-[0.4px] text-pine/71 uppercase">What happens next</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {copy.nextSteps.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-read text-quiet">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-pill bg-pine/28" />
              <span>
                <TenantText text={line} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
