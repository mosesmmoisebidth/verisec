import { CheckBadge } from "@/components/ui/component-icon";
import type { WorkflowSummary } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * One saved workflow — Figma frame Desktop-22's "Link" card.
 *
 * The card's height is driven by its chips: a workflow with seven checks wraps
 * to a third row and grows, which is why the grid uses `items-start` rather
 * than stretching every card to the tallest.
 */
export function WorkflowCard({ card }: { card: WorkflowSummary }) {
  return (
    <a
      href={card.href}
      className="flex flex-col gap-3 rounded-[20px] border border-edge bg-panel p-5 transition-colors hover:bg-hover-sunken"
    >
      <header className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-2">
          <h3 className="m-0 truncate text-[17px] leading-6 font-medium text-pine">{card.name}</h3>
          <StatusBadge status={card.status} />
        </span>
        <span className="tnum shrink-0 text-[13px] text-pine">{card.price}</span>
      </header>

      <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
        {card.chips.map((chip) => (
          <li
            key={chip.label}
            className="flex h-8 items-center gap-1.5 rounded-pill border border-pine/15 bg-lime p-1 pr-3"
          >
            <CheckBadge icon={chip.icon} />
            <span className="text-[13px] leading-none text-pine">{chip.label}</span>
          </li>
        ))}
      </ul>

      <p className="m-0 text-xs leading-4 text-slate">{card.updated}</p>
    </a>
  );
}

/** Pine pill for a live workflow, muted for one still being drafted. */
function StatusBadge({ status }: { status: "active" | "draft" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-pill px-2 py-0.5 text-[11px] leading-4",
        status === "active" ? "bg-pine text-lime" : "bg-inert-tint text-inert",
      )}
    >
      {status}
    </span>
  );
}
