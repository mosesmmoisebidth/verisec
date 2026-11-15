"use client";

import { useCurrentAccount } from "@/lib/console/use-current-account";

/**
 * What the signed-in person's team role lets them do, for BOTH portals (KYC console and Financial).
 *
 * The console decides: `/api/auth/me` returns the person's `role` and the `capabilities` it grants
 * (backend `auth/roles.ts`), and every route refuses what the role does not allow. The screens only
 * hide what cannot be used, so nothing here is a security boundary; it keeps people from meeting
 * buttons that would answer 403.
 */
export type Role = "owner" | "admin" | "developer" | "reviewer" | "billing" | "viewer";

export type Capability =
  | "verifications.summary"
  | "verifications.detail"
  | "verifications.reveal"
  | "run"
  | "workflows.view"
  | "workflows.manage"
  | "keys.view"
  | "keys.manage"
  | "playground"
  | "webhooks.manage"
  | "billing.view"
  | "billing.manage"
  | "team.manage"
  | "settings.manage"
  | "ownership";

export const ROLE_NAMES: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  reviewer: "Reviewer",
  billing: "Billing",
  viewer: "Viewer",
};

/** The page a path opens and what it needs (longest prefix first). Pages not listed are open to every member. */
const PAGES: [string, Capability][] = [
  // Financial portal
  ["/fin/api-keys/playground", "playground"],
  ["/fin/api-keys", "keys.view"],
  ["/fin/playground", "run"],
  ["/fin/bin-lookup", "run"],
  ["/fin/scans", "verifications.summary"],
  ["/fin/dashboard", "verifications.summary"],
  ["/fin/webhooks", "webhooks.manage"],
  ["/fin/billing", "billing.view"],
  ["/fin/team", "team.manage"],
  // KYC console
  ["/api-keys/playground", "playground"],
  ["/playground", "playground"],
  ["/api-keys", "keys.view"],
  ["/dashboard", "verifications.summary"],
  ["/workflows/templates", "workflows.manage"],
  ["/workflows", "workflows.view"],
  ["/verifications", "verifications.summary"],
  ["/explorer", "run"],
  ["/webhooks", "webhooks.manage"],
  ["/billing", "billing.view"],
  ["/team", "team.manage"],
];

/** What a page needs, or null when every member may open it (Settings, the Financial home). */
export function pageNeed(path: string): Capability | null {
  const p = path.replace(/\/+$/, "") || "/";
  for (const [prefix, cap] of PAGES) if (p === prefix || p.startsWith(`${prefix}/`)) return cap;
  return null;
}

/** Where a person lands when the page they asked for is not theirs: the first page of that portal they may open. */
export function firstAllowedPage(can: (c: Capability) => boolean, portal: "kyc" | "fin"): string {
  const order = portal === "fin"
    ? ["/fin/dashboard", "/fin/scans", "/fin/playground", "/fin/billing", "/fin/settings"]
    : ["/dashboard", "/verifications", "/workflows", "/billing", "/settings"];
  return order.find((href) => {
    const need = pageNeed(href);
    return !need || can(need);
  }) ?? (portal === "fin" ? "/fin/settings" : "/settings");
}

const LANDING_LABEL: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/verifications": "Verifications",
  "/workflows": "Workflows",
  "/billing": "Usage & Billing",
  "/settings": "Settings",
  "/fin/dashboard": "Dashboard",
  "/fin/scans": "Scans",
  "/fin/playground": "Playground",
  "/fin/billing": "Usage & Billing",
  "/fin/settings": "Settings",
};
/** The name of a landing page from firstAllowedPage, for its button. */
export const landingLabel = (href: string) => LANDING_LABEL[href] ?? "your console";

export type Access = {
  /** The role is known (signed in and loaded). Until then `can` answers yes, so nothing flickers away for most people. */
  ready: boolean;
  role: Role | null;
  roleName: string | null;
  can: (cap: Capability) => boolean;
  /** May this person open that page? */
  canOpen: (path: string) => boolean;
};

export function useAccess(): Access {
  const { status, account } = useCurrentAccount();
  // signed out (the local preview without the sign-in gate) or still loading: nothing is hidden
  const caps = status === "authed" && account?.capabilities ? new Set(account.capabilities) : null;
  const can = (cap: Capability) => (caps ? caps.has(cap) : true);
  return {
    ready: !!caps,
    role: account?.role ?? null,
    roleName: account?.role ? ROLE_NAMES[account.role] : null,
    can,
    canOpen: (path: string) => {
      const need = pageNeed(path);
      return !need || can(need);
    },
  };
}
