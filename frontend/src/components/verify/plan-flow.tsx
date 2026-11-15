"use client";

import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { TenantText } from "@/components/verify/tenant";
import { appliesTo, refreshPlan, screenAllowed, stepLabel, usePlan, wordingFor, type Plan } from "@/lib/verify/plan";
import type { Leaner } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

/**
 * The flow, shaped by the verification's workflow (lib/verify/plan.ts): the gate moves past a
 * screen the workflow leaves out, and the rail, the step counter and the mobile progress count
 * only the steps the applicant will actually see.
 */

export type RailStep = { id: string; title: string; caption: string; optional?: boolean; screens: string[] };

const LAST = "verisec.kyc.lastScreen";

/** The steps the applicant sees, with the current one's place among them. */
function numbers(plan: Plan | null, steps: RailStep[], stepId: string, slug: string) {
  const visible = steps.filter((s) => s.screens.some((x) => screenAllowed(plan, x)));
  const stepIndex = Math.max(0, visible.findIndex((s) => s.id === stepId));
  const step = visible[stepIndex];
  const screens = step ? step.screens.filter((x) => screenAllowed(plan, x)) : [slug];
  return {
    visible,
    stepNumber: stepIndex + 1,
    stepCount: Math.max(1, visible.length),
    substepNumber: Math.max(1, screens.indexOf(slug) + 1),
    substepCount: Math.max(1, screens.length),
  };
}

const fill = (template: string, n: number, total: number) => template.replace("{n}", String(n)).replace("{total}", String(total));

/** `--vs-d`, the stagger each `.vs-in` reads (same scale as the shell's). */
const delay = (ms: number) => ({ "--vs-d": `${Math.min(180, Math.round(ms * 0.34))}ms` }) as React.CSSProperties;

/**
 * Moves past a screen this workflow leaves out: forward normally, backward when the applicant
 * came back from a later screen (so Back never bounces them forward again). With rules, the plan
 * is fetched again on each screen and a left-out screen is only skipped once that has settled.
 */
export function PlanGate({ slug, order }: { slug: string; order: string[] }) {
  const plan = usePlan();
  const router = useRouter();
  const allowed = screenAllowed(plan, slug);
  const dynamic = !!plan?.dynamic;
  const [settled, setSettled] = useState<string | null>(null);

  useEffect(() => {
    if (!dynamic) return;
    let live = true;
    void refreshPlan().then(() => {
      if (live) setSettled(slug);
    });
    return () => {
      live = false;
    };
  }, [dynamic, slug]);

  useEffect(() => {
    if (!plan) return;
    if (!allowed && dynamic && settled !== slug) return;
    const here = order.indexOf(slug);
    if (allowed) {
      try {
        sessionStorage.setItem(LAST, String(here));
      } catch {}
      return;
    }
    let last: number | null = null;
    try {
      const v = sessionStorage.getItem(LAST);
      last = v === null ? null : Number(v);
    } catch {}
    const backwards = last !== null && last > here;
    const target = backwards
      ? [...order.slice(0, here)].reverse().find((s) => screenAllowed(plan, s))
      : order.slice(here + 1).find((s) => screenAllowed(plan, s));
    router.replace(`/verify/${target ?? (backwards ? "start" : "result")}`);
  }, [plan, allowed, dynamic, settled, slug, order, router]);

  if (plan && !allowed) {
    return (
      <div className="vs-ground fixed inset-0 z-[60] grid place-items-center" aria-live="polite">
        <Loader2 aria-hidden className="size-6 animate-spin text-pine/60" />
        <span className="sr-only">Please wait…</span>
      </div>
    );
  }
  return null;
}

/**
 * A list whose entries can belong to some checks only (`needs`): those the workflow leaves out are
 * dropped. Held invisible until the plan is known, so a line never shows and then vanishes.
 */
export function PlanList({ className, entries }: { className?: string; entries: { key: string; needs?: string[]; node: ReactNode }[] }) {
  const plan = usePlan();
  const waits = !plan && entries.some((e) => e.needs?.length);
  return (
    <ul className={cn(className, waits && "invisible")}>
      {entries
        .filter((e) => appliesTo(plan, e.needs))
        .map((e) => (
          <Fragment key={e.key}>{e.node}</Fragment>
        ))}
    </ul>
  );
}

/** Explainer text worded for this workflow's checks (see `wordingFor`). */
export function PlanText({ text, needs, leaner }: { text: string; needs?: string[]; leaner?: Leaner<string> }) {
  const plan = usePlan();
  if (!needs?.length) return <TenantText text={text} />;
  return (
    <span className={cn(!plan && "invisible")}>
      <TenantText text={wordingFor(plan, text, needs, leaner)} />
    </span>
  );
}

