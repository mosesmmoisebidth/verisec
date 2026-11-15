/**
 * The console's data contract.
 *
 * This file is the handshake between the UI and whatever ends up feeding it.
 * Two rules keep that handshake cheap:
 *
 *   1. NOTHING here imports React, and every type is plain JSON. Icons, tones
 *      and verdicts are string unions, not components, so the whole payload can
 *      arrive from `fetch()` unchanged. If a field could not survive
 *      `JSON.parse(JSON.stringify(x))`, it does not belong in this file.
 *   2. Copy lives here too — panel titles, captions, button labels. The views
 *      render what they are handed and hold no strings of their own, so
 *      relabelling a panel or translating the screen never touches JSX.
 *
 * To wire this to a real backend, implement `getDashboardData()` in `./index.ts`
 * and return this shape. No component changes. See the note in that file.
 */

/* ----------------------------------------------------------------------------
   Shared vocabulary
---------------------------------------------------------------------------- */

/** Index into the `--color-ramp-*` scale, darkest first. */
export type Ramp = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Icon slots the shell knows how to draw. Add a case to the view's map too. */
export type NavIcon =
  | "dashboard"
  | "workflows"
  | "verifications"
  | "explorer"
  | "api-keys"
  | "webhooks"
  | "billing"
  | "team"
  | "settings";

export type KpiIcon = "verifications" | "pass" | "latency" | "uptime";

/**
 * A verification component — the atoms a workflow is built from. One key per
 * check the platform sells, resolved to a glyph by a map in the view. Adding a
 * check means a key here, an entry in that map, and a row in the demo data.
 */
export type ComponentIcon =
  | "document"
  | "authenticity"
  | "nfc"
  | "liveness"
  | "face-match"
  | "face-search"
  | "face-attributes"
  | "address"
  | "email"
  | "phone"
  | "aml"
  | "device-ip"
  | "database"
  | "age"
  | "questionnaire";

/** Which token colours a KPI delta. Not "good/bad" — the frame uses all three. */
export type DeltaTone = "pine" | "positive" | "uptime";

export type Verdict = "Approved" | "Needs review" | "Declined" | "Abandoned" | "In progress" | "Disabled";

/**
 * A table cell. A bare string renders as text; the object form renders a tag,
 * which is how severity and the "Slow" marker stay data rather than JSX.
 */
export type Cell = string | number | null | { tag: string; tone: "neutral" | "caution" | "danger" };

export interface TableColumn {
  /** Matches a key in each row object. */
  key: string;
  header: string;
  /** Defaults to left for the first column, right for the rest. */
  align?: "left" | "right";
  /** The frame's column width in px. Converted to `fr`, so ratios are kept. */
  width: number;
  /** Renders the cell in medium weight — the frame's first column. */
  emphasis?: boolean;
  /** Renders the cell in the muted token. */
  muted?: boolean;
}

export interface TableSpec {
  title: string;
  columns: TableColumn[];
  rows: Record<string, Cell>[];
  /** Shown instead of the table when there is nothing to list yet (live data). */
  empty?: string;
}

/* ----------------------------------------------------------------------------
   Shell
---------------------------------------------------------------------------- */

export interface NavItem {
  label: string;
  icon: NavIcon;
  href: string;
  /** Unread/pending count. Omit for none — 0 still renders a badge. */
  badge?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface Account {
  org: string;
  name: string;
  email: string;
  /** Precomputed so the view never has to guess how to abbreviate a name. */
  initials: string;
}

export interface UpgradeCard {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
}

/** Colours the small dot on a notification row. */
export type NotificationTone = "info" | "success" | "warning" | "danger";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  /** Relative time, preformatted (e.g. "2m ago"). */
  time: string;
  /** Unlit once read; drives the row tint and the count on the bell. */
  unread?: boolean;
  href?: string;
  tone?: NotificationTone;
}

export interface ShellData {
  account: Account;
  nav: NavGroup[];
  /** Path of the current page, matched against `NavItem.href`. */
  currentPath: string;
  upgrade: UpgradeCard | null;
  /** Which API environment the console is pointed at. */
  env: "test" | "live";
  envLabels: { test: string; live: string };
  /** Set while Live is not open: Live shows locked, with this as its reason. */
  liveLocked?: string;
  /** Unread count — the number of `notifications` with `unread: true`. */
  unread: number;
  /** Rows in the bell's dropdown, newest first. */
  notifications: NotificationItem[];
  /** Header + empty-state copy for that dropdown. */
  notificationsLabel: string;
  notificationsEmpty: string;
  markAllReadLabel: string;
  viewAllLabel: string;
  searchPlaceholder: string;
}

/* ----------------------------------------------------------------------------
   Panels
---------------------------------------------------------------------------- */

export interface Kpi {
  icon: KpiIcon;
  label: string;
  value: string;
  delta: string;
  /** "none": nothing to compare with yet, so no arrow. */
  trend: "up" | "down" | "none";
  tone: DeltaTone;
  /** The lead card carries the lime gradient. At most one. */
  feature?: boolean;
}

