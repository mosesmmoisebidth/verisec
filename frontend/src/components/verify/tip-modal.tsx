"use client";

import { useRef } from "react";
import { ArrowRight, X } from "lucide-react";

import { usePlan, wordingFor } from "@/lib/verify/plan";

import { TenantText } from "@/components/verify/tenant";
import type { TipContent } from "@/lib/verify/types";

/**
 * An aside "learn more" link that opens its tip in a centred modal — Desktop-70
 * (Why do we need this? / Tips for a clear photo / What is an ePassport chip? /
 * Lighting & positioning tips / Why do we verify email?).
 *
 * The trigger keeps the exact look of the plain `<a>` it replaces, so a screen
 * reads the same whether its link navigates or explains. The modal is a native
 * `<dialog>` via `showModal()`, so focus-trap, Escape, page-inertness and the
 * top layer are the platform's — the same shell as SampleDialog, at the frame's
 * 821px, over a blurred backdrop.
 */
export function TipLink({ label, tip }: { label: string; tip: TipContent }) {
  const ref = useRef<HTMLDialogElement>(null);
  const isBullets = (tip.kind ?? "bullets") === "bullets";
  // worded for this verification's checks (a tip about the selfie says nothing of one it skips)
  const plan = usePlan();
  const body = wordingFor(plan, tip.body, tip.needs, tip.leaner);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="group inline-flex w-fit items-center gap-1.5 text-body font-medium text-pine underline-offset-4 transition-colors hover:underline"
      >
        {label}
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          strokeWidth={1.8}
        />
      </button>

      <dialog
        ref={ref}
        aria-labelledby="tip-title"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto w-[min(821px,calc(100vw-2rem))] rounded-[20px] border border-divider bg-white p-0 text-pine shadow-[0_4px_6px_-4px_rgb(0_0_0/0.1),0_10px_15px_-3px_rgb(0_0_0/0.1)] backdrop:bg-pine/18 backdrop:backdrop-blur-[7.6px]"
      >
        <div className="flex max-h-[88dvh] flex-col gap-5 overflow-y-auto p-[25px]">
          <header className="flex items-start justify-between gap-4 border-b border-divider pb-4">
            <h2 id="tip-title" className="m-0 text-[18px] leading-6 font-medium text-pine">
              {tip.title}
            </h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="-m-1 grid size-7 shrink-0 place-items-center rounded-pill text-pine transition-colors hover:bg-hover-light"
            >
              <X aria-hidden className="size-4" strokeWidth={1.6} />
            </button>
          </header>

          {isBullets ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {body.map((line) => (
                <li key={line} className="flex gap-2.5 text-read leading-relaxed text-pine/82">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-pill bg-pine/40" />
                  <span>
                    <TenantText text={line} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-3">
              {body.map((para) => (
                <p key={para} className="m-0 text-read leading-relaxed text-pine/82">
                  <TenantText text={para} />
                </p>
              ))}
            </div>
          )}

          <footer className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="inline-flex h-9 items-center justify-center rounded-pill border border-hairline bg-white px-4 text-body text-pine transition-colors hover:bg-hover-light"
            >
              Close
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
