/**
 * The demo dataset for the verifications list and detail.
 *
 * ALL OF IT IS ILLUSTRATIVE. These are the values drawn in Figma frames
 * Desktop-26 (list) and Desktop-33 Â· 51 Â· 52 Â· 53 Â· 54 Â· 55 Â· 56 Â· 57 Â· 58
 * (the nine detail tabs), kept so the built screens can be diffed against the
 * frames. Nothing here comes from the recognition gateway.
 *
 * FOR WHOEVER WIRES THIS UP: you should not need to edit this file. Implement
 * `getVerifications()` / `getVerification()` in `./index.ts` against the
 * contract in `./types.ts` and this becomes the fallback only. When a tab
 * becomes real, DELETE its entry here rather than editing the numbers to look
 * plausible â€” every payload is nullable precisely so "not run" can be said out
 * loud instead of drawn as an empty panel that reads as "all clear".
 *
 * THREE DELIBERATE DEPARTURES FROM THE FRAMES, all for the same reason â€” a
 * value that could belong to a real person, or that would tell an operator two
 * different things about one check:
 *
 *   Â· The frames reuse four reference numbers across eleven different
 *     applicants (V20292-NEW appears four times). A reference identifies a
 *     session; duplicated, it cannot address a row. Each row gets its own,
 *     in the frames' format.
 *   Â· Device & IP draws 152.105.236.163, a routable address that resolves to
 *     somebody. It is the RFC 5737 documentation range here.
 *   Â· The account email is RFC 2606 `example.com`, not the frames' gmail.com.
 *
 * And one derivation: the Trust Seal badges light from whether their tab
 * produced a result, rather than being stored. The frames draw Cryptographic
 * and Address dim while those tabs show a pass, which would have the same check
 * reading two ways on one screen. AML stays dim, which is what its own tab's
 * copy says it should be until screening is live.
 */

import type { VerificationDetail, VerificationRow, VerificationsListData } from "./types";

/* ----------------------------------------------------------------------------
   List, Desktop-26
---------------------------------------------------------------------------- */

const BASE_ROWS: VerificationRow[] = [
  {
    id: "v20292-0041",
    reference: "V20292-0041",
    applicant: "New applicant",
    initials: "NA",
    document: "Passport",
    country: "South Africa",
    workflow: "Standard KYC",
    score: 0,
    verdict: "Needs review",
    when: "2 minutes ago",
  },
  {
    id: "v20292-0038",
    reference: "V20292-0038",
    applicant: "Yuki Tanaka",
    initials: "YT",
    document: "Residence permit",
    country: "Egypt",
    workflow: "Standard KYC",
    score: 65,
    verdict: "Needs review",
    when: "3 months ago",
  },
  {
    id: "v20252-4655",
    reference: "V20252-4655",
    applicant: "Amina Hassan",
    initials: "AH",
    document: "National ID",
    country: "UAE",
    workflow: "Fast KYC",
    score: 92,
    verdict: "Approved",
    when: "about 2 months ago",
  },
  {
    id: "v20254-7599",
    reference: "V20254-7599",
    applicant: "Wanjiru Kamau",
    initials: "WK",
    document: "Passport",
    country: "UAE",
    workflow: "Standard KYC",
    score: 96,
    verdict: "Approved",
    when: "3 months ago",
  },
  {
    id: "v20255-7124",
    reference: "V20255-7124",
    applicant: "Sarah Chen",
    initials: "SC",
    document: "Driver's licence",
    country: "UAE",
    workflow: "Fast KYC",
    score: 47,
    verdict: "Declined",
    when: "about 2 months ago",
  },
  {
    id: "v20257-5229",
    reference: "V20257-5229",
    applicant: "Fatima Bello",
    initials: "FB",
    document: "Driver's licence",
    country: "UAE",
    workflow: "Standard KYC",
    score: 24,
    verdict: "Declined",
    when: "3 months ago",
  },
  {
    id: "v20254-7602",
    reference: "V20254-7602",
    applicant: "Amara Okafor",
    initials: "AO",
    document: "Passport",
    country: "Brazil",
    workflow: "Fast KYC",
    score: 87,
    verdict: "Approved",
    when: "about 2 months ago",
  },
  {
    id: "v20252-4661",
    reference: "V20252-4661",
    applicant: "Lucas Silva",
    initials: "LS",
    document: "Residence permit",
    country: "Brazil",
    workflow: "Standard KYC",
    score: 91,
    verdict: "Approved",
    when: "3 months ago",
  },
  {
    id: "v20252-4670",
    reference: "V20252-4670",
    applicant: "Emeka Adeyemi",
    initials: "EA",
    document: "National ID",
    country: "Brazil",
    workflow: "High-risk onboarding",
    score: 0,
    verdict: "Abandoned",
    when: "about 2 months ago",
  },
  {
    id: "v20292-0029",
    reference: "V20292-0029",
    applicant: "Thabo Molefe",
    initials: "TM",
    document: "National ID",
    country: "Brazil",
    workflow: "Fast KYC",
    score: 0,
    verdict: "Abandoned",
    when: "3 months ago",
  },
  {
    id: "v20292-0017",
    reference: "V20292-0017",
    applicant: "Emeka Adeyemi",
    initials: "EA",
    document: "National ID",
    country: "United Kingdom",
    workflow: "Standard KYC",
    score: 92,
    verdict: "Approved",
    when: "3 months ago",
  },
];