export interface Slice {
  label: string;
  percent: number;
  ramp: Ramp;
}

export interface Segment extends Slice {
  /** Label the segment in place. The view still hides it when too narrow. */
  inline?: boolean;
}

export interface BarItem {
  label: string;
  /** What is printed at the end of the row. */
  display: string;
  /** Drives bar width, relative to the largest item in its own list. */
  value: number;
}

/** Axis config travels with its series so a chart never invents its own scale. */
export interface Axis {
  /** Top of the y scale. Omit and the view derives a rounded ceiling. */
  max?: number;
  /** Y gridline values. Omit and the view divides `max` into four. */
  yTicks?: number[];
  /** Which x values get a printed label. Omit to label every 5th point. */
  xTicks?: string[];
}

export interface VolumePoint {
  date: string;
  total: number;
  approved: number;
}

export interface LatencyPoint {
  date: string;
  p50: number;
  p95: number;
  p99: number;
}

export interface ErrorPoint {
  date: string;
  c4xx: number;
  c5xx: number;
}

export interface DonutPanel {
  title: string;
  slices: Slice[];
  centerLabel?: string;
  centerValue?: string;
  /** Shown instead of the chart when the period has nothing to draw (live data). */
  empty?: string;
}

export interface BarPanel {
  title: string;
  items: BarItem[];
  empty?: string;
}

export interface StatPanel {
  title: string;
  value: string;
  caption?: string;
}

export interface QueueTile {
  label: string;
  value: string;
  cta: string;
  href: string;
}

export interface ActivityRow {
  name: string;
  /** Session reference. Never a document number. */
  ref: string;
  workflow: string;
  /** Null until the verification is decided. */
  score: number | null;
  verdict: Verdict;
  href: string;
}

/* ----------------------------------------------------------------------------
   Workflows, list (Desktop-22) + template dialog (Desktop-31)
---------------------------------------------------------------------------- */

export interface WorkflowChip {
  label: string;
  icon: ComponentIcon;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  status: "active" | "draft";
  /**
   * Per-verification price, pre-formatted.
   *
   * A workflow's price is DERIVED from its enabled components, never stored
   * independently — see `priceOf()` in `./demo-data.ts`. Storing it would let
   * this card and the builder disagree the first time somebody toggles a check.
   */
  price: string;
  chips: WorkflowChip[];
  updated: string;
  href: string;
}

export interface WorkflowTemplate {
  name: string;
  priceRange: string;
  /** Gradient endpoints for the card's banner. */
  from: string;
  to: string;
  href: string;
  /** Live picker: what to create from (a template id), and a tile that cannot be picked yet. */
  id?: string;
  summary?: string;
  disabled?: boolean;
  badge?: string;
}

export interface TemplatePicker {
  title: string;
  searchPlaceholder: string;
  /** No-template option, rendered as the dashed first tile. */
  scratch: { label: string; href: string };
  templates: WorkflowTemplate[];
  emptyLabel: string;
}

export interface WorkflowsData {
  title: string;
  countLabel: string;
  count: number;
  newLabel: string;
  cards: WorkflowSummary[];
  picker: TemplatePicker;
}

/* ----------------------------------------------------------------------------
   Workflow builder (Desktop-32)
---------------------------------------------------------------------------- */

export interface WorkflowComponentRow {
  id: string;
  name: string;
  icon: ComponentIcon;
  price: string;
  enabled: boolean;
  /** Gated behind a plan. Rendered dimmed with a lock and cannot be toggled. */
  locked?: boolean;
}

export interface FlowStep {
  id: string;
  name: string;
  /** "Required" / "Optional". */
  requirement: string;
  /** What a non-pass does: "pass" / "review" / "fail". */
  outcome: string;
  price: string;
}

export interface StepSettings {
  stepName: string;
  subtitle: string;
  /** Shown when a step exposes nothing to configure. */
  note: string;
  passRuleLabel: string;
  passRule: string;
  passRuleOptions: string[];
  requiredLabel: string;
  required: boolean;
}

export interface BuilderFooter {
  decisionModeLabel: string;
  decisionMode: string;
  decisionModes: string[];
  threshold: number;
  thresholdMax: number;
  testLabel: string;
  saveLabel: string;
}

export interface WorkflowBuilderData {
  id: string;
  name: string;
  breadcrumb: { label: string; href: string };
  componentsTitle: string;
  components: WorkflowComponentRow[];
  flowTitle: string;
  /** Sum of the enabled components. Derived, never stored. */
  flowPrice: string;
  steps: FlowStep[];
  settingsTitle: string;
  settings: StepSettings;
  footer: BuilderFooter;
}

/* ----------------------------------------------------------------------------
   The whole screen
---------------------------------------------------------------------------- */

