"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Barcode,
  Cake,
  Check,
  Circle,
  Fingerprint,
  Globe,
  IdCard,
  EyeOff,
  ImageOff,
  Info,
  MapPin,
  Maximize2,
  Minus,
  OctagonAlert,
  UserRound,
  VenusAndMars,
  X,
} from "lucide-react";

import type { CheckOutcome, CheckRow, DetailFlag, DocumentField, FaceTab, TrustPart, VerificationProgress } from "@/lib/console/types";
import { cn } from "@/lib/utils";
import { toAlpha2 } from "@/lib/verify/idv/iso";

/*
 * The evidence kit for a verification's tabs: compact image cards with a zoom view, the
 * document field table, check cards, a banded gauge, the warnings list, the Trust Seal
 * breakdown and the progress stepper. Every block renders only what the record holds.
 */

/* ------------------------------------------------------------------ status -- */

const STATUS: Record<CheckOutcome, { icon: typeof Check; dot: string; text: string; label: string }> = {
  pass: { icon: Check, dot: "bg-pass-tint text-ramp-2", text: "text-ramp-2", label: "Passed" },
  review: { icon: Minus, dot: "bg-caution-tint text-caution", text: "text-caution", label: "Review" },
  fail: { icon: X, dot: "bg-danger-tint text-danger", text: "text-danger", label: "Failed" },
  pending: { icon: Minus, dot: "bg-inert-tint text-inert", text: "text-inert", label: "Not checked" },
};

/** A round status mark: its glyph carries the meaning, the colour only repeats it. */
export function StatusMark({ outcome, className }: { outcome: CheckOutcome; className?: string }) {
  const s = STATUS[outcome];
  const Icon = s.icon;
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-pill", s.dot, className)} title={s.label}>
      <Icon aria-hidden className="size-3" strokeWidth={2.6} />
      <span className="sr-only">{s.label}</span>
    </span>
  );
}

/** A white tile with an optional header row (title, a count or summary on the right). */
export function Card({ title, aside, children, className, bodyClass }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-box border border-hairline bg-page", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-hairline bg-panel/60 px-3.5 py-2.5">
          <h3 className="m-0 text-body font-medium text-pine">{title}</h3>
          {aside ? <span className="shrink-0 text-micro text-muted">{aside}</span> : null}
        </header>
      ) : null}
      <div className={cn("p-3.5", bodyClass)}>{children}</div>
    </section>
  );
}

