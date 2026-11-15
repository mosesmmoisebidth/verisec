import { cn } from "@/lib/utils";

/**
 * The workflow mark: a node branching into two, joined by connectors, the way workflow tools
 * draw a flow (one step leading to the next ones). Our own drawing on a 24px grid, stroked in
 * `currentColor` like the icon set it sits beside, so it takes the same sizes and colours.
 */
export function WorkflowGlyph({ className, strokeWidth = 1.8 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
    >
      <rect x="2" y="9.25" width="5.5" height="5.5" rx="1.6" />
      <rect x="16.5" y="3" width="5.5" height="5.5" rx="1.6" />
      <rect x="16.5" y="15.5" width="5.5" height="5.5" rx="1.6" />
      <path d="M7.5 12h3" />
      <path d="M10.5 12c0-3.6 1.6-6.25 6-6.25" />
      <path d="M10.5 12c0 3.6 1.6 6.25 6 6.25" />
      <circle cx="10.5" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}