export interface DashboardData {
  header: {
    title: string;
    lastSyncLabel: string;
    lastSync: string;
    /** Select options. First entry of each is the initial value. */
    ranges: string[];
    workflows: string[];
    exportLabel: string;
    newSessionLabel: string;
  };
  kpis: Kpi[];
  volume: { title: string; points: VolumePoint[]; axis: Axis; empty?: string };
  outcomes: DonutPanel;
  failingChecks: BarPanel;
  declineReasons: BarPanel;
  connections: { title: string; segments: Segment[]; empty?: string };
  ipMismatch: StatPanel;
  latency: { title: string; points: LatencyPoint[]; axis: Axis; empty?: string };
  errors: { title: string; points: ErrorPoint[]; axis: Axis; empty?: string };
  uptime: { title: string; value: string; incidents: TableSpec };
  webhooks: DonutPanel;
  endpoints: TableSpec;
  queues: QueueTile[];
  workflowTracking: TableSpec;
  processing: { title: string; tiles: { label: string; value: string }[]; note: string };
  slowestChecks: BarPanel;
  activity: { title: string; cta: string; rows: ActivityRow[]; empty?: string };
}

/** Everything one render of the console needs. */
export interface ConsoleData {
  shell: ShellData;
  dashboard: DashboardData;
  workflows: WorkflowsData;
  /** Builder payloads keyed by workflow id. */
  builders: Record<string, WorkflowBuilderData>;
}

/* ----------------------------------------------------------------------------
   Verifications, the list (Desktop-26) and the nine-tab detail
   (Desktop-33 · 51 · 52 · 53 · 54 · 55 · 56 · 57 · 58)

   The detail is one record with one payload per tab. Every payload is optional:
   a verification that never ran a check has no data for its tab, and the view
   says so rather than drawing an empty shell that reads as "all clear". That
   distinction matters more here than anywhere else in the console, a blank
   AML panel and a clean AML panel must never look alike.
---------------------------------------------------------------------------- */

/** How a single check came out. `pending` is "not run", not "not yet passed". */
export type CheckOutcome = "pass" | "fail" | "review" | "pending";

/** A term/detail pair. The frames' `Descriptions` node, everywhere it appears. */
export interface FactPair {
  term: string;
  detail: string;
  /** Renders monospaced — MRZ lines, fingerprints, serials. */
  mono?: boolean;
}

export interface CheckRow {
  label: string;
  outcome: CheckOutcome;
  /** Why, in a few words (live records). */
  note?: string;
}

/** A flagged finding, shown as a badge (live records). */
export interface DetailFlag {
  label: string;
  severity: "info" | "warn" | "critical";
}

/** One titled block of evidence inside a tab (live records): facts, checks, or raw JSON. */
export interface DetailGroup {
  title: string;
  facts?: FactPair[];
  checks?: CheckRow[];
  raw?: string;
  /** Long blocks start folded. */
  collapsed?: boolean;
  /** "rows": label on the left, the full detail on the right, one entry per line (long text). */
  layout?: "grid" | "rows";
}

/**
 * One badge on the Trust Seal.
 *
 * `on` is the whole point: the AML tab's own copy says the AML-clear badge
 * shows "dim until it's live for your account", so an unlit badge means the
 * check did not run — not that it ran and failed.
 */
export interface SealBadge {
  label: string;
  on: boolean;
}

/** A row in the verifications list. */
export interface VerificationRow {
  id: string;
  reference: string;
  applicant: string;
  /** Precomputed so the view never has to guess how to abbreviate a name. */
  initials: string;
  document: string;
  country: string;
  /** The workflow it runs. */
  workflow: string;
  /** Where an unfinished session is ("At document (14%)"), or "Redacted"; absent once it is decided. */
  stage?: string | null;
  score: number;
  verdict: Verdict;
  when: string;
  /** The record's status (live rows only): what its menu offers (Disable while it runs, Enable once disabled). */
  status?: "in_progress" | "completed" | "redacted" | "disabled";
}

export interface FilterSpec {
  name: string;
  /** First entry is the initial value. */
  options: string[];
}

export interface VerificationsListData {
  title: string;
  liveLabel: string;
  liveCount: number;
  newSessionLabel: string;
  searchPlaceholder: string;
  filters: FilterSpec[];
  columns: { key: string; header: string; width: number; align?: "left" | "right" }[];
  rows: VerificationRow[];
  pagination: {
    rowsLabel: string;
    /** `null` renders the ellipsis gap. */
    pages: (number | null)[];
    current: number;
    previousLabel: string;
    nextLabel: string;
  };
}

export type VerificationTabId =
  | "overview"
  | "document"
  | "face"
  | "nfc"
  | "aml"
  | "device-ip"
  | "contact"
  | "address"
  | "timeline";

export interface VerificationTab {
  id: VerificationTabId;
  label: string;
}

/** A captured image slot. No `src` yet — see the note in the view. */
export interface CaptureSlot {
  label: string;
  caption?: string;
  /** A public sample image to fill the slot (shown under a SAMPLE ribbon). */
  image?: string;
  /** The applicant's actual capture from the encrypted store (no SAMPLE ribbon). */
  real?: boolean;
  /** Captured, but the person's role does not show images (the console sent no link). */
  hidden?: boolean;
}

