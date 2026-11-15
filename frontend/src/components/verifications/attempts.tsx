"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Ban,
  Check,
  CirclePlus,
  EyeOff,
  FileText,
  IdCard,
  ImageOff,
  Link2,
  MailCheck,
  MapPinHouse,
  Minus,
  MonitorSmartphone,
  MousePointerClick,
  PlayCircle,
  Radio,
  ScanFace,
  ShieldCheck,
  Smartphone,
  UserRoundCheck,
  UserSearch,
  X,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/verifications/evidence";
import type { AttemptView, TimelineIcon, TimelineTab, TimelineTone } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/*
 * Every try the applicant made, not only the one that worked: refused documents (what was expected, what was
 * uploaded, its image), failed liveness checks, face matches below the line. Shown as cards on the Document and
 * Face tabs, and on the timeline, which reads as a day-by-day activity log with each entry coloured by how it went.
 */

const TONE: Record<TimelineTone, { disc: string; chip: string; border: string; head: string; word: string; mark: LucideIcon | null }> = {
  pass: { disc: "bg-pass-tint text-ramp-2", chip: "bg-pass-tint text-ramp-2", border: "border-ramp-2/30", head: "bg-pass-tint/50", word: "Passed", mark: Check },
  fail: { disc: "bg-danger-tint text-danger", chip: "bg-danger-tint text-danger", border: "border-danger/35", head: "bg-danger-tint/60", word: "Failed", mark: X },
  review: { disc: "bg-caution-tint text-caution", chip: "bg-caution-tint text-caution", border: "border-caution/35", head: "bg-caution-tint/60", word: "Needs review", mark: Minus },
  info: { disc: "bg-lime-tint text-pine", chip: "bg-lime-tint text-pine", border: "border-hairline", head: "bg-panel/60", word: "", mark: null },
};

const GLYPH: Record<TimelineIcon, LucideIcon> = {
  created: CirclePlus,
  opened: MousePointerClick,
  document: FileText,
  selfie: ScanFace,
  match: UserRoundCheck,
  nfc: Radio,
  decision: ShieldCheck,
  phone: Smartphone,
  email: MailCheck,
  screening: UserSearch,
  address: MapPinHouse,
  link: Link2,
  disabled: Ban,
  enabled: PlayCircle,
  device: MonitorSmartphone,
};

const KIND: Record<AttemptView["kind"], string> = { document: "Upload", liveness: "Face check", "face-match": "Face match" };

const toneOfTry = (a: AttemptView): TimelineTone => (a.warn ? "review" : a.ok ? "pass" : "fail");
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "22:14" and "Thursday 15 October" in the viewer's own time zone. */
function clock(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function dayOf(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return {
    key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
    label: d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }),
  };
}
function stamp(iso: string, fallback: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ pieces -- */

/** A small status word with its mark: Passed, Failed, Needs review. */
function ToneChip({ tone, children }: { tone: TimelineTone; children?: React.ReactNode }) {
  const t = TONE[tone];
  const Mark = t.mark;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] leading-4 font-medium", t.chip)}>
      {Mark ? <Mark aria-hidden className="size-3" strokeWidth={2.6} /> : null}
      {children ?? t.word}
    </span>
  );
}

