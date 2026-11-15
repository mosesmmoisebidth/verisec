"use client";

import { useEffect } from "react";

import { withNext } from "@/lib/auth-landing";
import { useCurrentAccount } from "@/lib/console/use-current-account";

/**
 * Auth gate for the portals (KYC console, Financial, ALPR): one sign-in for all of them. It checks
 * the session (via /api/auth/me), bounces a signed-out visitor to /login, and sends an account that
 * has not answered the onboarding yet to /onboarding first.
 *
 * This gate is on for every portal so the same VeriSec session protects both
 * the Financial and KYC consoles. Set `NEXT_PUBLIC_AUTH_GATE=0` only for a
 * deliberately public local preview; production builds keep it enabled.
 */
const AUTH_GATE = process.env.NEXT_PUBLIC_AUTH_GATE !== "0";

export function RequireAuth() {
  const { status, account } = useCurrentAccount();
  useEffect(() => {
    if (!AUTH_GATE) return;
    // the page asked for comes back after sign-in (and after the one-time onboarding)
    const here = window.location.pathname + window.location.search;
    if (status === "anon") window.location.href = withNext("/login/", here);
    // onboarding is offered once, after sign-up: an account that has seen it is never sent back
    else if (status === "authed" && account && !account.portal && !account.onboardingSeen) window.location.href = withNext("/onboarding/", here);
  }, [status, account]);
  return null;
}