/**
 * More rows so the pager, search and filters have real depth to work over.
 * Deterministic (index-based, no `Math.random`) so a static export is stable,
 * and it reuses the base applicants rather than inventing new people. The field
 * values are drawn from the filter option sets so filtering hits them.
 */
const DOCUMENTS = ["Passport", "National ID", "Driver's licence", "Residence permit"];
const COUNTRIES = ["South Africa", "Egypt", "UAE", "Brazil", "United Kingdom", "Kenya", "Nigeria", "Rwanda"];
const WORKFLOWS = ["Standard KYC", "Fast KYC", "High-risk onboarding"];
const VERDICTS = ["Approved", "Needs review", "Declined", "Abandoned"] as const;
const WHENS = ["1 hour ago", "yesterday", "2 days ago", "last week", "3 weeks ago", "last month", "2 months ago", "3 months ago"];

const GENERATED: VerificationRow[] = Array.from({ length: 44 }, (_, i) => {
  const base = BASE_ROWS[i % BASE_ROWS.length]!;
  const ref = `V2025${(4 + (i % 6))}-${(9100 - i * 13).toString().padStart(4, "0")}`;
  return {
    id: ref.toLowerCase(),
    reference: ref,
    applicant: base.applicant,
    initials: base.initials,
    document: DOCUMENTS[i % DOCUMENTS.length]!,
    country: COUNTRIES[i % COUNTRIES.length]!,
    workflow: WORKFLOWS[i % WORKFLOWS.length]!,
    score: (i * 37) % 101,
    verdict: VERDICTS[i % VERDICTS.length]!,
    when: WHENS[i % WHENS.length]!,
  };
});

const ROWS: VerificationRow[] = [...BASE_ROWS, ...GENERATED];

export const DEMO_VERIFICATIONS_LIST: VerificationsListData = {
  title: "Verifications",
  liveLabel: "Live Sessions:",
  liveCount: 26,
  newSessionLabel: "New Session",
  searchPlaceholder: "Search reference or applicant",
  filters: [
    { name: "status", options: ["All statuses", "Approved", "Needs review", "Declined", "In progress", "Abandoned"] },
    { name: "document", options: ["All docs", "Passport", "National ID", "Driver's licence", "Residence permit"] },
    { name: "workflow", options: ["All workflows", "Standard KYC", "Fast KYC", "High-risk onboarding"] },
  ],
  columns: [
    { key: "reference", header: "Reference", width: 140 },
    { key: "applicant", header: "Applicant", width: 180 },
    { key: "document", header: "Document", width: 150 },
    { key: "country", header: "Country", width: 125 },
    { key: "workflow", header: "Workflow", width: 155 },
    { key: "score", header: "Score", width: 65, align: "right" },
    // Wide enough for "Needs review", which is a fixed-width pill and cannot
    // truncate the way the text columns do.
    { key: "verdict", header: "Status", width: 160 },
    { key: "when", header: "When", width: 145 },
    // A narrow trailing column for the per-row â‹¯ menu (View / Disable).
    { key: "actions", header: "", width: 56, align: "right" },
  ],
  rows: ROWS,
  pagination: {
    rowsLabel: "10 rows",
    pages: [1, 2, 3, null, 8, 9, 10],
    current: 1,
    previousLabel: "Previous",
    nextLabel: "Next",
  },
};