export interface OverviewTab {
  factsTitle: string;
  facts: FactPair[];
  checksTitle: string;
  checks: CheckRow[];
  flags?: DetailFlag[];
  groups?: DetailGroup[];
}

export interface DocumentTab {
  /** Live records: every upload, accepted or refused. */
  attempts?: AttemptView[];
  /** Live records: false while no upload was accepted (only refused ones so far). */
  accepted?: boolean;
  /** Live records: the printed details checked against the barcode / MRZ, detail by detail. */
  crossMatch?: { agree: boolean; fields: { label: string; agree: boolean; sources: string[] }[] } | null;
  captures: CaptureSlot[];
  fieldsTitle: string;
  fields: FactPair[];
  metricsTitle: string;
  metrics: CheckRow[];
  flags?: DetailFlag[];
  groups?: DetailGroup[];
  /** Live records: a one-line summary of what the document is. */
  summary?: { label: string; value: string }[];
  /** Live records: every field the engine read, grouped by field type (never a fixed list). */
  fieldGroups?: { title: string; fields: DocumentField[] }[];
  /** Live records: the document checks by area (authenticity, image quality, issues...). */
  checkGroups?: { title: string; checks: CheckRow[] }[];
  mrz?: { format: string | null; lines: string[] } | null;
  /** The photo cut from the document, when the face step captured it. */
  portrait?: string;
  /** The issuing country (alpha-2, alpha-3 or a name, as the record holds it), for its flag. */
  country?: { code: string; name: string };
}

/** One field read from a document. */
export interface DocumentField {
  label: string;
  value: string;
  mono?: boolean;
  /** Where the value was read: VISUAL, MRZ, BARCODE, RFID. */
  sources?: string[];
  /** pass: the sources agree; fail: they disagree; pending: not checked. */
  status?: CheckOutcome;
  crossChecked?: boolean;
}

/** How far the applicant got (live records). */
export interface VerificationProgress {
  /** `failed`: how many tries at the stage failed; `problem`: the latest try failed, and how. */
  stages: { id: string; label: string; state: "done" | "current" | "todo" | "skipped"; at?: string; failed?: number; problem?: string; warning?: string }[];
  percent: number;
  state: "completed" | "in_progress" | "abandoned" | "redacted";
  /** The stage the applicant is on, or stopped at. */
  at?: string;
  lastActivity: string;
  lastActivityAgo: string;
}

/** One line of the Trust Seal's breakdown. */
export interface TrustPart {
  label: string;
  weight: number;
  /** null: the check did not run. */
  score: number | null;
  points: number;
  notes: string[];
  knockout?: string;
}

export interface FaceTab {
  /** Live records: every liveness check and face match, passed or failed. */
  attempts?: AttemptView[];
  captures: CaptureSlot[];
  similarity: { label: string; value: string; score?: number; bands?: { decline: number; review: number } };
  liveness: { label: string; detail: string; tag: string };
  /** Live records: how the two faces were compared, in words (never the engine's raw answer). */
  comparison?: {
    images: { label: string; faces: number; read: boolean }[];
    pair: string | null;
    similarity: number;
    threshold: number;
    matched: boolean;
    seconds: number | null;
  } | null;
  spoofTitle: string;
  /** 0–100. The frame draws these as bars against a full-width track. */
  spoof: { label: string; value: number }[];
  attributes: FactPair[];
  flags?: DetailFlag[];
  groups?: DetailGroup[];
}

export interface NfcTab {
  banner: { title: string; detail: string };
  checksTitle: string;
  checks: CheckRow[];
  certificates: { title: string; rows: FactPair[] }[];
}

export interface AmlTab {
  notice: { title: string; body: string; tag: string };
  /** Drawn dim: the screens exist as a product but not yet as a result. */
  screens: { label: string; icon: ComponentIcon }[];
  /** Live records: the screening's real results replace the dim tiles. */
  flags?: DetailFlag[];
  groups?: DetailGroup[];
  /** One block per list entry the name was compared with, strongest first. */
  matches?: { title: string; status: "confirmed" | "possible" | "discounted"; groups: DetailGroup[] }[];
}

export interface DeviceTab {
  facts: FactPair[];
  /** What raised the device risk score, largest first (live records only). */
  reasons?: { label: string; points: number }[];
  flags?: DetailFlag[];
  /** One run of groups per device the applicant used. */
  devices?: { title: string; groups: DetailGroup[] }[];
}

/** One collapsible section of the phone or email card. */
export interface ChannelSection {
  label: string;
  rows: FactPair[];
  /** The frame leaves exactly one section of each card open. */
  open?: boolean;
}

export interface ContactTab {
  metrics: { label: string; value: string }[];
  risk: { label: string; value: string };
  decision: { label: string; value: string };
  reasonCodes: string[];
  /** Live records: the same signals in words, with what each means. */
  reasons?: { label: string; tone: "pass" | "warn" | "fail" | "na" }[];
  channels: { title: string; icon: ComponentIcon; sections: ChannelSection[] }[];
  consistency: {
    title: string;
    pairs: {
      left: { label: string; icon: ComponentIcon };
      right: { label: string; icon: ComponentIcon };
      /** Live records: the two values compared, the result, and why. */
      leftValue?: string | null;
      rightValue?: string | null;
      outcome?: CheckOutcome;
      note?: string;
    }[];
  };
  velocity: { title: string; rows: { label: string; value: string; note?: string; outcome?: CheckOutcome }[] };
  explain: { title: string; verdictTag: string; riskTag: string; summary: string; codes: string[] };
}

