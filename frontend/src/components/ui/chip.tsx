import { cn } from "@/lib/utils";

import type { Verdict } from "@/lib/console/types";

/**
 * Verdict pill for the activity list.
 *
 * Colour is not the only signal — each verdict also carries its own glyph — so
 * the list stays readable to anyone who cannot separate the amber from the red.
 */
const VERDICT_STYLE: Record<Verdict, { dot: string; text: string; bg: string }> = {
  Approved: { dot: "bg-ramp-3", text: "text-ramp-2", bg: "bg-pass-tint" },
  "Needs review": { dot: "bg-caution", text: "text-caution", bg: "bg-caution-tint" },
  Declined: { dot: "bg-danger", text: "text-danger", bg: "bg-danger-tint" },
  Abandoned: { dot: "bg-muted", text: "text-inert", bg: "bg-inert-tint" },
  "In progress": { dot: "bg-ramp-4", text: "text-pine", bg: "bg-lime-tint" },
  Disabled: { dot: "bg-pine", text: "text-pine", bg: "bg-inert-tint" },
};

const VERDICT_GLYPH: Record<Verdict, string> = {
  Approved: "✓",
  "Needs review": "!",
  Declined: "✕",
  Abandoned: "-",
  "In progress": "…",
  Disabled: "‖",
};

/** A status this build does not know yet (a newer server, an older open page) shows neutral instead of breaking the list. */
const UNKNOWN = { dot: "bg-muted", text: "text-inert", bg: "bg-inert-tint" };

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const s = VERDICT_STYLE[verdict] ?? UNKNOWN;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium whitespace-nowrap",
        s.bg,
        s.text,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-3.5 place-items-center rounded-pill text-[8px] leading-none font-bold text-white",
          s.dot,
        )}
      >
        {VERDICT_GLYPH[verdict] ?? "-"}
      </span>
      {verdict}
    </span>
  );
}

/** Incident severity, and the workflow table's "Slow" marker. */
export function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "caution" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-micro",
        tone === "caution" && "bg-caution-tint text-caution",
        tone === "danger" && "bg-danger-tint text-danger",
        tone === "neutral" && "bg-well text-inert",
      )}
    >
      {children}
    </span>
  );
}
