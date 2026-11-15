/**
 * The Financial Portal's data contract.
 *
 * Two separate services feed this portal, and these types are their wire
 * formats, unchanged:
 *
 *   MICR API   (cheques)  POST /v2/cheques/micr, GET /v2/cheques, /stats, /{id}
 *   Card API   (cards)    POST /v2/cards/read,  GET /v2/cards,   /stats, /{id}
 *                         GET /v2/bin/{digits}
 *
 * The screens render these responses directly. Nothing is re-parsed in the
 * browser: routing numbers, layouts, Luhn results and BIN rows are the
 * services' answers, so the portal can never disagree with the API a
 * developer integrates against.
 *
 * Same rules as `lib/console/types.ts`: plain JSON, no React.
 */

import type { Account, ApiEnv, ApiKeysTab, NotificationItem, SdksTab, UpgradeCard } from "@/lib/console/types";

/* ----------------------------------------------------------------------------
   Shell
---------------------------------------------------------------------------- */

export type FinNavIcon =
  | "dashboard"
  | "playground"
  | "scans"
  | "bin"
  | "api-keys"
  | "webhooks"
  | "billing"
  | "team"
  | "settings";

export interface FinNavItem {
  label: string;
  icon: FinNavIcon;
  href: string;
}

export interface FinNavGroup {
  label: string;
  items: FinNavItem[];
}

export interface FinShellData {
  account: Account;
  /** The portal's name, shown as a pill beside the org in the topbar. */
  portalLabel: string;
  nav: FinNavGroup[];
  upgrade: UpgradeCard | null;
  env: ApiEnv;
  envLabels: { test: string; live: string };
  notifications: NotificationItem[];
  notificationsLabel: string;
  notificationsEmpty: string;
  markAllReadLabel: string;
  viewAllLabel: string;
  viewAllHref: string;
  searchPlaceholder: string;
  settingsHref: string;
}

/* ----------------------------------------------------------------------------
   Wire formats
---------------------------------------------------------------------------- */

export type FinProduct = "cheque" | "card";

/** `partial` = read, but something a caller relies on is missing or failed a check. */
export type ScanStatus = "read" | "partial" | "unreadable";

export type ScanSource = "api" | "sdk" | "playground";

// The API prunes null fields from every response, so anything that can be
// empty is OPTIONAL here (absent, never null) rather than `T | null`.
interface ResponseBase {
  id: string;
  created_at: string;
  source: ScanSource;
  env: ApiEnv;
  processing_ms: number;
  status: ScanStatus;
  /** Machine-readable reason for `partial` / `unreadable`. Absent on a clean read. */
  issue_code?: string;
  /** The same reason in plain words, safe to show a person. */
  issue?: string;
}

/** One named MICR field in the vendor demo's own format: one key (the field name, e.g.
 * "Routing") and its value. */
export type MicrField = Record<string, string>;

/** Which of the demo's 4 fixed templates named the line. */
export type MicrTemplate = "us_business" | "us_personal" | "br_cmc7" | "fr_cmc7";

/** A named value of a MICR line; `value` is "" in a field list when the line did not yield it. */
export interface MicrNamedValue {
  name: string;
  value: string;
  parts?: { name: string; value: string }[];
}

/** An official national layout the demo does not cover (whole-line match only). */
export interface MicrStandardLayout {
  /** e.g. "ca_cpa_006", "in_cts_2010". */
  id: string;
  /** The standard's name, e.g. "Canada (Payments Canada Standard 006)". */
  name: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  fields: MicrNamedValue[];
  /** Every field of the standard, "" where the line did not yield it. */
  field_list?: MicrNamedValue[];
}

/** The cheque's country and where it came from. `flag` is the emoji; the UI draws an image. */
export interface CountryInfo {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  name: string;
  flag: string;
  source: "bank_directory" | "cheque_face" | "micr_line";
}

/** Every text box found on a cheque, for drawing only (no text). Boxes are 4 corners,
 * x1,y1 … x4,y4, in the pixel space of `width` × `height` (the upright image). */
export interface TextBoxes {
  width: number;
  height: number;
  boxes: { box: number[]; score: number }[];
}

export type RoutingCheck = "pass" | "fail" | "not_applicable";

export type RoutingType = "bank" | "thrift" | "electronic" | "government" | "travellers_cheque";