export interface AddressTab {
  documentsTitle: string;
  documents: CaptureSlot[];
  address: { label: string; value: string };
  facts: FactPair[];
  /** Live records: proof of address for reviewers, structured. */
  poa?: {
    status: { outcome: CheckOutcome; title: string; detail: string };
    document: FactPair[];
    address: {
      parts: { label: string; value: string; edited: boolean }[];
      country: string | null;
      readAs: string | null;
      confirmed: boolean;
      source: string;
    };
    checks: CheckRow[];
    details: { label: string; value: string }[];
    /** Every reason the reader raised, forgery signals included (never shown to the applicant). */
    reviewer: CheckRow[];
    integrity: FactPair[];
  };
}

export type TimelineIcon =
  | "created"
  | "opened"
  | "document"
  | "selfie"
  | "match"
  | "nfc"
  | "decision"
  | "phone"
  | "email"
  | "screening"
  | "address"
  | "link"
  | "disabled"
  | "enabled"
  | "device";

/** How a timeline entry went: passed, failed, needs a look, or just something that happened. */
export type TimelineTone = "pass" | "fail" | "review" | "info";

/** One try at a step: a document upload (accepted or refused), a liveness check, a face match. */
export interface AttemptView {
  /** Its number among tries of the same kind (documents 1, 2...; face checks 1, 2...). */
  n: number;
  kind: "document" | "liveness" | "face-match";
  /** `retake`: the right document, but its photo did not pass (glare, not sharp); `not-accepted`: stopped for another reason. */
  outcome: "accepted" | "refused" | "retake" | "not-accepted" | "passed" | "failed" | "error" | "cancelled";
  ok: boolean;
  title: string;
  at: string;
  iso: string;
  /** Document: what the workflow accepts, and what the image turned out to be. */
  expected?: string[];
  seen?: string;
  seenName?: string;
  country?: string;
  /** Its own image (absent when the role may not see images: then `hidden`). */
  image?: string | null;
  hidden?: boolean;
  /** Face match: reached and needed, 0..1. */
  similarity?: number;
  threshold?: number;
  reason?: string;
  mode?: string;
  /** Document: the details the front and back agreed on, out of how many were compared. */
  matched?: string[];
  compared?: number;
  /** Accepted, with a warning (a photo let through despite low quality). */
  warn?: boolean;
}

export interface TimelineTab {
  events: { at: string; iso?: string; label: string; icon: TimelineIcon; tone?: TimelineTone; attempt?: AttemptView }[];
}

export interface VerificationDetail {
  id: string;
  reference: string;
  applicant: string;
  verdict: Verdict;
  backLabel: string;
  backHref: string;
  downloadLabel: string;
  seal: {
    score: number;
    label: string;
    badges: SealBadge[];
    /** Live records: the session is not finished, so the seal is not issued yet. */
    provisional?: boolean;
    breakdown?: TrustPart[];
    policy?: string;
    /** The weighted score before the verdict rule capped it. */
    raw?: number;
    rule?: "knockout" | "missing" | "review" | "low" | "clear";
    knockouts?: string[];
    missing?: string[];
    reviews?: string[];
    /** Security checks that did not stop the result (the barcode read, front and back agree) but need a look. */
    internalChecks?: string[];
  };
  /** Live records: how far the applicant got. */
  progress?: VerificationProgress;
  /** Copy for a tab whose check did not run. */
  emptyLabel: string;
  overview: OverviewTab | null;
  document: DocumentTab | null;
  face: FaceTab | null;
  nfc: NfcTab | null;
  aml: AmlTab | null;
  deviceIp: DeviceTab | null;
  contact: ContactTab | null;
  address: AddressTab | null;
  timeline: TimelineTab | null;
  /** Live records: shown under the Trust Seal. Flags always, plus the open tab's summary. */
  side?: { flags?: Partial<Record<VerificationTabId, DetailFlag[]>>; groups?: Partial<Record<VerificationTabId, DetailGroup[]>> };
}

/* ----------------------------------------------------------------------------
   API Keys & Playground, Desktop-44 · 45 · 46 · 47 · 48

   One screen, four tabs. Two of them are drawn; two are not, see `logs` and
   `sdks` on `ApiKeysData`.
---------------------------------------------------------------------------- */

export type ApiTabId = "keys" | "playground" | "logs" | "sdks";

export interface ApiTab {
  id: ApiTabId;
  label: string;
  /** A small pill after the label, e.g. "Coming soon". */
  badge?: string;
}

/** live vs test. Drives the chip in the table and the playground's toggle. */
export type ApiEnv = "live" | "test";

