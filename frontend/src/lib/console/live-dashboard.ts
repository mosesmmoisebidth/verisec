/**
 * The dashboard's live data: what the Console API measured for the signed-in organisation
 * (GET /api/verifications/dashboard), turned into the `DashboardData` the frame renders.
 *
 * Copy (titles, labels, columns) comes from the frame's own data; every number comes from the
 * API. A period with nothing in it says so in the panel instead of drawing an invented figure.
 */
import { niceMax, niceTicks } from "@/components/charts/charts";

import type { Cell, DashboardData, Kpi, Ramp, Verdict } from "./types";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

/** The Console API's answer (backend/services/console/src/kyc/dashboard.view.ts). */
export type DashboardMetrics = {
  days: number;
  from: string;
  generatedAt: string;
  kpis: {
    verifications: { value: number; prev: number };
    passRate: { value: number | null; prev: number | null };
    medianMs: { value: number | null; prev: number | null };
    uptime: { value: number | null; prev: number | null };
  };
  volume: { date: string; total: number; approved: number }[];
  outcomes: { total: number; approved: number; review: number; declined: number; abandoned: number; inProgress: number };
  failingChecks: { label: string; count: number }[];
  declineReasons: { label: string; count: number }[];
  connections: { label: string; count: number }[];
  ipMismatch: { mismatched: number; compared: number };
  latency: { unit: "day" | "hour"; points: { label: string; p50: number; p95: number; p99: number }[] };
  errors: { calls: number; points: { date: string; calls: number; c4xx: number; c5xx: number }[] };
  uptime: { percent: number | null; incidents: { start: string; minutes: number; note: string }[] };
  webhooks: { delivered: number; retried: number; failed: number };
  endpoints: { method: string; path: string; calls: number; p50: number; p95: number; p99: number; c4xx: number; c5xx: number }[];
  queues: { unfinished: number; abandoned: number; flagged: number; oldestWaitingMs: number | null };
  workflow: { uses: number; avgMs: number | null; p95Ms: number | null; avgCompletionMs: number | null };
  /** One row per workflow that ran in the period. */
  workflows?: { id: string | null; name: string; uses: number; avgMs: number | null; p95Ms: number | null; avgCompletionMs: number | null }[];
  /** The organisation's workflows, for the filter. */
  workflowOptions?: { id: string; name: string }[];
  processing: { p50: number; p95: number; p99: number } | null;
  completionMedianMs: number | null;
  slowestChecks: { label: string; avgMs: number }[];
  activity: { id: string; name: string | null; ref: string; score: number | null; verdict: Verdict; workflow?: string | null }[];
};

export type Loaded = { state: "ready"; data: DashboardMetrics } | { state: "signin" } | { state: "error"; message: string };

export async function fetchDashboard(days: number, workflow?: string | null): Promise<Loaded> {
  try {
    const q = `days=${days}${workflow ? `&workflow=${encodeURIComponent(workflow)}` : ""}`;
    const r = await fetch(`${API}/api/verifications/dashboard?${q}`, { credentials: "include", cache: "no-store" });
    if (r.status === 401) return { state: "signin" };
    if (!r.ok) return { state: "error", message: "The dashboard is unavailable right now. Please try again." };
    return { state: "ready", data: (await r.json()) as DashboardMetrics };
  } catch {
    return { state: "error", message: "We couldn't reach the console. Check your connection and try again." };
  }
}

