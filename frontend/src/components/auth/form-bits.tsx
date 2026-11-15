"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** An inline error banner above an auth form. Renders nothing when empty. */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="m-0 rounded-box border border-[#eabfbf] bg-[#fdeeee] px-3.5 py-2.5 text-body text-[#b3261e]"
    >
      {children}
    </p>
  );
}

/** A small success/notice banner (e.g. "code sent"). */
export function FormNotice({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="status"
      className="m-0 rounded-box border border-lime/50 bg-lime/12 px-3.5 py-2.5 text-body text-pine"
    >
      {children}
    </p>
  );
}

/** The lime primary submit button — a spinning loader while pending. */
export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-1 inline-flex h-13 w-full items-center justify-center gap-2 rounded-pill bg-lime text-field font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <Loader2 aria-hidden className="size-5 animate-spin" strokeWidth={2.2} />
      ) : (
        children
      )}
    </button>
  );
}

/** Read a query-string value on the client (static-export safe — no Suspense). */
export function readQuery(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

/** A pragmatic email check — enough to catch empty/typo'd inputs before submit. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Navigate after an auth action. We use a hard navigation, not `router.push`,
 * because this is a static export (`output: "export"`): there are no RSC
 * payloads to soft-navigate to (router.push would 404 the `__PAGE__.txt`
 * prefetch), and a full load re-runs the page against the fresh session cookie.
 */
export function goTo(path: string): void {
  if (typeof window !== "undefined") window.location.assign(path);
}
