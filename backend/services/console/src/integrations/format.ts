/**
 * Turns a raw VeriSec event into something a person can actually read in Slack, a Google Sheet, a Drive
 * file, etc. — a short status, the stage it reached, and a few non-confidential fields (reference, ID type,
 * country, score, time). No names, document numbers, photos or other personal data: only what the
 * organisation already set (its reference) plus the outcome.
 *
 * One session produces many events (created -> started -> each step -> completed -> the verdict). The Sheets
 * connector keeps ONE row per session and updates it as these arrive (keyed by the session id), so a paused
 * verification that resumes keeps writing to the same row instead of making a new one.
 */

export type VerStatus = "approved" | "declined" | "needs_review" | "in_progress" | "created" | "abandoned";

export interface VerSummary {
  session: string;
  reference: string;
  workflow: string;
  idType: string;
  country: string;
  stage: string;
  statusLabel: string;
  status: VerStatus;
  score: string;
  time: string;
  company: string;
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

const STEP_LABEL: Record<string, string> = {
  document: "Document",
  liveness: "Liveness",
  face_match: "Face match",
  phone: "Phone",
  email: "Email",
  screening: "AML screening",
  address: "Proof of address",
};

/** Title case a slug like "drivers_license" -> "Drivers License"; blank stays blank. */
function pretty(slug: string): string {
  const s = slug.trim();
  if (!s) return "";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The human status label + machine key for an event. */
export function statusOf(eventType: string, ev: Record<string, unknown>): { status: VerStatus; label: string } {
  const verdict = str(ev.verdict).toLowerCase();
  const status = str(ev.status).toLowerCase();
  if (eventType === "verification.approved" || verdict === "approved") return { status: "approved", label: "Approved" };
  if (eventType === "verification.declined" || verdict === "declined") return { status: "declined", label: "Declined" };
  if (eventType === "verification.needs_review" || verdict === "needs_review") return { status: "needs_review", label: "Needs review" };
  if (status === "abandoned" || status === "expired") return { status: "abandoned", label: "Abandoned" };
  if (eventType === "verification.redacted" || status === "deleted" || status === "redacted")
    return { status: "abandoned", label: "Removed" };
  if (eventType === "verification.created" || status === "created") return { status: "created", label: "Created" };
  return { status: "in_progress", label: "In progress" };
}

/** The stage the verification reached, in words. */
function stageOf(eventType: string, ev: Record<string, unknown>, status: VerStatus): string {
  if (eventType === "verification.step_completed") return STEP_LABEL[str(ev.step)] ?? pretty(str(ev.step));
  if (eventType === "face.liveness.completed") return "Liveness";
  if (eventType === "face.match.completed") return "Face match";
  if (eventType === "aml.screening.completed") return "AML screening";
  if (status === "approved" || status === "declined" || status === "needs_review") return "Decision";
  if (status === "created") return "Created";
  if (status === "abandoned") return "Abandoned";
  return "In progress";
}

/** "2026-10-23 16:40" in UTC — stable and sortable; the sheet owner reads it in their own head. */
function nowStamp(): string {
  return new Date().toISOString().replace("T", " ").replace(/:\d\d\..+$/, "");
}

export function summarize(eventType: string, ev: Record<string, unknown>): VerSummary {
  const { status, label } = statusOf(eventType, ev);
  const score = typeof ev.score === "number" ? String(ev.score) : str(ev.score);
  return {
    session: str(ev.id),
    reference: str(ev.reference_id) || str(ev.id),
    workflow: str(ev.workflow),
    idType: pretty(str(ev.document_type)),
    country: str(ev.country).toUpperCase(),
    stage: stageOf(eventType, ev, status),
    statusLabel: label,
    status,
    score,
    time: nowStamp(),
    company: str(ev.company) || "VeriSec",
  };
}

/* ------------------------------------------------------------------ sheet rows -- */

/** The spreadsheet's column headers, in order. The last column (Session) is the upsert key. */
export const SHEET_HEADERS = ["Time", "Workflow", "Reference", "ID type", "Country", "Stage", "Status", "Score", "Session"] as const;

export function sheetRow(s: VerSummary): string[] {
  return [s.time, s.workflow, s.reference, s.idType, s.country, s.stage, s.statusLabel, s.score, s.session];
}

/** Google Sheets background colour (0..1 RGB) for a status, matching the user's scheme. */
export function statusColor(status: VerStatus): { red: number; green: number; blue: number } {
  switch (status) {
    case "approved":
      return { red: 0.72, green: 0.88, blue: 0.8 }; // green
    case "declined":
      return { red: 0.96, green: 0.78, blue: 0.76 }; // red
    case "needs_review":
      return { red: 0.98, green: 0.8, blue: 0.61 }; // orange
    case "in_progress":
      return { red: 1, green: 0.95, blue: 0.8 }; // yellow
    case "created":
    case "abandoned":
    default:
      return { red: 0.9, green: 0.9, blue: 0.9 }; // grey
  }
}

/* -------------------------------------------------------------- chat / file text -- */

/** A short, human message for Slack / Discord / Teams / Google Chat / Gmail / a Drive file. */
export function messageText(s: VerSummary, eventType: string): string {
  const icon =
    s.status === "approved" ? "✅" : s.status === "declined" ? "❌" : s.status === "needs_review" ? "🟠" : s.status === "abandoned" ? "⚪" : "⏳";
  const lines = [
    `${icon} ${s.company} — Verification ${s.statusLabel}`,
    `Reference: ${s.reference}`,
    ...(s.workflow ? [`Workflow: ${s.workflow}`] : []),
    ...(s.idType ? [`ID type: ${s.idType}`] : []),
    ...(s.country ? [`Country: ${s.country}`] : []),
    `Stage: ${s.stage}`,
    ...(s.score ? [`Score: ${s.score}`] : []),
    `Time: ${s.time} UTC`,
  ];
  void eventType;
  return lines.join("\n");
}

/** The same, as a titled plain-text document for a Drive file. */
export function fileText(s: VerSummary): string {
  return [
    `${s.company} — Verification record`,
    "".padEnd(40, "-"),
    `Reference:  ${s.reference}`,
    s.workflow ? `Workflow:   ${s.workflow}` : "",
    `Status:     ${s.statusLabel}`,
    `Stage:      ${s.stage}`,
    s.idType ? `ID type:    ${s.idType}` : "",
    s.country ? `Country:    ${s.country}` : "",
    s.score ? `Score:      ${s.score}` : "",
    `Time:       ${s.time} UTC`,
    `Session:    ${s.session}`,
    "",
    "Written by VeriSec. No personal data (names, document numbers, photos) is included.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
