"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  IdCard,
  KeyRound,
  ListChecks,
  Mail,
  MailCheck,
  MapPin,
  Nfc,
  QrCode,
  Radar,
  Save,
  ScanFace,
  ScanText,
  ShieldCheck,
  Smartphone,
  Upload,
  X,
} from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { FlowGlyph, GlyphTile, SolarCameraAddLinear, SolarCameraLinear } from "@/components/verify/icons";
import { DEMO_FLOW } from "@/lib/verify/demo-data";
import { screenAllowed, screenFor, stepLabel } from "@/lib/verify/plan";
import type { FlowScreen, Panel } from "@/lib/verify/types";
import { ruleSentence, type Catalogue, type Definition } from "@/lib/console/workflows-api";
import { cn } from "@/lib/utils";

/**
 * The applicant's pages for a workflow, in order, as cards: each card is a true-to-design
 * miniature of the real page (same layout, the flow's own wording, this workflow's own steps
 * and numbering). Pages a rule adds are marked with the rule that adds them. Opening a card shows
 * it large, with the pages before and after it.
 */

type Page = {
  slug: string;
  stepId: string;
  stepTitle: string;
  stepCaption: string;
  screen: FlowScreen;
  /** Set when only a rule brings this page in: the rule, in words. */
  when?: string;
};

type Built = { pages: Page[]; steps: { id: string; title: string; caption: string; optional?: boolean }[] };

/** The pages a definition shows: always-on checks, plus what its rules can add (marked). */
export function pagesOf(def: Definition, catalogue: Catalogue): Built {
  const base = def.checks.map((c) => c.id);
  const added = def.rules.filter((r) => r.then === "require" && r.check).map((r) => r.check!);
  const always = { workflow: null, checks: base, documentTypes: null };
  const possible = { workflow: null, checks: [...new Set([...base, ...added])], documentTypes: null };
  const pages: Page[] = [];
  for (const step of DEMO_FLOW.steps) {
    for (const screen of step.screens) {
      if (!screenAllowed(possible, screen.slug)) continue;
      let when: string | undefined;
      if (!screenAllowed(always, screen.slug)) {
        // which rule brings it in: the first one whose added check this page needs
        const rule = def.rules.find(
          (r) => r.then === "require" && r.check && screenAllowed({ workflow: null, checks: [...base, r.check], documentTypes: null }, screen.slug),
        );
        when = rule ? ruleSentence({ ...rule, then: "review" }, catalogue).replace(/, send to a person$/, "") : "Only when a rule adds it";
      }
      const label = stepLabel(step.id, step.title, step.caption, possible);
      pages.push({ slug: screen.slug, stepId: step.id, stepTitle: label.title, stepCaption: label.caption, screen: screenFor(screen, possible), when });
    }
  }
  const stepIds = new Set(pages.map((p) => p.stepId));
  const steps = DEMO_FLOW.steps
    .filter((s) => stepIds.has(s.id))
    .map((s) => ({ id: s.id, ...stepLabel(s.id, s.title, s.caption, possible), optional: s.optional }));
  return { pages, steps };
}

