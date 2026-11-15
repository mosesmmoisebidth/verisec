"use client";

import { useEffect } from "react";

import { useAccess } from "@/lib/access";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import { finApi } from "@/lib/finance/api";

/**
 * Wakes the cheque deep-read model as soon as someone enters the Financial
 * Portal. The model sleeps when unused (no cost) and takes several seconds to
 * wake, so starting it here, before the user has reached the playground and
 * picked a cheque, means their first deep read lands on a ready model. It goes
 * back to sleep on its own ~90s after the last ping or read. Mounted once in the
 * portal shell; renders nothing. Signed in, only for a role that may run reads: the
 * others (Billing, Viewer) can never start a read, so waking the engines for them
 * would only cost. Signed out (a local setup without the sign-in gate) it always warms.
 */
/** May this page wake the engines? Signed out: yes. Signed in: once the role is known, if it may run reads. */
export function useWarmAllowed(): boolean {
  const { status } = useCurrentAccount();
  const { can } = useAccess();
  return status === "anon" || (status === "authed" && can("run"));
}

export function DeepReadWarmup() {
  const warm = useWarmAllowed();
  useEffect(() => {
    if (warm) void finApi.warmChequeDeep();
  }, [warm]);

  return null;
}
