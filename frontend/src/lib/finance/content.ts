/**
 * The Financial Portal's copy, navigation and static configuration.
 *
 * No scan data lives here. Every number on the Dashboard, every row in Scans
 * and every Playground result comes from the MICR and Card APIs at runtime.
 * What is here is the words around that data, plus the few screens that the
 * KYC console also serves from sample data today (API keys, wallet and
 * invoices); those are marked as samples on screen. Webhooks are live.
 */

import type { ApiKeyRow, BillingData, NotificationItem, WebhooksData } from "@/lib/console/types";

import { cardMc, cardTerminal, cardVisa, chequeBr, chequeCa, chequeUs } from "./fixtures";
import type { CardResponse, ChequeResponse, FinApiKeysData, FinNavGroup, FinProduct } from "./types";

/* ----------------------------------------------------------------------------
   Shell
---------------------------------------------------------------------------- */

export const FIN_NAV: FinNavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", icon: "dashboard", href: "/fin/dashboard" }],
  },
  {
    label: "Scan",
    items: [
      { label: "Playground", icon: "playground", href: "/fin/playground" },
      { label: "Scans", icon: "scans", href: "/fin/scans" },
      { label: "BIN Lookup", icon: "bin", href: "/fin/bin-lookup" },
    ],
  },
  {
    label: "Develop",
    items: [
      { label: "API Keys & Logs", icon: "api-keys", href: "/fin/api-keys" },
      { label: "Webhooks", icon: "webhooks", href: "/fin/webhooks" },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "Usage & Billing", icon: "billing", href: "/fin/billing" },
      { label: "Team", icon: "team", href: "/fin/team" },
      { label: "Settings", icon: "settings", href: "/fin/settings" },
    ],
  },
];

export const FIN_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "fin-n1",
    title: "Your scanning APIs are ready",
    body: "Cheques and cards can be read from the Playground or your own code.",
    time: "Today",
    unread: true,
    tone: "success",
    href: "/fin/playground",
  },
  {
    id: "fin-n2",
    title: "Card numbers are never stored",
    body: "Scans keep the first six and last four digits only. Images of cards aren't kept.",
    time: "Today",
    unread: false,
    tone: "info",
    href: "/fin/scans",
  },
];

/* ----------------------------------------------------------------------------
   Shared vocabulary
---------------------------------------------------------------------------- */

export const PRODUCT_LABEL: Record<FinProduct, string> = { cheque: "Cheque", card: "Card" };

export const STATUS_LABEL = { read: "Read", partial: "Partial", unreadable: "Couldn't read" } as const;

export const SOURCE_LABEL = { api: "API", sdk: "SDK", playground: "Playground" } as const;

/** Short names for the services' `issue_code`s, for ranked lists. */
export const ISSUE_LABEL: Record<string, string> = {
  no_micr_line: "No MICR line found",
  routing_checksum_failed: "Routing check digit failed",
  routing_prefix_invalid: "Routing prefix not valid",
  layout_unrecognised: "Cheque layout not recognised",
  weak_characters: "Hard-to-read characters",
  no_card: "No card found",
  number_unreadable: "Card number not read",
  luhn_failed: "Card number failed Luhn",
  expired: "Card expired",
};

export const ENDPOINT: Record<FinProduct, string> = {
  cheque: "/v2/cheques/micr",
  card: "/v2/cards/read",
};

/* ----------------------------------------------------------------------------
   Dashboard
---------------------------------------------------------------------------- */

