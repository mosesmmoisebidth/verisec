"use client";

import Link from "next/link";
import { Check, ChevronDown, Landmark, ScanLine, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

/**
 * The pill beside the org name, now a real portal switcher. One VeriSec account
 * can use every portal it is entitled to; this just navigates between them
 * (same sign-in, no new account). The portal you are in is shown on the pill and
 * ticked in the menu. ALPR is listed but not yet open.
 */
export type PortalId = "kyc" | "fin";

type Portal = {
  id: PortalId | "alpr";
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  soon?: boolean;
};

const PORTALS: Portal[] = [
  { id: "kyc", label: "KYC", href: "/dashboard", icon: ShieldCheck },
  { id: "fin", label: "Financial", href: "/fin", icon: Landmark },
  { id: "alpr", label: "ALPR", href: "#", icon: ScanLine, soon: true },
];

export function PortalSwitcher({ current }: { current: PortalId }) {
  const active = PORTALS.find((p) => p.id === current) ?? PORTALS[0]!;
  const ActiveIcon = active.icon;

  return (
    <details className="group/portal relative shrink-0">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-pill bg-pine py-1 pr-2 pl-2.5 text-micro font-medium text-lime transition-[filter] hover:brightness-110 [&::-webkit-details-marker]:hidden">
        <ActiveIcon aria-hidden className="size-3.5" strokeWidth={1.8} />
        {active.label}
        <ChevronDown aria-hidden className="size-3.5 transition-transform group-open/portal:rotate-180" strokeWidth={2} />
        <span className="sr-only">Switch portal</span>
      </summary>

      <div className="absolute left-0 z-30 mt-2 w-56 rounded-card border border-hairline bg-page p-2 shadow-lg">
        <p className="m-0 px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-[0.4px] text-muted uppercase">Switch portal</p>
        {PORTALS.map((p) => {
          const Icon = p.icon;
          const isActive = p.id === current;
          if (p.soon) {
            return (
              <span
                key={p.id}
                aria-disabled
                className="flex items-center gap-2 rounded-well px-2 py-2 text-body text-slate"
              >
                <Icon aria-hidden className="size-4" strokeWidth={1.7} />
                <span className="flex-1">{p.label}</span>
                <span className="rounded-pill border border-hairline bg-white px-2 py-0.5 text-[11px] font-medium text-pine/70">
                  Coming soon
                </span>
              </span>
            );
          }
          return (
            <Link
              key={p.id}
              href={p.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-well px-2 py-2 text-body text-pine transition-colors hover:bg-hover-light",
                isActive && "bg-hover-light/70",
              )}
            >
              <Icon aria-hidden className="size-4" strokeWidth={1.7} />
              <span className="flex-1">{p.label}</span>
              {isActive ? <Check aria-hidden className="size-4 text-positive" strokeWidth={2} /> : null}
            </Link>
          );
        })}
      </div>
    </details>
  );
}
