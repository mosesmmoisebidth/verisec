"use client";

import { useRef } from "react";
import { X } from "lucide-react";

import { SpecimenDocument } from "@/components/verify/specimen-document";
import type { Specimen } from "@/lib/verify/types";

/**
 * "View Samples" — Figma Desktop-37.
 *
 * An 821px dialog whose body is one large document preview, a Close button
 * bottom-right and an X top-right. The only stateful thing in the whole
 * applicant flow, so the only client component in it.
 *
 * A real <dialog> driven by `showModal()`, so focus trapping, Escape, inertness
 * of the page behind and the top layer are the platform's job rather than a
 * hand-rolled overlay that gets them subtly wrong.
 *
 * What fills the preview is a drawn specimen, not the frame's placeholder scan
 * of an unrelated third-party PDF — see the header of `specimen-document.tsx`.
 */
export function SampleDialog({
  trigger,
  title,
  close,
  specimen,
}: {
  trigger: string;
  title: string;
  close: string;
  specimen: Specimen;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="self-start text-body text-pine underline underline-offset-4 transition-colors hover:text-pine/70"
      >
        {trigger}
      </button>

      <dialog
        ref={ref}
        aria-labelledby="sample-dialog-title"
        className="m-auto w-[min(821px,calc(100vw-2rem))] rounded-[20px] border border-divider bg-white p-0 text-pine shadow-[0_4px_6px_-4px_rgb(0_0_0/0.1),0_10px_15px_-3px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
      >
        <div className="flex max-h-[min(707px,88dvh)] flex-col gap-4 p-6">
          <header className="flex items-start justify-between gap-4">
            <h2 id="sample-dialog-title" className="m-0 text-[18px] leading-6 font-medium text-pine">
              {title}
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

          {/* The frame's 771×554 preview panel. Scrolls on its own so a long
              document never pushes the Close button off the dialog. */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-tile border border-hairline bg-panel p-3">
            <div className="mx-auto max-w-[560px]">
              <SpecimenDocument specimen={specimen} />
            </div>
          </div>

          <footer className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="inline-flex h-9 items-center justify-center rounded-pill border border-hairline bg-white px-4 text-body text-pine transition-colors hover:bg-hover-light"
            >
              {close}
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
