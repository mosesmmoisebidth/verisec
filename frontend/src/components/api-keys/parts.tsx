import type { ReactNode } from "react";
import Link from "next/link";

import type { ApiEnv, ApiTab, ApiTabId } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
   The pieces the API screen is built from.
---------------------------------------------------------------------------- */

/**
 * The four-tab strip — Desktop-44's `Frame 48095783`.
 *
 * LINKS, not client state, for the same reason the verification detail's strip
 * is: every tab gets its own URL, the back button works, a teammate can be sent
 * straight to the playground, and the whole screen stays a server component.
 *
 * Not the same component as `verifications/detail.tsx`'s strip and not a
 * refactor waiting to happen — the frames draw two different controls. That one
 * is a scrolling nine-item bar on white with a flat lime-tint active state;
 * this is a fixed four-item bar on `panel` whose active tab carries the lime
 * gradient and a lime border. Merging them would mean a component with two
 * appearances selected by a flag, which is the same thing twice with extra
 * steps.
 */
export function ApiTabStrip({ tabs, current }: { tabs: ApiTab[]; current: ApiTabId }) {
  return (
    // Same pill as the Settings tabs: white→lime gradient fill + a solid lime
    // bottom bar, corners clipped to the strip's radius.
    <nav
      aria-label="API Keys & Playground"
      className="w-fit max-w-full overflow-hidden rounded-[14px] bg-[#f4f4f2]"
    >
      <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = tab.id === current;
          return (
            <Link
              key={tab.id}
              href={tab.id === "keys" ? "/api-keys" : `/api-keys/${tab.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative shrink-0 px-5 py-3.5 text-[15px] whitespace-nowrap transition-colors",
                active
                  ? "bg-[image:var(--gradient-tab)] font-semibold text-pine"
                  : "font-normal text-[#9a9a9a] hover:text-pine",
              )}
            >
              {tab.label}
              {tab.badge ? (
                <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-pill bg-lime/35 px-2 py-0.5 text-[11px] leading-4 font-medium text-pine">
                  {tab.badge}
                </span>
              ) : null}
              {active ? (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-lime" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ----------------------------------------------------------------------------
   Chips
---------------------------------------------------------------------------- */

/**
 * live / test.
 *
 * Two colours AND two words. The distinction between a key that bills and a key
 * that does not is the single most consequential thing on this table, and a
 * green-vs-blue pill is not a distinction to anyone who cannot separate them.
 */
export function EnvChip({ env }: { env: ApiEnv }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2 py-0.5 text-micro font-medium",
        env === "live" ? "bg-pass-tint text-ramp-2" : "bg-info-tint text-info",
      )}
    >
      {env}
    </span>
  );
}

/** active / revoked / expired. */
export function StatusChip({ status }: { status: "active" | "revoked" | "expired" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-micro font-medium whitespace-nowrap",
        status === "active" ? "bg-pass-tint text-ramp-2" : status === "expired" ? "bg-caution-tint text-caution" : "bg-danger-tint text-danger",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-pill",
          status === "active" ? "bg-ramp-3" : status === "expired" ? "bg-caution" : "bg-danger",
        )}
      />
      {status}
    </span>
  );
}

/** The playground's HTTP verb. */
export function MethodChip({ method }: { method: string }) {
  return (
    <span className="inline-flex items-center rounded-well bg-info-tint px-2.5 py-1 text-micro font-semibold tracking-[0.3px] text-info">
      {method}
    </span>
  );
}

/* ----------------------------------------------------------------------------
   Controls
---------------------------------------------------------------------------- */

/**
 * A white pill button.
 *
 * Every one of these is UNWIRED, and deliberately a `<button>` rather than a
 * link to nowhere: Save Test, History, Export, Copy and Send have no endpoint
 * behind them yet. A control that is visibly present but does nothing when
 * pressed is honest; a link that 404s is not. Wiring one means adding
 * `onClick`, not rebuilding it.
 */
export function PillButton({
  children,
  className,
  ...rest
}: React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill border border-hairline bg-page px-3 text-micro text-pine transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-page",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A `panel`-filled well the playground's toolbar groups sit in. */
export function Segmented({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-page p-0.5">
      {children}
    </div>
  );
}

/** One option inside a `Segmented` (wired when given `onClick`, e.g. the Logs filter). */
export function SegmentedOption({ active, children, onClick }: { active: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-pill px-3 py-1 text-micro whitespace-nowrap transition-colors",
        active ? "bg-pine font-medium text-lime" : "text-slate hover:text-pine",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A tab the frames name but never draw.
 *
 * Says so, rather than filling the panel with a plausible logs table. Leftover
 * or invented UI was the stated reason the console was purged in the first
 * place; a screen nobody designed is the same debt arriving by a different door.
 */
export function Undesigned({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-shell border border-dashed border-edge bg-page px-6 py-16 text-center">
      <p className="m-0 text-section font-medium text-pine">{title}</p>
      <p className="m-0 max-w-[62ch] text-body text-slate">{body}</p>
    </div>
  );
}