export function FlowPages({
  definition,
  catalogue,
  orgName = "Your company",
  title = "What your applicants will see",
}: {
  definition: Definition;
  catalogue: Catalogue;
  orgName?: string;
  title?: string;
}) {
  const built = useMemo(() => pagesOf(definition, catalogue), [definition, catalogue]);
  const [open, setOpen] = useState<number | null>(null);
  const conditional = built.pages.filter((p) => p.when).length;

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-xs leading-4 font-medium tracking-[0.6px] text-pine uppercase">{title}</h2>
          <p className="m-0 text-micro text-muted">
            {built.pages.length} pages across {built.steps.length} steps
            {conditional ? `, ${conditional} of them only when a rule asks for them` : ""}. Open a page to see it full size.
          </p>
        </div>
        <span className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-pill bg-pine" /> Every applicant
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-pill border border-dashed border-pine bg-lime" /> Only when a rule fires
          </span>
        </span>
      </header>

      <ol className="m-0 flex list-none snap-x gap-4 overflow-x-auto p-0 pb-2 [scrollbar-width:thin]">
        {built.pages.map((page, i) => (
          <li key={page.slug} className="w-[248px] shrink-0 snap-start">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className={cn(
                "group flex w-full flex-col gap-2 rounded-[16px] border bg-white p-2 text-left transition-[box-shadow,border-color]",
                page.when ? "border-dashed border-pine/35" : "border-hairline",
                "hover:border-pine/40 hover:shadow-[0_8px_24px_-12px_rgba(14,50,40,0.35)]",
              )}
            >
              <span className="relative block">
                <span className="block overflow-hidden rounded-[12px] border border-hairline bg-panel p-1.5">
                  <span className="block overflow-hidden rounded-[8px] shadow-flow">
                    <MiniPage page={page} built={built} orgName={orgName} zoom={0.172} />
                  </span>
                </span>
                <span className="tnum absolute top-3 right-3 rounded-pill bg-white px-2 py-0.5 text-micro font-medium text-pine shadow-sm">
                  {i + 1} of {built.pages.length}
                </span>
                <span
                  aria-hidden
                  className="absolute -bottom-3.5 left-3 grid size-9 place-items-center rounded-pill bg-pine text-lime ring-4 ring-white transition-transform group-hover:scale-105"
                >
                  {createElement(visualOf(page.slug).icon, { className: "size-[18px]", strokeWidth: 1.8 })}
                </span>
              </span>
              <span className="flex flex-col gap-1.5 px-1 pt-2.5 pb-1">
                <span className="truncate text-card font-medium text-pine">{page.screen.title}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 rounded-pill bg-lime px-2 py-0.5 text-micro font-medium text-pine">{visualOf(page.slug).label}</span>
                  <span className="truncate text-micro text-muted">{page.stepTitle}</span>
                </span>
                {page.when ? (
                  <span className="line-clamp-2 rounded-[8px] bg-lime-tint px-2 py-1 text-micro text-pine">{page.when}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {open !== null ? (
        <PageViewer built={built} index={open} orgName={orgName} onMove={setOpen} onClose={() => setOpen(null)} />
      ) : null}
    </section>
  );
}

/** What each page does, at a glance: a glyph and a few words on its card. */
const VISUAL: Record<string, { icon: typeof IdCard; label: string }> = {
  start: { icon: ListChecks, label: "What to have ready" },
  terms: { icon: ShieldCheck, label: "Consent" },
  "document-type": { icon: IdCard, label: "Pick a document" },
  "document-front": { icon: Camera, label: "Photo of the front" },
  "document-back": { icon: Camera, label: "Photo of the back" },
  "document-review": { icon: ScanText, label: "Read and confirm" },
  "document-face": { icon: ScanFace, label: "Face to document" },
  epassport: { icon: Nfc, label: "Chip read" },
  "face-intro": { icon: ScanFace, label: "Liveness" },
  selfie: { icon: ScanFace, label: "Live selfie" },
  phone: { icon: Smartphone, label: "Phone number" },
  "phone-code": { icon: KeyRound, label: "Code by SMS" },
  email: { icon: Mail, label: "Email address" },
  "email-code": { icon: MailCheck, label: "Code by email" },
  checking: { icon: Radar, label: "Screening" },
  findings: { icon: ListChecks, label: "What we found" },
  "address-upload": { icon: Upload, label: "Proof of address" },
  "address-confirm": { icon: MapPin, label: "Confirm address" },
  result: { icon: BadgeCheck, label: "The decision" },
};
const visualOf = (slug: string) => VISUAL[slug] ?? { icon: Fingerprint, label: "Step" };

/* ------------------------------------------------------------------ viewer -- */

function PageViewer({
  built,
  index,
  orgName,
  onMove,
  onClose,
}: {
  built: Built;
  index: number;
  orgName: string;
  onMove: (i: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const page = built.pages[index]!;
  const last = built.pages.length - 1;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < last) onMove(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onMove(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last, onMove]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={`Page ${index + 1}: ${page.screen.title}`}
      className="m-auto w-[min(1080px,calc(100vw-2rem))] rounded-[22px] border border-edge bg-white p-0 shadow-[0_24px_48px_-16px_rgba(14,50,40,0.35)] backdrop:bg-black/25 backdrop:backdrop-blur-[6px]"
    >
      <div className="flex max-h-[92dvh] flex-col gap-4 overflow-y-auto p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] tracking-[0.5px] text-muted uppercase">
              Page {index + 1} of {built.pages.length} · {page.stepTitle}
            </span>
            <span className="truncate text-[17px] font-medium text-pine">{page.screen.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onMove(index - 1)}
              disabled={index === 0}
              aria-label="Previous page"
              className="grid size-9 place-items-center rounded-pill border border-hairline text-pine transition-colors hover:bg-hover-panel disabled:opacity-40"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(index + 1)}
              disabled={index === last}
              aria-label="Next page"
              className="grid size-9 place-items-center rounded-pill border border-hairline text-pine transition-colors hover:bg-hover-panel disabled:opacity-40"
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-pill text-pine transition-colors hover:bg-hover-panel"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </header>
        {page.when ? (
          <p className="m-0 rounded-[10px] bg-lime-tint px-3 py-2 text-micro text-pine">
            Shown only to some applicants: <span className="font-medium">{page.when}</span>.
          </p>
        ) : null}
        <div className="mx-auto w-fit overflow-hidden rounded-[14px] border border-hairline">
          <MiniPage page={page} built={built} orgName={orgName} zoom={0.746} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {built.pages.map((p, i) => (
            <button
              key={p.slug}
              type="button"
              onClick={() => onMove(i)}
              aria-label={`Page ${i + 1}: ${p.screen.title}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-[8px] border p-0.5 transition-colors",
                i === index ? "border-pine" : "border-hairline hover:border-pine/40",
              )}
            >
              <MiniPage page={p} built={built} orgName={orgName} zoom={0.072} />
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}

/* --------------------------------------------------------------- the page -- */

/** The real flow card (max-w-flow-card x the height it has on a laptop), on its lined ground. */
const BASE_W = 1337;
const BASE_H = 866;

const fillN = (template: string, n: number, total: number) => template.replace("{n}", String(n)).replace("{total}", String(total));

/**
 * One applicant page drawn exactly as FlowShell draws it, with the same classes and tokens: the
 * step rail (PlanStepper) with this workflow's steps, the tenant bar, the heading, the explainer
 * and the page's own panel (panels.tsx), then Back and Continue. `zoom` scales it as a whole, so
 * the miniature is the page, not a sketch of it.
 */
function MiniPage({ page, built, orgName, zoom }: { page: Page; built: Built; orgName: string; zoom: number }) {
  const stepIndex = built.steps.findIndex((s) => s.id === page.stepId);
  const stepNumber = stepIndex + 1;
  const screensInStep = built.pages.filter((p) => p.stepId === page.stepId);
  const sub = screensInStep.findIndex((p) => p.slug === page.slug);
  const fill = (t: string) => t.replace(/\{org\}/g, orgName);
  const initials = orgName.split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "YC";
  const { brand, copy } = DEMO_FLOW;
  const aside = page.screen.aside;

  return (
    <div style={{ width: BASE_W * zoom, height: BASE_H * zoom }} className="relative overflow-hidden">
      <div
        aria-hidden
        className="vs-ground absolute top-0 left-0 grid place-items-center"
        style={{ width: BASE_W, height: BASE_H, transform: `scale(${zoom})`, transformOrigin: "0 0" } as CSSProperties}
      >
        <div className="grid h-[786px] w-flow-card grid-cols-[var(--spacing-flow-aside)_1fr] overflow-hidden rounded-flow shadow-flow backdrop-blur-[14.9px]">
          {/* the rail (FlowAside + PlanStepper) */}
          <aside className="flex min-h-0 flex-col justify-between gap-10 overflow-hidden bg-white/60 p-aside-pad">
            <div className="flex flex-col gap-10">
              <span className="flex items-center gap-2 text-pine">
                <LogoMark className="h-7" />
                <span className="text-mark leading-none font-bold tracking-tight">{brand.wordmark}</span>
              </span>
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {built.steps.map((step, i) => {
                  const n = i + 1;
                  const state = n < stepNumber ? "done" : n === stepNumber ? "current" : "todo";
                  const last = i === built.steps.length - 1;
                  return (
                    <li key={step.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-pill text-caption font-medium",
                            state === "done" && "bg-pine text-lime",
                            state === "current" && "bg-pine text-lime ring-4 ring-lime/40",
                            state === "todo" && "border border-step-ring bg-step-idle text-pine/47",
                          )}
                        >
                          {state === "done" ? <Check className="size-4" strokeWidth={3} /> : n}
                        </span>
                        {!last ? <span className={cn("my-1 w-px flex-1", n < stepNumber ? "bg-pine" : "bg-step-ring")} /> : null}
                      </div>
                      <div className={cn("flex min-w-0 flex-col gap-0.5", last ? "pb-0" : "pb-6")}>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={cn("text-step", state === "todo" ? "text-pine/47" : "font-medium text-pine")}>{step.title}</span>
                          {step.optional ? (
                            <span className="rounded-pill bg-pine/8 px-2 py-0.5 text-[11px] leading-4 text-pine/70">{copy.optional}</span>
                          ) : null}
                        </span>
                        <span className={cn("text-caption", state === "todo" ? "text-pine/47" : "text-quiet")}>{step.caption}</span>
                        {state === "current" && screensInStep.length > 1 ? (
                          <div className="mt-1.5 flex flex-col gap-1.5">
                            <span className="text-eyebrow font-medium text-pine">{fillN(copy.substep, sub + 1, screensInStep.length)}</span>
                            <span className="block h-1.5 overflow-hidden rounded-pill bg-divider">
                              <span className="block h-full rounded-pill bg-lime" style={{ width: `${((sub + 1) / screensInStep.length) * 100}%` }} />
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
            <p className="m-0 text-eyebrow leading-4 text-quiet">{fill(brand.legal)}</p>
          </aside>

          {/* the stage */}
          <div className="flex min-h-0 flex-col gap-6 bg-white p-flow-pad">
            <header className="flex items-center justify-between gap-4">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-lime px-3 text-eyebrow text-pine">
                <Save className="size-3.5" strokeWidth={1.8} />
                {brand.saveAndExit}
              </span>
              <span className="flex items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-lime text-body font-medium text-pine">{initials}</span>
                <span className="text-body font-medium text-pine">{orgName}</span>
              </span>
            </header>

            <div className="flex flex-col gap-1 pt-2">
              <p className="m-0 text-eyebrow text-pine/71">{fillN(copy.stepCounter, stepNumber, built.steps.length)}</p>
              <h1 className="m-0 text-display text-pine">{page.screen.title}</h1>
              {page.screen.intro ? <p className="m-0 max-w-[68ch] pt-0.5 text-body text-quiet">{fill(page.screen.intro)}</p> : null}
            </div>

            <hr className="m-0 border-0 border-t border-divider" />

            <div className="min-h-0 flex-1 overflow-hidden">
              {aside ? (
                <div className={cn("grid gap-x-10 gap-y-6", aside.notice ? "grid-cols-[minmax(0,370px)_minmax(0,1fr)]" : "grid-cols-[minmax(0,300px)_minmax(0,1fr)]")}>
                  <div className="flex flex-col gap-3">
                    <p className="m-0 text-body leading-relaxed text-quiet">{fill(aside.body)}</p>
                    {aside.link ? (
                      <span className="inline-flex w-fit items-center gap-1.5 text-body font-medium text-pine">
                        {aside.link.label}
                        <ArrowRight className="size-3.5" strokeWidth={1.8} />
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col gap-6">
                    <PanelPreview panel={page.screen.panel} fill={fill} slug={page.slug} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <PanelPreview panel={page.screen.panel} fill={fill} slug={page.slug} />
                </div>
              )}
            </div>

            <footer className="flex items-center gap-3 border-t border-divider pt-6">
              {page.screen.back ? (
                <span className="inline-flex h-9 min-w-[90px] items-center justify-center gap-2 rounded-pill bg-pine/10 pr-6 pl-[18px] text-body text-pine">
                  <ArrowLeft className="size-3.5" strokeWidth={1.8} />
                  {copy.back}
                </span>
              ) : null}
              <span className="ml-auto inline-flex h-9 min-w-[132px] items-center justify-center gap-2 rounded-pill bg-pine px-6 text-body text-white shadow-cta">
                {page.screen.next.label}
                <ArrowRight className="size-3.5" strokeWidth={1.8} />
              </span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The flow's empty selection dot (panels.tsx DotInput, unchecked). */
const Dot = () => <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-pine/25 bg-white" />;

/** A field as FieldGrid draws it (fields.tsx): label, then the control. */
function FieldBox({ label, value, half }: { label: string; value?: string; half?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1.5", half ? "col-span-1" : "col-span-2")}>
      <span className="text-field font-medium text-pine/82">{label}</span>
      <span className="flex h-11 w-full items-center rounded-well border border-divider bg-white px-3.5 text-field text-pine">
        <span className="truncate">{value ?? ""}</span>
      </span>
    </div>
  );
}

/** The page's own panel, with the classes the real one uses (panels.tsx, document-capture.tsx). */
function PanelPreview({ panel, fill, slug }: { panel: Panel; fill: (t: string) => string; slug?: string }) {
  switch (panel.kind) {
    case "checklist":
      return (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {panel.items.map((item) => (
            <li key={item.label} className="flex items-center gap-3.5 rounded-tile border border-card-line bg-tile p-4">
              <GlyphTile icon={item.icon} tone="brand" />
              <span className="flex flex-col gap-0.5">
                <span className="text-field font-medium text-pine">{item.label}</span>
                {item.detail ? <span className="text-read text-quiet">{item.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      );
    case "consent":
      return (
        <div className="ml-auto flex w-full max-w-[430px] flex-col gap-2.5">
          {panel.agreements.map((a) => (
            <span key={a} className="flex items-center gap-3 rounded-well border border-divider bg-white px-3.5 py-3">
              <Dot />
              <span className="text-read text-pine/82">{a}</span>
            </span>
          ))}
        </div>
      );
    case "choice":
      return (
        <div className="ml-auto flex w-full max-w-[440px] flex-col gap-4">
          {panel.country ? (
            <span className="flex flex-col gap-1.5">
              <span className="text-field font-medium text-pine/82">{panel.country.label}</span>
              <span className="flex h-11 w-full items-center justify-between rounded-well border border-divider bg-white pr-3 pl-3.5 text-field text-pine">
                {panel.country.value}
                <ChevronDown className="size-4 text-pine/60" strokeWidth={1.8} />
              </span>
            </span>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {panel.options.map((o) => (
              <span
                key={o.value}
                className={cn("flex items-center gap-3 rounded-well border border-divider p-3.5", o.disabled ? "bg-tile opacity-60" : "bg-white")}
              >
                <Dot />
                <span className="min-w-0 truncate text-field font-medium text-pine">{o.label}</span>
              </span>
            ))}
          </div>
        </div>
      );
    case "capture": {
      const face = panel.frame === "face";
      const shutter = (
        <span className={cn("inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-5 text-body font-medium text-pine shadow-cta", face ? "self-center" : "self-end")}>
          <SolarCameraAddLinear className="size-5" />
          {panel.shutter}
        </span>
      );
      if (face)
        // CapturePanelView, face frame
        return (
          <div className="mx-auto flex w-full max-w-[300px] flex-col items-center gap-4">
            <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[180px] border-2 border-dashed border-lime bg-lime/12">
              <div className="flex flex-col items-center gap-3 px-6 text-center">
                <SolarCameraLinear className="size-[70px] text-pine" />
                <p className="m-0 max-w-[32ch] text-field text-pine">{panel.guide}</p>
              </div>
            </div>
            {shutter}
          </div>
        );
      // document-capture.tsx: side switch and photo/upload toggle above a light frame
      const back = slug === "document-back";
      return (
        <div className="flex w-full flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {["Front", "Back"].map((label) => {
                const on = (label === "Back") === back;
                return (
                  <span
                    key={label}
                    className={cn("inline-flex items-center rounded-pill px-3.5 py-1.5 text-body font-medium", on ? "bg-pine text-white" : "bg-pine/8 text-pine/70")}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
            <div className="inline-flex rounded-pill bg-pine/8 p-1">
              <span className="rounded-pill bg-white px-4 py-1.5 text-body font-medium text-pine shadow-sm">Take a photo</span>
              <span className="rounded-pill px-4 py-1.5 text-body font-medium text-pine/60">Upload</span>
            </div>
          </div>
          <div className="relative flex aspect-[440/240] w-full items-center justify-center overflow-hidden rounded-tile bg-pine/5 p-5">
            <div className="flex size-full flex-col items-center justify-center gap-3 rounded-tile border-2 border-dashed border-lime bg-lime/12 px-6 text-center">
              <SolarCameraLinear className="size-[56px] text-pine" />
              <p className="m-0 max-w-[32ch] text-field text-pine">{panel.guide}</p>
            </div>
          </div>
          {shutter}
        </div>
      );
    }
    case "review":
      return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {panel.fields.slice(0, 8).map((f) => (
            <FieldBox key={f.key} label={f.label} value={f.value} half={f.span === "half"} />
          ))}
        </div>
      );
    case "illustration":
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <span className="grid size-[220px] place-items-center rounded-full bg-lime/12 text-pine">
            <FlowGlyph icon={panel.icon} className="size-24" strokeWidth={1.2} />
          </span>
          {panel.caption ? <p className="m-0 text-read text-quiet">{panel.caption}</p> : null}
        </div>
      );
    case "handoff":
      return (
        <div className="flex w-full justify-end">
          <div className="flex w-full max-w-[384px] flex-col items-center gap-6 rounded-[20px] border border-card-line bg-tile px-6 py-8">
            <div className="grid size-[226px] shrink-0 place-items-center overflow-hidden">
              <QrCode className="size-[200px] text-pine" strokeWidth={1} />
            </div>
            <p className="m-0 flex items-center gap-2 text-body text-quiet">
              <Smartphone className="size-[18px] text-quiet" strokeWidth={1.7} />
              {panel.status}
            </p>
          </div>
        </div>
      );
    case "contact":
      return (
        <div className="flex max-w-[460px] flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-field font-medium text-pine/82">{panel.field.label}</span>
            <div className="flex gap-2">
              {panel.countryCode ? (
                <span className="flex h-11 shrink-0 items-center gap-2 rounded-well border border-divider bg-white pr-3 pl-3.5 text-field text-pine">
                  {panel.countryCode.value}
                  <ChevronDown className="size-4 text-pine/60" strokeWidth={1.8} />
                </span>
              ) : null}
              <span className="flex h-11 min-w-0 flex-1 items-center rounded-well border border-divider bg-white px-3.5 text-field text-pine/47">
                {panel.field.placeholder ?? ""}
              </span>
            </div>
            {panel.field.hint ? <span className="text-read text-quiet">{panel.field.hint}</span> : null}
          </div>
          {panel.consent ? <p className="m-0 text-read text-quiet">{panel.consent}</p> : null}
        </div>
      );
    case "otp":
      return (
        <div className="flex items-start justify-between gap-10">
          <div className="flex max-w-[330px] flex-col gap-3">
            <p className="m-0 text-read text-quiet">
              We sent a code to <span className="font-medium text-pine">{fill(panel.sentTo)}</span>.
            </p>
            <span className="self-start text-body text-pine underline underline-offset-4">{panel.resend}</span>
          </div>
          <div className="grid w-full max-w-otp shrink-0 gap-2.5" style={{ gridTemplateColumns: `repeat(${panel.length}, minmax(0, 1fr))` }}>
            {Array.from({ length: panel.length }, (_, i) => (
              <span key={i} className="aspect-square h-[52px] w-full rounded-box border border-divider bg-tile" />
            ))}
          </div>
        </div>
      );
    case "upload":
      return (
        <div className="flex items-start justify-between gap-10">
          <p className="m-0 max-w-[330px] text-read text-quiet">{panel.guidance}</p>
          <div className="flex w-full max-w-[440px] shrink-0 flex-col gap-4">
            <span className="flex aspect-[440/240] flex-col items-center justify-center gap-2 rounded-box border border-lime bg-lime/12 p-3 text-center">
              <Upload className="size-[70px] text-pine" strokeWidth={1.25} />
              <span className="text-[21px] leading-[30px] text-pine/90">{panel.dropzone.label}</span>
              <span className="text-eyebrow text-quiet">
                {panel.accept.join(", ")}, up to {panel.maxMb} MB
              </span>
            </span>
          </div>
        </div>
      );
    case "address":
      return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {panel.fields.slice(0, 8).map((f) => (
            <FieldBox key={f.key} label={f.label} half={f.span === "half"} />
          ))}
        </div>
      );
    case "findings":
      // FindingsPanel: the scores as tiles, then the reason codes
      return (
        <div className="flex flex-col gap-5">
          <p className="m-0 text-read text-quiet">{panel.intro}</p>
          {panel.report ? (
            <>
              <div className="grid grid-cols-5 gap-3">
                {panel.report.scores.slice(0, 5).map((sc) => (
                  <div key={sc.label} className="flex flex-col gap-1 rounded-tile border border-card-line bg-tile p-3">
                    <span className="text-eyebrow text-quiet">{sc.label}</span>
                    <span className="tnum text-[19px] leading-6 font-medium text-pine">{sc.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {panel.report.reasonCodes.slice(0, 6).map((c) => (
                  <span key={c} className="tnum rounded-pill bg-pass-tint px-2.5 py-1 text-[11px] font-medium tracking-[0.3px] text-ramp-2">
                    {c}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      );
    case "result": {
      // the Trust Seal the verified page leads with (panels.tsx TrustSeal)
      const seal = panel.seal;
      return (
        <div className="relative overflow-hidden rounded-tile border border-pine/12 bg-pine p-6 text-lime">
          <div className="pointer-events-none absolute inset-0 opacity-[0.14]">
            <div className="absolute top-1/2 left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime" />
            <div className="absolute top-1/2 left-1/2 size-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime" />
            <div className="absolute top-1/2 left-1/2 size-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime" />
          </div>
          <div className="relative flex flex-col items-center gap-4 text-center">
            <span className="grid size-16 place-items-center rounded-pill bg-lime text-pine ring-8 ring-lime/15">
              <ShieldCheck className="size-8" strokeWidth={1.8} />
            </span>
            <div className="flex flex-col items-center gap-1">
              {seal?.detail ? <span className="text-eyebrow font-medium tracking-[2px] text-lime/70 uppercase">{seal.detail}</span> : null}
              <span className="text-[22px] leading-7 font-semibold text-white">{seal?.title ?? panel.outcomes.Verified.heading}</span>
              {seal?.issuer ? <span className="text-body text-lime/75">Issued by {seal.issuer}</span> : null}
            </div>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
