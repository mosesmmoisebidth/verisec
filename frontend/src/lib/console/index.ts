/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE ONE FILE TO CHANGE WHEN YOU WIRE THIS TO THE BACKEND
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Every component on the dashboard is a pure function of the `ConsoleData` this
 * returns. Nothing imports the demo dataset directly, no component holds a
 * label, a colour or a number of its own, and no view knows where the data came
 * from. So:
 *
 *   · Replace the bodies of `getConsoleData()` / `getWorkflow()` with fetches.
 *   · Return the `ConsoleData` shape from `./types.ts`.
 *   · Change nothing else. No JSX, no CSS, no props.
 *
 * They are already `async`, so becoming real network calls needs no change at
 * any call site — every page awaits them.
 *
 * A rough sketch of what that looks like:
 *
 *     export async function getConsoleData(
 *       opts: DashboardQuery = {},
 *     ): Promise<ConsoleData> {
 *       const res = await fetch(`${apiBase()}/api/dashboard`, {
 *         headers: { Authorization: `Bearer ${token}` },
 *         cache: "no-store",
 *         signal: AbortSignal.timeout(15_000),
 *       });
 *       if (!res.ok) throw new ApiError(...);
 *       return toConsoleData(await res.json());
 *     }
 *
 * Notes worth keeping when you do:
 *
 *   · TIME OUT THE REQUEST. The backend host is resolved at runtime from
 *     `public/config.js`, so a stale or unreachable value does not fail — it
 *     hangs, and the page sits on a skeleton forever with no way out. A bounded
 *     wait plus a retry is the difference between "slow" and "broken".
 *   · Keep the payload JSON-serialisable. Icons and tones are string unions in
 *     `types.ts` precisely so the whole thing can cross the wire untouched.
 *   · The `axis` on each chart is optional. Leave `max`/`yTicks` off and the
 *     chart derives a rounded ceiling from the data, which is what you want for
 *     live numbers — a hard-coded 400 clips the day you serve 500.
 *   · Panels the platform does not actually instrument yet (uptime, webhook
 *     delivery, per-endpoint latency, connection type, IP mismatch) should be
 *     dropped from the payload rather than filled with plausible numbers. See
 *     the header of `./demo-data.ts`.
 */

import { DEMO_CONSOLE } from "./demo-data";
import { DEMO_API_KEYS } from "./demo-api-keys";
import { DEMO_BILLING } from "./demo-billing";
import { DEMO_TEAM } from "./demo-team";
import { DEMO_INTEGRATIONS } from "./demo-integrations";
import { DEMO_WEBHOOKS } from "./demo-webhooks";
import { DEMO_SETTINGS } from "./demo-settings";
import {
  DEMO_VERIFICATIONS_LIST,
  DEMO_VERIFICATION_DETAILS,
  DEMO_VERIFICATION_TABS,
} from "./demo-verifications";
import type {
  ApiKeysData,
  ApiTab,
  BillingData,
  ConsoleData,
  SettingsData,
  SettingsTab,
  TeamData,
  WebhooksData,
  IntegrationsData,
  VerificationDetail,
  VerificationTab,
  VerificationsListData,
  WorkflowBuilderData,
} from "./types";

export * from "./types";

/** Filters the dashboard header exposes. Pass them through to your endpoint. */
export interface DashboardQuery {
  /** One of `header.ranges`. */
  range?: string;
  /** One of `header.workflows`. */
  workflow?: string;
}

/**
 * Returns everything one render of the console needs.
 *
 * Currently serves the demo dataset. `opts` is accepted and ignored so the
 * header's selects can be wired to it without a signature change.
 */
export async function getConsoleData(opts: DashboardQuery = {}): Promise<ConsoleData> {
  void opts;
  return DEMO_CONSOLE;
}

/**
 * One workflow's builder payload, or null when the id is unknown.
 *
 * Separate from `getDashboardData` so the builder page fetches only what it
 * renders — `GET /api/workflows/{id}` rather than the whole console.
 */
export async function getWorkflow(id: string): Promise<WorkflowBuilderData | null> {
  return DEMO_CONSOLE.builders[id] ?? null;
}

/** Every workflow id, for `generateStaticParams` in the export build. */
export async function listWorkflowIds(): Promise<string[]> {
  return Object.keys(DEMO_CONSOLE.builders);
}

