/**
 * Server-side entry for the Financial Portal's pages.
 *
 * Only the shell is resolved here. Scan data is fetched in the browser from
 * the MICR and Card APIs (see `./api.ts`), because the site is a static
 * export and those services hold live data that changes after a build.
 */

import { getConsoleData, getSettings } from "@/lib/console";
import type { SettingsData } from "@/lib/console";

import { FIN_NAV, FIN_NOTIFICATIONS } from "./content";
import type { FinShellData } from "./types";

export * from "./types";

/**
 * Account settings are the organisation's, shared with the KYC console.
 * Branding is left out: it styles the hosted applicant flow, which this
 * portal doesn't have.
 */
export async function getFinanceSettings(): Promise<SettingsData> {
  const data = await getSettings();
  return { ...data, tabs: data.tabs.filter((t) => t.id !== "branding") };
}

export async function getFinanceShell(): Promise<FinShellData> {
  // Same account and chrome copy as the KYC console: one organisation, one
  // signed-in person, whichever portal they are in.
  const { shell } = await getConsoleData();
  return {
    account: shell.account,
    portalLabel: "Financial",
    nav: FIN_NAV,
    upgrade: shell.upgrade ? { ...shell.upgrade, href: "/fin/billing" } : null,
    env: "test",
    envLabels: shell.envLabels,
    notifications: FIN_NOTIFICATIONS,
    notificationsLabel: shell.notificationsLabel,
    notificationsEmpty: shell.notificationsEmpty,
    markAllReadLabel: shell.markAllReadLabel,
    viewAllLabel: shell.viewAllLabel,
    viewAllHref: "/fin/scans",
    searchPlaceholder: shell.searchPlaceholder,
    settingsHref: "/fin/settings",
  };
}
