"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileScan, KeyRound, Loader2, LockKeyhole, ScanFace, ShieldCheck, Trash2, Users } from "lucide-react";

import { goTo } from "@/components/auth/form-bits";
import { nextFromUrl, withNext } from "@/lib/auth-landing";
import { toast } from "@/components/ui/toast";
import { ONBOARDING, PORTALS, type PortalId, type Question } from "@/config/onboarding";
import { authApi } from "@/lib/auth-api";
import { cn } from "@/lib/utils";

type Answers = Record<string, string | string[]>;
type Step = { kind: "choose" } | { kind: "question"; q: Question } | { kind: "how" } | { kind: "data" };

/** One icon per data promise, by meaning (in the order the promises are written). */
const PROMISE_ICONS = { kyc: [LockKeyhole, KeyRound, Users, Trash2], fin: [ShieldCheck, Users, LockKeyhole, Check] } as const;

/**
 * The onboarding after sign-up. It asks which portal brought the account here, a few multiple-choice
 * questions for that portal, then shows how the portal works and how its data is handled, and saves
 * the answers on the account. An account that has already answered goes straight to its portal.
 */
/** An earlier build's per-tab flag; it made onboarding reappear on every sign-in in that tab. Cleared, never read. */
const LEGACY_OPEN_KEY = "verisec.onboarding.open";

