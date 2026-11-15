/**
 * Normalized output shapes for the VeriSec IDV parser.
 *
 * Two layers, by design:
 *  - FullResult   the complete, backend-internal picture: every container, every
 *                 field with its bounding box, every authenticity check, plus the
 *                 anomaly flags computed against the per-country expectation
 *                 catalog. Bounding boxes and auth verdicts live here and are not
 *                 meant to reach the client wholesale.
 *  - DisplayResult the client-safe slice built ONLY from the ten containers that
 *                 are consistent across all document types. This is what the KYC
 *                 review screen renders.
 */

export type DocTypeName = "Passport" | "National ID" | "Driving Licence" | "Residence Permit";

/** Regula returns pixel rects per page image. */
export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 1 = valid/passed, 2 = failed, 0 = not performed, -1 = unknown. */
export type Validity = number;
export type Tone = "pass" | "warn" | "fail" | "idle";

export interface FieldSource {
  /** VISUAL, MRZ, BARCODE, RFID, ... (from the source container). */
  source: string;
  value: string;
  validity: Validity;
  box?: BoundingBox;
  page: number;
}

export interface NormField {
  type: number; // TextFieldType code
  name: string; // human label
  lcid?: number;
  value: string; // merged value (container 36)
  validity: Validity;
  page: number;
  box?: BoundingBox; // best available rect (prefers the visual source)
  sources: FieldSource[];
  /** Cross-source comparisons (VISUAL vs BARCODE/MRZ/RFID); status 1 = agree. */
  comparisons: { left: string; right: string; status: number }[];
  pii: boolean;
}

export interface GraphicField {
  type: number; // GraphicFieldType code
  name: string;
  page: number;
  box?: BoundingBox;
  /** data: URL when the image bytes were present. */
  src?: string;
}

export interface QualityCheck {
  type: number;
  name: string;
  passed: boolean;
  probability?: number;
  mean?: number;
  stdDev?: number;
  page: number;
}

export interface AuthElement {
  type: number;
  result: Validity;
  diagnose?: number;
  critical?: boolean;
  box?: BoundingBox;
}
export interface AuthCheck {
  type: number;
  name: string;
  result: Validity;
  page: number;
  elements: AuthElement[];
}

export interface DocClass {
  page: number;
  documentName: string;
  id: number; // unique per document side
  country: string; // ICAO code
  countryName: string;
  dType: number;
  dTypeName: string;
  dFormat: number;
  dMRZ: boolean;
  confidence: number;
  rotated180: boolean; // the source was upside down (engine already corrected it)
  rotationAngle: number; // degrees the engine rotated to make it upright
}

export interface Verdict {
  overallStatus: Validity;
  optical: Validity;
  security: Validity;
  text: Validity;
  mrz: Validity;
  imageQA: Validity;
  expiry: Validity;
  docType: Validity;
  portrait: Validity;
  rfid: Validity;
  stopList: Validity;
  rfidDetails?: { AA: number; BAC: number; CA: number; PA: number; PACE: number; TA: number };
  specimen: boolean;
}

export type AnomalyKind =
  | "missing-field"
  | "unexpected-field"
  | "missing-container"
  | "unexpected-container"
  | "country-mismatch"
  | "doctype-mismatch"
  | "specimen"
  | "expired"
  | "no-expiry"
  | "orientation"
  | "auth-failed"
  | "source-mismatch"
  | "no-classification";

export type Severity = "info" | "warn" | "critical";

export interface Anomaly {
  kind: AnomalyKind;
  severity: Severity;
  detail: string;
  field?: string;
  page?: number;
}

export interface DocumentPosition {
  quad: { x: number; y: number }[]; // LT, RT, RB, LB
  center: { x: number; y: number };
  angle: number;
  width: number;
  height: number;
  dpi: number;
  status: Validity;
}

export interface FaceInfo {
  count: number;
  boxes: BoundingBox[];
  page: number;
}

export interface MrzInfo {
  format?: string;
  rows: string[];
  checksums: { name: string; value: string }[];
  page: number;
}

