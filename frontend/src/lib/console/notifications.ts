"use client";

import { useEffect, useSyncExternalStore } from "react";

import { toast } from "@/components/ui/toast";
import { sinceLabel } from "@/lib/console/team-api";
import type { NotificationItem, NotificationTone } from "@/lib/console/types";
import { useCurrentAccount } from "@/lib/console/use-current-account";

/**
 * The bell, live: the signed-in person's notifications from the console (their own, and the team's their role may
 * see). Few and stacked by the console: the same sentence is one notification with a count. One store per page, so
 * every bell (KYC console, Financial portal) shares one request every 45 seconds, plus one when the tab comes back.
 * A notification that arrives while the page is open also shows as a toast, once; nothing older ever does.
 */

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

type Live = { id: string; kind: string; tone: NotificationTone; title: string; body: string; href: string | null; count: number; at: string; unread: boolean };
type State = { loaded: boolean; items: Live[]; unread: number };

let state: State = { loaded: false, items: [], unread: 0 };
const listeners = new Set<() => void>();
const seen = new Map<string, string>();
let started = false;

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

// a little longer than an action's toast: these arrive unannounced
const SHOW_MS = 8000;
const TOAST: Record<NotificationTone, (title: string, body?: string) => void> = {
  danger: (t, b) => toast.error(t, b, SHOW_MS),
  warning: (t, b) => toast.warning(t, b, SHOW_MS),
  success: (t, b) => toast.success(t, b, SHOW_MS),
  info: (t, b) => toast.info(t, b, SHOW_MS),
};

async function refresh() {
  try {
    const r = await fetch(`${API}/api/notifications`, { credentials: "include", cache: "no-store" });
    if (!r.ok) return;
    const data = (await r.json()) as { unread: number; items: Live[] };
    const first = !state.loaded;
    let shown = 0;
    for (const n of data.items) {
      // new since the page opened (or stacked again): a toast once, never for what was already there
      if (!first && n.unread && seen.get(n.id) !== n.at && shown < 3) {
        TOAST[n.tone]?.(n.count > 1 ? `${n.title} (×${n.count})` : n.title, n.body);
        shown++;
      }
      seen.set(n.id, n.at);
    }
    set({ loaded: true, items: data.items, unread: data.unread });
  } catch {
    /* offline for a moment: the next round tries again */
  }
}

function start() {
  if (started) return;
  started = true;
  void refresh();
  window.setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, 45_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh();
  });
}

const post = (path: string) =>
  fetch(`${API}/api/notifications${path}`, { method: "POST", credentials: "include", keepalive: true }).catch(() => undefined);

export type BellItem = NotificationItem & { count: number };

export function useNotifications() {
  const { status } = useCurrentAccount();
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  useEffect(() => {
    if (status === "authed") start();
  }, [status]);

  const items: BellItem[] = s.items.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    time: sinceLabel(n.at) ?? "",
    unread: n.unread,
    href: n.href ?? undefined,
    tone: n.tone,
    count: n.count,
  }));
  return {
    /** Signed in and loaded: show these, not the frame's sample. */
    live: status === "authed" && s.loaded,
    items,
    unread: s.unread,
    markAllRead() {
      set({ ...state, unread: 0, items: state.items.map((n) => ({ ...n, unread: false })) });
      void post("/read");
    },
    markRead(id: string) {
      const was = state.items.find((n) => n.id === id)?.unread;
      set({ ...state, unread: Math.max(0, state.unread - (was ? 1 : 0)), items: state.items.map((n) => (n.id === id ? { ...n, unread: false } : n)) });
      void post(`/${encodeURIComponent(id)}/read`);
    },
  };
}