export const DASHBOARD = {
  title: "Dashboard",
  updatedLabel: "Updated",
  ranges: [
    { label: "Last 30 days", days: 30 },
    { label: "Last 7 days", days: 7 },
    { label: "Last 90 days", days: 90 },
  ],
  products: ["All products", "Cheques", "Cards"],
  exportLabel: "Export CSV",
  playgroundLabel: "Open Playground",
  kpi: { scans: "Scans", readRate: "Read rate", median: "Median time", failed: "Couldn't read" },
  newLabel: "New this period",
  volumeTitle: "Scan volume",
  legend: { cheques: "Cheques", cards: "Cards" },
  outcomesTitle: "Outcomes",
  outcomesCenter: "Scans",
  networksTitle: "Card networks",
  issuersTitle: "Top issuers",
  failuresTitle: "Why scans fail",
  layoutsTitle: "Cheque layouts",
  routingTitle: "Routing check digits",
  routingCaption: "US routing numbers that passed the ABA check",
  latencyTitle: "Processing time",
  latencyLegend: ["p50", "p95", "p99"],
  endpointsTitle: "Calls by endpoint",
  endpointColumns: { endpoint: "Endpoint", calls: "Calls", p50: "p50", p95: "p95", errors: "Errors" },
  recentTitle: "Recent scans",
  recentCta: "View all",
  emptyChart: "No scans in this period yet.",
  latencyNeedsDays: "The daily trend line appears once scans span two or more days.",
  emptyList: "Nothing to rank yet.",
  noFailures: "No failed or partial reads in this period.",
  offlineTitle: "Scanning data isn't available",
  offlineBody: "The MICR and Card services didn't respond. Check that they're running, then try again.",
  partialOffline: "One service didn't respond, so these numbers cover the other one only.",
  retryLabel: "Try again",
  loading: "Please wait…",
  emptyStartTitle: "No scans yet",
  emptyStartBody: "Read a cheque or a card in the Playground and it shows up here straight away.",
} as const;

/* ----------------------------------------------------------------------------
   Scans
---------------------------------------------------------------------------- */

export const SCANS = {
  title: "Scans",
  subtitle: "Every cheque and card read through your keys, newest first.",
  totalLabel: "Total",
  searchPlaceholder: "Search by scan ID, last 4 digits, routing number or issuer",
  refreshLabel: "Refresh",
  playgroundLabel: "Open Playground",
  filters: {
    product: ["All products", "Cheque", "Card"],
    status: ["All statuses", "Read", "Partial", "Couldn't read"],
    source: ["All sources", "API", "SDK", "Playground"],
  },
  columns: [
    { key: "id", header: "Scan ID", width: 190 },
    { key: "product", header: "Product", width: 104 },
    { key: "result", header: "Result", width: 230 },
    { key: "status", header: "Status", width: 128 },
    { key: "confidence", header: "Confidence", width: 96, align: "right" as const },
    { key: "source", header: "Source", width: 104, gap: true },
    { key: "latency", header: "Time", width: 80, align: "right" as const },
    { key: "when", header: "When", width: 120, gap: true },
    { key: "open", header: "", width: 44, align: "right" as const },
  ],
  rowsOptions: ["10 rows", "20 rows", "50 rows"],
  previousLabel: "Previous",
  nextLabel: "Next",
  emptyFiltered: "No scans match your search.",
  emptyTitle: "No scans yet",
  emptyBody: "Reads made with your keys, the SDKs or the Playground appear here.",
  offlineTitle: "Scans couldn't be loaded",
  offlineBody: "The MICR and Card services didn't respond. Check that they're running, then try again.",
  partialOffline: "One service didn't respond, so only part of your scans are listed.",
  retryLabel: "Try again",
  loading: "Please wait…",
} as const;

export const DETAIL = {
  back: "Scans",
  tabs: { result: "Result", json: "API response" },
  meta: {
    created: "Created",
    source: "Source",
    env: "Environment",
    time: "Processing time",
    id: "Scan ID",
  },
  imageTitle: "Image",
  showBox: "Show detected area",
  cardImageTitle: "Card images are never stored",
  cardImageBody: "Only the first six and last four digits of the number are kept, so this scan has nothing to show.",
  imageMissing: "The stored image couldn't be loaded.",
  notFoundTitle: "Scan not found",
  notFoundBody: "It may have been deleted, or the link is incomplete.",
  offlineTitle: "This scan couldn't be loaded",
  offlineBody: "The service that holds it didn't respond. Check that it's running, then try again.",
  retryLabel: "Try again",
  loading: "Please wait…",
} as const;

/* ----------------------------------------------------------------------------
   Result view (Playground + detail)
---------------------------------------------------------------------------- */

