"use client";

import { useEffect, type ReactNode } from "react";

import { withNext } from "@/lib/auth-landing";
import { useCurrentAccount } from "@/lib/console/use-current-account";

/**
 * Pages that need an account no matter how the portal-wide gate is set (the API Playground runs
 * real calls). A signed-out visitor never sees the page: they go straight to sign-in and come back
 * here afterwards. While the session is being checked, only a short wait message shows.
 */
export function SignInRequired({ children }: { children: ReactNode }) {
  const { status } = useCurrentAccount();

  useEffect(() => {
    if (status !== "anon") return;
    window.location.replace(withNext("/login/", window.location.pathname + window.location.search));
  }, [status]);

  if (status === "authed") return <>{children}</>;
  return (
    <div role="status" className="fixed inset-0 grid place-items-center bg-page text-sm text-quiet">
      {status === "anon" ? "Taking you to sign in…" : "Please wait…"}
    </div>
  );
}
