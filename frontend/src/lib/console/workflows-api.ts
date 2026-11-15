/**
 * The Console API's workflow routes (backend/services/console/src/kyc/workflows*.ts): the
 * catalogue of checks and templates, an organisation's workflows, drafts and published versions.
 * Every call resolves (never throws) to `{ ok, data }` or `{ ok: false, message }`.
 */

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

/** `stage`: where the check's screens sit in the flow; a rule can only add a check after the fact it tests is known. */
export type CheckInfo = { id: string; name: string; price: number; available: boolean; note: string; stage: number };
export type FieldInfo = {
  id: string;
  label: string;
  kind: "countries" | "documentTypes" | "flag" | "number";
  source: string;
  min?: number;
  max?: number;
  unit?: string;
};
export type Condition = { field: string; values?: string[]; number?: number };
export type Rule = { when: Condition; then: "review" | "decline" | "require"; check?: string };
export type TemplateInfo = {
  id: string;
  name: string;
  summary: string;
  category: string;
  industries: string[];
  recommended: boolean;
  available: boolean;
  definition: Definition;
  /** The template's rules, in words. */
  rules: string[];
  price: { min: number; max: number };
  /** Document kinds a workflow from this template keeps (null: any the operator picks). */
  fixedDocumentTypes?: string[] | null;
};
export type Catalogue = {
  checks: CheckInfo[];
  documentTypes: string[];
  fields: FieldInfo[];
  presets: { highRisk: { id: string; label: string; countries: string[] } };
  categories: { id: string; name: string; summary: string }[];
  industries: string[];
  templates: TemplateInfo[];
};

export type WorkflowCheck = { id: string; required: boolean; onFail: "decline" | "review" };
export type Definition = {
  checks: WorkflowCheck[];
  rules: Rule[];
  settings: { faceMatchThreshold: number; documentTypes: string[]; minimumAge: number };
  decision: { mode: "auto" | "manual"; approveAt: number };
};