export const RESULT = {
  micrLineTitle: "MICR line",
  fieldsTitle: "Fields",
  // An official national layout that the standard US/Brazil/France naming does not cover.
  standardTitle: "Country standard",
  // The photo was small, so the line was read again on an enlarged copy.
  readOnResized: "Read on enlarged copy",
  // A field of the line's layout that this cheque's line did not yield.
  notCaptured: "Not captured",
  capturedCount: (n: number, total: number) => `${n} of ${total} fields captured`,
  // The fields the card engine itself read, shown exactly as it returned them.
  engineFieldsTitle: "Read fields",
  layoutLabel: "Layout",
  checkDigit: { pass: "Check digit valid", fail: "Check digit failed" },
  // Says exactly what was proven: the number's structure, not that the bank exists.
  routing: {
    valid: "Check digit and prefix valid",
    checksum: "Check digit failed",
    prefix: "Not a valid US prefix",
    notNine: "Not 9 digits, not a US routing number",
  },
  routingDistrict: "Federal Reserve district",
  routingType: "Routing type",
  routingTypes: {
    bank: "Bank",
    thrift: "Thrift institution",
    electronic: "Electronic payments",
    government: "US Government",
    travellers_cheque: "Traveller's cheque",
  },
  lineConfidence: "Line confidence",
  weakest: "Weakest character",
  weakHint: "Characters in amber were hard to read.",
  cardTitle: "Card",
  checksTitle: "Checks",
  luhn: { pass: "Luhn check passed", fail: "Luhn check failed" },
  expiry: { valid: "Valid through", expired: "Expired", unknown: "Expiry not read" },
  expirySoon: "Expires soon",
  expiresInDays: (n: number) => (n >= 0 ? `${n} days left` : `${-n} days ago`),
  validFrom: "Valid from",
  company: "Company",
  holder: "Card holder",
  holderLow: "Low confidence",
  holderNone: "Not printed or not read",
  numberHidden: "Masked in stored scans",
  scheme: { valid: "Scheme valid", invalid: "Scheme check failed" },
  schemeParts: { luhn: "Luhn", length: "Length", iin: "Known BIN" },
  networkMismatch: (bin: string, prefix: string) => `BIN says ${bin}, prefix looks like ${prefix}`,
  fingerprintTitle: "Card fingerprint",
  fingerprintNote: "Stable across scans. The number itself is never stored.",
  issuerTitle: "Issuer",
  issuerLabels: { network: "Network", type: "Type", level: "Level", issuer: "Bank", country: "Country", funding: "Funding", category: "Category", currency: "Currency", phone: "Phone" },
  issuerUnknown: "This BIN isn't in the table yet.",
  fundingLabel: { credit: "Credit", debit: "Debit", prepaid: "Prepaid", charge: "Charge", unknown: "Unknown" },
  flagPrepaid: "Prepaid",
  flagReloadable: "Reloadable",
  websiteLabel: "Website",
  flagCommercial: "Commercial",
  flagConsumer: "Consumer",
  confidenceTitle: "Confidence",
  confidenceLabels: { card: "Card", number: "Number", expiry: "Expiry", holder: "Holder" },
  copy: "Copy",
  copied: "Copied",
  multiCard: (n: number) => `${n} cards in this image`,
  otherCards: "Other cards in this image",
  multiZone: (n: number) => `${n} MICR lines found`,
  qualityTitle: "Capture quality",
  qualityLabels: { rotation: "Rotation", skew: "Skew", weakest: "Weakest character" },
  degrees: (n: number) => `${n}°`,
  // Deep read: the Qwen vision reader + the bank resolved from our directory.
  vision: {
    title: "Vision read",
    deepPill: "Deep read",
    chequesTitle: (n: number) => `${n} cheques in this photo`,
    chequeTab: (i: number) => `Cheque ${i}`,
    chequesLabel: "Cheques in this photo",
    summaryTitle: "Cheque details",
    amountMissing: "Amount not read",
    written: (raw: string) => `As written: ${raw}`,
    signedPill: (n: number) => (n > 1 ? `Signed (${n} signatures)` : "Signed"),
    unsignedPill: "No signature found",
    crossedPill: (text: string) => (text ? `Crossed: ${text}` : "Crossed"),
    printedTitle: "Also printed on the cheque",
    bankAsPrinted: "Bank (as printed)",
    branch: "Branch",
    chequeNumberPrinted: "Cheque number (printed)",
    accountNumberPrinted: "Account number (printed)",
    amountTitle: "Amount",
    figures: "In figures",
    words: "In words",
    agree: "Words and figures agree",
    disagree: "Words and figures differ",
    currency: "Currency",
    date: "Date",
    payee: "Payee",
    drawer: "Drawer",
    country: "Country",
    // Where the country came from, shown small under it.
    countrySource: { bank_directory: "From the bank directory", cheque_face: "Read on the cheque", micr_line: "From the MICR line" },
    memo: "Memo",
    signature: "Signature",
    signaturePresent: "Present",
    signatureNone: "Not found",
    crossing: "Crossing",
    detailsTitle: "Details",
    bankTitle: "Bank (matched in directory)",
    city: "City",
    address: "Address",
    bic: "BIC / SWIFT",
    matchConf: "Match confidence",
    alternatives: (n: number) => `${n} other candidate${n === 1 ? "" : "s"}`,
    fieldsTitle: "Read fields",
    verified: "matches image",
    unverified: "to check",
    unavailable: "The vision reader was unavailable; the MICR result above still stands.",
    // Photo quality from the check before the read. It never blocks the read.
    quality: {
      too_far: "The cheque looks small in this photo. The read may miss details; a closer photo gives better results.",
      blurry: "This photo looks blurry. The read may be less reliable; a sharper photo gives better results.",
      glare: "There is glare on this photo. Text under the bright patch may be misread; try again without direct light.",
      document_not_found:
        "We couldn't find the cheque's edges, so the photo was read as it is. The whole cheque on a plain, contrasting background works best.",
      unreadable: "We couldn't prepare this photo, so it was read as it is.",
    },
  },
} as const;