/** "Step 2/5", counted over the steps this workflow shows. */
export function PlanStepCounter({ template, steps, stepId, slug }: { template: string; steps: RailStep[]; stepId: string; slug: string }) {
  const plan = usePlan();
  const n = numbers(plan, steps, stepId, slug);
  return <>{fill(template, n.stepNumber, n.stepCount)}</>;
}

/**
 * The seven-step rail (now as many as the workflow has). A step is `done`, `current` or `todo`,
 * derived from the current step's place; only the current step shows its sub-progress.
 */
export function PlanStepper({
  steps,
  stepId,
  slug,
  optionalLabel,
  substepTemplate,
}: {
  steps: RailStep[];
  stepId: string;
  slug: string;
  optionalLabel: string;
  substepTemplate: string;
}) {
  const plan = usePlan();
  const { visible, stepNumber, substepNumber, substepCount } = numbers(plan, steps, stepId, slug);

  return (
    <nav aria-label="Progress">
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {visible.map((raw, i) => {
          const step = { ...raw, ...stepLabel(raw.id, raw.title, raw.caption, plan) };
          const n = i + 1;
          const state = n < stepNumber ? "done" : n === stepNumber ? "current" : "todo";
          const last = i === visible.length - 1;

          return (
            <li key={step.id} className="vs-in flex gap-4" style={delay(180 + i * 55)}>
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-pill text-caption font-medium transition-colors",
                    state === "done" && "bg-pine text-lime",
                    state === "current" && "bg-pine text-lime ring-4 ring-lime/40",
                    state === "todo" && "border border-step-ring bg-step-idle text-pine/47",
                  )}
                >
                  {state === "done" ? <Check className="size-4" strokeWidth={3} /> : n}
                </span>
                {!last ? <span aria-hidden className={cn("my-1 w-px flex-1", n < stepNumber ? "bg-pine" : "bg-step-ring")} /> : null}
              </div>

              <div className={cn("flex min-w-0 flex-col gap-0.5", last ? "pb-0" : "pb-6")}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-step", state === "todo" ? "text-pine/47" : "font-medium text-pine")}>{step.title}</span>
                  {step.optional ? (
                    <span className="rounded-pill bg-pine/8 px-2 py-0.5 text-[11px] leading-4 text-pine/70">{optionalLabel}</span>
                  ) : null}
                </span>
                <span className={cn("text-caption", state === "todo" ? "text-pine/47" : "text-quiet")}>{step.caption}</span>

                {state === "current" && substepCount > 1 ? (
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    <span className="text-eyebrow font-medium text-pine">{fill(substepTemplate, substepNumber, substepCount)}</span>
                    <span
                      role="progressbar"
                      aria-valuenow={substepNumber}
                      aria-valuemin={1}
                      aria-valuemax={substepCount}
                      aria-label={`${step.title} progress`}
                      className="block h-1.5 overflow-hidden rounded-pill bg-divider"
                    >
                      <span
                        className="vs-fill block h-full origin-left rounded-pill bg-lime transition-[width] duration-500 ease-out"
                        style={{ width: `${(substepNumber / substepCount) * 100}%` }}
                      />
                    </span>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Below `lg`: the step and how much of the flow is left, counted over this workflow's steps. */
export function PlanMobileProgress({
  steps,
  stepId,
  slug,
  title,
  substepTemplate,
}: {
  steps: RailStep[];
  stepId: string;
  slug: string;
  title: string;
  substepTemplate: string;
}) {
  const plan = usePlan();
  const n = numbers(plan, steps, stepId, slug);
  const done = (n.stepNumber - 1 + n.substepNumber / n.substepCount) / n.stepCount;
  const label = stepLabel(stepId, title, "", plan).title;
  return (
    <div className="flex flex-col gap-2 lg:hidden">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body font-medium text-pine">{label}</span>
        <span className="text-eyebrow text-quiet">{fill(substepTemplate, n.substepNumber, n.substepCount)}</span>
      </div>
      <span
        role="progressbar"
        aria-valuenow={n.stepNumber}
        aria-valuemin={1}
        aria-valuemax={n.stepCount}
        aria-label="Progress"
        className="block h-1.5 overflow-hidden rounded-pill bg-divider"
      >
        <span
          className="vs-fill block h-full origin-left rounded-pill bg-lime transition-[width] duration-500 ease-out"
          style={{ width: `${done * 100}%` }}
        />
      </span>
    </div>
  );
}
