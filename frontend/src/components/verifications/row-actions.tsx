"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Ban, Eye, Loader2, MoreHorizontal, PlayCircle, Send, StepForward, Trash2, X } from "lucide-react";

import { ContinueDialog, type ContinueMode } from "@/components/verifications/continue-dialog";
import { toast } from "@/components/ui/toast";
import { useAccess } from "@/lib/access";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

/** The list reloads when a row's action changed a verification. */
export const VERIFICATIONS_CHANGED = "verisec:verifications-changed";

type Action = "disable" | "enable" | "delete";

const CONFIRM: Record<Action, { title: string; body: string; cta: string; done: string; danger: boolean }> = {
  disable: {
    title: "Disable this verification?",
    body: "Its link stops working at once. Anyone who opens it, or is part-way through it, is told the verification was disabled. You can enable it again later.",
    cta: "Disable verification",
    done: "Verification disabled",
    danger: false,
  },
  enable: {
    title: "Enable this verification again?",
    body: "Its link works again for the applicant, on the device that opened it first, inside its original time window.",
    cta: "Enable verification",
    done: "Verification enabled",
    danger: false,
  },
  delete: {
    title: "Delete this verification?",
    body: "Its personal data and files are destroyed for good and it leaves your list. Credits still held for it come back. This cannot be undone.",
    cta: "Delete verification",
    done: "Verification deleted",
    danger: true,
  },
};

/**
 * The per-row ⋯ menu on the verifications table: View, Continue and Send by email (unfinished ones), Disable (Enable
 * once disabled) and Delete.
 *
 * The menu is rendered through a portal to `document.body` and positioned with the trigger's rect,
 * because the table sits inside `overflow-hidden` / `overflow-x-auto` containers that would
 * otherwise clip a normal absolutely-positioned dropdown. Same frosted-glass look as the Settings
 * actions menu.
 *
 * Disable stops an unfinished verification: its link, and any session already open on it, refuse
 * the applicant with "disabled" from then on. Delete destroys the record (Owner and Admin only).
 * Each asks first, and the list reloads once the console confirms.
 */
export function RowActions({ id, status, viewHref, label }: { id?: string; status?: string; viewHref: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [asking, setAsking] = useState<Action | null>(null);
  const [continuing, setContinuing] = useState<ContinueMode | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const access = useAccess();
  // the live list passes the record's id and status; the demo table has neither, so it only offers View
  const live = !!id && !!status;
  const mayRun = live && access.can("run");
  const mayDelete = live && access.can("settings.manage");

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 196) });
    };
    place();
    const close = () => setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Any scroll (the table's or the console main's) dismisses it rather than
    // letting the fixed menu drift away from its row.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex items-center gap-1.5 rounded-[6px] bg-[rgba(14,50,40,0.05)] py-1.5 pr-1.5 pl-2 text-left text-[13px] text-pine transition-colors hover:bg-[rgba(14,50,40,0.1)]";

  const ask = (a: Action) => {
    setOpen(false);
    setAsking(a);
  };

  const run = async (a: Action): Promise<boolean> => {
    const path = a === "delete" ? `/api/verifications/${encodeURIComponent(id!)}` : `/api/verifications/${encodeURIComponent(id!)}/${a}`;
    try {
      const r = await fetch(`${API}${path}`, { method: a === "delete" ? "DELETE" : "POST", credentials: "include" });
      const j = (await r.json().catch(() => null)) as { message?: string } | null;
      if (!r.ok) {
        toast.error(`Couldn't ${a} this verification`, typeof j?.message === "string" ? j.message : "Please try again.");
        return false;
      }
      toast.success(CONFIRM[a].done, label);
      window.dispatchEvent(new Event(VERIFICATIONS_CHANGED));
      return true;
    } catch {
      toast.error(`Couldn't ${a} this verification`, "The console is unreachable. Check your connection and try again.");
      return false;
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-full text-pine/55 transition-colors hover:bg-pine/8 hover:text-pine"
      >
        <MoreHorizontal aria-hidden className="size-4" strokeWidth={2} />
        <span className="sr-only">Actions for {label}</span>
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-[60] flex w-48 flex-col gap-[9px] rounded-[14px] border border-hairline bg-white/90 px-2.5 py-[11px] text-left shadow-[0_10px_24px_-8px_rgb(14_50_40/0.18)] backdrop-blur-[27px]"
            >
              <p className="m-0 text-[15px] font-medium tracking-[-0.17px] text-pine">Actions</p>
              <div aria-hidden className="h-px w-full bg-[rgba(14,50,40,0.1)]" />
              <Link href={viewHref} role="menuitem" className={item} onClick={() => setOpen(false)}>
                <Eye aria-hidden className="size-4" strokeWidth={1.7} />
                View
              </Link>
              {mayRun && status === "in_progress" ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={item}
                    onClick={() => {
                      setOpen(false);
                      setContinuing("continue");
                    }}
                  >
                    <StepForward aria-hidden className="size-4" strokeWidth={1.7} />
                    Continue verification
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={item}
                    onClick={() => {
                      setOpen(false);
                      setContinuing("send");
                    }}
                  >
                    <Send aria-hidden className="size-4" strokeWidth={1.7} />
                    Send by email
                  </button>
                </>
              ) : null}
              {mayRun && status === "in_progress" ? (
                <button type="button" role="menuitem" className={item} onClick={() => ask("disable")}>
                  <Ban aria-hidden className="size-4" strokeWidth={1.7} />
                  Disable
                </button>
              ) : null}
              {mayRun && status === "disabled" ? (
                <button type="button" role="menuitem" className={item} onClick={() => ask("enable")}>
                  <PlayCircle aria-hidden className="size-4" strokeWidth={1.7} />
                  Enable again
                </button>
              ) : null}
              {mayDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  className={cn(item, "bg-danger-tint text-danger hover:bg-danger/15")}
                  onClick={() => ask("delete")}
                >
                  <Trash2 aria-hidden className="size-4" strokeWidth={1.7} />
                  Delete
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {asking ? <Confirm action={asking} label={label} onClose={() => setAsking(null)} onConfirm={() => run(asking)} /> : null}
      {continuing && id ? (
        <ContinueDialog
          id={id}
          label={label}
          mode={continuing}
          onClose={() => {
            setContinuing(null);
            // the verification's timeline gained an entry
            window.dispatchEvent(new Event(VERIFICATIONS_CHANGED));
          }}
        />
      ) : null}
    </>
  );
}