/* ----------------------------------------------------------------------------
   Playground
---------------------------------------------------------------------------- */

export interface PlaygroundSample {
  id: string;
  product: FinProduct;
  label: string;
  caption: string;
  image: string;
  /** Saved real response, shown only when the service can't be reached. */
  saved: ChequeResponse | CardResponse;
}

/** Shown when the signed-in person's team role may not make a call. */
export const ACCESS = {
  code: "forbidden",
  title: "Not allowed for your role",
  body: "Your team role can't do this here. Ask an owner or admin of your organisation if you need it.",
} as const;

/** Shown when the organisation's credits can't pay for a call. */
export const CREDITS = {
  code: "insufficient_credits",
  title: "Out of credits",
  body: "Your organisation doesn't have enough credits for this call. Add credits on the Billing page, then try again.",
  action: "Go to Billing",
  href: "/fin/billing",
} as const;

export const PLAYGROUND = {
  title: "Playground",
  subtitle: "Read a cheque or a payment card from a photo and see exactly what the API returns.",
  products: [
    { id: "cheque" as const, label: "Cheque", runLabel: "Read cheque" },
    { id: "card" as const, label: "Card", runLabel: "Read card" },
  ],
  formatLabel: "MICR font",
  deepLabel: "Deep read (vision + bank · AI)",
  /** Shown above a deep-read result: the time you actually waited, measured in the browser. */
  wallLabel: "Run to result",
  serverLabel: "server",
  formats: [
    { label: "Detect automatically", value: "auto" as const },
    { label: "E-13B", value: "e13b" as const },
    { label: "CMC-7", value: "cmc7" as const },
  ],
  keyLabel: "sk_test_…",
  manageKeysLabel: "Manage keys",
  manageKeysHref: "/fin/api-keys",
  historyLabel: "History",
  imageTitle: "Image",
  drop: {
    title: "Drop a photo here",
    body: "JPG, PNG or BMP up to 10 MB. Flat, well lit, and the whole cheque or card in view.",
    browse: "Browse files",
    camera: "Use camera",
    clear: "Remove",
    samples: "Or try a sample",
  },
  accepted: ["image/jpeg", "image/png", "image/bmp"],
  maxBytes: 10 * 1024 * 1024,
  errors: {
    tooLarge: "That image is over 10 MB. Try a smaller one.",
    wrongType: "Use a JPG, PNG or BMP image.",
  },
  tabs: { result: "Result", json: "JSON", code: "Code" },
  emptyTitle: "Nothing read yet",
  emptyBody: "Pick a sample or drop a photo, then run it.",
  running: "Please wait…",
  runningHint: "Reading the image. This takes a few seconds.",
  offlineTitle: "The service isn't reachable",
  offlineBody: "Your own photos can't be read until it responds. Samples still show their saved results.",
  savedNote: "Saved result for this sample. The service didn't respond, so it wasn't read again just now.",
  failedTitle: "That image couldn't be read",
  showBox: "Show bounding boxes",
  micrBoxLabel: "MICR line",
  // While the field boxes are being found (first time, a few seconds).
  codeLanguages: ["cURL", "Python", "Node.js"],
  // JSON and Code tabs: the full request and response of the call being tried.
  api: {
    requestTab: "Request",
    responseTab: "Response",
    requestNote: "Everything this call sends, with your API key as a Bearer token. Your own image goes in once you pick one.",
    jsonView: "JSON",
    httpView: "HTTP",
    paramsTitle: "Everything you can send",
    cols: { name: "Name", where: "In", required: "Required", value: "Value", note: "What it does" },
    header: "Header",
    form: "Form field",
    yes: "Required",
    no: "Optional",
    defaultLabel: "default",
    liveNote: "The response to your last read.",
    briefNote: "Boxes and long lists are shortened here; Copy gives the full response.",
    exampleNote: (of: string) => `An example response from a real read of ${of}. Run a read to see yours.`,
    structureTitle: "Response structure",
    structureNote: "Every field this call returns, with its type. A field marked ? is left out when it has no value.",
  },
  history: { title: "Run history", close: "Close", empty: "Runs from this visit appear here." },
} as const;

