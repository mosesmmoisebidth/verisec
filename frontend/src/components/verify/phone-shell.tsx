"use client";

import type { ReactNode } from "react";

import type { FooterNav } from "@/components/verify/flow-shell";
import { LinkGate } from "@/components/verify/link-gate";
import { TenantInitials, TenantText } from "@/components/verify/tenant";
import type { ScreenContext } from "@/lib/verify/types";

/**
 * The page around a face step done on the applicant's phone (lib/verify/handoff.ts): the organisation, the heading
 * and the step. No step rail, no Back, Continue or Save & exit: the verification goes on on the computer. It takes
 * the same props as FlowShell, so a step renders in either.
 */
export function PhoneShell({ ctx, children, asideSlot }: { ctx: ScreenContext; children: ReactNode; nav?: FooterNav; asideSlot?: ReactNode; wide?: boolean }) {
  return (
    <div className="vs-ground relative min-h-screen">
      <LinkGate />
      <div className="vs-backdrop" aria-hidden />
      <div className="relative z-10 flex min-h-screen flex-col items-center px-3 py-4 sm:justify-center sm:px-4 sm:py-8">
        <main className="flex w-full max-w-[560px] flex-col gap-4 rounded-[22px] bg-white p-5 shadow-flow sm:rounded-[24px] sm:p-7">
          <header className="flex items-center gap-2.5">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-pill bg-lime text-body font-medium text-pine">
              <TenantInitials />
            </span>
            <span className="text-body font-medium text-pine">
              <TenantText text={ctx.brand.tenant} />
            </span>
          </header>
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-display-sm text-pine">{ctx.title}</h1>
            {ctx.screen.intro ? (
              <p className="m-0 text-body text-quiet">
                <TenantText text={ctx.screen.intro} />
              </p>
            ) : null}
          </div>
          <hr className="m-0 border-0 border-t border-divider" />
          {children}
          {asideSlot}
        </main>
      </div>
    </div>
  );
}