function Confirm({ action, label, onClose, onConfirm }: { action: Action; label: string; onClose: () => void; onConfirm: () => Promise<boolean> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const c = CONFIRM[action];
  const mount = (node: HTMLDialogElement | null) => {
    ref.current = node;
    if (node && !node.open) node.showModal();
  };
  const go = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) ref.current?.close();
  };
  return createPortal(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={mount}
      aria-labelledby="row-confirm-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-[20px] border border-edge bg-white p-0 text-pine shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
    >
      <div className="flex flex-col gap-4 p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 id="row-confirm-title" className="m-0 text-h2 font-medium tracking-[-0.3px] text-pine">
            {c.title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Cancel"
            className="-m-1 grid size-7 shrink-0 place-items-center rounded-pill text-pine transition-colors hover:bg-pine/8"
          >
            <X aria-hidden className="size-4.5" strokeWidth={1.6} />
          </button>
        </header>
        <p className="m-0 text-body text-pine/82">
          <span className="font-medium text-pine">{label}</span>. {c.body}
        </p>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="inline-flex h-10 items-center rounded-pill border border-hairline px-4 text-body text-pine transition-colors hover:bg-hover-panel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-pill px-4 text-body font-medium transition-[filter] hover:brightness-95 disabled:opacity-70",
              c.danger ? "bg-danger text-white" : "bg-lime text-pine",
            )}
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            {c.cta}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

/**
 * Delete several verifications at once (the list's batch action): the same confirmation as one row's Delete, then one
 * request; the list reloads. Resolves true when the console deleted them.
 */
export function BatchDeleteDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const n = ids.length;
  const mount = (node: HTMLDialogElement | null) => {
    ref.current = node;
    if (node && !node.open) node.showModal();
  };
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/verifications/delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = (await r.json().catch(() => null)) as { deleted?: number; skipped?: string[]; message?: string } | null;
      if (!r.ok) throw new Error(typeof j?.message === "string" ? j.message : "");
      const done = j?.deleted ?? 0;
      const skipped = j?.skipped?.length ?? 0;
      toast.success(
        `${done} verification${done === 1 ? "" : "s"} deleted`,
        skipped ? `${skipped} could not be deleted (already gone, or not yours).` : "Their personal data and files are destroyed, and held credits came back.",
      );
      window.dispatchEvent(new Event(VERIFICATIONS_CHANGED));
      onDone();
      ref.current?.close();
    } catch (e) {
      toast.error("Couldn't delete the verifications", (e as Error).message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={mount}
      aria-labelledby="batch-confirm-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-[20px] border border-edge bg-white p-0 text-pine shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
    >
      <div className="flex flex-col gap-4 p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 id="batch-confirm-title" className="m-0 text-h2 font-medium tracking-[-0.3px] text-pine">
            Delete {n} verification{n === 1 ? "" : "s"}?
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Cancel"
            className="-m-1 grid size-7 shrink-0 place-items-center rounded-pill text-pine transition-colors hover:bg-pine/8"
          >
            <X aria-hidden className="size-4.5" strokeWidth={1.6} />
          </button>
        </header>
        <p className="m-0 text-body text-pine/82">
          Their personal data and files are destroyed for good and they leave your list. Credits still held for them come back.
          This cannot be undone.
        </p>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="inline-flex h-10 items-center rounded-pill border border-hairline px-4 text-body text-pine transition-colors hover:bg-hover-panel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-pill bg-danger px-4 text-body font-medium text-white transition-[filter] hover:brightness-95 disabled:opacity-70"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Trash2 aria-hidden className="size-4" strokeWidth={1.9} />}
            Delete {n} verification{n === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