export const SAMPLES: PlaygroundSample[] = [
  { id: "cheque-us", product: "cheque", label: "US cheque", caption: "E-13B", image: "/finance/samples/cheque-us.jpg", saved: chequeUs },
  { id: "cheque-ca", product: "cheque", label: "Canadian cheque", caption: "E-13B", image: "/finance/samples/cheque-ca.jpg", saved: chequeCa },
  { id: "cheque-br", product: "cheque", label: "Brazilian cheque", caption: "CMC-7", image: "/finance/samples/cheque-cmc7.jpg", saved: chequeBr },
  { id: "card-visa", product: "card", label: "Visa debit", caption: "Portrait", image: "/finance/samples/card-visa.jpg", saved: cardVisa },
  { id: "card-mc", product: "card", label: "Mastercard", caption: "Expired", image: "/finance/samples/card-mastercard.jpg", saved: cardMc },
  { id: "card-terminal", product: "card", label: "Card in a terminal", caption: "No card visible", image: "/finance/samples/card-terminal.jpg", saved: cardTerminal },
];

export const API_HOST = "https://api.verisec.dev";

/* ----------------------------------------------------------------------------
   BIN lookup
---------------------------------------------------------------------------- */

export const BIN_PAGE = {
  title: "BIN Lookup",
  subtitle: "The network, bank and country behind the first digits of a card.",
  inputLabel: "Card BIN or card number",
  placeholder: "BIN or full card number",
  wholeNumberNote: "Only the first 8 digits (the BIN) are sent. The full number stays on this page.",
  luhnPass: "Luhn check passes",
  luhnFail: "Luhn check fails, a digit may be mistyped",
  submit: "Look up",
  tryLabel: "Try",
  examples: ["471376", "539123", "403321", "400154"],
  tooShort: "Enter at least the first 6 digits.",
  emptyTitle: "Look up a BIN",
  emptyBody: "Enter a BIN (the first 6 to 8 digits) or the whole card number to see its network, bank and country.",
  notFoundTitle: "No match for this BIN",
  notFoundBody: "It isn't in the table yet.",
  prefixNote: "From the prefix alone this looks like",
  offlineNote: "The Card API didn't respond, so this answer comes from a small saved set of BINs.",
  offlineMissTitle: "Lookup unavailable",
  offlineMiss: "The Card API didn't respond and this BIN isn't in the saved set. Try again once it's back.",
  result: {
    bin: "BIN",
    copy: "Copy",
    copied: "Copied",
    unknownBank: "Bank not named",
    notInDirectory: "Not in the bank directory yet.",
    listedAs: "On the BIN record:",
    network: "Network",
    type: "Type",
    level: "Level",
    category: "Category",
    country: "Country",
    currency: "Currency",
    prepaid: "Prepaid",
    reloadable: "Reloadable",
    bic: "BIC / SWIFT",
    city: "City",
    website: "Website",
    phone: "Phone",
    match: "Directory match",
    yes: "Yes",
    no: "No",
    commercial: "Commercial",
    consumer: "Consumer",
  },
  found: "Found",
  codeTitle: "From your code",
  codeBody: "The same lookup over the Card API. Send the first 6 to 8 digits; the full number is never needed.",
  requestLabel: "Request",
  responseLabel: "Response",
  coverageTitle: "Coverage",
  coverageRows: "BINs in the table",
  coverageNetworks: "Networks",
  coverageNetworksValue: "Visa, Mastercard, American Express, Discover, UnionPay, JCB, Maestro and more",
  recentTitle: "Recent lookups",
  recentEmpty: "Lookups from this visit appear here.",
  loading: "Please wait…",
} as const;