/* ----------------------------------------------------------------------------
   Detail, the nine tabs, for the one verification the frames draw
---------------------------------------------------------------------------- */

const AMINA: VerificationDetail = {
  id: "v20252-4655",
  reference: "V20252-4655",
  applicant: "Amina Hassan",
  verdict: "Approved",
  backLabel: "All verifications",
  backHref: "/verifications",
  downloadLabel: "Download report",
  emptyLabel: "This check did not run for this verification.",
  seal: {
    score: 92,
    label: "Trust Seal",
    badges: [
      { label: "Cryptographic", on: true },
      { label: "Phone", on: true },
      { label: "Address", on: true },
      { label: "Image-clean", on: true },
      { label: "AML-clear", on: false },
    ],
  },

  overview: {
    factsTitle: "Key facts",
    facts: [
      { term: "Reference", detail: "V20252-4655" },
      { term: "Workflow", detail: "Fast KYC" },
      { term: "Environment", detail: "live" },
      { term: "Score", detail: "92" },
      { term: "Document", detail: "National ID" },
      { term: "Country", detail: "UAE" },
    ],
    checksTitle: "Check summary",
    checks: [
      { label: "Document Capture & Recognition", outcome: "pass" },
      { label: "Document Authenticity", outcome: "pass" },
      { label: "Face Match (1:1)", outcome: "pass" },
      { label: "Face Liveness", outcome: "pass" },
      { label: "Device & IP Analysis", outcome: "pass" },
    ],
  },

  document: {
    // Public samples: the official "SPECIMEN" Pennsylvania sample licence, under
    // a SAMPLE ribbon â€” never a real applicant's document.
    captures: [
      { label: "Document front", image: "/samples/id-sample.png" },
      { label: "Document back", image: "/samples/id-sample.png" },
    ],
    fieldsTitle: "Extracted fields",
    fields: [
      { term: "First name", detail: "Wanjiru" },
      { term: "Last name", detail: "Kamau" },
      { term: "Date of birth", detail: "1974-08-11" },
      { term: "Document â„–", detail: "AE5024176", mono: true },
      { term: "Expiry", detail: "2031-06-16" },
      { term: "Issuing country", detail: "UAE" },
      { term: "MRZ", detail: "P<AEKAMAU<<WANJIRU<<<<<<<<<<<<<<<<<<", mono: true },
    ],
    metricsTitle: "Authenticity metrics",
    metrics: [
      { label: "Glare", outcome: "pass" },
      { label: "Focus", outcome: "fail" },
      { label: "Resolution", outcome: "pass" },
      { label: "ScreenRecapture", outcome: "pass" },
      { label: "Bounds", outcome: "pass" },
      { label: "Portrait", outcome: "pass" },
    ],
  },

  face: {
    // A public stock portrait for both slots (the same person, consistent with
    // the match score); SAMPLE ribbon marks them as placeholders.
    captures: [
      { label: "Document photo", image: "/samples/selfie-sample.jpg" },
      { label: "Selfie", image: "/samples/selfie-sample.jpg" },
    ],
    similarity: { label: "Face match similarity", value: "87%" },
    liveness: { label: "Liveness verdict", detail: "Probability 97.3%", tag: "Passive pass" },
    spoofTitle: "Anti-spoof breakdown",
    spoof: [
      { label: "Screen replay", value: 42 },
      { label: "Printed photo", value: 31 },
      { label: "3D mask", value: 24 },
      { label: "Deepfake", value: 12 },
    ],
    attributes: [
      { term: "Age band", detail: "45-54" },
      { term: "Glasses", detail: "Yes" },
      { term: "Mask", detail: "No" },
    ],
  },

  nfc: {
    banner: { title: "Chip is genuine", detail: "Chip Auth: CA" },
    checksTitle: "Passive Authentication",
    checks: [
      { label: "Signature", outcome: "pass" },
      { label: "Hash Integrity", outcome: "pass" },
      { label: "Trust Chain", outcome: "pass" },
    ],
    certificates: [
      {
        title: "Passive Authentication",
        rows: [
          { term: "Serial", detail: "DS-050698", mono: true },
          { term: "Issuer", detail: "UAE DoS" },
          { term: "Valid", detail: "2022-01-01, 2032-01-01" },
        ],
      },
      {
        title: "CSCA",
        rows: [
          { term: "Serial", detail: "CSCA-759", mono: true },
          { term: "Issuer", detail: "UAE CSCA" },
          { term: "Valid", detail: "2018-01-01, 2038-01-01" },
        ],
      },
    ],
  },

  aml: {
    notice: {
      title: "AML screening, Coming soon",
      body: "We're rolling out AML screening globally. Your Trust Seal shows the AML-clear badge dim until it's live for your account.",
      tag: "Not yet live",
    },
    screens: [
      { label: "Sanctions", icon: "aml" },
      { label: "PEP", icon: "face-search" },
      { label: "Crypto risk", icon: "database" },
      { label: "Relatives & associates", icon: "questionnaire" },
      { label: "Adverse media", icon: "document" },
    ],
  },

  deviceIp: {
    facts: [
      { term: "IP", detail: "203.0.113.42", mono: true },
      { term: "Country", detail: "UAE" },
      { term: "Connection", detail: "Corporate" },
      { term: "Reputation", detail: "Clean" },
      { term: "Consistent with document", detail: "Yes" },
      { term: "Fingerprint", detail: "fp_588dd90d0c", mono: true },
      { term: "Risk score", detail: "21 / 100" },
    ],
  },

  contact: {
    metrics: [
      { label: "Phone risk", value: "12/100" },
      { label: "Email risk", value: "8/100" },
      { label: "Identity score", value: "91/100" },
    ],
    risk: { label: "Risk level", value: "LOW" },
    decision: { label: "Decision", value: "PASS" },
    reasonCodes: [
      "PHONE_OTP_VERIFIED",
      "EMAIL_DELIVERABLE",
      "NO_RECENT_SIM_SWAP",
      "IDENTITY_CONSISTENT",
    ],
    channels: [
      {
        title: "Phone",
        icon: "phone",
        sections: [
          {
            label: "OTP status",
            open: true,
            rows: [
              { term: "Result", detail: "Verified" },
              { term: "Method", detail: "SMS" },
              { term: "Timestamp", detail: "7/14/2026, 6:10:07 PM" },
              { term: "Attempts", detail: "1" },
            ],
          },
          { label: "Number validity", rows: [{ term: "Result", detail: "Valid" }] },
          { label: "Line intelligence", rows: [{ term: "Line type", detail: "Mobile" }] },
          { label: "SIM risk", rows: [{ term: "Recent swap", detail: "None" }] },
          { label: "Reputation", rows: [{ term: "Result", detail: "Clean" }] },
          { label: "Identity match", rows: [{ term: "Result", detail: "Match" }] },
        ],
      },
      {
        title: "Email",
        icon: "email",
        sections: [
          {
            label: "OTP status",
            open: true,
            rows: [
              { term: "Result", detail: "Verified" },
              { term: "Timestamp", detail: "7/14/2026, 6:10:07 PM" },
              { term: "Attempts", detail: "1" },
            ],
          },
          { label: "Deliverability", rows: [{ term: "Result", detail: "Deliverable" }] },
          { label: "Email type", rows: [{ term: "Result", detail: "Personal" }] },
          { label: "Reputation", rows: [{ term: "Result", detail: "Clean" }] },
          { label: "Digital footprint", rows: [{ term: "Result", detail: "Established" }] },
          { label: "Identity match", rows: [{ term: "Result", detail: "Match" }] },
        ],
      },
    ],
    consistency: {
      title: "Cross-channel consistency",
      pairs: [
        { left: { label: "Document", icon: "document" }, right: { label: "Phone country", icon: "phone" } },
        { left: { label: "Document", icon: "document" }, right: { label: "Email name", icon: "email" } },
        { left: { label: "Phone", icon: "phone" }, right: { label: "IP country", icon: "device-ip" } },
        { left: { label: "Declared", icon: "questionnaire" }, right: { label: "Doc country", icon: "document" } },
        { left: { label: "Email", icon: "email" }, right: { label: "IP region", icon: "device-ip" } },
      ],
    },
    velocity: {
      title: "Velocity & duplicates",
      rows: [
        { label: "Same phone across accounts", value: "1" },
        { label: "Same email across accounts", value: "1" },
        { label: "Device fingerprint reuse", value: "0" },
        { label: "OTP retries in last hour", value: "2" },
        { label: "Sessions from this IP (24h)", value: "1" },
      ],
    },
    explain: {
      title: "Explainable decision",
      verdictTag: "PASS",
      riskTag: "LOW risk",
      summary:
        "Approved, phone and email both verified, no SIM-swap or duplicate signals detected.",
      codes: [
        "PHONE OTP VERIFIED",
        "EMAIL DELIVERABLE",
        "NO RECENT SIM SWAP",
        "IDENTITY CONSISTENT",
      ],
    },
  },

  address: {
    documentsTitle: "Documents",
    documents: [{ label: "Receipt1" }, { label: "Receipt2" }],
    address: { label: "Address", value: "3 Main Street, Accra" },
    facts: [
      { term: "Name match", detail: "83%" },
      { term: "Address match", detail: "UAE" },
      { term: "Tamper", detail: "None" },
    ],
  },

  timeline: {
    events: [
      { at: "6/15/2026, 6:17:00 PM", label: "Session created", icon: "created" },
      { at: "6/15/2026, 6:17:15 PM", label: "Applicant opened link", icon: "opened" },
      { at: "6/15/2026, 6:17:45 PM", label: "Document captured", icon: "document" },
      { at: "6/15/2026, 6:18:10 PM", label: "Selfie + liveness captured", icon: "selfie" },
      { at: "6/15/2026, 6:18:30 PM", label: "NFC chip read", icon: "nfc" },
      { at: "6/15/2026, 6:19:00 PM", label: "Workflow decision: approved", icon: "decision" },
    ],
  },
};