/**
 * True while the screen is showing invented figures.
 *
 * Read this rather than testing for the demo dataset by identity: it gives the
 * UI one honest place to render a "Sample data" marker, which it must do before
 * this screen goes in front of a customer. Flip it to `false` in the same commit
 * that makes these functions real.
 */
export const IS_DEMO_DATA = true;

/* ----------------------------------------------------------------------------
   Verifications

   Two reads, not one: the list page fetches rows, the detail page fetches one
   record. `GET /api/verifications` and `GET /api/verifications/{id}` rather
   than shipping every tab of every session to a page that renders a table.
---------------------------------------------------------------------------- */

/** Filters the list header exposes. Pass them through to your endpoint. */
export interface VerificationQuery {
  /** Free text against reference or applicant. */
  q?: string;
  status?: string;
  document?: string;
  workflow?: string;
  page?: number;
}

export async function getVerifications(
  opts: VerificationQuery = {},
): Promise<VerificationsListData> {
  void opts;
  return DEMO_VERIFICATIONS_LIST;
}

/** One verification's nine tabs, or null when the id is unknown. */
export async function getVerification(id: string): Promise<VerificationDetail | null> {
  return DEMO_VERIFICATION_DETAILS[id] ?? null;
}

/** Every verification id, for `generateStaticParams` in the export build. */
export async function listVerificationIds(): Promise<string[]> {
  return Object.keys(DEMO_VERIFICATION_DETAILS);
}

/**
 * The detail's tab strip.
 *
 * Order and labels are data, so the strip is not restated in JSX and a tab
 * cannot exist in the nav but not the router — `generateStaticParams` reads the
 * same list the strip renders.
 */
export async function listVerificationTabs(): Promise<VerificationTab[]> {
  return DEMO_VERIFICATION_TABS.map((t) => ({ ...t }));
}

/* ----------------------------------------------------------------------------
   API Keys & Playground

   One read, not four: the tabs are routes but they are one screen's worth of
   data, and splitting them would mean four round trips to render a strip that
   has to know all four labels anyway. `GET /api/api-keys`.
---------------------------------------------------------------------------- */

export async function getApiKeys(): Promise<ApiKeysData> {
  return DEMO_API_KEYS;
}

/**
 * The tab strip, for `generateStaticParams`.
 *
 * Same list the strip renders, so a tab cannot exist in the nav but not the
 * router.
 */
export async function listApiTabs(): Promise<ApiTab[]> {
  return DEMO_API_KEYS.tabs.map((t) => ({ ...t }));
}

/* ----------------------------------------------------------------------------
   Webhooks · Usage & Billing · Team

   One read each, `GET /api/webhooks`, `/api/billing`, `/api/team`. Each is a
   single screen's worth of data with no sub-resource a page renders on its own,
   so there is nothing here to split the way verifications splits list from
   detail.
---------------------------------------------------------------------------- */

export async function getWebhooks(): Promise<WebhooksData> {
  return DEMO_WEBHOOKS;
}

export async function getIntegrations(): Promise<IntegrationsData> {
  return DEMO_INTEGRATIONS;
}

/**
 * Usage, rates and invoices.
 *
 * The rate card and the per-verification estimate are DERIVED from the same
 * `CATALOGUE` the workflow builder prices against — see `demo-billing.ts`. When
 * this becomes a real fetch, keep that: the price a customer is quoted and the
 * price they are billed must come from one list.
 */
export async function getBilling(): Promise<BillingData> {
  return DEMO_BILLING;
}

export async function getTeam(): Promise<TeamData> {
  return DEMO_TEAM;
}

/* ----------------------------------------------------------------------------
   Settings

   One read, `GET /api/settings`. The seven tabs are routes but one screen's
   worth of data, so they load together the way API Keys' tabs do.
---------------------------------------------------------------------------- */

export async function getSettings(): Promise<SettingsData> {
  return DEMO_SETTINGS;
}

/**
 * The settings tab strip, for `generateStaticParams`.
 *
 * Same list the strip renders, so a tab cannot exist in the nav but not the
 * router.
 */
export async function listSettingsTabs(): Promise<SettingsTab[]> {
  return DEMO_SETTINGS.tabs.map((t) => ({ ...t }));
}