/* ----------------------------------------------------------------------------
   API keys & logs (keys are samples, as on the KYC console; logs are live)
---------------------------------------------------------------------------- */

const KEY_ROWS: ApiKeyRow[] = [
  { id: "fk-1", name: "Teller app (Android)", key: "sk_live_7c2e…41ab", env: "live", scope: "Cheques, Cards", rateLimit: "600/min", lastUsed: "2026-09-27 16:31", status: "active" },
  { id: "fk-2", name: "Checkout web", key: "pk_live_19fa…c0d3", env: "live", scope: "Cards, BIN", rateLimit: "1200/min", lastUsed: "2026-09-27 16:38", status: "active" },
  { id: "fk-3", name: "Back-office batch", key: "sk_live_a93d…77e0", env: "live", scope: "Cheques", rateLimit: "300/min", lastUsed: "2026-09-27 02:00", status: "active" },
  { id: "fk-4", name: "Sandbox tests", key: "sk_test_4f1a…9c2e", env: "test", scope: "Cheques, Cards, BIN", rateLimit: "60/min", lastUsed: "2026-09-27 15:12", status: "active" },
  { id: "fk-5", name: "Old kiosk", key: "sk_live_0b7e…d912", env: "live", scope: "Cards", rateLimit: "300/min", lastUsed: null, status: "revoked" },
];