/** Downloads the period's verifications as CSV (plain columns, no personal data). */
export async function downloadExport(days: number): Promise<boolean> {
  try {
    const r = await fetch(`${API}/api/verifications/export?days=${days}`, { credentials: "include", cache: "no-store" });
    if (!r.ok) return false;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `verisec-verifications-last-${days}-days.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- formatting -- */

const int = (n: number) => n.toLocaleString("en-US");
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 1 : 2)} s` : `${Math.round(n)} ms`);
const msTight = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`);
const pct = (n: number, digits = 0) => `${n.toFixed(digits)}%`;
/** Shares in a legend: whole numbers, one decimal under 10. */
const share = (part: number, whole: number) => {
  const v = whole ? (part / whole) * 100 : 0;
  return Math.round(v * (v < 10 ? 10 : 1)) / (v < 10 ? 10 : 1);
};

function duration(msValue: number): string {
  const s = Math.round(msValue / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** "Just now", "1 minute ago", "3 minutes ago". */
export function syncedAgo(iso: string, now: number): string {
  const m = Math.floor((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

/**
 * At most `n` evenly spaced labels from a list of dates. The final point sits on the chart's
 * right edge, where a centred label would be cut off, so it is never labelled.
 */
function spaced(dates: string[], n: number): string[] {
  const step = Math.max(1, Math.ceil(dates.length / n));
  return dates.filter((_, i) => i % step === 0 && i < dates.length - 1);
}

/** An axis whose four gridlines are evenly spaced whole numbers, however small the data. */
function axisFor(values: number[]) {
  const max = Math.ceil(Math.max(4, niceMax(values)) / 4) * 4;
  return { max, yTicks: niceTicks(max) };
}

/* ------------------------------------------------------------------- mapping -- */

export const RANGE_DAYS: Record<string, number> = { "Last 7 days": 7, "Last 30 days": 30, "Last 90 days": 90 };
/** The workflow filter's first option (no filter). */
export const ALL_WORKFLOWS = "All workflows";
const RAMP_OF: Record<string, Ramp> = { Residential: 1, Mobile: 2, Corporate: 3, Datacenter: 4, VPN: 5, Proxy: 6, Tor: 7 };

export function toDashboardData(m: DashboardMetrics, base: DashboardData, now: number): DashboardData {
  const k = m.kpis;
  const [kVer, kPass, kLat, kUp] = base.kpis;

  // a change only means something when there is a period before to compare with
  const verDelta =
    k.verifications.prev > 0
      ? ((k.verifications.value - k.verifications.prev) / k.verifications.prev) * 100
      : null;
  const passDelta = k.passRate.value !== null && k.passRate.prev !== null ? k.passRate.value - k.passRate.prev : null;
  const latDelta = k.medianMs.value !== null && k.medianMs.prev !== null ? k.medianMs.value - k.medianMs.prev : null;
  const upDelta = k.uptime.value !== null && k.uptime.prev !== null ? k.uptime.value - k.uptime.prev : null;
  const sign = (n: number, text: string) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${text}`;
  const NO_EARLIER = "No earlier period to compare";

  const kpis: Kpi[] = [
    {
      ...kVer!,
      value: int(k.verifications.value),
      delta: verDelta === null ? NO_EARLIER : sign(verDelta, pct(Math.abs(verDelta), 1)),
      trend: verDelta === null ? "none" : verDelta < 0 ? "down" : "up",
    },
    {
      ...kPass!,
      value: k.passRate.value === null ? "-" : pct(k.passRate.value),
      delta:
        k.passRate.value === null
          ? "No decided verifications yet"
          : passDelta === null
            ? NO_EARLIER
            : sign(passDelta, `${Math.abs(passDelta).toFixed(1)} pts`),
      trend: passDelta === null ? "none" : passDelta < 0 ? "down" : "up",
      tone: (passDelta ?? 0) < 0 ? "pine" : "positive",
    },
    {
      ...kLat!,
      value: k.medianMs.value === null ? "-" : ms(k.medianMs.value),
      delta:
        k.medianMs.value === null ? "No API calls yet" : latDelta === null ? NO_EARLIER : sign(latDelta, ms(Math.abs(latDelta))),
      trend: latDelta === null ? "none" : latDelta > 0 ? "up" : "down",
      // faster is better: a slower median is shown without the positive colour
      tone: (latDelta ?? 0) > 0 ? "pine" : "positive",
    },
    {
      ...kUp!,
      value: k.uptime.value === null ? "-" : pct(k.uptime.value, 2),
      delta:
        k.uptime.value === null
          ? "No health checks yet"
          : upDelta === null
            ? NO_EARLIER
            : sign(upDelta, `${Math.abs(upDelta).toFixed(2)} pts`),
      trend: upDelta === null ? "none" : upDelta < 0 ? "down" : "up",
    },
  ];

  const dates = m.volume.map((v) => v.date);
  const o = m.outcomes;
  const decidedOrNot = o.approved + o.review + o.declined + o.abandoned;
  const connTotal = m.connections.reduce((s, c) => s + c.count, 0);
  const anyCalls = m.errors.calls > 0;
  const wf = m.workflow;
  const hooks = m.webhooks.delivered + m.webhooks.retried + m.webhooks.failed;

  return {
    ...base,
    header: {
      ...base.header,
      lastSync: syncedAgo(m.generatedAt, now),
      // the organisation's own workflows (the filter re-reads the dashboard for one of them)
      workflows: [ALL_WORKFLOWS, ...(m.workflowOptions ?? []).map((w) => w.name)],
    },
    kpis,
    volume: {
      ...base.volume,
      points: m.volume,
      axis: { ...axisFor(m.volume.map((v) => v.total)), xTicks: spaced(dates, 8) },
      empty: o.total ? undefined : "No verifications in this period yet.",
    },
    outcomes: {
      ...base.outcomes,
      centerValue: int(o.total),
      slices: [
        { label: "Approved", percent: share(o.approved, o.total), ramp: 1 },
        { label: "Needs review", percent: share(o.review, o.total), ramp: 4 },
        { label: "Declined", percent: share(o.declined, o.total), ramp: 6 },
        { label: "Abandoned", percent: share(o.abandoned, o.total), ramp: 7 },
      ],
      empty: decidedOrNot ? undefined : o.total ? "Verifications in this period are still in progress." : "No verifications in this period yet.",
    },
    failingChecks: {
      ...base.failingChecks,
      items: m.failingChecks.map((x) => ({ label: x.label, display: int(x.count), value: x.count })),
      empty: m.failingChecks.length ? undefined : "No checks failed in completed verifications this period.",
    },
    declineReasons: {
      ...base.declineReasons,
      items: m.declineReasons.map((x) => ({ label: x.label, display: int(x.count), value: x.count })),
      empty: m.declineReasons.length ? undefined : "No verifications were declined this period.",
    },
    connections: {
      ...base.connections,
      segments: m.connections.map((c, i) => ({
        label: c.label,
        percent: share(c.count, connTotal),
        ramp: RAMP_OF[c.label] ?? 7,
        inline: i < 3,
      })),
      empty: connTotal ? undefined : "No device checks from a public network this period yet.",
    },
    ipMismatch: {
      ...base.ipMismatch,
      value: m.ipMismatch.compared ? pct(share(m.ipMismatch.mismatched, m.ipMismatch.compared), 1) : "-",
      caption: m.ipMismatch.compared
        ? `${int(m.ipMismatch.mismatched)} of ${int(m.ipMismatch.compared)} verifications compared this period`
        : "No verification could be compared yet this period",
    },
    latency: {
      ...base.latency,
      points: m.latency.points.map((p) => ({ date: p.label, p50: p.p50, p95: p.p95, p99: p.p99 })),
      axis: { ...axisFor(m.latency.points.map((p) => p.p99)), xTicks: spaced(m.latency.points.map((p) => p.label), 6) },
      empty: m.latency.points.length >= 2 ? undefined : "Not enough API calls in this period to chart yet.",
    },
    errors: {
      ...base.errors,
      points: m.errors.points.map((p) => ({ date: p.date, c4xx: p.c4xx, c5xx: p.c5xx })),
      axis: { ...axisFor(m.errors.points.map((p) => p.c4xx + p.c5xx)), xTicks: spaced(dates, 6) },
      empty: anyCalls ? undefined : "No API calls in this period yet.",
    },
    uptime: {
      ...base.uptime,
      value: m.uptime.percent === null ? "-" : pct(m.uptime.percent, 2),
      incidents: {
        ...base.uptime.incidents,
        rows: m.uptime.incidents.map((x) => ({
          when: new Date(x.start).toISOString().slice(0, 16).replace("T", " "),
          duration: duration(x.minutes * 60_000),
          severity: x.minutes >= 5 ? { tag: "major", tone: "danger" } : { tag: "minor", tone: "caution" },
          note: x.note,
        })),
        empty: m.uptime.percent === null ? "No health checks recorded in this period yet." : "No incidents in this period.",
      },
    },
    webhooks: {
      ...base.webhooks,
      centerValue: int(hooks),
      slices: [
        { label: "Delivered", percent: share(m.webhooks.delivered, hooks), ramp: 1 },
        { label: "Retried", percent: share(m.webhooks.retried, hooks), ramp: 4 },
        { label: "Failed", percent: share(m.webhooks.failed, hooks), ramp: 6 },
      ],
      empty: hooks ? undefined : "No webhook deliveries in this period yet.",
    },
    endpoints: {
      ...base.endpoints,
      rows: m.endpoints.map((e) => ({
        endpoint: `${e.method} ${e.path}`,
        calls: int(e.calls),
        p50: msTight(e.p50),
        p95: msTight(e.p95),
        p99: msTight(e.p99),
        c4xx: pct(e.c4xx, 1),
        c5xx: pct(e.c5xx, 2),
      })),
      empty: m.endpoints.length ? undefined : "No API calls in this period yet.",
    },
    queues: base.queues.map((q, i) => {
      const value =
        i === 0 ? int(m.queues.unfinished)
        : i === 1 ? int(m.queues.abandoned)
        : i === 2 ? int(m.queues.flagged)
        : m.queues.oldestWaitingMs === null ? "-"
        : duration(m.queues.oldestWaitingMs);
      return { ...q, value, href: "/verifications" };
    }),
    workflowTracking: {
      ...base.workflowTracking,
      // one row per workflow that ran (its own name, its applicants' calls, link-to-result time)
      rows: (m.workflows ?? []).map((w) => ({
        workflow: w.name,
        uses: int(w.uses),
        avgLatency: w.avgMs === null ? "-" : msTight(w.avgMs),
        p95: w.p95Ms === null ? "-" : msTight(w.p95Ms),
        avgCompletion: w.avgCompletionMs === null ? "-" : duration(w.avgCompletionMs),
        flag: (w.avgCompletionMs ?? 0) > 10 * 60_000 ? ({ tag: "Slow", tone: "caution" } as Cell) : "-",
      })),
      empty: wf.uses ? undefined : "No verifications in this period yet."
    },
    processing: {
      ...base.processing,
      tiles: [
        { label: "p50", value: m.processing ? ms(m.processing.p50) : "-" },
        { label: "p95", value: m.processing ? ms(m.processing.p95) : "-" },
        { label: "p99", value: m.processing ? ms(m.processing.p99) : "-" },
      ],
      note:
        m.completionMedianMs === null
          ? "No completed verifications in this period yet."
          : `From link opened to result: ${duration(m.completionMedianMs)} (median)`,
    },
    slowestChecks: {
      ...base.slowestChecks,
      items: m.slowestChecks.map((c) => ({ label: c.label, display: msTight(c.avgMs), value: c.avgMs })),
      empty: m.slowestChecks.length ? undefined : "No checks ran in this period yet.",
    },
    activity: {
      ...base.activity,
      rows: m.activity.map((a) => ({
        name: a.name ?? "Applicant not named yet",
        ref: a.ref,
        workflow: a.workflow ?? "Before workflows",
        score: a.score,
        verdict: a.verdict,
        href: `/verifications/session/?id=${encodeURIComponent(a.id)}`,
      })),
      empty: m.activity.length ? undefined : "No verifications in this period yet.",
    },
  };
}
