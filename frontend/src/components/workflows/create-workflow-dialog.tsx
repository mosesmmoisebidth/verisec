"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, X } from "lucide-react";

import { WorkflowGlyph } from "@/components/workflows/workflow-glyph";

/**
 * "Create custom workflow": the name comes first (it is what the team sees in the workflow list
 * and when they start a verification), then the editor opens on the new draft with the ID document
 * as its first check.
 */
export function CreateWorkflowDialog({
  creating,
  onCreate,
  onClose,
}: {
  creating: boolean;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const trimmed = name.trim();

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    input.current?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="create-workflow-title"
      className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-[24px] border border-edge bg-white p-0 shadow-[0_24px_48px_-16px_rgba(14,50,40,0.35)] backdrop:bg-black/25 backdrop:backdrop-blur-[6px]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !creating) onCreate(trimmed);
        }}
        className="flex flex-col gap-5 p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <span className="flex items-center gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-pill bg-pine text-lime">
              <WorkflowGlyph className="size-5" />
            </span>
            <span className="flex flex-col gap-0.5">
              <h2 id="create-workflow-title" className="m-0 text-[20px] font-medium tracking-[-0.3px] text-pine">
                Create custom workflow
              </h2>
              <span className="text-micro text-muted">Name it, then choose its checks and rules in the editor.</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-pill text-pine transition-colors hover:bg-hover-panel"
          >
            <X aria-hidden className="size-4" />
          </button>
        </header>

        <label className="flex flex-col gap-1.5">
          <span className="text-micro font-medium text-pine">Workflow name</span>
          <input
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            placeholder="For example: Customer onboarding"
            className="h-11 w-full rounded-[12px] border border-hairline bg-white px-3.5 text-body text-pine outline-none placeholder:text-placeholder focus:border-pine/30 focus:ring-2 focus:ring-lime/40"
          />
          <span className="text-[11px] text-muted">Your team sees this name in the workflow list and when starting a verification.</span>
        </label>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="inline-flex h-10 items-center rounded-pill border border-hairline bg-white px-4 text-body font-medium text-pine transition-colors hover:bg-hover-panel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!trimmed || creating}
            className="inline-flex h-10 items-center gap-2 rounded-pill bg-lime px-5 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ArrowRight aria-hidden className="size-4" />}
            Create workflow
          </button>
        </footer>
      </form>
    </dialog>
  );
}
