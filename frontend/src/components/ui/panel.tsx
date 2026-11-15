import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The frame's "Background+Border" node — the one card the whole dashboard is
 * built from. Two radii exist in Desktop-43: the upper half of the page uses
 * 16 and the lower half 18.8, so `radius` selects rather than guesses.
 */
export function Panel({
  title,
  action,
  radius = "card",
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  /** Right-aligned control on the heading row (the activity card's button). */
  action?: ReactNode;
  radius?: "card" | "panel";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-stack border border-site-line bg-site-panel p-pad",
        radius === "card" ? "rounded-site-card" : "rounded-site-panel",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex min-h-[19px] items-center justify-between gap-4">
          {title && <h3 className="text-card font-medium tracking-[-0.26px] text-pine">{title}</h3>}
          {action}
        </header>
      )}
      <div className={cn("flex min-w-0 flex-col", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Uppercase eyebrow above a figure. Letter-spaced per the frame. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-micro tracking-[0.564px] uppercase", className)}>{children}</span>
  );
}

/** The big number in a KPI or panel. */
export function Figure({
  children,
  size = "stat",
  className,
}: {
  children: ReactNode;
  size?: "stat" | "lg";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "tnum m-0 font-medium text-pine",
        size === "lg" ? "text-stat-lg" : "text-stat",
        className,
      )}
    >
      {children}
    </p>
  );
}