/** The ABA proof behind a US routing number. Absent for other layouts. */
export interface RoutingProof {
  /** True only when the checksum AND the prefix both hold. */
  valid: boolean;
  checksum_pass: boolean;
  /** Absent when the number is not nine digits. */
  check_digit?: number;
  /** The digit the first eight imply. An audit value, not a correction: a misread can sit in any digit. */
  expected_check_digit?: number;
  /** First two digits are an assigned Federal Reserve routing symbol. */
  prefix_valid: boolean;
  institution_type?: RoutingType;
  federal_reserve_district?: string;
  reason?: string;
}

/** One MICR line, exactly as the engine returns it, plus values derived from its
 * own text and two namings, each only when the line fits (never a guess). */
export interface MicrZone {
  index: number;
  // --- the engine's own output, kept verbatim ---
  /** As read, with the control symbols as letters (E-13B A-D, CMC-7 F-J). */
  text: string;
  /** The engine's label for the line, e.g. "CMC-7". */
  description: string;
  /** Every confidence the engine returned (zone-level values, then per character). */
  confidences: number[];
  klass?: number;
  skew: number;
  /** The engine's own box (its spelling), verbatim. */
  warpedBox?: number[];
  // --- derived from the engine's own text (universal, no country logic) ---
  font: "E-13B" | "CMC-7";
  /** The same line with the printed E-13B glyphs. */
  printed: string;
  /** A single summary confidence for the line. */
  confidence: number;
  /** One confidence (0 to 100) per character of `text`. */
  char_confidences: number[];
  min_char_confidence?: number;
  /** Four corners, x1,y1 … x4,y4, rounded, in `image` pixels. */
  box: number[];
  /** The groups the engine's own control symbols delimit. */
  segments: string[];
  // --- naming ---
  /** Fields named exactly as the vendor demo names them; empty when none of its
   * templates fits the line. */
  fields?: MicrField[];
  /** Every field the line's font can yield, "" where this line did not yield it. */
  field_list?: MicrNamedValue[];
  /** The demo template that produced `fields`. */
  template?: MicrTemplate;
  /** An official national layout the demo does not cover. */
  standard?: MicrStandardLayout;
  /** The US ABA proof of a field named "Routing" (shows when it is not a real US one). */
  routing?: RoutingProof;
}

export interface ChequeResponse extends ResponseBase {
  object: "cheque";
  /** `url` is relative to the MICR API. */
  image: { width: number; height: number; url: string };
  /** Every MICR line found, strongest first. */
  zones_detected: number;
  zones: MicrZone[];
  /** The primary (strongest) line, the full zone object. Absent when unreadable. */
  micr?: MicrZone;
  /** Capture-quality signals: page rotation, primary-line skew, weakest character. */
  quality: { rotation: number; skew?: number; min_char_confidence?: number };
  /** Only when a national MICR layout proves the country (e.g. India, Canada). */
  country?: CountryInfo;
  /** Present when the original named no fields and a resized copy did; `box` values
   * are already mapped back to the original image. */
  read_on?: { image: "resized"; scale: number; width: number; height: number };
}

export interface BinRecord {
  bin: string;
  /** All fields below are absent when unknown (the API prunes nulls). */
  network?: string;
  type?: string;
  level?: string;
  issuer?: string;
  /** ISO 3166-1 alpha-2, upper case. */
  country?: string;
  /** Full country name, ISO3 and flag emoji, derived from the ISO2 code. */
  country_name?: string;
  country_code3?: string;
  flag?: string;
  /** The country's flag image (SVG), relative to the Card API base: /v2/flags/{cc}.svg. */
  flag_url?: string;
  /** The issuer's record in our bank directory (with logo). Returned by GET /v2/bin/{digits}. */
  bank?: BankMatch | null;
  /** Issuing currency (ISO 4217) + its name. */
  currency?: string;
  currency_name?: string;
  /** Funding + flags. Derived from type/level, or from the online provider. */
  funding?: "credit" | "debit" | "prepaid" | "charge" | "unknown";
  is_prepaid?: boolean;
  is_commercial?: boolean;
  /** Only present once the online provider fills it. */
  is_reloadable?: boolean;
  category?: "consumer" | "commercial";
  issuer_country?: string;
  /** Issuer contact, when the source has it. */
  phone?: string;
  url?: string;
  /** Which tier answered: master / ultimate2026 / overlay / master+neutrino / neutrino. */
  source?: string;
}

export type ExpiryStatus = "valid" | "expiring_soon" | "expired" | "unknown";

/** One field exactly as the engine emitted it (its own name, value, confidence).
 * The engine may attach other keys per field (e.g. a `valid` flag); they are kept. */