export const API_KEYS: FinApiKeysData = {
  title: "API Keys & Logs",
  createLabel: "Create API key",
  tabs: [
    { id: "keys", label: "API Keys" },
    { id: "playground", label: "API Playground" },
    { id: "logs", label: "Logs" },
    { id: "sdks", label: "SDKs" },
  ],
  playground: { keyLabel: "Your test key", manageKeysHref: "/fin/api-keys" },
  keys: {
    columns: [
      { key: "name", header: "Name", width: 190 },
      { key: "key", header: "Key", width: 160 },
      { key: "env", header: "Env", width: 68 },
      { key: "scope", header: "Scope", width: 150 },
      { key: "rateLimit", header: "Rate limit", width: 88, align: "right" },
      { key: "lastUsed", header: "Last used", width: 128 },
      { key: "status", header: "Status", width: 92 },
      { key: "actions", header: "Actions", width: 168, align: "right" },
    ],
    rows: KEY_ROWS,
    copyLabel: "Copy",
    revokeLabel: "Revoke",
    revokedLabel: "Revoked",
    neverUsedLabel: "-",
    create: {
      title: "Create API key",
      nameLabel: "Name",
      namePlaceholder: "Teller app",
      envLabel: "Environment",
      envOptions: ["Test", "Live"],
      permissionsLabel: "Permissions",
      permissions: [
        { label: "Read cheques", on: true },
        { label: "Read cards", on: true },
        { label: "BIN lookup", on: true },
        { label: "Scan records", on: false },
        { label: "Webhooks", on: false },
        { label: "Usage & billing", on: false },
        { label: "Account/settings", on: false },
      ],
      rateLabel: "Rate limit / min",
      rateOptions: ["300", "600", "1200", "60"],
      submitLabel: "Add",
      closeLabel: "Close",
    },
  },
  sdks: {
    copyLabel: "Copy",
    soonBadge: "Coming soon",
    cards: [
      // Server SDKs — one per language, generated from the same API contract.
      { key: "node", label: "Node.js", icon: "node", install: "npm install @veriseclabs/node", registry: "npm", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "python", label: "Python", icon: "python", install: "pip install verisec", registry: "PyPI", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "go", label: "Go", icon: "go", install: "go get github.com/mosesmmoisebidth/verisec-go", registry: "Go", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "java", label: "Java", icon: "java", install: 'implementation("io.github.mosesmmoisebidth:verisec-java:1.0.0")', registry: "Maven Central", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "dotnet", label: ".NET", icon: "dotnet", install: "dotnet add package VeriSec", registry: "NuGet", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "php", label: "PHP", icon: "php", install: "composer require verisec/verisec-php", registry: "Packagist", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "ruby", label: "Ruby", icon: "ruby", install: "gem install verisec", registry: "RubyGems", docsLabel: "Docs", docsHref: "/developers/" },
      // Mobile capture SDKs.
      { key: "react-native", label: "React Native", icon: "react", install: "npm install @veriseclabs/capture-react-native", registry: "npm", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "android", label: "Android", icon: "android", install: 'implementation("com.github.mosesmmoisebidth:verisec-kotlin:0.1.0")', registry: "JitPack", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "flutter", label: "Flutter", icon: "flutter", install: "flutter pub add verisec_api", registry: "pub.dev", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "ios", label: "iOS", icon: "ios", install: "pod 'VeriSecCapture'", soon: true, docsLabel: "Docs", docsHref: "/developers/" },
    ],
  },
};

export const LOGS = {
  columns: { endpoint: "Endpoint", status: "Status", latency: "Time", when: "When" },
  serviceLabel: { micr: "MICR API", card: "Card API" },
  empty: "No API calls yet.",
  offline: "The MICR and Card services didn't respond, so there's no log to show.",
  partialOffline: "One service didn't respond, so its calls are missing from this list.",
  refresh: "Refresh",
  loading: "Please wait…",
} as const;

export const SAMPLE_MARKER = "Sample data";

/* ----------------------------------------------------------------------------
   Webhooks (live: endpoints, scan events and deliveries come from /api/webhooks)
---------------------------------------------------------------------------- */

/** The Webhooks screen's words. Its endpoints and the scan events (cheque.read, cheque.failed, card.read, card.failed) are loaded live. */
export const WEBHOOKS: WebhooksData = {
  portal: "fin",
  title: "Webhooks",
  addLabel: "Add endpoint",
  labels: {
    events: "Events",
    secret: "Signing secret",
    rotate: "Rotate",
    test: "Test",
    log: "Delivery log",
    logColumns: ["Event", "Status", "Response", "When"],
    resend: "Resend",
    refresh: "Refresh",
    remove: "Delete endpoint",
  },
  empty: {
    title: "No endpoints yet",
    body: "Add an endpoint to receive cheque and card events on your server as they happen. Each request is signed so you can check it came from VeriSec.",
  },
  add: {
    title: "Add webhook endpoint",
    urlLabel: "Endpoint URL",
    urlPlaceholder: "https://api.example.com/hooks/scans",
    envLabel: "Environment",
    envOptions: ["Test", "Live"],
    liveHint: "Live endpoints must use https://.",
    eventsLabel: "Events",
    submitLabel: "Add endpoint",
    closeLabel: "Close",
  },
};

