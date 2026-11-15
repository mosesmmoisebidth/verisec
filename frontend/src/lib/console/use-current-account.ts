"use client";

import { useEffect, useState } from "react";

import type { Capability, Role } from "@/lib/access";
import { authApi } from "@/lib/auth-api";

/**
 * The signed-in user's identity, for the console chrome (rail, topbar, settings).
 *
 * The console is a static export whose pages ship with demo data baked in; this
 * hook fetches `/api/auth/me` on the client and hands back the REAL account so
 * the UI shows the person who signed in, not the specimen. The fetch is cached
 * at module scope and de-duplicated, so the rail, topbar and settings share one
 * request per page load.
 *
 * `status` lets callers avoid flashing the demo identity: render a neutral
 * placeholder while `loading`, the real account when `authed`, and fall back to
 * the page's demo data only when genuinely `anon` (not signed in).
 */
export type CurrentAccount = {
  userId: string;
  name: string;
  email: string;
  initials: string;
  org: string | null;
  /** Permanent Zitadel organization identifier for API and support references. */
  tenantId: string | null;
  avatar: string | null;
  /** The portal chosen at onboarding (null until the account has answered it). */
  portal: "kyc" | "fin" | null;
  /** Onboarding was already shown once (answered or not): it is never forced again. */
  onboardingSeen: boolean;
  /** The team role and the capabilities it grants (null/absent: an older console that sends none). */
  role: Role | null;
  capabilities: Capability[] | null;
};

type State = { status: "loading" | "authed" | "anon"; account: CurrentAccount | null };

let cache: State | undefined;
let inflight: Promise<State> | null = null;
const listeners = new Set<() => void>();

/**
 * Re-read `/api/auth/me` after the account changes (name, photo, org renamed) and tell every
 * mounted `useCurrentAccount` to update, so the rail, topbar and settings all refresh at once.
 */
export async function refreshCurrentAccount(): Promise<void> {
  cache = undefined;
  inflight = null;
  const next = await load().catch<State>(() => ({ status: "anon", account: null }));
  cache = next;
  for (const l of listeners) l();
}

function initialsOf(name: string, email: string): string {
  const src = (name || email || "").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase() || "•";
}

async function load(): Promise<State> {
  const me = await authApi.me();
  if (!me || !me.userId) return { status: "anon", account: null };
  const name = (me.displayName || me.loginName || "").trim();
  const email = (me.loginName || "").trim();
  return {
    status: "authed",
    account: {
      userId: me.userId,
      name,
      email,
      initials: initialsOf(name, email),
      org: me.orgName ?? null,
      tenantId: me.orgId ?? null,
      avatar: me.avatarUrl ?? null,
      portal: me.onboarding?.portal ?? null,
      onboardingSeen: !!me.onboarding || !!me.onboardingSeen,
      role: me.role ?? null,
      capabilities: Array.isArray(me.capabilities) ? (me.capabilities as Capability[]) : null,
    },
  };
}

export function useCurrentAccount(): State {
  const [state, setState] = useState<State>(cache ?? { status: "loading", account: null });

  useEffect(() => {
    let alive = true;
    // Update whenever the shared account is refreshed elsewhere (e.g. after a profile/org save).
    const onChange = () => {
      if (alive && cache) setState(cache);
    };
    listeners.add(onChange);
    if (cache) {
      setState(cache);
    } else {
      if (!inflight) {
        inflight = load()
          .catch<State>(() => ({ status: "anon", account: null }))
          .then((s) => {
            cache = s;
            return s;
          });
      }
      void inflight.then((s) => {
        if (alive) setState(s);
      });
    }
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, []);

  return state;
}