export interface CardField {
  name: string;
  value?: string;
  confidence?: number;
  [key: string]: unknown;
}

/** One payment card. A photo can contain several. */
export interface CardRead {
  index: number;
  /** The engine's own label, e.g. "Card #1". */
  description?: string;
  /** Every field the engine read, verbatim (number, valid_thru, holder_name, ...). */
  fields?: CardField[];
  /** Summary confidence for the whole card (the engine's own value). */
  confidence: number;
  /** The engine's own box, verbatim. */
  warpedBox?: number[];
  box: number[];
  /** Full number: present ONLY in the read response, removed from stored copies. */
  number?: string;
  first6?: string;
  last4?: string;
  length: number;
  /** Keyed hash of the number: safe to store, stable across scans (dedup). */
  fingerprint?: string;
  luhn_valid: boolean;
  /** Luhn AND a length that fits the network. */
  scheme_valid: boolean;
  scheme_checks: { luhn: boolean; length: boolean; iin_known: boolean };
  network_from_prefix?: string;
  expired?: boolean;
  expires_in_days?: number;
  expiry_status: ExpiryStatus;
  bin?: BinRecord;
  /** The issuer's record in our bank directory (with logo), matched from the BIN row. */
  bank?: BankMatch | null;
  /** The engine's own card-level pass flag, when it emits one. */
  number_valid?: boolean;
}

export interface CardResponse extends ResponseBase {
  object: "card";
  /** Dimensions only: card images are never stored, so there is no url. */
  image: { width: number; height: number };
  /** Every card found, strongest first. */
  cards_detected: number;
  cards: CardRead[];
  /** The primary card without its `bin` and `bank` (they sit alongside). Absent when unreadable. */
  card?: Omit<CardRead, "bin" | "bank">;
  bin?: BinRecord;
  bank?: BankMatch | null;
}

export type ScanResponse = ChequeResponse | CardResponse;

/* ----------------------------------------------------------------------------
   Deep read (POST /v2/cheques/read): MICR + Qwen vision reader + bank resolved
---------------------------------------------------------------------------- */

/** One field the vision reader returned: the detector's box kept, text corrected. */
export interface VisionField {
  source_id?: number | null;
  type: string;
  value?: string | null;
  confidence?: number;
  verified?: boolean;
  /** The PP-OCR polygon this field kept (4 points), when it maps to one. */
  box?: number[][];
  detector_text?: string;
}

export interface VisionResult {
  fields?: VisionField[];
  amount?: { figures?: string; words?: string; numeric?: number | null; fraction?: string | null; agreement?: boolean | null };
  currency?: { code?: string | null; symbol?: string | null; source?: string | null };
  date?: { raw?: string | null; iso?: string | null; format?: string | null; ambiguous?: boolean; post_dated?: boolean };
  payee?: string | null;
  drawer?: { name?: string | null; address?: string | null } | null;
  bank?: { name?: string | null; country?: string | null; branch?: string | null; address?: string | null };
  cheque_number_printed?: string | null;
  account_number_printed?: string | null;
  memo?: string | null;
  pay_wording?: string;
  crossing?: { present?: boolean; type?: string; text?: string | null };
  signature?: { present?: boolean; count?: number };
  cheque_type?: string;
  language?: string;
  region_guess?: string | null;
  [key: string]: unknown;
}

/** A bank from our directory, resolved from the name/country the reader read. */
export interface BankResolved {
  profile_id: string;
  name: string;
  country?: string | null;
  /** ISO 3166-1 alpha-2. */
  country_code?: string | null;
  city?: string | null;
  address?: string | null;
  bic?: string | null;
  routing?: string | null;
  parent?: string | null;
  /** Only when the record states it plainly. */
  status?: "active" | "dissolved" | null;
  /** The bank's logo image, relative to the base of the API that returned it. */
  logo_url?: string | null;
  /** The country's flag image (SVG), relative to the same base. */
  flag_url?: string | null;
}

/** A full currency record (ISO 4217 + CLDR), resolved from the code/symbol read. */
export interface ResolvedCurrency {
  code?: string | null;
  numeric_code?: string | null;
  name?: string | null;
  symbol?: string | null;
  local_symbol?: string | null;
  minor_units?: string | null;
  english_name_cldr?: string | null;
  usd_per_unit?: number | string | null;
  units_per_usd?: number | string | null;
  wikidata_id?: string | null;
}

