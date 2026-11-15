"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CircleAlert, CreditCard, FlaskConical, Info, Receipt, RefreshCw, WifiOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CREDITS, PRODUCT_LABEL, SAMPLE_MARKER, STATUS_LABEL } from "@/lib/finance/content";
import type { FinProduct, ScanStatus } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
   Page header, the console's h1 + a caption line
---------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  marker,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  marker?: boolean;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{title}</h1>
          {marker ? <SampleMarker /> : null}
        </div>
        {subtitle ? <p className="m-0 text-micro text-crumb">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-tight">{actions}</div> : null}
    </header>
  );
}

/** "Sample data": the same caution pill the KYC API-keys screen uses. */
export function SampleMarker() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-caution-tint px-2.5 py-1 text-micro font-medium text-caution">
      <FlaskConical aria-hidden className="size-3.5" strokeWidth={1.8} />
      {SAMPLE_MARKER}
    </span>
  );
}

/** A country's flag as an image from `public/flags/` (emoji flags don't render on
 * Windows). Hidden if the file is missing. */
export function CountryFlag({ code, className }: { code: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static asset from public/flags
    <img
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=""
      aria-hidden
      width={22}
      height={16}
      className={cn("h-4 w-[22px] shrink-0 rounded-[2px] object-cover ring-1 ring-pine/10", className)}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

/* ----------------------------------------------------------------------------
   Chips
---------------------------------------------------------------------------- */

const PRODUCT_ICON: Record<FinProduct, LucideIcon> = { cheque: Receipt, card: CreditCard };

export function ProductChip({ product }: { product: FinProduct }) {
  const Icon = PRODUCT_ICON[product];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium whitespace-nowrap",
        product === "cheque" ? "bg-pine/[0.07] text-pine" : "bg-lime/35 text-pine",
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={1.8} />
      {PRODUCT_LABEL[product]}
    </span>
  );
}

const STATUS_STYLE: Record<ScanStatus, { dot: string; text: string; bg: string; glyph: string }> = {
  read: { dot: "bg-ramp-3", text: "text-ramp-2", bg: "bg-pass-tint", glyph: "✓" },
  partial: { dot: "bg-caution", text: "text-caution", bg: "bg-caution-tint", glyph: "!" },
  unreadable: { dot: "bg-danger", text: "text-danger", bg: "bg-danger-tint", glyph: "✕" },
};

/** Colour AND glyph, like the console's verdict chip. */
export function StatusChip({ status }: { status: ScanStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium whitespace-nowrap", s.bg, s.text)}>
      <span aria-hidden className={cn("grid size-3.5 place-items-center rounded-pill text-[8px] leading-none font-bold text-white", s.dot)}>
        {s.glyph}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** A neutral pill for small facts: a font, a layout, an environment. */
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill bg-well px-2.5 py-1 text-micro text-pine whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------------------
   Notices and whole-panel states
---------------------------------------------------------------------------- */

const NOTICE: Record<"info" | "warning" | "error", { icon: LucideIcon; cls: string }> = {
  info: { icon: Info, cls: "border-info/15 bg-info-tint text-info" },
  warning: { icon: AlertTriangle, cls: "border-caution/20 bg-caution-tint text-caution" },
  error: { icon: CircleAlert, cls: "border-danger/15 bg-danger-tint text-danger" },
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warning" | "error";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { icon: Icon, cls } = NOTICE[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-[14px] border px-3.5 py-3", cls)}>
      <Icon aria-hidden className="mt-px size-4 shrink-0" strokeWidth={1.9} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title ? <p className="m-0 text-body font-medium">{title}</p> : null}
        {children ? <div className="text-micro leading-snug text-pine/80">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

/** "Go to Billing", inside an out-of-credits notice. */
export function CreditsAction() {
  return (
    <a
      href={CREDITS.href}
      className="inline-flex h-8 shrink-0 items-center rounded-pill bg-pine px-3.5 text-micro font-medium whitespace-nowrap text-white transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
    >
      {CREDITS.action}
    </a>
  );
}

/** A whole-panel empty, offline or not-found state. */
export function StatePanel({
  icon: Icon = WifiOff,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-shell border border-dashed border-edge bg-page px-6 py-14 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-pill bg-well text-pine/70">
        <Icon aria-hidden className="size-5" strokeWidth={1.7} />
      </span>
      <p className="m-0 text-section font-medium text-pine">{title}</p>
      {body ? <p className="m-0 max-w-[56ch] text-body text-slate">{body}</p> : null}
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-pine/15 border-t-pine", className)}
    />
  );
}

export function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center justify-center gap-2.5 py-14 text-body text-slate", className)}>
      <Spinner />
      {label}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Buttons
---------------------------------------------------------------------------- */

export function LimeLink({ href, children, icon: Icon }: { href: string; children: ReactNode; icon?: LucideIcon }) {
  return (
    <a
      href={href}
      className="inline-flex h-[35px] items-center gap-2 rounded-pill bg-lime px-3.5 text-micro font-medium text-pine transition-[filter] hover:brightness-95"
    >
      {Icon ? <Icon aria-hidden className="size-[15px]" strokeWidth={1.9} /> : null}
      {children}
    </a>
  );
}

export function GhostButton({
  children,
  icon: Icon,
  className,
  ...rest
}: React.ComponentPropsWithoutRef<"button"> & { icon?: LucideIcon }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-[35px] items-center gap-2 rounded-pill border border-hairline bg-panel px-3 text-micro font-medium text-pine transition-colors hover:bg-hover-panel disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden className="size-[15px]" strokeWidth={1.7} /> : null}
      {children}
    </button>
  );
}

export function RetryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <GhostButton icon={RefreshCw} onClick={onClick}>
      {label}
    </GhostButton>
  );
}

/* ----------------------------------------------------------------------------
   Client-state switches
---------------------------------------------------------------------------- */

/** Pine-on-lime segmented control (product switch, font choice). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: readonly { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "md" | "lg";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-hairline bg-panel p-1">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill whitespace-nowrap transition-colors",
              size === "lg" ? "px-4 py-2 text-body" : "px-3 py-1 text-micro",
              active ? "bg-pine font-medium text-lime" : "text-slate hover:text-pine",
            )}
          >
            {Icon ? <Icon aria-hidden className="size-4" strokeWidth={1.8} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The console's tab strip (Settings / API keys look), driven by state. */
export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="w-fit max-w-full overflow-hidden rounded-[14px] bg-[#f4f4f2]">
      <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative shrink-0 px-4 py-2.5 text-[14px] whitespace-nowrap transition-colors",
                active ? "bg-[image:var(--gradient-tab)] font-semibold text-pine" : "font-normal text-[#9a9a9a] hover:text-pine",
              )}
            >
              {tab.label}
              {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-lime" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A thin 0 to 100 bar, amber below `warnBelow`. */
export function ConfidenceBar({ value, warnBelow = 80 }: { value: number; warnBelow?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-pill bg-black/[0.06]">
      <span
        className={cn("block h-full rounded-pill", v < warnBelow ? "bg-caution" : "bg-ramp-3")}
        style={{ width: `${v}%` }}
      />
    </span>
  );
}
