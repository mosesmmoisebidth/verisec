"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, CircleX, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * VeriSec toasts — top-right, colour-coded by severity, with a countdown bar.
 *
 * A tiny module-level store so ANY client code can fire one without threading a
 * context: `toast.success("Signed in")`, `toast.error("…", "detail")`. The
 * palette is the platform's — soft, minimal cards on pine text — one per
 * severity (success / info / warning / error). Mounted once via <Toaster/> in
 * the root layout.
 */

export type ToastSeverity = "success" | "info" | "warning" | "error";
export type ToastItem = {
  id: number;
  severity: ToastSeverity;
  title: string;
  message?: string;
  duration: number;
};

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function push(severity: ToastSeverity, title: string, message?: string, duration = 4500): number {
  const id = ++seq;
  // Newest on top; cap the stack so a burst can't fill the screen.
  items = [{ id, severity, title, message, duration }, ...items].slice(0, 5);
  emit();
  return id;
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (title: string, message?: string, duration?: number) => push("success", title, message, duration),
  info: (title: string, message?: string, duration?: number) => push("info", title, message, duration),
  warning: (title: string, message?: string, duration?: number) => push("warning", title, message, duration),
  error: (title: string, message?: string, duration?: number) => push("error", title, message, duration),
};

const FLASH_KEY = "vs_toast_flash";

/**
 * Queue a toast to appear AFTER a navigation. The auth flows hard-navigate on
 * success (static export), which would drop an in-memory toast; this stashes it
 * in sessionStorage and the Toaster fires it on the next page's mount.
 */
export function flashToast(severity: ToastSeverity, title: string, message?: string): void {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ severity, title, message }));
  } catch {
    /* private mode / storage disabled — non-fatal */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
}

/* ---- styling per severity (soft platform-tinted cards) ------------------- */

const STYLES: Record<ToastSeverity, { bg: string; border: string; icon: string; bar: string; Icon: LucideIcon }> = {
  success: { bg: "bg-[#eaf7d6]", border: "border-[#d2ea9f]", icon: "text-[#4a7c1f]", bar: "bg-[#8fce3f]", Icon: CheckCircle2 },
  info: { bg: "bg-[#dcedf8]", border: "border-[#b9dbef]", icon: "text-[#2f6f9e]", bar: "bg-[#57a6db]", Icon: Info },
  warning: { bg: "bg-[#fbedcc]", border: "border-[#f0d89a]", icon: "text-[#b07d17]", bar: "bg-[#e0a92b]", Icon: TriangleAlert },
  error: { bg: "bg-[#fadcdc]", border: "border-[#f0bcbc]", icon: "text-[#b3261e]", bar: "bg-[#e05a5a]", Icon: CircleX },
};

function ToastCard({ item }: { item: ToastItem }) {
  useEffect(() => {
    const t = setTimeout(() => dismissToast(item.id), item.duration);
    return () => clearTimeout(t);
  }, [item.id, item.duration]);

  const s = STYLES[item.severity];
  const Icon = s.Icon;

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-[14px] border px-4 py-3.5",
        "shadow-[0_10px_30px_-12px_rgba(14,50,40,0.35)] duration-300 animate-in slide-in-from-right-5 fade-in",
        s.bg,
        s.border,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", s.icon)} strokeWidth={1.9} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[15px] font-semibold tracking-[-0.2px] text-pine">{item.title}</p>
          {item.message ? <p className="m-0 mt-0.5 text-[13px] leading-snug text-pine/70">{item.message}</p> : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => dismissToast(item.id)}
          className="-m-1 grid size-6 shrink-0 place-items-center rounded-full text-pine/45 transition-colors hover:bg-black/[0.06] hover:text-pine"
        >
          <X aria-hidden className="size-4" strokeWidth={2} />
        </button>
      </div>
      <span
        aria-hidden
        className={cn("absolute bottom-0 left-0 h-[3px] w-full", s.bar)}
        style={{ transformOrigin: "left", animation: `toast-progress ${item.duration}ms linear forwards` }}
      />
    </div>
  );
}

const noopSubscribe = () => () => {};

export function Toaster() {
  const list = useToasts();

  // Fire any toast queued for after a navigation (see flashToast).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FLASH_KEY);
      if (!raw) return;
      sessionStorage.removeItem(FLASH_KEY);
      const f = JSON.parse(raw) as { severity?: ToastSeverity; title?: string; message?: string };
      if (f?.severity && f?.title) push(f.severity, f.title, f.message);
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }, []);

  // Hydration-safe client check: false on the server AND on the hydrating
  // render, true after. A `typeof document` test here rendered a portal on the
  // first client pass that the server never sent, which threw React #418 on
  // every page and made React discard the HTML and re-render the whole tree.
  const onClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!onClient) return null;
  return createPortal(
    <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[368px] max-w-[calc(100vw-2rem)] flex-col gap-2.5">
      {list.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>,
    document.body,
  );
}