/**
 * One row of the keys table.
 *
 * `key` ARRIVES MASKED and must stay that way. A secret is shown once, at
 * creation; a list endpoint that returns whole keys turns every screenshot of
 * this page into a credential leak. The mask is the server's job, not a
 * `slice()` in the view.
 */
export interface ApiKeyRow {
  id: string;
  name: string;
  key: string;
  env: ApiEnv;
  scope: string;
  rateLimit: string;
  /** `null` renders the frame's em dash: created but never called. */
  lastUsed: string | null;
  status: "active" | "revoked";
}

/** The Create API key dialog — Desktop-48. */
export interface CreateKeyForm {
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  envLabel: string;
  envOptions: string[];
  permissionsLabel: string;
  /** `on` is the frame's pre-checked state, not a stored grant. */
  permissions: { label: string; on: boolean }[];
  rateLabel: string;
  rateOptions: string[];
  submitLabel: string;
  closeLabel: string;
}

export interface ApiKeysTab {
  columns: { key: string; header: string; width: number; align?: "left" | "right" }[];
  rows: ApiKeyRow[];
  copyLabel: string;
  revokeLabel: string;
  revokedLabel: string;
  /** Stands in for `lastUsed: null`. */
  neverUsedLabel: string;
  create: CreateKeyForm;
}

/** One request parameter. Rendered as a real pair of inputs. */
export interface RequestParam {
  name: string;
  value: string;
}

/** The response block's syntax colouring is derived from the body, not stored. */
export interface PlaygroundTab {
  method: string;
  endpoints: string[];
  savedLabel: string;
  envs: string[];
  activeEnv: string;
  /** Masked, for the same reason as `ApiKeyRow.key`. */
  keyLabel: string;
  manageKeysLabel: string;
  manageKeysHref: string;
  saveTestLabel: string;
  historyLabel: string;
  /** The "Save your test" modal the Save Test button opens — Desktop-67. */
  saveTest: {
    title: string;
    nameLabel: string;
    namePlaceholder: string;
    saveLabel: string;
    closeLabel: string;
  };
  /** The "Run history" drawer the History button opens. */
  history: {
    title: string;
    closeLabel: string;
    runs: {
      method: string;
      endpoint: string;
      status: string;
      /** true = 2xx (green), false = error (red). */
      ok: boolean;
      latency: string;
      when: string;
    }[];
  };
  request: {
    title: string;
    url: string;
    methods: string[];
    sendLabel: string;
    tabs: string[];
    loadSampleLabel: string;
    /** Query Params tab — editable name/value rows. */
    params: RequestParam[];
    removeParamLabel: string;
    addParamLabel: string;
    /** Headers tab — a name/value list. */
    headers: RequestParam[];
    /** Body tab — a JSON request body. */
    body: string;
    /** Auth tab — the bearer token in use. */
    auth: {
      label: string;
      token: string;
      copyLabel: string;
      manageLabel: string;
      manageHref: string;
    };
  };
  response: {
    title: string;
    exportLabel: string;
    statusLabel: string;
    status: string;
    latency: string;
    size: string;
    tabs: string[];
    copyLabel: string;
    /** Response tab — pretty-printed JSON, tokenised for colour at render time. */
    body: string;
    /** Headers tab — the response header list. */
    headers: RequestParam[];
    /** Code tab — a client snippet per language. */
    code: { languages: string[]; activeLanguage: string; snippet: string };
  };
}

/** One request-log row — Desktop-46. */
export interface LogRow {
  method: string;
  path: string;
  status: number;
  latency: string;
  when: string;
}

export interface LogsTab {
  columns: { endpoint: string; status: string; latency: string; when: string };
  rows: LogRow[];
}

/** One platform card — Desktop-47. */
export interface SdkCard {
  key: string;
  label: string;
  icon:
    | "web"
    | "ios"
    | "android"
    | "react"
    | "flutter"
    | "node"
    | "python"
    | "go"
    | "java"
    | "dotnet"
    | "php"
    | "ruby";
  install: string;
  docsLabel: string;
  docsHref: string;
  /** Where it is published, shown as a small tag (e.g. "npm", "pub.dev", "JitPack"). */
  registry?: string;
  /** This one platform is not published yet: it shows a "Coming soon" badge and the install cannot be copied. */
  soon?: boolean;
}

export interface SdksTab {
  copyLabel: string;
  /** Badge text on a single platform that is not published yet (e.g. "Coming soon"). */
  soonBadge?: string;
  cards: SdkCard[];
  /** Legacy: the whole tab is pre-release — every card says so and nothing can be copied. */
  comingSoon?: { badge: string; title: string; body: string; linkLabel: string; linkHref: string };
}

export interface ApiKeysData {
  title: string;
  createLabel: string;
  tabs: ApiTab[];
  /** Copy for a tab the frames name but never draw. */
  emptyTitle: string;
  emptyBody: string;
  keys: ApiKeysTab | null;
  playground: PlaygroundTab | null;
  /** Desktop-46: a request-log table. Desktop-47: platform SDK cards. */
  logs: LogsTab | null;
  sdks: SdksTab | null;
}