/** A row of key figures, separated by hairlines. */
export function SummaryStrip({ items }: { items: { label: string; value: string }[] }) {
  if (!items.length) return null;
  return (
    <dl className="m-0 grid grid-cols-2 overflow-hidden rounded-box border border-hairline bg-page sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-col gap-0.5 border-hairline px-3.5 py-3 not-last:border-r [&:nth-child(2n)]:max-sm:border-r-0">
          <dt className="text-micro text-muted">{it.label}</dt>
          <dd className="m-0 text-body font-medium text-pine">
            <ClampText text={it.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Text that wraps instead of being cut, up to two lines; longer than that, it folds with a
 * More / Less toggle so the whole value can always be read.
 */
export function ClampText({ text, lines = 2 }: { text: string; lines?: 2 | 3 }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setLong(open || el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span ref={ref} className={cn("[overflow-wrap:anywhere]", !open && (lines === 2 ? "line-clamp-2" : "line-clamp-3"))}>
        {text}
      </span>
      {long ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-pill text-[11px] font-medium text-ramp-2 underline-offset-2 hover:underline">
          {open ? "Less" : "More"}
        </button>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ images -- */

/**
 * A captured image at a fixed, modest height (the photo is contained, never stretched or
 * cropped), with its label on the frame and a zoom view for the full image.
 */
export function EvidenceImage({
  label,
  image,
  height = "h-44",
  caption,
  hidden,
}: {
  label: string;
  image?: string;
  height?: string;
  caption?: string;
  /** Captured, but the person's role does not show images. */
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  return (
    <figure className="m-0 flex min-w-0 flex-col overflow-hidden rounded-box border border-hairline bg-page">
      <div className={cn("relative grid w-full place-items-center bg-panel", height)}>
        {image ? (
          <>
            <button type="button" onClick={() => setOpen(true)} className="absolute inset-0 cursor-zoom-in p-2.5" aria-label={`Zoom ${label}`}>
              {/* the whole image always fits the frame, whatever its shape: filled box, contained picture */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={label} className="h-full w-full object-contain" />
            </button>
            <span className="pointer-events-none absolute right-2 bottom-2 grid size-7 place-items-center rounded-pill bg-white/90 text-pine shadow-[0_1px_2px_rgb(14_50_40/0.2)]">
              <Maximize2 aria-hidden className="size-3.5" strokeWidth={2} />
            </span>
          </>
        ) : (
          // nothing was captured for this slot: the "no image" mark, inside a dashed frame
          <span className="m-2.5 flex size-[calc(100%-1.25rem)] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-edge text-center">
            <span className="grid size-10 place-items-center rounded-[10px] bg-page text-muted shadow-[0_1px_2px_rgb(14_50_40/0.08)]">
              {hidden ? <EyeOff aria-hidden className="size-5" strokeWidth={1.7} /> : <ImageOff aria-hidden className="size-5" strokeWidth={1.7} />}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-micro font-medium text-slate">{hidden ? "Image hidden" : "No image"}</span>
              <span className="text-[11px] text-muted">
                {hidden ? "Your role sees the checks, not the images." : "The applicant has not captured this yet."}
              </span>
            </span>
          </span>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2">
        <span className="text-micro font-medium text-pine">{label}</span>
        {caption ? <span className="truncate text-micro text-muted">{caption}</span> : null}
      </figcaption>
      {open && image ? (
        <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 grid place-items-center p-6">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-zoom-out bg-pine/70 backdrop-blur-sm" />
          <div className="relative flex max-h-full max-w-5xl flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={label} className="max-h-[80vh] max-w-full rounded-box bg-white object-contain" />
            <div className="flex items-center gap-3">
              <span className="text-body font-medium text-white">{label}</span>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-white px-3 text-micro font-medium text-pine">
                <X aria-hidden className="size-3.5" strokeWidth={2.2} />
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </figure>
  );
}

/* ------------------------------------------------------------------ fields -- */

const SOURCE: Record<string, string> = { VISUAL: "Visual", MRZ: "MRZ", BARCODE: "Barcode", RFID: "Chip" };

function sourceLabel(s: string) {
  const k = s.toUpperCase();
  return SOURCE[k] ?? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** What the sources say about a field, in words and colour. */
function fieldVerdict(f: DocumentField): { text: string; cls: string } {
  const n = f.sources?.length ?? 0;
  if (f.status === "fail") return { text: n > 1 ? "Sources disagree" : "Failed its check", cls: "text-danger" };
  if (f.status === "review") return { text: "Check this value", cls: "text-caution" };
  if (f.crossChecked || (f.status === "pass" && n > 1)) return { text: "Sources agree", cls: "text-ramp-2" };
  if (f.status === "pass") return { text: "Valid", cls: "text-ramp-2" };
  return { text: "Not cross-checked", cls: "text-muted" };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A date the reader returned as YYYY-MM-DD, written out, plus what it means for this field:
 * an age for a birth date, how long ago for an issue date, valid or expired for an expiry.
 */
function readDate(label: string, value: string): { text: string; hint?: { text: string; cls: string } } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const text = `${d} ${MONTHS[mo - 1]} ${y}`;
  const years = (Date.now() - Date.UTC(y, mo - 1, d)) / (365.2425 * 86_400_000);
  const span = (n: number) => (n >= 1 ? `${Math.floor(n)} year${Math.floor(n) === 1 ? "" : "s"}` : `${Math.max(1, Math.round(n * 12))} month${Math.round(n * 12) === 1 ? "" : "s"}`);
  const l = label.toLowerCase();
  if (/birth/.test(l)) return { text, hint: { text: `Age ${Math.floor(years)}`, cls: "text-slate" } };
  if (/expir/.test(l)) {
    return years > 0
      ? { text, hint: { text: `Expired ${span(years)} ago`, cls: "text-danger" } }
      : { text, hint: { text: `Valid for ${span(-years)} more`, cls: "text-ramp-2" } };
  }
  if (/issue/.test(l) && years >= 0) return { text, hint: { text: `Issued ${span(years)} ago`, cls: "text-slate" } };
  return { text };
}

const ACCENT: Record<CheckOutcome, string> = { fail: "bg-danger", review: "bg-caution", pass: "bg-ramp-4/60", pending: "bg-edge" };

/**
 * One field as a tile: the label small, the value large, a date written out with what it means,
 * where it was read, and whether the sources agree. A coloured edge carries the status at a glance.
 */
function FieldTile({ f }: { f: DocumentField }) {
  const date = readDate(f.label, f.value);
  const v = fieldVerdict(f);
  const status = f.status ?? "pending";
  return (
    <div className={cn("relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-box border py-2.5 pr-3 pl-4", status === "fail" ? "border-danger/25 bg-danger-tint/30" : status === "review" ? "border-caution/25 bg-caution-tint/30" : "border-hairline bg-page")}>
      <span aria-hidden className={cn("absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-pill", ACCENT[status])} />
      <dt className="text-micro text-muted">{f.label}</dt>
      <dd className="m-0 flex flex-col gap-0.5">
        <span className={cn("text-[15px] leading-[21px] font-medium text-pine [overflow-wrap:anywhere]", f.mono && "tnum font-mono text-[14px] tracking-[0.3px]")}>{date ? date.text : f.value}</span>
        {date?.hint ? <span className={cn("text-micro font-medium", date.hint.cls)}>{date.hint.text}</span> : null}
      </dd>
      <dd className="m-0 mt-1 flex flex-wrap items-center gap-1.5">
        {(f.sources ?? []).map((s) => (
          <span key={s} className="rounded-[5px] bg-well px-1.5 py-px text-[10.5px] font-medium tracking-[0.2px] text-slate">
            {sourceLabel(s)}
          </span>
        ))}
        <span className={cn("text-[11px] font-medium", v.cls)}>{v.text}</span>
      </dd>
    </div>
  );
}

/** One icon per group of fields, in the group's header (never one per field). */
function groupIcon(title: string) {
  const t = title.toLowerCase();
  const cls = "size-4 text-muted";
  if (t.startsWith("personal")) return <UserRound aria-hidden className={cls} strokeWidth={1.8} />;
  if (t.startsWith("document")) return <IdCard aria-hidden className={cls} strokeWidth={1.8} />;
  if (t.startsWith("address")) return <MapPin aria-hidden className={cls} strokeWidth={1.8} />;
  if (t.startsWith("machine")) return <Barcode aria-hidden className={cls} strokeWidth={1.8} />;
  return null;
}

/** One group of document fields, as tiles, with how many agree across sources in the header. */
export function FieldTable({ title, fields }: { title: string; fields: DocumentField[] }) {
  const disagree = fields.filter((f) => f.status === "fail").length;
  const agree = fields.filter((f) => f.status === "pass").length;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {groupIcon(title)}
          {title}
        </span>
      }
      aside={
        <span className="flex items-center gap-2.5">
          {agree ? <span className="text-ramp-2">{agree} agree</span> : null}
          {disagree ? <span className="text-danger">{disagree} disagree</span> : null}
          <span>
            {fields.length} field{fields.length === 1 ? "" : "s"}
          </span>
        </span>
      }
      bodyClass="p-3"
    >
      <dl className="m-0 grid gap-2.5 sm:grid-cols-2">
        {fields.map((f, i) => (
          <FieldTile key={`${f.label}-${i}`} f={f} />
        ))}
      </dl>
    </Card>
  );
}

/**
 * The person on the document, at a glance: the name large, then birth date with age, sex,
 * nationality and personal number, each found by what its label says (whatever the document
 * calls them). Shown only when the document carried a name.
 */
export function IdentityHero({ fields, portrait, country }: { fields: DocumentField[]; portrait?: string; country?: { code: string; name: string } }) {
  const find = (re: RegExp) => fields.find((f) => re.test(f.label));
  const full = find(/surname and given names|full name|^name$/i);
  const surname = find(/^surname$|^last name$/i);
  const given = find(/^given names?$|^first name$/i);
  const name = full?.value ?? [given?.value, surname?.value].filter(Boolean).join(" ");
  if (!name) return null;
  const facts = [
    { f: find(/date of birth/i), icon: Cake },
    { f: find(/^sex$|gender/i), icon: VenusAndMars },
    { f: find(/^nationality$/i) ?? find(/nationality/i), icon: Globe },
    { f: find(/personal number|national (id|number)/i), icon: Fingerprint },
  ].filter((x): x is { f: DocumentField; icon: typeof Cake } => !!x.f);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  // the issuing country's flag (public/flags/<alpha-2>.svg), from any form of the country the record holds
  const a2 = country ? toAlpha2(country.code) || toAlpha2(country.name) : "";
  const flag = a2 ? `/flags/${a2}.svg` : null;
  const countryName = country?.name || a2.toUpperCase();
  return (
    <section className="flex items-center gap-4 overflow-hidden rounded-box border border-pine/10 bg-[linear-gradient(135deg,var(--color-lime-wash),var(--color-page)_60%)] p-4">
      {portrait ? (
        <span className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portrait} alt="Portrait on the document" className="h-20 w-16 rounded-[10px] border border-hairline bg-page object-cover" />
          {flag ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flag} alt={countryName} title={countryName} className="absolute -right-2 -bottom-1.5 h-[18px] w-6 rounded-[3px] object-cover ring-2 ring-white" />
          ) : null}
        </span>
      ) : flag ? (
        <span className="flex shrink-0 flex-col items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={flag} alt={countryName} title={countryName} className="h-[54px] w-[72px] rounded-[8px] object-cover shadow-[0_1px_3px_rgb(14_50_40/0.25)] ring-1 ring-pine/10" />
          <span className="max-w-[88px] truncate text-[10.5px] font-medium text-slate">{countryName}</span>
        </span>
      ) : (
        <span className="grid size-16 shrink-0 place-items-center rounded-[14px] bg-pine text-[20px] font-medium text-lime">{initials}</span>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-col">
          <span className="text-micro text-muted">Name on the document</span>
          <span className="text-[20px] leading-[26px] font-medium tracking-[-0.3px] text-pine [overflow-wrap:anywhere]">{name}</span>
        </div>
        {facts.length ? (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {facts.map(({ f, icon: Icon }) => {
              const date = readDate(f.label, f.value);
              return (
                <li key={f.label} className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-page px-2.5 py-1 text-micro text-pine">
                  <Icon aria-hidden className="size-3.5 text-muted" strokeWidth={1.8} />
                  <span className="font-medium">{date ? `${date.text}${date.hint ? ` (${date.hint.text.toLowerCase()})` : ""}` : f.value}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- proof of address -- */

const BANNER: Record<CheckOutcome, string> = {
  pass: "border-ramp-3/25 bg-pass-tint/60",
  review: "border-caution/25 bg-caution-tint/60",
  fail: "border-danger/25 bg-danger-tint/60",
  pending: "border-hairline bg-panel",
};

/** The outcome of a check as a banner: the mark, the verdict in one or two words, and why. */
export function StatusBanner({ outcome, title, detail }: { outcome: CheckOutcome; title: string; detail: string }) {
  return (
    <section className={cn("flex items-start gap-3 rounded-box border p-3.5", BANNER[outcome])}>
      <StatusMark outcome={outcome} className="mt-0.5 size-6" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] leading-[21px] font-medium text-pine">{title}</span>
        <span className="text-micro leading-[17px] text-slate">{detail}</span>
      </span>
    </section>
  );
}

/**
 * The address in its parts, as the applicant confirmed it (or as read from the document), with
 * the country's flag, the fields the applicant changed marked, and the line exactly as read.
 */
export function AddressCard({
  parts,
  country,
  readAs,
  source,
}: {
  parts: { label: string; value: string; edited: boolean }[];
  country: string | null;
  readAs: string | null;
  source: string;
}) {
  const a2 = country ? toAlpha2(country) || country.toLowerCase().slice(0, 2) : "";
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <MapPin aria-hidden className="size-4 text-muted" strokeWidth={1.8} />
          Address
        </span>
      }
      aside={source}
    >
      <div className="flex flex-col gap-3">
        {parts.length ? (
          <dl className="m-0 grid gap-2 sm:grid-cols-2">
            {parts.map((p) => (
              <div key={p.label} className={cn("flex min-w-0 flex-col gap-0.5 rounded-well px-2.5 py-2", p.edited ? "bg-caution-tint/50" : "bg-panel")}>
                <dt className="flex items-center gap-1.5 text-[11px] text-muted">
                  {p.label}
                  {p.edited ? <span className="rounded-pill bg-caution-tint px-1.5 text-[10px] font-medium text-caution">Changed by applicant</span> : null}
                </dt>
                <dd className="m-0 text-body font-medium text-pine [overflow-wrap:anywhere]">{p.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="m-0 text-body text-muted">No address was confirmed.</p>
        )}
        {country ? (
          <p className="m-0 flex items-center gap-2 text-body text-pine">
            {a2 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/flags/${a2}.svg`} alt="" className="h-4 w-[22px] rounded-[2px] object-cover ring-1 ring-pine/10" />
            ) : null}
            <span className="font-medium">{country}</span>
          </p>
        ) : null}
        {readAs ? (
          <p className="m-0 border-t border-hairline pt-2.5 text-micro text-muted">
            Read from the document: <span className="text-pine">{readAs}</span>
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- face match -- */

/**
 * How the two faces were compared, told in words: was a face found in each image, which face
 * was compared with which, how close they are against the line that decides, and how long it took.
 */
export function FaceComparison({ data }: { data: NonNullable<FaceTab["comparison"]> }) {
  const pct = (n: number) => `${(Math.round(n * 1000) / 10).toFixed(1)}%`;
  const margin = data.similarity - data.threshold;
  return (
    <Card title="How the faces were compared" aside={data.matched ? "Same person" : "Different people"}>
      <div className="flex flex-col gap-3">
        {data.images.length ? (
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {data.images.map((img) => {
              const outcome: CheckOutcome = !img.read || img.faces === 0 ? "fail" : img.faces > 1 ? "review" : "pass";
              return (
                <li key={img.label} className="flex items-center gap-2.5 rounded-box border border-hairline bg-panel/50 px-3 py-2.5">
                  <StatusMark outcome={outcome} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body font-medium text-pine">{img.label}</span>
                    <span className="text-micro text-muted">
                      {!img.read ? "Could not be read" : img.faces === 0 ? "No face found" : img.faces === 1 ? "One face found" : `${img.faces} faces found`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {data.pair ? <p className="m-0 text-micro text-slate">{data.pair}</p> : null}
        <dl className="m-0 grid grid-cols-2 overflow-hidden rounded-box border border-hairline sm:grid-cols-4">
          {[
            { label: "Similarity", value: pct(data.similarity), cls: data.matched ? "text-ramp-2" : "text-danger" },
            { label: "Needed to match", value: `${Math.round(data.threshold * 100)}%`, cls: "text-pine" },
            { label: "Margin", value: `${margin >= 0 ? "+" : ""}${(Math.round(margin * 1000) / 10).toFixed(1)} pts`, cls: margin >= 0 ? "text-ramp-2" : "text-danger" },
            { label: "Time taken", value: data.seconds != null ? `${data.seconds} s` : "Not recorded", cls: "text-pine" },
          ].map((x) => (
            <div key={x.label} className="flex flex-col gap-0.5 border-hairline bg-page px-3 py-2.5 not-last:border-r [&:nth-child(2)]:max-sm:border-r-0">
              <dt className="text-micro text-muted">{x.label}</dt>
              <dd className={cn("tnum m-0 text-[15px] font-medium", x.cls)}>{x.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ checks -- */

function tally(checks: CheckRow[]) {
  const n = (o: CheckOutcome) => checks.filter((c) => c.outcome === o).length;
  return [
    n("pass") && `${n("pass")} passed`,
    n("review") && `${n("review")} to review`,
    n("fail") && `${n("fail")} failed`,
    n("pending") && `${n("pending")} not checked`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** A titled list of checks, problems first, with a one-line tally in the header. */
export function CheckCard({ title, checks }: { title: string; checks: CheckRow[] }) {
  const order: Record<CheckOutcome, number> = { fail: 0, review: 1, pass: 2, pending: 3 };
  const sorted = [...checks].sort((a, b) => order[a.outcome] - order[b.outcome]);
  return (
    <Card title={title} aside={tally(checks)} bodyClass="p-0">
      <ul className="m-0 list-none divide-y divide-hairline p-0">
        {sorted.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-start gap-2.5 px-3.5 py-2.5">
            <StatusMark outcome={c.outcome} className="mt-px" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body text-pine">{c.label}</span>
              {c.note ? <span className="text-micro break-words text-muted">{c.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ gauge --- */

/**
 * A 0 to 100% value against its bands: decline (red), review (amber), pass (green), with a
 * marker at the value. The bands are the same lines the Trust Seal decides with.
 */
export function BandGauge({ value, decline, review, label }: { value: number; decline: number; review: number; label: string }) {
  const at = Math.max(0, Math.min(1, value));
  const tone = at <= decline ? "text-danger" : at < review ? "text-caution" : "text-ramp-2";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body text-pine">{label}</span>
        <span className={cn("tnum text-[22px] leading-none font-medium", tone)}>{Math.round(at * 100)}%</span>
      </div>
      <div className="relative h-4" role="meter" aria-label={label} aria-valuenow={Math.round(at * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-pill">
          <span className="absolute inset-y-0 left-0 bg-danger/25" style={{ width: `${decline * 100}%` }} />
          <span className="absolute inset-y-0 bg-caution/30" style={{ left: `${decline * 100}%`, width: `${(review - decline) * 100}%` }} />
          <span className="absolute inset-y-0 right-0 bg-ramp-3/35" style={{ left: `${review * 100}%` }} />
        </div>
        <span className="absolute top-0 h-4 w-1 -translate-x-1/2 rounded-pill bg-pine ring-2 ring-white" style={{ left: `${at * 100}%` }} />
      </div>
      <div className="relative h-3.5">
        <span className="absolute text-[10.5px] text-muted" style={{ left: `${decline * 100}%`, transform: "translateX(-50%)" }}>
          {Math.round(decline * 100)}%
        </span>
        <span className="absolute text-[10.5px] text-muted" style={{ left: `${review * 100}%`, transform: "translateX(-50%)" }}>
          {Math.round(review * 100)}%
        </span>
      </div>
      <p className="m-0 text-micro text-muted">Below {Math.round(decline * 100)}% declines, up to {Math.round(review * 100)}% goes to review, above passes.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- warnings -- */

const FLAG = {
  critical: { icon: OctagonAlert, cls: "bg-danger-tint text-danger", label: "Critical" },
  warn: { icon: AlertTriangle, cls: "bg-caution-tint text-caution", label: "Warning" },
  info: { icon: Info, cls: "bg-inert-tint text-slate", label: "Note" },
} as const;

/** Findings, most serious first, each on its own line. */
export function WarningList({ flags, limit }: { flags?: DetailFlag[]; limit?: number }) {
  const [all, setAll] = useState(false);
  if (!flags) return null;
  if (!flags.length) {
    return (
      <p className="m-0 flex items-center gap-2 rounded-box border border-hairline bg-page px-3 py-2.5 text-body text-ramp-2">
        <StatusMark outcome="pass" /> No risks found.
      </p>
    );
  }
  const rank = { critical: 0, warn: 1, info: 2 } as const;
  const sorted = [...flags].sort((a, b) => rank[a.severity] - rank[b.severity]);
  const shown = limit && !all ? sorted.slice(0, limit) : sorted;
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {shown.map((f, i) => {
          const s = FLAG[f.severity];
          const Icon = s.icon;
          return (
            <li key={`${f.label}-${i}`} className="flex items-start gap-2.5 rounded-box border border-hairline bg-page px-3 py-2">
              <span className={cn("mt-px grid size-5 shrink-0 place-items-center rounded-[6px]", s.cls)}>
                <Icon aria-hidden className="size-3" strokeWidth={2.4} />
                <span className="sr-only">{s.label}</span>
              </span>
              <span className="min-w-0 text-micro leading-[18px] break-words text-pine">{f.label}</span>
            </li>
          );
        })}
      </ul>
      {limit && sorted.length > limit ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="self-start rounded-pill px-2 py-1 text-micro font-medium text-pine hover:bg-hover-light">
          {all ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- trust seal -- */

const RULE: Record<string, string> = {
  knockout: "A knock-out check failed: declined, score capped at 19.",
  missing: "A required check did not run: held for review, score capped at 49.",
  review: "A check is in its review band: held for review, score capped at 79.",
  low: "Below 80: held for review.",
  clear: "80 or more with nothing to review: approved.",
};

/** How the score was made: each check's weight, its own score, the points it gave, and why. */
export function TrustBreakdown({ parts, score, raw, rule, policy, provisional }: { parts: TrustPart[]; score: number; raw?: number; rule?: string; policy?: string; provisional?: boolean }) {
  return (
    <Card title={provisional ? "Trust Seal so far (the applicant has not finished)" : "How the Trust Seal was calculated"} aside={policy ? `Policy ${policy}` : undefined} bodyClass="p-0">
      <ul className="m-0 list-none divide-y divide-hairline p-0">
        {parts.map((p) => {
          const missing = p.score === null;
          const tone = p.knockout ? "bg-danger" : missing ? "bg-inert/40" : (p.score ?? 0) >= 80 ? "bg-ramp-3" : (p.score ?? 0) >= 50 ? "bg-caution" : "bg-danger";
          return (
            <li key={p.label} className="grid grid-cols-[minmax(0,1fr)_7rem_3rem] items-center gap-x-4 gap-y-1 px-3.5 py-2.5 max-sm:grid-cols-[minmax(0,1fr)_3rem]">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-body text-pine">
                  {p.label}
                  <span className="text-micro text-muted">weight {p.weight}</span>
                  {p.knockout ? <span className="rounded-pill bg-danger-tint px-1.5 py-px text-[10.5px] font-medium text-danger">Knock-out</span> : null}
                  {missing ? <span className="rounded-pill bg-inert-tint px-1.5 py-px text-[10.5px] font-medium text-inert">{provisional ? "Not reached yet" : "Missing"}</span> : null}
                </span>
                <span className="text-micro break-words text-muted">{missing && provisional ? "The applicant has not reached this step." : p.notes.join(", ")}</span>
              </span>
              <span className="flex items-center gap-2 max-sm:hidden">
                <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-well">
                  <span className={cn("block h-full rounded-pill", tone)} style={{ width: `${missing ? 0 : p.score}%` }} />
                </span>
                <span className="tnum w-7 text-right text-micro text-slate">{missing ? "0" : p.score}</span>
              </span>
              <span className="tnum text-right text-body font-medium text-pine">+{p.points}</span>
            </li>
          );
        })}
      </ul>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-panel/60 px-3.5 py-2.5">
        <span className="text-micro text-slate">{rule ? RULE[rule] : null}</span>
        <span className="tnum text-body font-medium text-pine">
          {raw != null && raw !== score ? `${raw} weighted, capped to ` : "Score "}
          {score}
        </span>
      </footer>
    </Card>
  );
}

/* ---------------------------------------------------------------- progress -- */

/** Where the applicant is (or stopped) in the flow, stage by stage, with when each was reached. */
export function ProgressStepper({ progress }: { progress: VerificationProgress }) {
  const head =
    progress.state === "completed"
      ? "Completed"
      : progress.state === "abandoned"
        ? `Stopped at ${progress.at?.toLowerCase() ?? "the start"}`
        : progress.state === "redacted"
          ? "Redacted"
          : `In progress: ${progress.at?.toLowerCase() ?? "starting"}`;
  return (
    <Card
      title={head}
      aside={progress.state === "completed" ? progress.lastActivity : `Last activity ${progress.lastActivityAgo}`}
    >
      {/* One row that always fits: every stage gets an equal share of the width, its name and time centred on its
          circle, and the line joining the circles fills up to where the applicant is (amber when they stopped). On a
          phone every second name sits above the line, so neighbouring names get twice the room and stay whole words. */}
      <ol className="m-0 flex list-none p-0" aria-label="Progress">
        {progress.stages.map((s, i) => {
          const stopped = progress.state === "abandoned" && s.state === "current";
          const reached = s.state === "done" || s.state === "current";
          // the latest try at this stage failed (a refused document, a failed face check): red, with what went wrong
          const failedNow = !!s.problem && reached;
          const above = i % 2 === 1;
          const label = (
            <span className="flex flex-col">
              <span className={cn("text-micro leading-[15px] font-medium [text-wrap:balance]", s.state === "todo" || s.state === "skipped" ? "text-muted" : "text-pine")}>
                {s.label}
              </span>
              <span className="text-[10.5px] leading-[14px] text-muted [text-wrap:balance]">
                {s.state === "skipped" ? "Skipped" : s.at ?? (s.state === "current" ? "Not finished" : "")}
              </span>
              {failedNow ? (
                <span className="text-[10.5px] leading-[14px] font-medium text-danger [text-wrap:balance]">{s.problem}</span>
              ) : s.warning ? (
                <span className="text-[10.5px] leading-[14px] font-medium text-caution [text-wrap:balance]">{s.warning}</span>
              ) : s.failed ? (
                <span className="text-[10.5px] leading-[14px] text-danger">
                  {s.failed} failed {s.failed === 1 ? "try" : "tries"}
                </span>
              ) : null}
            </span>
          );
          return (
            <li key={s.id} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
              <span aria-hidden={!above} className="hidden h-14 w-[calc(200%-8px)] shrink-0 flex-col justify-end pb-2 max-sm:flex">
                {above ? label : null}
              </span>
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn("absolute top-[11px] right-1/2 left-[-50%] h-0.5 max-sm:top-[67px]", failedNow ? "bg-danger/60" : stopped ? "bg-caution" : reached ? "bg-pine" : "bg-well")}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-[1] grid size-6 shrink-0 place-items-center rounded-pill text-[10px]",
                  failedNow && "bg-danger-tint text-danger ring-2 ring-danger/40",
                  !failedNow && s.state === "done" && "bg-pine text-lime",
                  !failedNow && s.state === "current" && (stopped ? "bg-caution-tint text-caution ring-2 ring-caution/40" : "bg-lime-tint text-pine ring-2 ring-lime"),
                  s.state === "todo" && "border border-edge bg-page text-muted",
                  s.state === "skipped" && "border border-dashed border-edge bg-page text-muted",
                )}
              >
                {failedNow ? (
                  <X aria-hidden className="size-3" strokeWidth={3} />
                ) : s.state === "done" ? (
                  <Check aria-hidden className="size-3" strokeWidth={3} />
                ) : s.state === "current" ? (
                  <Circle aria-hidden className="size-2 fill-current" />
                ) : null}
              </span>
              <span className={cn("w-full shrink-0 px-1 pt-2 max-sm:w-[calc(200%-8px)] max-sm:px-0", above && "max-sm:invisible")} aria-hidden={above ? undefined : undefined}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
