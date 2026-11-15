/**
 * The demo dataset — every value the dashboard shows when nothing real is wired.
 *
 * ALL OF IT IS ILLUSTRATIVE. These are the figures drawn in Figma frame
 * Desktop-43, kept verbatim so the built screen can be diffed against the frame.
 * Nothing here comes from the recognition gateway, and several panels (uptime,
 * webhook delivery, per-endpoint latency, connection type, IP mismatch) measure
 * things the platform does not instrument at all yet.
 *
 * FOR WHOEVER WIRES THIS UP: you should not need to edit this file. Implement
 * `getDashboardData()` in `./index.ts` against the `ConsoleData` contract in
 * `./types.ts` and this becomes the fallback only. Two things to carry over:
 *
 *   · When a panel becomes real, DELETE its entry here rather than editing the
 *     numbers to look plausible. A fabricated figure on a compliance surface is
 *     one an operator will act on, and nothing on screen tells it apart from a
 *     measured one.
 *   · Applicant names below are invented and carry no document numbers, dates of
 *     birth or addresses. The activity list reports each run's OUTCOME only,
 *     never the identity data behind it. Keep it that way.
 */

import type {
  ComponentIcon,
  ConsoleData,
  ErrorPoint,
  FlowStep,
  LatencyPoint,
  VolumePoint,
  WorkflowBuilderData,
  WorkflowSummary,
} from "./types";

/* ----------------------------------------------------------------------------
   Series generators

   Deterministic: a hash of the index, not `Math.random`, so the shape is stable
   between server and client render and cannot cause a hydration mismatch.
---------------------------------------------------------------------------- */

/** Repeatable pseudo-noise in roughly [-1, 1]. */
function wobble(i: number): number {
  return ((Math.sin(i * 12.9898) * 43758.5453) % 1);
}

/** `count` consecutive ISO dates from a UTC start. UTC so a DST boundary or a
 *  server in another zone cannot shift a bucket by a day. */
function days(startUtc: [number, number, number], count: number): string[] {
  const [y, m, d] = startUtc;
  return Array.from({ length: count }, (_, i) => {
    const t = new Date(Date.UTC(y, m, d));
    t.setUTCDate(t.getUTCDate() + i);
    return t.toISOString().slice(0, 10);
  });
}

const VOLUME: VolumePoint[] = days([2026, 6, 12], 30).map((date, i) => {
  // A gentle climb from ~290 to ~370, with the two-week dip the frame shows.
  const trend = 288 + (i / 29) * 82;
  const dip = i === 11 || i === 12 ? -26 : 0;
  const total = Math.round(trend + dip + wobble(i) * 14);
  return { date, total, approved: Math.round(total * (0.44 + wobble(i + 7) * 0.05)) };
});

const LATENCY: LatencyPoint[] = days([2026, 6, 13], 29).map((date, i) => ({
  date,
  p50: Math.round(190 + wobble(i * 3) * 22),
  p95: Math.round(455 + wobble(i * 5) * 70),
  // p99 swings hardest — a tail metric moves far more than a median.
  p99: Math.round(1120 + wobble(i * 3) * 300),
}));

const ERRORS: ErrorPoint[] = days([2026, 6, 15], 27).map((date, i) => {
  const ramp = i < 16 ? 2 + i * 1.25 : 16 - (i - 16) * 0.55;
  const total = Math.max(1, Math.round(ramp + wobble(i * 9) * 3));
  const c5xx = Math.max(0, Math.round(total * 0.16));
  return { date, c4xx: total - c5xx, c5xx };
});


/* ----------------------------------------------------------------------------
   Component catalogue

   The single price list. Everything that quotes a figure, the workflow cards,
   the builder's component rail, the applicant flow total, reads it from here,
   so a price cannot be right in one place and stale in another.
---------------------------------------------------------------------------- */

interface Component {
  id: ComponentIcon;
  name: string;
  /** USD per verification. */
  price: number;
  /** Gated behind a plan: rendered dimmed with a lock, cannot be toggled. */
  locked?: boolean;
}

