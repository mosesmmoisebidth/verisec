"use client";

import { ArrowRight } from "lucide-react";

import { withNext } from "@/lib/auth-landing";
import { useCurrentAccount } from "@/lib/console/use-current-account";

/**
 * Opens an available product where it lives in the platform. One sign-in covers the KYC and the
 * Financial portals, so a signed-in visitor goes straight in; a signed-out one signs in (or creates
 * an account) first and then lands on the same page.
 */
export function SolutionOpenLink({ href, label, className }: { href: string; label: string; className?: string }) {
  const { status } = useCurrentAccount();
  return (
    <a href={status === "anon" ? withNext("/login/", href) : href} className={className}>
      {label}
      <ArrowRight aria-hidden className="size-4" />
    </a>
  );
}