export function OnboardingFlow() {
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [portal, setPortal] = useState<PortalId | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // Signed out: sign in first. Onboarding is offered ONCE, after sign-up: an account that answered
  // goes to its portal, one that saw it and left goes to the KYC portal (unless asked to choose again).
  useEffect(() => {
    let alive = true;
    void authApi.me().then((me) => {
      if (!alive) return;
      // the page the person was going to when sign-in started, if any (it comes after onboarding)
      const dest = nextFromUrl();
      if (!me?.userId) return goTo(withNext("/login/", dest));
      const again = new URLSearchParams(window.location.search).has("again");
      if (me.onboarding?.portal && !again) return goTo(dest ?? PORTALS[me.onboarding.portal].home);
      // shown once, ever: the server's record decides (a flag in the tab once kept bringing it back)
      if (me.onboardingSeen && !again) return goTo(dest ?? PORTALS.kyc.home);
      try {
        sessionStorage.removeItem(LEGACY_OPEN_KEY);
      } catch {}
      void authApi.markOnboardingSeen().catch(() => undefined);
      setName((me.displayName || "").split(/\s+/)[0] ?? "");
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const steps: Step[] = useMemo(() => {
    const out: Step[] = [{ kind: "choose" }];
    if (portal) {
      for (const q of PORTALS[portal].questions) out.push({ kind: "question", q });
      out.push({ kind: "how" }, { kind: "data" });
    }
    return out;
  }, [portal]);
  const total = portal ? steps.length : PORTALS.kyc.questions.length + 3;
  const step = steps[Math.min(index, steps.length - 1)]!;
  const info = portal ? PORTALS[portal] : null;

  const answered = (q: Question) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : !!v;
  };
  const canContinue = step.kind === "choose" ? !!portal : step.kind === "question" ? answered(step.q) : true;
  const last = step.kind === "data";

  const pick = (q: Question, id: string) =>
    setAnswers((a) => {
      if (!q.multi) return { ...a, [q.id]: id };
      const cur = Array.isArray(a[q.id]) ? (a[q.id] as string[]) : [];
      return { ...a, [q.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });

  async function finish() {
    if (!portal || saving) return;
    setSaving(true);
    try {
      await authApi.saveOnboarding({ portal, answers });
      goTo(nextFromUrl() ?? PORTALS[portal].home);
    } catch {
      toast.error("We couldn't save your answers", "Please try again.");
      setSaving(false);
    }
  }

  const next = () => {
    if (!canContinue) return;
    if (last) void finish();
    else setIndex((i) => i + 1);
  };

  if (!ready) {
    return (
      <p className="m-0 flex items-center gap-2.5 text-read text-quiet" aria-live="polite">
        <Loader2 aria-hidden className="size-5 animate-spin text-pine" strokeWidth={2} />
        Please wait…
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-7">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3 text-body text-quiet">
          <span>{index === 0 ? (name ? `${ONBOARDING.welcome}, ${name}` : ONBOARDING.welcome) : info?.name}</span>
          <span className="tnum">{`Step ${index + 1} of ${total}`}</span>
        </div>
        <span
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-label="Onboarding progress"
          className="block h-1.5 overflow-hidden rounded-pill bg-card-line"
        >
          <span className="block h-full rounded-pill bg-lime transition-[width] duration-500 ease-out" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </span>
      </div>

      {step.kind === "choose" ? (
        <section className="flex flex-col gap-5" aria-labelledby="ob-title">
          <Heading id="ob-title" title={ONBOARDING.choose.title} subtitle={ONBOARDING.choose.subtitle} />
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="ob-title">
            {(Object.keys(PORTALS) as PortalId[]).map((id) => {
              const p = PORTALS[id];
              const on = portal === id;
              const Icon = id === "kyc" ? ScanFace : FileScan;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (portal !== id) setAnswers({});
                    setPortal(id);
                  }}
                  className={cn(
                    "group flex flex-col gap-4 rounded-[20px] border-2 bg-tile p-5 text-left transition-[border-color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:outline-none",
                    on ? "border-pine bg-lime-tint shadow-[0_8px_24px_-12px_rgb(14_50_40/0.35)]" : "border-card-line hover:border-pine/35",
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className={cn("grid size-12 place-items-center rounded-[14px] transition-colors", on ? "bg-pine text-lime" : "bg-lime text-pine")}>
                      <Icon aria-hidden className="size-6" strokeWidth={1.8} />
                    </span>
                    <Mark on={on} round />
                  </span>
                  <span className="flex flex-col gap-1.5">
                    <span className="text-[17px] leading-6 font-medium text-pine">{p.name}</span>
                    <span className="text-body text-quiet">{p.tagline}</span>
                  </span>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {p.includes.map((x) => (
                      <li key={x} className="flex items-center gap-2 text-body text-pine">
                        <Check aria-hidden className="size-4 shrink-0 text-pine/60" strokeWidth={2.4} />
                        {x}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </section>
      ) : step.kind === "question" ? (
        <section key={step.q.id} className="flex flex-col gap-5" aria-labelledby={`ob-${step.q.id}`}>
          <Heading id={`ob-${step.q.id}`} title={step.q.title} subtitle={step.q.subtitle} />
          <div
            className={cn("grid gap-2.5", step.q.choices.length > 4 && "sm:grid-cols-2")}
            role={step.q.multi ? "group" : "radiogroup"}
            aria-labelledby={`ob-${step.q.id}`}
          >
            {step.q.choices.map((c) => {
              const v = answers[step.q.id];
              const on = Array.isArray(v) ? v.includes(c.id) : v === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role={step.q.multi ? "checkbox" : "radio"}
                  aria-checked={on}
                  onClick={() => pick(step.q, c.id)}
                  className={cn(
                    "flex min-h-14 items-center justify-between gap-3 rounded-box border-2 bg-tile px-4 py-3 text-left transition-[border-color,background-color] focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:outline-none",
                    on ? "border-pine bg-lime-tint" : "border-card-line hover:border-pine/35",
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-field font-medium text-pine">{c.label}</span>
                    {c.hint ? <span className="text-[13px] leading-snug text-quiet">{c.hint}</span> : null}
                  </span>
                  <Mark on={on} round={!step.q.multi} />
                </button>
              );
            })}
          </div>
        </section>
      ) : step.kind === "how" && info ? (
        <section className="flex flex-col gap-5" aria-labelledby="ob-how">
          <Heading id="ob-how" title={ONBOARDING.howTitle(info.name.charAt(0).toLowerCase() + info.name.slice(1))} subtitle={ONBOARDING.howSubtitle} />
          <ol className="m-0 flex list-none flex-col gap-0 p-0">
            {info.howItWorks.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex flex-col items-center">
                  <span className="tnum grid size-9 shrink-0 place-items-center rounded-pill bg-pine text-body font-medium text-lime">{i + 1}</span>
                  {i < info.howItWorks.length - 1 ? <span aria-hidden className="my-1 w-px flex-1 bg-card-line" /> : null}
                </span>
                <span className={cn("flex flex-col gap-1 pt-1.5", i < info.howItWorks.length - 1 && "pb-6")}>
                  <span className="text-field font-medium text-pine">{s.title}</span>
                  <span className="text-body leading-relaxed text-quiet">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : step.kind === "data" && info && portal ? (
        <section className="flex flex-col gap-5" aria-labelledby="ob-data">
          <Heading id="ob-data" title={ONBOARDING.dataTitle} subtitle={ONBOARDING.dataSubtitle} />
          <div className="grid gap-3 sm:grid-cols-2">
            {info.dataPromises.map((d, i) => {
              const Icon = PROMISE_ICONS[portal][i] ?? ShieldCheck;
              return (
                <div key={d.title} className="flex flex-col gap-2.5 rounded-box border border-card-line bg-tile p-4">
                  <span className="grid size-10 place-items-center rounded-[12px] bg-lime text-pine">
                    <Icon aria-hidden className="size-5" strokeWidth={1.9} />
                  </span>
                  <span className="text-field font-medium text-pine">{d.title}</span>
                  <span className="text-body leading-relaxed text-quiet">{d.body}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-1">
        {index > 0 ? (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={saving}
            className="inline-flex h-12 items-center gap-2 rounded-pill px-4 text-body font-medium text-pine transition-colors hover:bg-pine/5 disabled:opacity-50"
          >
            <ArrowLeft aria-hidden className="size-4" strokeWidth={2} />
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={next}
          disabled={!canContinue || saving}
          className="group inline-flex h-12 min-w-[150px] items-center justify-center gap-2.5 rounded-pill bg-pine px-6 text-body font-medium text-white shadow-cta transition-[background-color,transform] hover:bg-pine/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-pine/30 disabled:shadow-none"
        >
          {saving ? (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.2} />
              {ONBOARDING.saving}
            </>
          ) : (
            <>
              {last ? ONBOARDING.enter : "Continue"}
              <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Heading({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 id={id} className="m-0 text-[28px] leading-[34px] font-medium text-pine sm:text-[32px] sm:leading-[38px]">
        {title}
      </h1>
      <p className="m-0 text-read text-quiet">{subtitle}</p>
    </header>
  );
}

/** The selected state of a tile: a filled circle (one answer) or a ticked box (several). */
function Mark({ on, round }: { on: boolean; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center border-2 transition-colors",
        round ? "rounded-pill" : "rounded-[7px]",
        on ? "border-pine bg-pine text-lime" : "border-card-line bg-tile",
      )}
    >
      {on ? <Check className="size-3.5" strokeWidth={3.2} /> : null}
    </span>
  );
}