export interface ContainerReport {
  resultType: number;
  name: string;
  page: number;
  count: number;
}

/**
 * Field-level cross-source verification (container 15, lexical analysis): which
 * sources carried the field and the per-field check matrix. Raw values are NOT
 * kept here (they live in NormField); this is a validation signal only.
 */
export interface LexicalField {
  type: number;
  name: string;
  lcid?: number;
  sources: string[]; // VISUAL / BARCODE / MRZ / RFID present for this field
  matrix: number[]; // Regula per-field check codes
}

export interface PageResult {
  page: number;
  docClass?: DocClass;
  fields: NormField[];
  graphics: GraphicField[];
  quality: QualityCheck[];
  lexical?: LexicalField[];
  position?: DocumentPosition;
  faces?: FaceInfo;
  mrz?: MrzInfo;
}

/** Everything the parser needs from the caller: the user's selection + the
 * resolved expectation profile (looked up from the catalog by the caller so the
 * core stays pure). */
export interface ParseOptions {
  country: string; // selected ISO (e.g. "RWA")
  docType: DocTypeName; // selected document
  profile?: import("./catalog").CountryDocProfile | null;
  keepRaw?: boolean;
}

export type ErrorSeverity = "serious" | "quality";

/**
 * One concrete error Regula reported, wired straight from its result codes:
 *  - "serious": a data mismatch or fraud / tampering / liveness indicator, or a
 *    check Regula itself marked critical. The applicant is stopped.
 *  - "quality": a capture, geometry, resolution, lighting or read-quality issue.
 *    The applicant is asked to re-take; a repeat may be allowed.
 */
export interface RegulaError {
  area: "cross-source" | "authenticity" | "image-quality";
  label: string; // the check or field it concerns
  detail?: string; // the human diagnosis, e.g. "Barcode size params error"
  diagnose?: number; // Regula CheckDiagnose code
  page: number;
  /** The side it is on; absent for a detail missing from the whole document (no side can be named). */
  side?: DocSide;
  critical: boolean; // Regula's own CriticalFlag
  severity: ErrorSeverity;
  /** A quality error that must gate (ask for a re-take) even when the engine
   *  passed overall, e.g. a required identity field that could not be read. */
  gating?: boolean;
  /** Enum names of the fields this error concerns, so the UI can badge them. */
  affects?: string[];
}

export interface FullResult {
  country: string; // selected ISO
  docType: DocTypeName;
  pages: PageResult[];
  verdict: Verdict;
  authChecks: AuthCheck[];
  anomalies: Anomaly[];
  errors: RegulaError[]; // every error Regula reported, classified
  faces: number;
  containersPresent: ContainerReport[];
  /**
   * Every detail some text container read with a value (the merged text, the printed side, the barcode, the MRZ,
   * the chip), by field type, with the sources that read it. Whatever the country or layout: what was read is here.
   */
  readFields: { type: number; key: string; sources: string[] }[];
  /** Present only when explicitly requested; heavy. */
  raw?: unknown;
}

/* ----------------------- Client-safe display slice ----------------------- */

export interface DisplayField {
  type: number; // TextFieldType code
  key: string; // TextFieldType enum name, e.g. "DOCUMENT_NUMBER" ("" if unknown)
  name: string;
  value: string;
  tone: Tone;
  /** Which sources produced it and whether they agreed. */
  sources: string[];
  crossChecked: boolean;
  pii: boolean;
}
export type DocSide = "front" | "back";

export interface DisplayPhoto {
  name: string;
  src: string;
  side: DocSide;
}

/** A single check surfaced to the applicant (good or bad), no engine wording. */
export interface DisplaySignal {
  name: string;
  tone: Tone; // pass = good, fail = bad, idle = not checked
  note?: string;
}

/** Per-side view: the data read from that face of the document. */
export interface DisplayPage {
  side: DocSide;
  label: string; // "Front" / "Back"
  documentName: string;
  fields: DisplayField[];
  photos: DisplayPhoto[];
}