export type WorkflowStatus = "draft" | "active" | "archived";
export type WorkflowListItem = {
  id: string;
  name: string;
  /** The template it started from ("blank" for one built from scratch). */
  template: string | null;
  status: WorkflowStatus;
  version: number | null;
  /** The one new verifications run when none is picked. */
  isDefault: boolean;
  unpublishedChanges: boolean;
  /** Published and still exactly its template (picking that template runs this workflow). */
  matchesTemplate: boolean;
  checks: string[];
  price: number;
  priceRange: { min: number; max: number };
  updatedAt: string;
  uses: number;
  /** When a verification last started on it (null: never used). */
  lastUsedAt: string | null;
};
export type WorkflowDetail = {
  id: string;
  name: string;
  template: string | null;
  status: WorkflowStatus;
  version: number | null;
  draft: Definition;
  published: Definition | null;
  unpublishedChanges: boolean;
  versions: { version: number; published_at: string; published_by: string | null }[];
  uses: number;
  updatedAt: string;
};

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  try {
    const r = await fetch(`${API}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
    const j = (await r.json().catch(() => null)) as (T & { message?: unknown }) | null;
    if (!r.ok) {
      const m = j?.message;
      const message =
        r.status === 401
          ? "Sign in to manage workflows."
          : typeof m === "string"
            ? m
            : Array.isArray(m)
              ? m.join(" ")
              : "Something went wrong. Please try again.";
      return { ok: false, status: r.status, message };
    }
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the console. Check your connection and try again." };
  }
}

export const workflowsApi = {
  catalogue: () => call<Catalogue>("/api/workflows/catalogue"),
  list: () => call<{ workflows: WorkflowListItem[] }>("/api/workflows"),
  get: (id: string) => call<WorkflowDetail>(`/api/workflows/${encodeURIComponent(id)}`),
  create: (body: { template: string; name?: string }) => call<WorkflowDetail>("/api/workflows", { method: "POST", body: JSON.stringify(body) }),
  save: (id: string, body: { name: string; definition: Definition }) =>
    call<WorkflowDetail>(`/api/workflows/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  /** A new name only (the draft is kept as it is). */
  rename: (id: string, name: string) =>
    call<WorkflowDetail>(`/api/workflows/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ name }) }),
  publish: (id: string) => call<WorkflowDetail>(`/api/workflows/${encodeURIComponent(id)}/publish`, { method: "POST" }),
  archive: (id: string) => call<{ ok: true }>(`/api/workflows/${encodeURIComponent(id)}/archive`, { method: "POST" }),
  /** Archive several at once (the list's batch action); at least one workflow always stays active. */
  archiveMany: (ids: string[]) =>
    call<{ ok: true; archived: number }>("/api/workflows/archive", { method: "POST", body: JSON.stringify({ ids }) }),
  /** The organisation's archived workflows. */
  archived: () => call<{ workflows: ArchivedWorkflow[] }>("/api/workflows/archived"),
  /** Back from the archive (published: runs verifications again; never published: a draft again). */
  restore: (id: string) => call<{ ok: true; status: string }>(`/api/workflows/${encodeURIComponent(id)}/restore`, { method: "POST" }),
  /** Delete an archived workflow for good (its template stays in the gallery). */
  remove: (id: string) => call<{ ok: true }>(`/api/workflows/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** The FATF high-risk / monitored list in force, and any update waiting to be confirmed. */
  fatf: () => call<FatfState>("/api/fatf"),
  /** Apply the pending FATF update to every workflow that screens on FATF countries and the builder preset. */
  fatfApprove: () => call<{ ok: boolean; reason?: string; countries?: string[] }>("/api/fatf/approve", { method: "POST" }),
  /** Decline the pending FATF update (it is not offered again until it changes). */
  fatfDismiss: () => call<{ ok: boolean; reason?: string }>("/api/fatf/dismiss", { method: "POST" }),
};

/** The FATF list the rules screen against, and any proposed change (see FatfService on the server). */
export type FatfSnapshot = {
  blacklist: string[];
  greylist: string[];
  countries: string[];
  asOf: { blacklist: string | null; greylist: string | null };
  source: string;
};
export type FatfPending = FatfSnapshot & { added: string[]; removed: string[]; seenAt: string; fetchedAt: string };
export type FatfState = {
  active: FatfSnapshot & { approvedAt: string | null; approvedBy: string | null };
  pending: FatfPending | null;
  source: string;
  /** ISO alpha-2 to country name, for every code in the active list and the proposal. */
  names: Record<string, string>;
};

/** An archived workflow, as the Archived panel lists it. */
export type ArchivedWorkflow = {
  id: string;
  name: string;
  version: number | null;
  template: string | null;
  archivedAt: string;
  verifications: number;
  lastUsed: string | null;
};

/** The order checks run in the applicant flow (the server keeps the same order). */
export const FLOW_ORDER = ["document", "authenticity", "age", "face-match", "nfc", "liveness", "phone", "email", "aml", "device-ip", "address"];
/** Checks that only make sense with the ID document read. */
export const NEEDS_DOCUMENT = new Set(["authenticity", "age", "face-match", "nfc"]);
export const sortChecks = <T extends { id: string }>(checks: T[]) => [...checks].sort((a, b) => FLOW_ORDER.indexOf(a.id) - FLOW_ORDER.indexOf(b.id));

/** "$1.91/verif", as the frame prints a price. */
export const perVerification = (n: number) => `$${n.toFixed(2)}/verif`;

/** "Updated 3 hours ago". */
export function updatedAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "Updated just now";
  const m = Math.round(s / 60);
  if (m < 60) return `Updated ${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `Updated ${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `Updated ${d} day${d === 1 ? "" : "s"} ago`;
}

/** A price range, as the template gallery prints it. */
export const priceRange = (p: { min: number; max: number }) =>
  p.min === p.max ? perVerification(p.min) : `$${p.min.toFixed(2)} to $${p.max.toFixed(2)}/verif`;

const DOC_LABEL: Record<string, string> = {
  passport: "passport",
  "national-id": "national ID",
  licence: "driver's licence",
  "residence-permit": "residence permit",
};

/** "Document country is FATF high-risk and monitored (June 2026)". */
export function conditionSentence(c: Condition, cat: Catalogue): string {
  const f = cat.fields.find((x) => x.id === c.field);
  if (!f) return c.field;
  if (f.kind === "flag") return f.label;
  if (f.kind === "countries") {
    const preset = cat.presets.highRisk;
    const v = c.values ?? [];
    const same = v.length === preset.countries.length && v.every((x) => preset.countries.includes(x));
    return `${f.label} is ${same ? preset.label : v.length === 1 ? v[0] : `one of ${v.length} countries`}`;
  }
  if (f.kind === "documentTypes") return `${f.label} is ${(c.values ?? []).map((v) => DOC_LABEL[v] ?? v).join(" or ")}`;
  return `${f.label} ${c.number ?? ""}${f.unit ?? ""}`;
}

/** The condition inside a sentence ("if VPN detected", "when document country is ..."). */
export function conditionClause(c: Condition, cat: Catalogue): string {
  const cond = conditionSentence(c, cat);
  // keep acronyms and names as written (VPN, Tor, FATF); lower-case an ordinary first word
  return /^[A-Z][a-z]/.test(cond) && !/^Tor\b/.test(cond) ? cond[0]!.toLowerCase() + cond.slice(1) : cond;
}

/** "If VPN detected, add Face Liveness". */
export function ruleSentence(r: Rule, cat: Catalogue): string {
  const then =
    r.then === "review" ? "send to a person" : r.then === "decline" ? "decline" : `add ${cat.checks.find((c) => c.id === r.check)?.name ?? r.check}`;
  return `If ${conditionClause(r.when, cat)}, ${then}`;
}