export const CATALOGUE: Component[] = [
  { id: "document", name: "Document Capture & Recognition", price: 0.35 },
  { id: "authenticity", name: "Document Authenticity", price: 0.25 },
  { id: "nfc", name: "NFC Verification", price: 0.9 },
  { id: "liveness", name: "Face Liveness", price: 0.2 },
  { id: "face-match", name: "Face Match (1:1)", price: 0.2 },
  { id: "face-search", name: "Face Search (1:N)", price: 0.3 },
  { id: "face-attributes", name: "Face Attributes", price: 0.1 },
  { id: "address", name: "Proof of Address", price: 0.4 },
  { id: "email", name: "Email Verification", price: 0.05 },
  { id: "phone", name: "Phone Verification", price: 0.08 },
  { id: "aml", name: "AML Screening", price: 0.8, locked: true },
  { id: "device-ip", name: "Device & IP Analysis", price: 0.06 },
  { id: "database", name: "Database Validation", price: 0.15 },
  { id: "age", name: "Age Verification", price: 0.05 },
  { id: "questionnaire", name: "Questionnaire", price: 0 },
];

const BY_ID = new Map(CATALOGUE.map((c) => [c.id, c]));

export function component(id: ComponentIcon): Component {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`unknown component: ${id}`);
  return c;
}

export function money(total: number): string {
  return `$${total.toFixed(2)}`;
}

/**
 * A workflow's price is the sum of its checks — DERIVED, never stored.
 *
 * All three frames reconcile exactly against their own components ($1.06,
 * $0.75, $2.36), so the design treats this as computed too. Storing it would
 * let a card and the builder disagree the first time somebody toggles a check.
 */
export function priceOf(ids: ComponentIcon[]): number {
  return ids.reduce((sum, id) => sum + component(id).price, 0);
}

/* ----------------------------------------------------------------------------
   Saved workflows
---------------------------------------------------------------------------- */

interface WorkflowSeed {
  id: string;
  name: string;
  status: "active" | "draft";
  /** Ordered as the applicant walks them. */
  components: ComponentIcon[];
  /** Card chip order, which the frames set independently of the flow order. */
  chipOrder?: ComponentIcon[];
  updated: string;
  /** Per-step requirement + outcome, in flow order. */
  rules: { requirement: string; outcome: string }[];
}

const WORKFLOWS: WorkflowSeed[] = [
  {
    id: "standard-kyc",
    name: "Standard KYC",
    status: "active",
    components: ["document", "authenticity", "face-match", "liveness", "device-ip"],
    chipOrder: ["document", "face-match", "liveness", "device-ip", "authenticity"],
    updated: "8/10/2026",
    rules: [
      { requirement: "Required", outcome: "pass" },
      { requirement: "Required", outcome: "review" },
      { requirement: "Required", outcome: "review" },
      { requirement: "Required", outcome: "fail" },
      { requirement: "Optional", outcome: "review" },
    ],
  },
  {
    id: "fast-kyc",
    name: "Fast KYC",
    status: "draft",
    components: ["document", "face-match", "liveness"],
    updated: "7/5/2026",
    rules: [
      { requirement: "Required", outcome: "pass" },
      { requirement: "Required", outcome: "review" },
      { requirement: "Required", outcome: "fail" },
    ],
  },
  {
    id: "high-risk-onboarding",
    name: "High-risk onboarding",
    status: "active",
    components: ["document", "authenticity", "face-match", "liveness", "device-ip", "address", "nfc"],
    updated: "7/10/2026",
    rules: [
      { requirement: "Required", outcome: "pass" },
      { requirement: "Required", outcome: "review" },
      { requirement: "Required", outcome: "review" },
      { requirement: "Required", outcome: "fail" },
      { requirement: "Optional", outcome: "review" },
      { requirement: "Required", outcome: "review" },
      { requirement: "Required", outcome: "fail" },
    ],
  },
];

function toCard(w: WorkflowSeed): WorkflowSummary {
  const chips = (w.chipOrder ?? w.components).map((id) => ({
    label: component(id).name,
    icon: id,
  }));
  return {
    id: w.id,
    name: w.name,
    status: w.status,
    price: `${money(priceOf(w.components))}/verif`,
    chips,
    updated: `Updated ${w.updated}`,
    href: `/workflows/${w.id}`,
  };
}

