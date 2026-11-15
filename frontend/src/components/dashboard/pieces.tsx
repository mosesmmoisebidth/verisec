import type { ReactNode } from "react";
import Link from "next/link";

import { ArrowRight, Download, Globe, Loader2, Plus } from "lucide-react";

import { ramp } from "@/components/charts/charts";
import { Select } from "@/components/ui/select";
import { Eyebrow, Figure } from "@/components/ui/panel";
import type {
  BarItem,
  DeltaTone,
  Kpi,
  QueueTile as QueueTileData,
  Segment,
} from "@/lib/console/types";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
   Header controls
---------------------------------------------------------------------------- */

/** The header's dropdowns (date range, workflow). The custom platform `Select`
 *  in the frame's pill, not a native `<select>` — the OS popup cannot be styled
 *  to match. First option is the initial selection. */
export function Combobox({
  options,
  label,
  className,
  value,
  onValueChange,
}: {
  options: readonly string[];
  label: string;
  className?: string;
  /** Controlled selection (live dashboard); uncontrolled when omitted. */
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Select
      options={options}
      label={label}
      value={value}
      onValueChange={onValueChange}
      className={cn(
        "h-[34px] rounded-pill border border-hairline bg-panel pr-8 pl-3 text-micro text-pine",
        className,
      )}
    />
  );
}

export function GhostButton({
  children,
  onClick,
  busy,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Work in flight: a spinner, and the click is ignored. */
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={busy ? undefined : onClick}
      aria-busy={busy || undefined}
      className="inline-flex h-[35px] items-center gap-2 rounded-pill border border-hairline bg-panel px-3 text-micro font-medium text-pine transition-colors hover:bg-hover-panel"
    >
      {busy ? (
        <Loader2 aria-hidden className="size-[15px] animate-spin" strokeWidth={1.6} />
      ) : (
        <Download aria-hidden className="size-[15px]" strokeWidth={1.6} />
      )}
      {children}
    </button>
  );
}

/** A panel with nothing to draw for the period says so, in the panel's own quiet voice. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex min-h-[120px] items-center justify-center px-4 text-center text-micro text-muted">
      {children}
    </p>
  );
}

export function LimeButton({
  children,
  compact,
  href,
}: {
  children: ReactNode;
  compact?: boolean;
  /** When set, renders as a link — e.g. "New session" opens the KYC flow. */
  href?: string;
}) {
  const className = cn(
    "inline-flex items-center gap-2 rounded-pill bg-lime px-3 text-micro font-medium text-pine transition-[filter] hover:brightness-95",
    compact ? "h-[30px]" : "h-[35px]",
  );
  const inner = (
    <>
      <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" className={className}>
      {inner}
    </button>
  );
}

export function LastSync({ label, value }: { label: string; value: string }) {
  return (
    <p className="m-0 flex items-center gap-1.5 text-micro text-pine">
      <Globe aria-hidden className="size-[13px] text-muted" strokeWidth={1.6} />
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </p>
  );
}

/* ----------------------------------------------------------------------------
   KPI card
---------------------------------------------------------------------------- */

const TONE: Record<DeltaTone, string> = {
  pine: "text-pine",
  positive: "text-positive",
  uptime: "text-uptime",
};

export function KpiCard({ kpi, icon }: { kpi: Kpi; icon: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-hair rounded-card border border-hairline p-pad",
        kpi.feature
          ? "bg-[image:var(--gradient-feature)]"
          : "bg-panel",
      )}
    >
      <span className={cn("flex items-center gap-1.5", kpi.feature ? "text-pine" : "text-muted")}>
        {icon}
        <Eyebrow>{kpi.label}</Eyebrow>
      </span>
      <Figure className="pt-1">{kpi.value}</Figure>
      <span className={cn("flex items-center gap-1 text-micro", TONE[kpi.tone])}>
        {kpi.trend === "none" ? null : <Trend dir={kpi.trend} />}
        <span className="tnum">{kpi.delta}</span>
      </span>
    </div>
  );
}

/** A 45° arrow. Direction is the shape, not just the colour. */
function Trend({ dir }: { dir: "up" | "down" }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="size-3 shrink-0" fill="none">
      <path
        d={dir === "up" ? "M3 9 L9 3 M9 3 H5.2 M9 3 V6.8" : "M3 3 L9 9 M9 9 H5.2 M9 9 V5.2"}
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   Ranked bar list
---------------------------------------------------------------------------- */

/**
 * Label + value on one line, a proportional bar under it.
 *
 * Bars are scaled to the largest item in the list, not to 100, so the ranking
 * stays legible when every value is small. `aria-hidden` on the bar because the
 * number beside it already carries the information.
 */
export function BarList({ items }: { items: BarItem[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((item, i) => (
        <li key={item.label} className="flex flex-col gap-hair">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-micro text-pine">{item.label}</span>
            <span className="tnum shrink-0 text-micro text-muted">{item.display}</span>
          </span>
          <span aria-hidden className="block h-2.5 w-full overflow-hidden rounded-pill bg-black/[0.05]">
            <span
              className="block h-full rounded-pill"
              style={{
                width: `${(item.value / max) * 100}%`,
                // Walk down the ramp so rank reads without the numbers.
                background: ramp((Math.min(i, 4) + 1) as 1 | 2 | 3 | 4 | 5),
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------------------
   Connection-type stacked bar
---------------------------------------------------------------------------- */

/**
 * One stacked bar, labelled in place where a segment is wide enough to read.
 *
 * Three tiers, because 62% and 6% of a 669px bar are not the same problem: a
 * wide segment takes "Label 62%" on one line, a middling one stacks the label
 * over the number, and anything under 5% carries no label at all and is read
 * from the legend. The whole bar is one `role="img"` with the full breakdown as
 * its label, so nothing depends on reading text off a coloured rectangle.
 */
export function SegmentedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.percent, 0) || 1;
  return (
    <div
      className="flex h-[30px] w-full overflow-hidden rounded-well"
      role="img"
      aria-label={segments.map((s) => `${s.label} ${s.percent}%`).join(", ")}
    >
      {segments.map((s) => {
        const wide = s.percent >= 20;
        const mid = s.percent >= 8;
        return (
          <span
            key={s.label}
            aria-hidden
            // overflow-hidden clips each segment to its own box, so a label can
            // never spill into the next segment (which is what scrambled the text).
            className="grid min-w-0 place-items-center overflow-hidden px-1 leading-none"
            style={{ width: `${(s.percent / total) * 100}%`, background: ramp(s.ramp) }}
          >
            {s.inline && wide ? (
              <span className="max-w-full truncate text-[10px] font-medium text-white">
                {s.label} {s.percent}%
              </span>
            ) : s.inline && mid ? (
              // Too narrow for the name; show just the percent — the full name
              // is in the legend below. Tiny slivers show nothing, never a scramble.
              <span className="tnum text-[9px] font-medium text-white">{s.percent}%</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Queue tile
---------------------------------------------------------------------------- */

export function QueueTile({ tile }: { tile: QueueTileData }) {
  return (
    <a
      href={tile.href}
      className="flex flex-col gap-tight rounded-panel border border-hairline bg-panel p-pad transition-colors hover:bg-hover-sunken"
    >
      <Eyebrow className="text-muted">{tile.label}</Eyebrow>
      <Figure>{tile.value}</Figure>
      <span className="flex items-center gap-1 text-micro text-uptime">
        {tile.cta}
        <ArrowRight aria-hidden className="size-3" strokeWidth={2} />
      </span>
    </a>
  );
}
