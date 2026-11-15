import type { ReactNode } from "react";
import { Check, Loader, Minus, X } from "lucide-react";

import { Lottie } from "@/components/ui/lottie";
import type { CheckOutcome, FactPair, Verdict } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
   The pieces every tab is built from.

   Nine tabs draw the same five shapes over and over, a term/detail grid, a
   labelled outcome, a bordered tile, a heading, an image slot. Each lives here
   once, so "the pass pill" is one decision rather than nine that drift.
---------------------------------------------------------------------------- */

/** The heading above a block inside a tab. */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 text-section font-medium text-pine">{children}</h3>
  );
}

/**
 * The frames' `Descriptions` node: term above detail, two to a row.
 *
 * A real `<dl>`. These are label/value pairs about one subject, which is what
 * a description list is for — and it is the difference between a screen reader
 * announcing "Document number, AE5024176" and announcing two loose strings.
 */
export function Facts({ facts, columns = 2 }: { facts: FactPair[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl
      className={cn(
        "m-0 grid gap-x-6 gap-y-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {facts.map((fact) => (
        <div key={fact.term} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-micro text-muted">{fact.term}</dt>
          <dd
            className={cn(
              "m-0 min-w-0 text-body break-words text-pine [overflow-wrap:anywhere]",
              // MRZ lines and fingerprints are strings to be compared character
              // by character, not read. Tabular figures and a mono face make a
              // transposed digit visible instead of invisible.
              fact.mono && "tnum font-mono text-[13px] break-all",
            )}
          >
            {fact.detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------------------------
   Outcomes
---------------------------------------------------------------------------- */

const OUTCOME: Record<CheckOutcome, { label: string; pill: string; glyph: typeof Check }> = {
  pass: { label: "pass", pill: "bg-pass-tint text-ramp-2", glyph: Check },
  fail: { label: "Fail", pill: "bg-danger-tint text-danger", glyph: X },
  review: { label: "review", pill: "bg-caution-tint text-caution", glyph: Minus },
  pending: { label: "not run", pill: "bg-inert-tint text-inert", glyph: Minus },
};

/**
 * A check's result.
 *
 * Carries its own glyph as well as its colour. On a compliance surface a pass
 * and a fail must not be one hue apart and nothing else — this is the screen an
 * operator acts on.
 */
export function OutcomeTag({ outcome }: { outcome: CheckOutcome }) {
  const o = OUTCOME[outcome];
  const Glyph = o.glyph;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-micro font-medium whitespace-nowrap",
        o.pill,
      )}
    >
      <Glyph aria-hidden className="size-3" strokeWidth={2.4} />
      {o.label}
    </span>
  );
}

/** A bordered row: label on the left, its outcome on the right. */
export function CheckPill({ label, outcome, note }: { label: string; outcome: CheckOutcome; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-box border border-hairline bg-page px-2.5 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body text-pine">{label}</span>
        {note && <span className="text-micro break-words text-muted">{note}</span>}
      </span>
      <OutcomeTag outcome={outcome} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Surfaces
---------------------------------------------------------------------------- */

/** A white tile inside a tab panel — the frames' `Border` node at radius 12. */
export function Tile({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-box border border-hairline bg-page p-3", className)}>{children}</div>
  );
}

/** Label + value on one line, ruled. The velocity list. */
export function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-box border border-hairline bg-page px-2.5 py-2.5">
      <span className="min-w-0 text-body text-pine">{label}</span>
      <span className="tnum shrink-0 text-body font-medium text-pine">{value}</span>
    </div>
  );
}

/**
 * A captured image.
 *
 * With no `image`, the slot stays empty and says so — the capture pipeline has
 * not handed a photograph over. With one, it shows a clearly-marked PUBLIC
 * SAMPLE (a stock portrait, an official "SPECIMEN" sample driving licence): the
 * frames populate these slots so the record does not read as broken, and the
 * SAMPLE ribbon keeps the placeholder from ever being mistaken for a real
 * applicant's face or a real document — which is the line this component holds.
 */
export function CaptureFrame({
  label,
  caption,
  image,
  real,
  hidden,
  ratio = "landscape",
}: {
  label: string;
  caption?: string;
  /** A public sample image to fill the slot; shows a SAMPLE ribbon over it. */
  image?: string;
  /** The applicant's actual capture (from the encrypted store): no SAMPLE ribbon. */
  real?: boolean;
  /** Captured, but not shown to the person's role. */
  hidden?: boolean;
  ratio?: "landscape" | "portrait" | "page";
}) {
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2 rounded-box border border-hairline bg-page p-3">
      <div
        className={cn(
          "relative grid w-full place-items-center overflow-hidden rounded-well border bg-panel",
          image ? "border-hairline" : "border-dashed border-edge",
          ratio === "landscape" && "aspect-[1.586]",
          ratio === "portrait" && "aspect-[3/4]",
          ratio === "page" && "aspect-[1/1.294]",
        )}
      >
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={label} className={cn("absolute inset-0 size-full", real ? "object-contain" : "object-cover")} />
            {real ? null : (
              <span className="absolute top-1.5 left-1.5 rounded-pill bg-pine/85 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.5px] text-lime uppercase">
                Sample
              </span>
            )}
          </>
        ) : (
          <span className="px-4 text-center text-micro text-muted">{hidden ? "Hidden for your role" : "Not captured"}</span>
        )}
      </div>
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-pine">{label}</span>
        {caption ? <span className="text-micro text-muted">{caption}</span> : null}
      </figcaption>
    </figure>
  );
}

