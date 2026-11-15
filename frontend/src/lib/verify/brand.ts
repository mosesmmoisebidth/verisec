"use client";

/**
 * Who is asking the applicant to verify, and how it is shown: the organisation's branding — the name,
 * an optional logo, and the URL to return to when finished (VeriSec itself for a demo session no
 * organisation opened).
 *
 * Asked once per session and kept for the tab, tied to the session's token so a newly opened link
 * never shows the previous organisation. Read through `useSyncExternalStore`, so the static HTML
 * renders a neutral placeholder and the brand appears as soon as it is known.
 */
import { useEffect, useSyncExternalStore } from "react";

import { kycApi } from "./kyc-api";

export type TenantBrand = { name: string; logoUrl: string | null; returnUrl: string | null };

const KEY = "verisec.kyc.brand";
const TOKEN_KEY = "verisec.kyc.session"; // the session token dpop.ts keeps for this tab

/** The token's tail identifies the session the cached brand belongs to (never the whole token). */
export function sessionTag(): string | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null") as { accessToken?: string } | null;
    return s?.accessToken ? s.accessToken.slice(-16) : null;
  } catch {
    return null;
  }
}

let current: TenantBrand | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function read(): TenantBrand | null {
  if (current) return current;
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { tag?: string; brand?: TenantBrand } | null;
    const tag = sessionTag();
    if (c?.brand?.name && tag && c.tag === tag) current = c.brand;
  } catch {}
  return current;
}

function publish(brand: TenantBrand) {
  current = brand;
  try {
    const tag = sessionTag();
    if (tag) sessionStorage.setItem(KEY, JSON.stringify({ tag, brand }));
  } catch {}
  for (const l of listeners) l();
}

function load() {
  if (read() || pending) return;
  pending = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await kycApi.brand();
      if (r.ok && r.data.name)
        return publish({ name: r.data.name, logoUrl: r.data.logoUrl ?? null, returnUrl: r.data.returnUrl ?? null });
      await new Promise((ok) => setTimeout(ok, 2_500));
    }
    // the session could not be reached: VeriSec runs the check, so it is never wrong to say so
    publish({ name: "VeriSec", logoUrl: null, returnUrl: null });
  })().finally(() => {
    pending = null;
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The organisation's full branding, or null until it is known (render a placeholder meanwhile). */
export function useTenantBrand(): TenantBrand | null {
  const brand = useSyncExternalStore(subscribe, read, () => null);
  useEffect(() => {
    load();
  }, []);
  return brand;
}

/** The organisation's name, or null until known. */
export function useTenantName(): string | null {
  return useTenantBrand()?.name ?? null;
}

/** Two letters for the avatar: the first two words' initials, or a single word's capitals. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const word = words[0] ?? "";
  const caps = word.replace(/[^A-Z]/g, "");
  return (caps.length >= 2 ? caps.slice(0, 2) : word.slice(0, 2)).toUpperCase();
}
