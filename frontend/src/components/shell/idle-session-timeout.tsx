"use client";

import { useEffect } from "react";

import { authApi } from "@/lib/auth-api";
import { accountApi } from "@/lib/console/account-api";
import { useCurrentAccount } from "@/lib/console/use-current-account";

/** Enforce the configured idle limit in every open portal tab; the API independently enforces it too. */
export function IdleSessionTimeout() {
  const { status, account } = useCurrentAccount();

  useEffect(() => {
    if (status !== "authed" || !account?.userId) return;

    let timeoutMs = 0;
    let lastActivity = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSavedActivity = 0;
    let expiring = false;
    let active = true;
    const activityKey = `verisec:activity:${account.userId}`;
    const refreshEvent = `verisec:security-updated:${account.userId}`;
    const updateTimer = () => {
      if (timer) clearTimeout(timer);
      if (!timeoutMs || expiring) return;
      const remaining = lastActivity + timeoutMs - Date.now();
      if (remaining <= 0) {
        void expire();
        return;
      }
      timer = setTimeout(() => void expire(), remaining);
    };
    const expire = async () => {
      if (expiring) return;
      expiring = true;
      await authApi.logout().catch(() => undefined);
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login/?error=idle&next=${encodeURIComponent(next)}`);
    };
    const markActivity = () => {
      if (!timeoutMs || expiring) return;
      const now = Date.now();
      if (now - lastActivity < 1_000) return;
      lastActivity = now;
      updateTimer();
      if (now - lastSavedActivity > 2_000) {
        lastSavedActivity = now;
        try {
          localStorage.setItem(activityKey, String(now));
        } catch {
          // The current tab's timer still works when storage is unavailable.
        }
      }
    };
    const refreshPolicy = async () => {
      try {
        const settings = await accountApi.security();
        if (!active) return;
        timeoutMs = settings.sessionTimeoutHours == null ? 0 : settings.sessionTimeoutHours * 60 * 60_000;
        // Loading the current policy is an authenticated request and starts the local timer from now.
        lastActivity = Date.now();
        updateTimer();
      } catch {
        // The server remains authoritative and will reject a request if it cannot validate the policy.
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === activityKey && event.newValue) {
        const timestamp = Number(event.newValue);
        if (Number.isFinite(timestamp) && timestamp > lastActivity) {
          lastActivity = timestamp;
          updateTimer();
        }
      } else if (event.key === refreshEvent) {
        void refreshPolicy();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") updateTimer();
    };
    const onRefresh = () => void refreshPolicy();

    const activityEvents: (keyof WindowEventMap)[] = ["pointerdown", "pointermove", "keydown", "touchstart", "scroll"];
    for (const eventName of activityEvents) window.addEventListener(eventName, markActivity, { passive: true });
    window.addEventListener("storage", onStorage);
    window.addEventListener(refreshEvent, onRefresh);
    document.addEventListener("visibilitychange", onVisible);
    void refreshPolicy();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      for (const eventName of activityEvents) window.removeEventListener(eventName, markActivity);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(refreshEvent, onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, account?.userId]);

  return null;
}