/* ----------------------------------------------------------------------------
   Verdict
---------------------------------------------------------------------------- */

const VERDICT: Record<Verdict, { pill: string; glyph: typeof Check }> = {
  Approved: { pill: "bg-approve-tint text-approve", glyph: Check },
  "Needs review": { pill: "bg-caution-tint text-caution", glyph: Minus },
  Declined: { pill: "bg-danger-tint text-danger", glyph: X },
  Abandoned: { pill: "bg-inert-tint text-inert", glyph: Minus },
  "In progress": { pill: "bg-lime-tint text-pine", glyph: Loader },
  Disabled: { pill: "bg-inert-tint text-pine", glyph: Minus },
};

/** The verdict beside the applicant's name in the detail header. */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  // a status this build does not know yet shows neutral instead of breaking the page
  const v = VERDICT[verdict] ?? { pill: "bg-inert-tint text-inert", glyph: Minus };
  const Glyph = v.glyph;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2 py-1 text-body whitespace-nowrap",
        v.pill,
      )}
    >
      <Glyph aria-hidden className="size-4" strokeWidth={2.4} />
      {verdict}
    </span>
  );
}

/** A machine-readable reason code. Monospaced because it is an identifier. */
export function CodeChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-box border border-hairline bg-page px-2 py-1 font-mono text-[11px] leading-4 text-pine">
      {children}
    </span>
  );
}

/** The picture above an empty tab, named for what is missing: the chip, an upload, or a check. */
export type EmptyArt = "nfc" | "upload" | "check";

/**
 * Said out loud when a tab has no result, rather than drawn as an empty shell. With `art` the
 * whole tab is empty: a small looping picture (`public/animation_files/empty_*.json`), a title
 * and the reason. Without it, a quiet one-line note inside a tab that has other results.
 */
export function NotRun({ label, title, art }: { label: string; title?: string; art?: EmptyArt }) {
  if (!art) {
    return <p className="m-0 rounded-box border border-hairline bg-panel px-4 py-5 text-center text-body text-slate">{label}</p>;
  }
  return (
    <section className="flex flex-col items-center gap-3 rounded-box border border-hairline bg-panel px-6 pt-6 pb-8 text-center">
      <Lottie name={`empty_${art}`} className="h-[180px] w-[240px] max-w-full" />
      <div className="flex max-w-[46ch] flex-col gap-1">
        {title ? <h3 className="m-0 text-[15px] leading-[21px] font-medium text-pine">{title}</h3> : null}
        <p className="m-0 text-body text-slate">{label}</p>
      </div>
    </section>
  );
}