/* ----------------------------------------------------------------------------
   Webhooks, Desktop-23 · 25
---------------------------------------------------------------------------- */

/**
 * A delivery attempt's outcome.
 *
 * Three states, because a delivery has three: it arrived, it did not, or it is
 * still being tried. Deliberately NOT a verdict: a delivery log answers "did my
 * server get it?", not what the check concluded.
 */
export type DeliveryStatus = "delivered" | "failed" | "pending";

/** Which portal's endpoints and events a Webhooks screen shows. */
export type WebhookPortal = "kyc" | "fin";

/** The Add webhook endpoint dialog, Desktop-25. */
export interface AddEndpointForm {
  title: string;
  urlLabel: string;
  urlPlaceholder: string;
  envLabel: string;
  envOptions: string[];
  /** Shown under the environment when Live is chosen. */
  liveHint: string;
  eventsLabel: string;
  submitLabel: string;
  closeLabel: string;
}

/**
 * The words around the Webhooks screen (Desktop-23). The endpoints, the event
 * catalogue and the delivery log are live, from /api/webhooks in the browser;
 * nothing here is data.
 */
export interface WebhooksData {
  portal: WebhookPortal;
  title: string;
  addLabel: string;
  labels: {
    events: string;
    secret: string;
    rotate: string;
    test: string;
    log: string;
    /** Event, Status, Response, When. */
    logColumns: string[];
    resend: string;
    refresh: string;
    remove: string;
  };
  /** No endpoint yet. */
  empty: { title: string; body: string };
  add: AddEndpointForm;
}

/**
 * The words around the Integrations screen. Apps, automations and runs are live, from
 * /api/integrations in the browser; nothing here is data.
 */
export interface IntegrationsData {
  title: string;
  intro: string;
  /** What never reaches a connected app. */
  privacy: string;
  /** Shown when the server has no Composio key yet. */
  notConfigured: string;
  apps: {
    title: string;
    body: string;
    connect: string;
    empty: string;
    /** The home page's apps, offered first. */
    suggested: { slug: string; name: string }[];
  };
  automations: { title: string; body: string; add: string; empty: string };
  feed: { title: string; body: string; live: string; test: string; needsAutomation: string };
  labels: {
    test: string;
    runs: string;
    /** Event, Status, The app's answer, When. */
    runColumns: string[];
    refresh: string;
    remove: string;
    save: string;
  };
}

/* ----------------------------------------------------------------------------
   Usage & Billing, Desktop-34
---------------------------------------------------------------------------- */

export interface RateRow {
  name: string;
  /** Preformatted; the source of truth is the catalogue, not this string. */
  price: string;
  /** "AML Screening $0.80 (soon)" — sold but not yet live. */
  note?: string;
}

export interface Invoice {
  id: string;
  date: string;
  amount: string;
  downloadLabel: string;
}

export interface BillingData {
  title: string;
  wallet: {
    label: string;
    balance: string;
    caption: string;
    cta: string;
  };
  budget: {
    label: string;
    amount: string;
    /** Slider bounds and position, so the thumb is not a hard-coded percentage. */
    min: number;
    max: number;
    value: number;
    hardStopLabel: string;
    hardStop: boolean;
  };
  activate: {
    label: string;
    /** DERIVED from the catalogue — see `demo-billing.ts`. */
    body: string;
    cta: string;
  };
  usage: {
    title: string;
    points: { label: string; value: number }[];
    axisLabel: string;
  };
  rates: { title: string; rows: RateRow[] };
  invoices: { title: string; rows: Invoice[] };
}

/* ----------------------------------------------------------------------------
   Team, Desktop-24
---------------------------------------------------------------------------- */

export type MemberStatus = "active" | "invited" | "deactivated";

export interface TeamMember {
  id: string;
  name: string;
  /** Precomputed, like `VerificationRow.initials`. */
  initials: string;
  email: string;
  role: string;
  status: MemberStatus;
  /** `null` for an invite that has never been accepted. */
  lastActive: string | null;
  /** Live only: the role's id ("admin"…), the signed-in person's own row, when they were invited. */
  roleId?: string;
  isMe?: boolean;
  invitedAt?: string;
  /** Live only: what they may do (their role's permissions with their own changes), and whether it differs from the role. */
  permissions?: string[];
  customPermissions?: boolean;
}

export type MemberAction = "view" | "role" | "permissions" | "deactivate" | "activate" | "edit" | "delete" | "resend" | "transfer";

export interface ActionItem {
  id: MemberAction;
  label: string;
}

/** One of the three confirm dialogs — Delete / Activate / Deactivate. */
export interface ConfirmCopy {
  title: string;
  /** `{name}` is replaced with the member's name at render time. */
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "destructive" | "affirm" | "warn";
  /**
   * Decorative artwork, when the frame supplied some.
   *
   * OPTIONAL ON PURPOSE. Two of the three dialogs have art and the third does
   * not, so the view has to handle both — and typing it as required would mean
   * inventing a file for Deactivate. Intrinsic dimensions travel with the src
   * so the image reserves its space before it loads.
   */
  illustration?: { src: string; width: number; height: number };
}