/* ----------------------------------------------------------------------------
   Usage & Billing (usage is live; wallet, budget and invoices are samples)
---------------------------------------------------------------------------- */

/** Per-read list prices. Illustrative until a billing service owns them. */
export const RATES = [
  { name: "Cheque read (MICR)", price: 0.05 },
  { name: "Card read", price: 0.03 },
  { name: "BIN lookup", price: 0.002 },
];

export function money(n: number): string {
  return n < 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

export const BILLING_BASE: BillingData = {
  title: "Usage & Billing",
  wallet: { label: "Credit wallet", balance: "$1,284.60", caption: "Auto top-up at $250", cta: "Top up" },
  budget: { label: "Monthly budget", amount: "$1500", min: 0, max: 10000, value: 1500, hardStopLabel: "Hard stop on budget", hardStop: false },
  activate: {
    label: "Activate Live billing",
    body: `Cheque reads are ${money(0.05)} each and card reads ${money(0.03)}. BIN lookups are ${money(0.002)}.`,
    cta: "Continue to payment",
  },
  usage: { title: "Reads this period, by product", axisLabel: "Reads in the last 30 days, by product", points: [] },
  rates: { title: "Rates", rows: RATES.map((r) => ({ name: r.name, price: money(r.price) })) },
  invoices: {
    title: "Invoices",
    rows: [
      { id: "FIN-2026-09", date: "2026-09-01", amount: "$412.30", downloadLabel: "Download" },
      { id: "FIN-2026-08", date: "2026-08-01", amount: "$388.75", downloadLabel: "Download" },
      { id: "FIN-2026-07", date: "2026-07-01", amount: "$301.10", downloadLabel: "Download" },
    ],
  },
};

export const BILLING = {
  sharedNote: "One credit wallet for your organisation, shared with the KYC console. 1 credit = $1 at list price; only successful calls are charged.",
  walletLabel: "Credit wallet",
  balance: (c: string) => `${c} credits`,
  heldCaption: (c: string) => `${c} held for calls in progress`,
  unitCaption: "1 credit = $1 at list price",
  topUp: "Top up",
  comingSoon: "Card payments are coming soon",
  budgetLabel: "Monthly budget",
  noBudget: "No budget",
  hardStop: "Hard stop on budget",
  spent: (c: string) => `${c} credits spent this month`,
  budgetHint: (n: string) => `Up to ${n} credits: what your wallet has this month.`,
  budgetHintEmpty: "Top up to set a budget.",
  budgetSaved: "Budget saved",
  noBudgetSaved: "No monthly budget.",
  budgetSavedBody: (n: number, hardStop: boolean) => `${n.toLocaleString()} credits a month${hardStop ? ", hard stop on" : ""}.`,
  budgetError: "Couldn't save the budget",
  activateLabel: "Activate Live billing",
  activateBody: "Live billing opens with card payments. Until then, calls use your credits.",
  activateCta: "Continue to payment",
  // The verification-plan card. Plans cover full KYC verification flows; Financial API calls always use credits.
  planChooseLabel: "Verification plans",
  planChooseBody: "A monthly quota of full KYC verification flows at a better rate. Your Financial API calls always use credits.",
  planChooseCta: "Choose a plan",
  planActiveLabel: "Verification plan",
  planActiveBody: (name: string, remaining: string, quota: string) =>
    `${name}: ${remaining} of ${quota} verifications left this period. Financial API calls use credits.`,
  planActiveCta: "Change plan",
  usageTitle: "Financial API usage (this month)",
  usageAxis: "Successful Financial API calls this month, by API",
  usageEmpty: "No Financial API call has used credits this month yet.",
  ratesTitle: "Rates",
  invoicesEmpty: "No invoices yet. They begin once card payments are switched on.",
  activityTitle: "Credit activity (both portals)",
  activityEmpty: "No credit activity yet.",
  activityError: "Couldn't load the activity",
  left: (c: string) => `${c} left`,
  held: (c: string) => `${c} held`,
  back: (c: string) => `${c} back`,
  errorTitle: "Billing couldn't be loaded",
  retry: "Try again",
} as const;