export interface BankMatch {
  read: { name?: string | null; country?: string | null; branch?: string | null; address?: string | null };
  /** Absent (pruned) when no bank in the directory matched. */
  resolved?: BankResolved | null;
  match_confidence: number;
  /** How surely the two names name the same bank (0..1), when the match was checked by name. */
  name_match?: number;
  alternatives: BankResolved[];
}

/** The whole cheque read: the MICR result, the vision result, the resolved bank. */
/** One cheque of a photo that holds several: its own MICR line (the engine's zone,
 * with the same status rule as a whole read), what the model read, bank, country, currency. */
export interface DeepCheque {
  /** 1-based, counting from the top (left to right when side by side). */
  index: number;
  micr: Pick<ChequeResponse, "status" | "issue_code" | "issue" | "zones_detected" | "zones" | "micr" | "country" | "quality">;
  vision?: VisionResult | null;
  bank?: BankMatch;
  country?: CountryInfo | null;
  currency?: ResolvedCurrency | null;
  reader_error?: string;
}

export interface ChequeDeepRead {
  id: string;
  object: "cheque_read";
  created_at: string;
  source: ScanSource;
  env: ApiEnv;
  processing_ms: number;
  image: { width: number; height: number; url: string };
  status: ScanStatus;
  /** The MICR engine's own cheque result (authoritative for the code line). */
  micr: ChequeResponse;
  /** The Qwen vision reader's fields (absent if the reader was unreachable). */
  vision?: VisionResult | null;
  bank?: BankMatch;
  /** The currency resolved from the world-currencies directory. */
  currency?: ResolvedCurrency | null;
  /** The cheque's country: bank directory, else the face, else a national MICR layout. */
  country?: CountryInfo | null;
  /** Set when the vision reader could not be reached; the MICR part still stands. */
  reader_error?: string;
  /** Every text box on the image, found while the fields were read (null if unavailable). */
  text_boxes?: TextBoxes | null;
  /** Only when the photo holds more than one cheque: each cheque on its own. The fields
   * above are cheque 1 (the top one); `micr` above is the whole MICR read. */
  cheques?: DeepCheque[];
  /** Where the time went, in ms. `processing_ms` above is the MICR engine alone. */
  timing?: { micr_ms?: number; model_ms?: number; boxes_ms?: number; total_ms?: number };
  /** Photo quality from the check before the read. It never blocks the read, only warns. */
  image_quality?: {
    status: "ok" | "document_not_found" | "too_far" | "blurry" | "glare" | "unreadable";
    normalised?: boolean;
    ms?: number;
  } | null;
}

export interface ListResponse<T> {
  data: T[];
  total: number;
}

/* ----------------------------------------------------------------------------
   Stats (GET /v2/cheques/stats, /v2/cards/stats)
---------------------------------------------------------------------------- */

export interface StatsHeadline {
  total: number;
  by_status: Record<ScanStatus, number>;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  latencies_ms: number[];
}

export interface StatsDay {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  total: number;
  read: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  latencies_ms: number[];
}

export interface EndpointStat {
  method: string;
  path: string;
  calls: number;
  p50_ms: number;
  p95_ms: number;
  error_rate: number;
}

interface StatsBase {
  days: number;
  current: StatsHeadline;
  previous: StatsHeadline;
  series: StatsDay[];
  issues: { code: string; count: number }[];
  endpoints: EndpointStat[];
}

export interface ChequeStats extends StatsBase {
  fonts: Record<string, number>;
  /** Counts keyed by the interpreted standard (cmc7_febraban, e13b_us, ...). */
  standards: Record<string, number>;
  routing: { checked: number; passed: number };
}

export interface CardStats extends StatsBase {
  networks: { name: string; count: number }[];
  issuers: { name: string; count: number }[];
  expired: number;
  luhn_failed: number;
}

export interface LogEntry {
  ts: string;
  method: string;
  path: string;
  status: number;
  ms: number;
}

/* ----------------------------------------------------------------------------
   Developer screens (keys, SDKs)
---------------------------------------------------------------------------- */

export type FinApiTabId = "keys" | "playground" | "logs" | "sdks";

export interface FinApiKeysData {
  title: string;
  createLabel: string;
  tabs: { id: FinApiTabId; label: string; badge?: string }[];
  /** The API Playground tab: the key shown on it and where keys are managed. */
  playground: { keyLabel: string; manageKeysHref: string };
  keys: ApiKeysTab;
  sdks: SdksTab;
}