export interface InviteForm {
  title: string;
  emailLabel: string;
  emailPlaceholder: string;
  roleLabel: string;
  roles: string[];
  submitLabel: string;
  closeLabel: string;
}

export interface TeamData {
  title: string;
  inviteLabel: string;
  columns: { key: string; header: string; width: number; align?: "left" | "right" }[];
  members: TeamMember[];
  neverActiveLabel: string;
  actionsLabel: string;
  actions: ActionItem[];
  confirm: Record<"delete" | "activate" | "deactivate" | "transfer", ConfirmCopy>;
  invite: InviteForm;
  pagination: {
    rowsLabel: string;
    rowsOptions: string[];
    /** `null` renders the ellipsis gap. */
    pages: (number | null)[];
    current: number;
    previousLabel: string;
    nextLabel: string;
  };
}

/* ----------------------------------------------------------------------------
   Settings, Profile · Business · Security · Data & Retention · Notifications
   · Branding · Danger zone.

   Built to the Figma frames (Desktop 35/37/50/39/40/41/49): one card per tab,
   icon-led fields, lime Save/Connect/Export. As everywhere in the console, no
   component holds a label of its own, every string arrives in this payload.
---------------------------------------------------------------------------- */

export type SettingsTabId =
  | "profile"
  | "business"
  | "security"
  | "data"
  | "notifications"
  | "branding"
  | "danger";

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  /** The Danger zone tab renders its active state in red. */
  danger?: boolean;
}

/** The leading glyph a field carries, matching the frames. */
export type SettingFieldIcon =
  | "user"
  | "mail"
  | "lock"
  | "globe"
  | "building"
  | "info"
  | "clock"
  | "link"
  | "list";

/** An icon-led control, rendered as a real input / select. */
export interface SettingField {
  key: string;
  label: string;
  kind: "text" | "email" | "password" | "tel" | "url" | "select" | "country" | "readonly";
  icon: SettingFieldIcon;
  value?: string;
  placeholder?: string;
  options?: string[];
  /** Grid span when two fields share a row. Defaults to full. */
  span?: "half" | "full";
}

/** The photo/logo tile with its ⋯ actions menu. */
export interface SettingAvatar {
  label: string;
  initials: string;
  actions: string[];
}

/** A label + switch, sitting inline in a card (no border of its own). */
export interface SettingToggle {
  label: string;
  on: boolean;
}

/** The 3-step "enable two-factor authentication" wizard — Desktop-59/60/61. */
export interface TwoFactorSetup {
  qrImage: string;
  cancelLabel: string;
  backLabel: string;
  continueLabel: string;
  finishLabel: string;
  closeLabel: string;
  scan: { title: string; subtitle: string; manualLabel: string; manualCode: string };
  verify: { title: string; subtitle: string };
  backup: {
    title: string;
    subtitle: string;
    codes: string[];
    copyLabel: string;
    downloadLabel: string;
    savedLabel: string;
  };
}

export interface ProfileSettings {
  photo: SettingAvatar;
  name: SettingField;
  email: SettingField;
  password: SettingField;
  twoFactor: SettingToggle;
  /** Opens when the two-factor toggle is switched on. */
  twoFactorSetup: TwoFactorSetup;
  language: SettingField;
  save: string;
}

export interface BusinessSettings {
  photo: SettingAvatar;
  name: SettingField;
  industry: SettingField;
  tenantId: SettingField;
  transfer: string;
}

export interface AuditRow {
  time: string;
  actor: string;
  action: string;
}

export interface SecuritySettings {
  enforce2fa: SettingToggle;
  sso: { label: string; connect: string };
  sessionTimeout: SettingField;
  ipAllowlist: SettingField;
  audit: { label: string; rows: AuditRow[] };
  password: SettingField;
  export: string;
}

export interface DataSettings {
  enforce2fa: SettingToggle;
  retention: SettingField;
  region: SettingField;
  note: string;
  exportData: string;
  deleteData: string;
}

export interface NotificationRow {
  key: string;
  label: string;
  email: boolean;
  inApp: boolean;
  slack: boolean;
}

export interface NotificationSettings {
  columns: { event: string; email: string; inApp: string; slack: string };
  rows: NotificationRow[];
  slack: { title: string; description: string; connect: string };
}

export interface BrandingSettings {
  companyName: SettingField;
  returnUrl: SettingField;
  customDomain: SettingField;
  save: string;
}

export interface DangerCard {
  key: string;
  title: string;
  description: string;
  action: string;
  tone: "neutral" | "danger";
}

export interface DangerSettings {
  cards: DangerCard[];
}

export interface SettingsData {
  title: string;
  tabs: SettingsTab[];
  profile: ProfileSettings;
  business: BusinessSettings;
  security: SecuritySettings;
  data: DataSettings;
  notifications: NotificationSettings;
  branding: BrandingSettings;
  danger: DangerSettings;
}
