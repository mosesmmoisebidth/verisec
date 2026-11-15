"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import { dropSession, resumable } from "@/lib/verify/dpop";
import { clearFlow } from "@/lib/verify/flow-store";

/** "14 Oct, 09:12" in the applicant's own time. */
function short(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * The tenant bar's "Save & exit" (Frame 81): the button keeps the frame's look; it now does what
 * it says. Everything finished is already on the verification record, so saving needs no call.
 * "Save and close" also wipes this tab's working copy (photos and answers held in the tab) so
 * nothing is left on a shared screen; coming back on this device continues where they stopped.
 */
export function SaveExit({ label }: { label: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  const open = () => {
    setUntil(short(resumable()?.resumeUntil));
    setClosed(false);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();
  const saveAndClose = () => {
    clearFlow();
    dropSession();
    setClosed(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-lime px-3 text-eyebrow text-pine transition-[filter,transform] hover:brightness-95 active:scale-[0.97]"
      >
        <Save aria-hidden className="size-3.5" strokeWidth={1.8} />
        {label}
      </button>

      <dialog
        ref={ref}
        aria-labelledby="save-exit-title"
        onCancel={(e) => {
          // once the tab's copy is wiped there is nothing to go back to here
          if (closed) e.preventDefault();
        }}
        className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-[20px] border border-divider bg-white p-0 text-pine shadow-[0_4px_6px_-4px_rgb(0_0_0/0.1),0_10px_15px_-3px_rgb(0_0_0/0.1)] backdrop:bg-pine/18 backdrop:backdrop-blur-[7.6px]"
      >
        <div className="flex flex-col gap-5 p-[25px]">
          {closed ? (
            <>
              <header className="flex flex-col gap-1.5">
                <h2 id="save-exit-title" className="m-0 text-[20px] leading-7 font-medium text-pine">
                  You can close this tab now
                </h2>
                <p className="m-0 text-body text-quiet">
                  Your verification is saved. Open your verification link again on this device to continue
                  {until ? `, any time until ${until}` : ""}.
                </p>
              </header>
              <footer className="flex justify-end border-t border-divider pt-4">
                <button
                  type="button"
                  onClick={() => {
                    close();
                    router.push("/verify/start");
                  }}
                  className="inline-flex h-10 items-center rounded-pill border border-divider px-5 text-body font-medium text-pine transition-colors hover:bg-hover-light"
                >
                  Continue now
                </button>
              </footer>
            </>
          ) : (
            <>
              <header className="flex flex-col gap-1.5">
                <h2 id="save-exit-title" className="m-0 text-[20px] leading-7 font-medium text-pine">
                  Your progress is saved
                </h2>
                <p className="m-0 text-body text-quiet">
                  Everything you have finished so far is kept. To come back, open your verification link again on
                  this device and you&apos;ll continue where you stopped.
                </p>
                {until ? <p className="m-0 text-body text-pine">You can come back until {until}.</p> : null}
              </header>
              <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-divider pt-4">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-10 items-center rounded-pill border border-divider px-5 text-body font-medium text-pine transition-colors hover:bg-hover-light"
                >
                  Keep going
                </button>
                <button
                  type="button"
                  onClick={saveAndClose}
                  className="inline-flex h-10 items-center rounded-pill bg-pine px-5 text-body font-medium text-white transition-[background-color,transform] hover:bg-pine/90 active:scale-[0.97]"
                >
                  Save and close
                </button>
              </footer>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