/** The try's own image, zoomable; a frame that says why when there is none. */
function Thumb({ a, className }: { a: AttemptView; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  const label = `${KIND[a.kind]} ${a.n}: ${a.title}`;
  if (!a.image)
    return (
      <span className={cn("grid place-items-center rounded-[10px] border border-dashed border-edge bg-panel text-muted", className)} title={a.hidden ? "Your role sees the checks, not the images." : "No image kept for this try"}>
        {a.hidden ? <EyeOff aria-hidden className="size-5" strokeWidth={1.7} /> : <ImageOff aria-hidden className="size-5" strokeWidth={1.7} />}
        <span className="sr-only">{a.hidden ? "Image hidden" : "No image"}</span>
      </span>
    );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Zoom ${label}`} className={cn("block cursor-zoom-in overflow-hidden rounded-[10px] border border-hairline bg-panel", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.image} alt={label} className="h-full w-full object-cover" />
      </button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 grid place-items-center p-6">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-zoom-out bg-pine/70 backdrop-blur-sm" />
          <div className="relative flex max-h-full max-w-5xl flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.image} alt={label} className="max-h-[80vh] max-w-full rounded-box bg-white object-contain" />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <ToneChip tone={toneOfTry(a)}>{a.title}</ToneChip>
              <span className="text-body font-medium text-white">
                {KIND[a.kind]} {a.n}, {stamp(a.iso, a.at)}
              </span>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-white px-3 text-micro font-medium text-pine">
                <X aria-hidden className="size-3.5" strokeWidth={2.2} />
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * What the try was about: expected vs uploaded for a document, the match against its line, or why a check stopped.
 * `stacked`: each label above its chips (a narrow card), instead of beside them.
 */
function TryFacts({ a, stacked = false }: { a: AttemptView; stacked?: boolean }) {
  if (a.kind === "document")
    return (
      <dl className={cn("m-0", stacked ? "flex flex-col gap-1 [&>dd]:mb-1.5" : "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5")}>
        <dt className="text-micro text-muted">Expected</dt>
        <dd className="m-0 flex flex-wrap gap-1">
          {(a.expected ?? []).map((x) => (
            <span key={x} className="inline-flex items-center gap-1 rounded-pill border border-pine/15 bg-white px-2 py-0.5 text-[11px] leading-4 font-medium text-pine">
              <IdCard aria-hidden className="size-3" strokeWidth={2} />
              {x}
            </span>
          ))}
        </dd>
        <dt className="text-micro text-muted">Uploaded</dt>
        <dd className="m-0">
          {/* the right kind of document whose photo did not pass: the kind is fine, the problem is said below */}
          <ToneChip tone={a.outcome === "refused" ? "fail" : "pass"}>{a.seen ?? "Not recognised"}</ToneChip>
        </dd>
        {a.reason && (a.outcome === "retake" || a.outcome === "not-accepted" || a.warn) ? (
          <>
            <dt className="text-micro text-muted">{a.warn ? "Warning" : "Problem"}</dt>
            <dd className="m-0 flex flex-wrap gap-1">
              {a.reason.split(", ").map((x) => (
                <ToneChip key={x} tone={a.warn ? "review" : "fail"}>
                  {x}
                </ToneChip>
              ))}
            </dd>
          </>
        ) : null}
        {a.compared ? (
          <>
            <dt className="text-micro text-muted">Front and back</dt>
            <dd className="m-0 flex flex-wrap gap-1">
              {a.matched?.length ? (
                a.matched.map((x) => (
                  <ToneChip key={x} tone="pass">
                    {x}
                  </ToneChip>
                ))
              ) : (
                <span className="text-micro text-slate">No detail matched</span>
              )}
              <span className="self-center text-[11px] leading-4 text-muted">
                {a.matched?.length ?? 0} of {a.compared} agree
              </span>
            </dd>
          </>
        ) : null}
      </dl>
    );
  if (a.kind === "face-match" && typeof a.similarity === "number") {
    const need = a.threshold ?? 0.75;
    return (
      <div className="flex flex-col gap-1.5" role="meter" aria-label="Face similarity" aria-valuenow={Math.round(a.similarity * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="flex items-baseline justify-between gap-3 text-micro">
          <span className={cn("tnum font-medium", a.ok ? "text-ramp-2" : "text-danger")}>{pct(a.similarity)} similar</span>
          <span className="tnum text-muted">needs {pct(need)}</span>
        </div>
        <div className="relative h-2 rounded-pill bg-well">
          <span className={cn("absolute inset-y-0 left-0 rounded-pill", a.ok ? "bg-ramp-2" : "bg-danger")} style={{ width: pct(Math.min(1, Math.max(0, a.similarity))) }} />
          {/* the line it had to reach */}
          <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded-pill bg-pine" style={{ left: pct(need) }} />
        </div>
      </div>
    );
  }
  const note = a.reason ?? (a.mode ? `${a.mode.charAt(0).toUpperCase()}${a.mode.slice(1)} check` : null);
  return note ? <p className="m-0 text-micro text-slate">{note}</p> : null;
}

/* ---------------------------------------------------------- tab card -- */

/** "4 tries" and "3 failed": the count, at a glance. */
function TryCount({ attempts }: { attempts: AttemptView[] }) {
  const failed = attempts.filter((a) => !a.ok).length;
  return (
    <span className="flex items-center gap-1.5">
      <span className="rounded-pill border border-hairline bg-white px-2 py-0.5 text-[11px] leading-4 font-medium text-pine">
        {attempts.length} {attempts.length === 1 ? "try" : "tries"}
      </span>
      {failed ? <ToneChip tone="fail">{failed} failed</ToneChip> : null}
    </span>
  );
}

/** Every try at one step, as image cards: refused in red (expected vs uploaded), the one that worked in green. */
export function AttemptsCard({ title, attempts }: { title: string; attempts?: AttemptView[] }) {
  if (!attempts?.length) return null;
  return (
    <Card title={title} aside={<TryCount attempts={attempts} />}>
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))] gap-3 p-0">
        {attempts.map((a) => (
          <li key={`${a.kind}-${a.n}-${a.iso}`} className="min-w-0">
            <article className={cn("flex h-full flex-col overflow-hidden rounded-[12px] border bg-page", TONE[toneOfTry(a)].border)}>
              <div className="relative">
                <Thumb a={a} className="h-32 w-full rounded-none border-0 border-b" />
                <span className="pointer-events-none absolute top-2 right-2 rounded-pill bg-white/95 px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-pine shadow-[0_1px_2px_rgb(14_50_40/0.15)]">
                  {KIND[a.kind]} {a.n}
                </span>
              </div>
              {/* the result as a band right under the image: red refused or failed, green accepted or passed */}
              <div className={cn("flex items-center justify-between gap-2 px-3 py-2", TONE[toneOfTry(a)].head)}>
                <ToneChip tone={toneOfTry(a)}>{a.title}</ToneChip>
                <time dateTime={a.iso} className="shrink-0 text-[11px] leading-4 text-muted">
                  {stamp(a.iso, a.at)}
                </time>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <TryFacts a={a} stacked />
                {a.seenName ? <p className="m-0 text-[11px] leading-4 text-muted">Read as: {a.seenName}</p> : null}
              </div>
            </article>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * The front and back check: each detail the reader compared between the printed side and the barcode / MRZ / chip,
 * and whether they agreed. Green when everything agreed, red rows for any detail that differs.
 */
export function CrossMatchCard({ data }: { data?: { agree: boolean; fields: { label: string; agree: boolean; sources: string[] }[] } | null }) {
  if (!data?.fields.length) return null;
  const agreed = data.fields.filter((f) => f.agree).length;
  return (
    <Card
      title="Front and back check"
      aside={<ToneChip tone={data.agree ? "pass" : agreed ? "review" : "fail"}>{`${agreed} of ${data.fields.length} agree`}</ToneChip>}
    >
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-2 p-0">
        {data.fields.map((f) => (
          <li key={f.label} className={cn("flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5", f.agree ? "border-ramp-2/25 bg-pass-tint/40" : "border-danger/30 bg-danger-tint/50")}>
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill", f.agree ? "bg-ramp-2 text-white" : "bg-danger text-white")}>
              {f.agree ? <Check aria-hidden className="size-3" strokeWidth={3} /> : <X aria-hidden className="size-3" strokeWidth={3} />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-body font-medium text-pine">{f.label}</span>
              <span className="text-micro text-muted">
                {f.agree ? "Same on " : "Differs between "}
                {f.sources.join(", ").toLowerCase() || "the two sides"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Shown instead of a document while every upload so far was refused. */
export function NoAcceptedDocument({ attempts }: { attempts: AttemptView[] }) {
  const refused = attempts.filter((a) => !a.ok).length;
  return (
    <div className="flex items-start gap-3 rounded-box border border-danger/35 bg-danger-tint/50 px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-danger-tint text-danger">
        <X aria-hidden className="size-4.5" strokeWidth={2.4} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-medium text-pine">No accepted document yet</span>
        <span className="text-micro text-slate">
          {refused === 1 ? "The applicant's upload was not accepted." : `None of the applicant's ${refused} uploads was accepted.`} Each one is below with the reason: the wrong kind of document, or a photo that did not pass the check.
        </span>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------- timeline -- */

type Entry = TimelineTab["events"][number];

function Disc({ e }: { e: Entry }) {
  const tone = e.tone ?? "info";
  const Glyph = GLYPH[e.icon] ?? ShieldCheck;
  const Mark = TONE[tone].mark;
  return (
    <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-pill", TONE[tone].disc)}>
      <Glyph aria-hidden className="size-4" strokeWidth={1.8} />
      {/* how it went, as a mark on the disc (the colour only repeats it) */}
      {Mark ? (
        <span className={cn("absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-pill ring-2 ring-page", tone === "fail" ? "bg-danger text-white" : tone === "pass" ? "bg-ramp-2 text-white" : "bg-caution text-white")}>
          <Mark aria-hidden className="size-2.5" strokeWidth={3} />
        </span>
      ) : null}
    </span>
  );
}

function AttemptEntry({ e, a }: { e: Entry; a: AttemptView }) {
  const tone = toneOfTry(a);
  return (
    <article className={cn("overflow-hidden rounded-[12px] border bg-page", TONE[tone].border)}>
      <header className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2", TONE[tone].head)}>
        <span className="min-w-0 text-body font-medium text-pine">{e.label}</span>
        <span className="flex items-center gap-1.5">
          <ToneChip tone={tone}>{a.title}</ToneChip>
          <span className="rounded-pill border border-hairline bg-white px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-pine">
            {KIND[a.kind]} {a.n}
          </span>
        </span>
      </header>
      <div className="flex gap-3 p-3 max-sm:flex-col">
        <Thumb a={a} className="h-20 w-28 shrink-0 max-sm:h-36 max-sm:w-full" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <TryFacts a={a} />
          {a.seenName ? <p className="m-0 text-[11px] leading-4 text-muted">Read as: {a.seenName}</p> : null}
        </div>
      </div>
    </article>
  );
}

/**
 * The verification's activity, day by day: when each thing happened, what it was, and how it went. A try (a document
 * upload, a face check) is a card with its image and its result; everything else is one line with a status mark.
 */
export function ActivityTimeline({ data }: { data: TimelineTab }) {
  const events = data.events;
  const count = (t: TimelineTone) => events.filter((e) => e.tone === t).length;
  const tries = events.filter((e) => e.attempt);
  const failedTries = tries.filter((e) => !e.attempt!.ok).length;
  // day groups, in order (an entry without a time joins the day before it)
  const days: { key: string; label: string; events: Entry[] }[] = [];
  for (const e of events) {
    const d = dayOf(e.iso);
    const last = days[days.length - 1];
    if (last && (!d || last.key === d.key)) last.events.push(e);
    else days.push({ key: d?.key ?? `day-${days.length}`, label: d?.label ?? "Activity", events: [e] });
  }
  return (
    <div className="flex flex-col gap-5">
      {/* at a glance: how much happened and how it went */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-page px-3 py-1 text-micro font-medium text-pine">
          <Activity aria-hidden className="size-3.5" strokeWidth={2} />
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
        {tries.length ? (
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-page px-3 py-1 text-micro font-medium text-pine">
            {tries.length} {tries.length === 1 ? "try" : "tries"}
            {failedTries ? <ToneChip tone="fail">{failedTries} failed</ToneChip> : null}
          </span>
        ) : null}
        {count("pass") ? <ToneChip tone="pass">{count("pass")} passed</ToneChip> : null}
        {count("review") ? <ToneChip tone="review">{count("review")} to review</ToneChip> : null}
      </div>

      {days.map((day) => (
        <section key={day.key} aria-label={day.label} className="flex flex-col">
          <h4 className="m-0 mb-3 inline-flex self-start rounded-pill bg-panel px-3 py-1 text-micro font-medium text-pine">{day.label}</h4>
          <ol className="m-0 list-none p-0">
            {day.events.map((e, i) => {
              const last = i === day.events.length - 1;
              const tone = e.tone ?? "info";
              return (
                <li key={`${e.iso ?? e.at}-${i}`} className="grid grid-cols-[2.75rem_2rem_minmax(0,1fr)] gap-x-3 max-sm:grid-cols-[2rem_minmax(0,1fr)]">
                  <time dateTime={e.iso} className="tnum pt-2 text-right text-micro text-muted max-sm:hidden">
                    {clock(e.iso) || e.at}
                  </time>
                  {/* the spine is drawn by each entry, so it ends exactly at the day's last disc */}
                  <span className="flex flex-col items-center">
                    <Disc e={e} />
                    {last ? null : <span aria-hidden className="my-1 w-0.5 flex-1 rounded-pill bg-track" />}
                  </span>
                  <div className={cn("min-w-0", last ? "pb-1" : "pb-4")}>
                    {e.attempt ? (
                      <AttemptEntry e={e} a={e.attempt} />
                    ) : (
                      <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-body text-pine">{e.label}</span>
                        {tone !== "info" ? <ToneChip tone={tone} /> : null}
                      </div>
                    )}
                    <time dateTime={e.iso} className="tnum mt-1 hidden text-micro text-muted max-sm:block">
                      {clock(e.iso) || e.at}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