function toBuilder(w: WorkflowSeed): WorkflowBuilderData {
  const enabled = new Set<string>(w.components);
  const steps: FlowStep[] = w.components.map((id, i) => {
    const c = component(id);
    const rule = w.rules[i] ?? { requirement: "Required", outcome: "review" };
    return {
      id,
      name: c.name,
      requirement: rule.requirement,
      outcome: rule.outcome,
      price: money(c.price),
    };
  });
  const first = steps[0];
  if (!first) throw new Error(`workflow "${w.id}" has no components`);

  return {
    id: w.id,
    name: w.name,
    breadcrumb: { label: "Workflows", href: "/workflows" },
    componentsTitle: "Components",
    components: CATALOGUE.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.id,
      price: `${money(c.price)}/verif`,
      enabled: enabled.has(c.id),
      locked: c.locked,
    })),
    flowTitle: "Applicant flow",
    flowPrice: `${money(priceOf(w.components))}/verif`,
    steps,
    settingsTitle: "Step settings",
    settings: {
      stepName: first.name,
      subtitle: "Configure this step",
      note: "No additional settings.",
      passRuleLabel: "Pass rule",
      passRule: "Pass",
      passRuleOptions: ["Pass", "Review", "Fail"],
      requiredLabel: "Required",
      required: first.requirement === "Required",
    },
    footer: {
      decisionModeLabel: "Decision mode",
      decisionMode: "Trust Score threshold",
      decisionModes: ["Trust Score threshold", "All checks must pass", "Manual review only"],
      threshold: 75,
      thresholdMax: 100,
      testLabel: "Test in Playground",
      saveLabel: "Save",
    },
  };
}

/* ----------------------------------------------------------------------------
   Industry templates

   Gradient endpoints live with the template because the banner colour IS the
   only thing distinguishing one tile from another at a glance.
---------------------------------------------------------------------------- */

const TEMPLATES: { name: string; low: number; high: number; from: string; to: string }[] = [
  { name: "Fintech", low: 0.85, high: 1.6, from: "#4f5bf7", to: "#6d78fb" },
  { name: "Banking", low: 1.2, high: 2.4, from: "#111827", to: "#39424f" },
  { name: "Crypto & Web3", low: 0.95, high: 1.8, from: "#f97316", to: "#ea5a0c" },
  { name: "Lending & BNPL", low: 0.7, high: 1.4, from: "#0d9d6e", to: "#10b981" },
  { name: "iGaming", low: 1.1, high: 2.0, from: "#e916c8", to: "#f43fb5" },
  { name: "Gaming", low: 0.5, high: 1.0, from: "#8b2ff5", to: "#a855f7" },
  { name: "E-commerce", low: 0.45, high: 0.95, from: "#f4304f", to: "#fb1d3f" },
  { name: "Marketplace", low: 0.55, high: 1.1, from: "#06a4e8", to: "#22c3f5" },
  { name: "Insurance", low: 0.9, high: 1.7, from: "#2563eb", to: "#3b82f6" },
  { name: "Healthcare", low: 0.8, high: 1.5, from: "#059669", to: "#10b981" },
  { name: "Real estate", low: 0.85, high: 1.55, from: "#6b5f57", to: "#8a7c72" },
  { name: "Travel & Hospitality", low: 0.65, high: 1.2, from: "#0891b2", to: "#06b6d4" },
  { name: "Mobility", low: 0.55, high: 1.05, from: "#7c3aed", to: "#9333ea" },
  { name: "Telecom", low: 0.6, high: 1.15, from: "#1d4ed8", to: "#2563eb" },
  { name: "Government", low: 1.3, high: 2.5, from: "#0e3228", to: "#1a4a3a" },
  { name: "EdTech", low: 0.35, high: 0.8, from: "#ca8a04", to: "#eab308" },
  { name: "Biometric Payments", low: 0.7, high: 1.3, from: "#be185d", to: "#db2777" },
  { name: "Access Control", low: 0.5, high: 1.0, from: "#475569", to: "#64748b" },
];

/* ----------------------------------------------------------------------------
   The dataset
---------------------------------------------------------------------------- */