/**
 * The other rows resolve to a stub of the same record.
 *
 * Only Amina Hassan is drawn in the frames. Rather than invent nine more full
 * result sets â€” nine more chances for a fabricated figure to be read as a
 * measured one â€” every other row carries the frames' one payload with its own
 * identity and verdict, and the tabs a run of its verdict would not have are
 * null. An abandoned session has no result to show, and says so.
 */
function stub(row: VerificationRow): VerificationDetail {
  const ran = row.verdict !== "Abandoned" && row.score > 0;
  return {
    ...AMINA,
    id: row.id,
    reference: row.reference,
    applicant: row.applicant,
    verdict: row.verdict,
    seal: {
      ...AMINA.seal,
      score: row.score,
      badges: AMINA.seal.badges.map((b) => ({ ...b, on: b.on && ran })),
    },
    overview: ran
      ? {
          ...AMINA.overview!,
          facts: [
            { term: "Reference", detail: row.reference },
            { term: "Workflow", detail: row.workflow },
            { term: "Environment", detail: "live" },
            { term: "Score", detail: String(row.score) },
            { term: "Document", detail: row.document },
            { term: "Country", detail: row.country },
          ],
        }
      : null,
    document: ran ? AMINA.document : null,
    face: ran ? AMINA.face : null,
    nfc: ran ? AMINA.nfc : null,
    deviceIp: ran ? AMINA.deviceIp : null,
    contact: ran ? AMINA.contact : null,
    address: ran ? AMINA.address : null,
  };
}

export const DEMO_VERIFICATION_DETAILS: Record<string, VerificationDetail> = Object.fromEntries(
  ROWS.map((row) => [row.id, row.id === AMINA.id ? AMINA : stub(row)]),
);

/** Tab order and labels â€” the frames' strip, left to right. */
export const DEMO_VERIFICATION_TABS = [
  { id: "overview", label: "Overview" },
  { id: "document", label: "Document" },
  { id: "face", label: "Face" },
  { id: "nfc", label: "NFC" },
  { id: "aml", label: "AML" },
  { id: "device-ip", label: "Device & IP" },
  { id: "contact", label: "Contact Information" },
  { id: "address", label: "Address" },
  { id: "timeline", label: "Timeline" },
] as const;