export interface DisplayResult {
  country: string;
  docType: DocTypeName;
  documentName: string;
  /** The blended headline (specimen and anomalies fold in here). */
  status: { tone: Tone; label: string; specimen: boolean };
  /** The engine's final decision on its own (what gates proceeding). */
  decision: { tone: Tone; label: string };
  /** Whether the final decision permits proceeding (a hard fail or specimen does not). */
  canProceed: boolean;
  photos: DisplayPhoto[]; // all figures, each tagged with its side
  fields: DisplayField[]; // merged front + back, deduped by field type
  pages: DisplayPage[]; // per-side breakdown (front, back)
  signals: DisplaySignal[]; // every check, good and bad
  quality: { name: string; tone: Tone }[]; // 30 IMAGE_QUALITY
  faces: number; // 97 FACE_DETECTION
  /** User-facing anomaly notes (no engine names, no raw internals). */
  notes: { severity: Severity; text: string }[];
}

/* --------------------- Confirm Details (dynamic per doc) ------------------ */

/** One grouped section of the Confirm Details screen (only non-empty ones ship). */
export interface ConfirmSection {
  title: string;
  fields: DisplayField[];
}

/* --------------------------- KYC resolution ------------------------------- */

/** What the applicant chose at the start of the flow. */
export interface DocSelection {
  country: string; // any of: ISO-3, alpha-2, or country name
  docType: string; // flow slug ("national-id"...) or a DocTypeName
}

/**
 * The decision the flow acts on:
 *  - accept        detected document matches the selection; show Confirm Details.
 *  - autocorrected detected a DIFFERENT (but supported) country/type; the details
 *                  are rebuilt for what was detected, and the user is advised.
 *  - wrong-document a recognised document that is NOT one of the four accepted
 *                  types (visa, student card...): no details, ask to choose one.
 *  - unreadable    could not be recognised (blurry, or not one of the four):
 *                  ask to re-take a clear photo.
 */
export type KycOutcome = "accept" | "autocorrected" | "wrong-document" | "unreadable";

/** How proceeding is gated once the document is supported. */
export type GateReason =
  | "ok" // clean, proceed
  | "serious" // a data mismatch or fraud indicator: stop, never overridden
  | "quality-retake" // capture/geometry issue: ask for a clearer photo
  | "quality-allowed" // capture issue again after a retry: allowed, flagged
  | "failed"; // engine could not pass it and it was not clearly classified

export interface KycGate {
  canProceed: boolean;
  reason: GateReason;
  attempt: number; // 1-based attempt index this decision was made on
  flagged: boolean; // proceeded despite unresolved quality errors
  /** Let through despite photo quality problems because the printed side and the barcode / MRZ agree. */
  crossMatched?: boolean;
}

/**
 * The printed details checked against the barcode / MRZ / chip on the same document (usually its back): each field
 * the reader compared, and whether every pair agreed. `agree`: at least two fields compared, all agreed, and one of
 * them is an identity detail (document number, name or date of birth). Field names only, never their values.
 */
export interface CrossMatch {
  agree: boolean;
  fields: { name: string; key: string; pairs: { left: string; right: string; agree: boolean }[] }[];
}

export interface KycResolution {
  outcome: KycOutcome;
  /** Normalised selection the user made. */
  selected: { country: string; docType: DocTypeName | null };
  /** What the parser resolved to (what Regula detected), when supported. */
  effective: { country: string; docType: DocTypeName } | null;
  /** Which parts were auto-corrected. */
  corrected: { country: boolean; docType: boolean };
  /** One clear, human, em-dash-free message for the screen. */
  guidance: string;
  /** True when the user should be advised to re-take. */
  adviseRetake: boolean;
  /** Every error Regula reported, classified serious vs quality. */
  errors: RegulaError[];
  errorClass: "none" | "serious" | "quality";
  /** The proceed decision (this is authoritative, over display.canProceed). */
  gate: KycGate;
  /** Front and back details compared (empty when nothing could be compared). */
  crossMatch: CrossMatch;
  /** Present for accept / autocorrected only. */
  display?: DisplayResult;
  sections?: ConfirmSection[];
  /** The complete backend picture (kept on the trusted side). */
  full: FullResult;
}