export const DEMO_CONSOLE: ConsoleData = {
  shell: {
    account: {
      org: "Mark Fintech",
      name: "Mark Grayson",
      // RFC 2606 reserved domain, not the frame's gmail.com — that is a real
      // routable address that could belong to a person.
      email: "markgrayson@example.com",
      initials: "MG",
    },
    nav: [
      {
        label: "Verify",
        items: [
          { label: "Dashboard", icon: "dashboard", href: "/dashboard" },
          { label: "Workflows", icon: "workflows", href: "/workflows" },
          { label: "Verifications", icon: "verifications", href: "/verifications" },
          { label: "AML Explorer", icon: "explorer", href: "/explorer" },
        ],
      },
      {
        label: "Develop",
        items: [
          { label: "API Keys & Playground", icon: "api-keys", href: "/api-keys" },
          { label: "Webhooks", icon: "webhooks", href: "/webhooks" },
        ],
      },
      {
        label: "Manage",
        items: [
          { label: "Usage & Billing", icon: "billing", href: "/billing" },
          { label: "Team", icon: "team", href: "/team" },
          { label: "Settings", icon: "settings", href: "/settings" },
        ],
      },
    ],
    currentPath: "/dashboard",
    // No plan upgrade: the product is credits-based (see Usage & Billing), so the sidebar has no promo.
    upgrade: null,
    // VeriSec has not opened Live yet: every verification runs in Test (kyc_sessions.env), so the
    // switch stays on Test and Live is shown locked, with why.
    env: "test",
    envLabels: { test: "Test", live: "Live" },
    liveLocked: "Live is not open yet. Every verification runs in Test for now.",
    unread: 3,
    notifications: [
      {
        id: "n1",
        title: "3 sessions need manual review",
        body: "High-risk onboarding flagged them for a reviewer.",
        time: "2m ago",
        unread: true,
        tone: "warning",
        href: "/verifications",
      },
      {
        id: "n2",
        title: "Webhook delivery failing",
        body: "Your live endpoint returned 500 on the last 4 attempts.",
        time: "26m ago",
        unread: true,
        tone: "danger",
        href: "/webhooks",
      },
      {
        id: "n3",
        title: "A teammate accepted their invite",
        body: "They now have Reviewer access to this workspace.",
        time: "1h ago",
        unread: true,
        tone: "success",
        href: "/team",
      },
      {
        id: "n4",
        title: "This month's invoice is ready",
        body: "August usage has been totalled and is ready to download.",
        time: "Yesterday",
        unread: false,
        tone: "info",
        href: "/billing",
      },
    ],
    notificationsLabel: "Notifications",
    notificationsEmpty: "You're all caught up.",
    markAllReadLabel: "Mark all read",
    viewAllLabel: "View all",
    searchPlaceholder: "Search",
  },

  dashboard: {
    header: {
      title: "Dashboard",
      lastSyncLabel: "Last Sync:",
      lastSync: "2 Minutes ago",
      ranges: ["Last 30 days", "Last 7 days", "Last 90 days"],
      workflows: ["All workflows", "Standard KYC", "Fast KYC", "High-risk onboarding"],
      exportLabel: "Export",
      newSessionLabel: "New session",
    },

    kpis: [
      { icon: "verifications", label: "Verifications", value: "24", delta: "+12.4%", trend: "up", tone: "pine", feature: true },
      { icon: "pass", label: "Pass rate", value: "54%", delta: "+1.8%", trend: "up", tone: "positive" },
      { icon: "latency", label: "Median latency", value: "412 ms", delta: "-24 ms", trend: "down", tone: "positive" },
      { icon: "uptime", label: "Uptime", value: "99.98%", delta: "0.01%", trend: "up", tone: "uptime" },
    ],

    volume: {
      title: "Verification volume",
      points: VOLUME,
      axis: {
        max: 400,
        yTicks: [0, 100, 200, 300, 400],
        xTicks: ["2026-07-12", "2026-07-16", "2026-07-20", "2026-07-24", "2026-07-28", "2026-08-01", "2026-08-05", "2026-08-10"],
      },
    },

    // The frame's four labels sum to 90, not 100, yet it draws a closed ring, so
    // the view normalises the arcs and prints these numbers as designed.
    outcomes: {
      title: "Outcome breakdown",
      centerLabel: "Total Verifications",
      centerValue: "24",
      slices: [
        { label: "Approved", percent: 45, ramp: 1 },
        { label: "Needs review", percent: 18, ramp: 4 },
        { label: "Declined", percent: 17, ramp: 6 },
        { label: "Abandoned", percent: 10, ramp: 7 },
      ],
    },

    failingChecks: {
      title: "Top failing checks",
      items: [
        { label: "Liveness", display: "42", value: 42 },
        { label: "Document", display: "31", value: 31 },
        { label: "Face match", display: "24", value: 24 },
        { label: "NFC", display: "12", value: 12 },
        { label: "Address", display: "8", value: 8 },
      ],
    },

    declineReasons: {
      title: "Top decline reasons",
      items: [
        { label: "Screen recapture", display: "22", value: 22 },
        { label: "Face mismatch", display: "18", value: 18 },
        { label: "MRZ check-digit fail", display: "14", value: 14 },
        { label: "IP high risk", display: "11", value: 11 },
        { label: "Chip auth fail", display: "6", value: 6 },
      ],
    },

    // Percentages are the frame's segment widths converted from px, so the bar
    // and its legend cannot disagree.
    connections: {
      title: "Connection type",
      segments: [
        { label: "Residential", percent: 62, ramp: 1, inline: true },
        { label: "Mobile", percent: 25, ramp: 2, inline: true },
        { label: "Corporate", percent: 6, ramp: 3, inline: true },
        { label: "Datacenter", percent: 4, ramp: 4 },
        { label: "VPN", percent: 2, ramp: 5 },
        { label: "Proxy", percent: 0.7, ramp: 6 },
        { label: "Tor", percent: 0.3, ramp: 7 },
      ],
    },

    ipMismatch: {
      title: "IP vs document mismatch",
      value: "4.2%",
      caption: "of live verifications this period",
    },

    latency: {
      title: "Latency (p50/p95/p99)",
      points: LATENCY,
      axis: {
        max: 1600,
        yTicks: [0, 400, 800, 1200, 1600],
        xTicks: ["2026-07-13", "2026-07-17", "2026-07-21", "2026-07-25", "2026-07-30", "2026-08-04", "2026-08-10"],
      },
    },

    errors: {
      title: "Error rate (4xx/5xx)",
      points: ERRORS,
      axis: {
        max: 24,
        yTicks: [0, 6, 12, 18, 24],
        xTicks: ["2026-07-15", "2026-07-20", "2026-07-25", "2026-07-30", "2026-08-04", "2026-08-10"],
      },
    },

    uptime: {
      title: "Uptime & downtime",
      value: "99.98%",
      incidents: {
        title: "Incidents",
        columns: [
          { key: "when", header: "When", width: 110, align: "left" },
          { key: "duration", header: "Duration", width: 60, align: "left" },
          { key: "severity", header: "Severity", width: 60, align: "left" },
          { key: "note", header: "Note", width: 140, align: "left", muted: true },
        ],
        rows: [
          { when: "2026-07-14 03:22", duration: "4m 12s", severity: { tag: "minor", tone: "caution" }, note: "Regional DB failover" },
          { when: "2026-06-28 15:04", duration: "1m 45s", severity: { tag: "minor", tone: "caution" }, note: "CDN provider incident" },
          { when: "2026-06-02 08:11", duration: "11m 03s", severity: { tag: "major", tone: "danger" }, note: "Cert renewal error" },
        ],
      },
    },

    webhooks: {
      title: "Webhook deliveries",
      slices: [
        { label: "Delivered", percent: 45, ramp: 1 },
        { label: "Retried", percent: 18, ramp: 4 },
        { label: "Failed", percent: 17, ramp: 6 },
      ],
    },

    endpoints: {
      title: "Calls by endpoint",
      columns: [
        { key: "endpoint", header: "Endpoint", width: 422.66, emphasis: true },
        { key: "calls", header: "Calls", width: 122.4 },
        { key: "p50", header: "p50", width: 99.57 },
        { key: "p95", header: "p95", width: 100.49 },
        { key: "p99", header: "p99", width: 112.53 },
        { key: "c4xx", header: "4xx", width: 76.75 },
        { key: "c5xx", header: "5xx", width: 94.12, muted: true },
      ],
      rows: [
        { endpoint: "POST /kyc/verify", calls: "184,320", p50: "260ms", p95: "640ms", p99: "1420ms", c4xx: "0.4%", c5xx: "0.02%" },
        { endpoint: "POST /face/match", calls: "92,104", p50: "110ms", p95: "220ms", p99: "480ms", c4xx: "0.2%", c5xx: "0.01%" },
        { endpoint: "POST /face/liveness", calls: "88,450", p50: "180ms", p95: "320ms", p99: "610ms", c4xx: "0.3%", c5xx: "0.02%" },
        { endpoint: "POST /document/authenticity", calls: "74,210", p50: "145ms", p95: "290ms", p99: "540ms", c4xx: "0.5%", c5xx: "0.02%" },
        { endpoint: "POST /nfc/verify", calls: "12,580", p50: "380ms", p95: "720ms", p99: "1180ms", c4xx: "0.1%", c5xx: "0.01%" },
        { endpoint: "GET /verifications/:id", calls: "220,400", p50: "42ms", p95: "96ms", p99: "210ms", c4xx: "0.1%", c5xx: "0.01%" },
      ],
    },

    queues: [
      { label: "Unfinished", value: "12", cta: "Open queue", href: "/verifications?queue=unfinished" },
      { label: "Abandoned", value: "3", cta: "Open queue", href: "/verifications?queue=abandoned" },
      { label: "Flagged", value: "4", cta: "Open queue", href: "/verifications?queue=flagged" },
      { label: "Oldest waiting", value: "3d 4h", cta: "Open queue", href: "/verifications?queue=waiting" },
    ],

    workflowTracking: {
      title: "Workflow tracking",
      columns: [
        { key: "workflow", header: "Workflow", width: 344.67, emphasis: true },
        { key: "uses", header: "Uses", width: 87.1 },
        { key: "avgLatency", header: "Avg latency", width: 161.59 },
        { key: "p95", header: "p95", width: 125.5 },
        { key: "avgCompletion", header: "Avg completion", width: 215.48 },
        { key: "flag", header: "Flag", width: 94.18 },
      ],
      rows: [
        { workflow: "Standard KYC", uses: "1,240", avgLatency: "380ms", p95: "640ms", avgCompletion: "3m 12s", flag: "-" },
        { workflow: "High-risk onboarding", uses: "320", avgLatency: "812ms", p95: "1420ms", avgCompletion: "5m 44s", flag: { tag: "Slow", tone: "caution" } },
        { workflow: "Fast KYC", uses: "640", avgLatency: "220ms", p95: "410ms", avgCompletion: "1m 48s", flag: "-" },
      ],
    },

    processing: {
      title: "Processing time",
      tiles: [
        { label: "p50", value: "412 ms" },
        { label: "p95", value: "780 ms" },
        { label: "p99", value: "1.42 s" },
      ],
      note: "Simple flows: 310ms · Complex flows (NFC+AML): 980ms",
    },

    // Ordered as the frame does, not by value — Liveness sits last at 210ms even
    // though it is slower than Face match.
    slowestChecks: {
      title: "Slowest checks",
      items: [
        { label: "NFC verify", display: "720ms", value: 720 },
        { label: "AML screen", display: "540ms", value: 540 },
        { label: "Document authenticity", display: "320ms", value: 320 },
        { label: "Face match", display: "180ms", value: 180 },
        { label: "Liveness", display: "210ms", value: 210 },
      ],
    },

    activity: {
      title: "Recent activity",
      cta: "New session",
      rows: [
        { name: "Yuki Tanaka", ref: "V20251-0168", workflow: "Standard KYC", score: 65, verdict: "Needs review", href: "/verifications?id=V20251-0168" },
        { name: "Amina Hassan", ref: "V20252-4655", workflow: "Fast KYC", score: 92, verdict: "Approved", href: "/verifications?id=V20252-4655" },
        { name: "Wanjiru Kamau", ref: "V20254-7599", workflow: "Standard KYC", score: 96, verdict: "Approved", href: "/verifications?id=V20254-7599" },
        { name: "Sarah Chen", ref: "V20255-7124", workflow: "Fast KYC", score: 47, verdict: "Declined", href: "/verifications?id=V20255-7124" },
        { name: "Fatima Bello", ref: "V20257-5229", workflow: "Standard KYC", score: 24, verdict: "Declined", href: "/verifications?id=V20257-5229" },
        { name: "Amara Okafor", ref: "V20258-7549", workflow: "Fast KYC", score: 87, verdict: "Approved", href: "/verifications?id=V20258-7549" },
        { name: "Lucas Silva", ref: "V20260-8229", workflow: "Standard KYC", score: 91, verdict: "Approved", href: "/verifications?id=V20260-8229" },
        { name: "Emeka Adeyemi", ref: "V20261-8666", workflow: "High-risk onboarding", score: 0, verdict: "Abandoned", href: "/verifications?id=V20261-8666" },
      ],
    },
  },

  workflows: {
    title: "Workflows",
    countLabel: "Saved Workflows:",
    count: WORKFLOWS.length,
    newLabel: "Create new workflow",
    // Seed order is the frame's reading order: Standard and Fast sit side by
    // side, High-risk wraps to the next row because it carries more chips.
    cards: WORKFLOWS.map(toCard),
    picker: {
      title: "Start a new workflow",
      searchPlaceholder: "Search industry templates",
      scratch: { label: "Start from scratch", href: "/workflows/new" },
      emptyLabel: "No templates match that search.",
      templates: TEMPLATES.map((t) => ({
        name: t.name,
        priceRange: `${money(t.low)}, ${money(t.high)}`,
        from: t.from,
        to: t.to,
        href: `/workflows/new?template=${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      })),
    },
  },

  builders: Object.fromEntries(WORKFLOWS.map((w) => [w.id, toBuilder(w)])),
};
