/**
 * The demo dataset for API Keys & Playground.
 *
 * ALL OF IT IS ILLUSTRATIVE. The values are the ones drawn in Figma frames
 * Desktop-44 (keys table), Desktop-48 (create dialog) and Desktop-45 (the
 * playground), kept so the built screens can be diffed against the frames.
 * Nothing here comes from a real gateway, and no key below has ever existed.
 *
 * FOR WHOEVER WIRES THIS UP: you should not need to edit this file. Implement
 * `getApiKeys()` in `./index.ts` against the contract in `./types.ts` and this
 * becomes the fallback only.
 *
 * FOUR DELIBERATE DEPARTURES FROM THE FRAMES:
 *
 *   · THE RESPONSE BODY CARRIES NO IDENTITY. Desktop-45 fills it with a
 *     complete Rwandan passport — given names, surname, date of birth, document
 *     number and a matching MRZ with check digits. That is a whole person, and
 *     a plausible one is indistinguishable from a leaked one in a screenshot of
 *     a developer console. The JSON keeps the frame's exact SHAPE, which is the
 *     part a developer needs, and carries SPECIMEN tokens and round placeholder
 *     dates in the fields that would otherwise name somebody. Same rule the
 *     applicant flow's review screen follows.
 *   · The permissions grid drops a duplicate. Desktop-48 lists "Usage &
 *     billing" twice — fourth in the right column and fifth in the left. Two
 *     checkboxes granting one scope is a permissions bug: checking one and not
 *     the other has no defined meaning. Nine unique scopes here.
 *   · Keys are masked in the payload, not by the view. See `ApiKeyRow.key`.
 *   · `lastUsed` is `null` rather than the frame's literal em dash, so "never
 *     called" is a fact the data states rather than a glyph the view has to
 *     parse back.
 *
 * ONE FRAME INCONSISTENCY LEFT AS DRAWN, because fixing it means knowing the
 * real API: the playground is drawn as `POST /v1/kyc/verify` but every one of
 * its eight parameters (`page`, `limit`, `status`, `search`, `created_after` …)
 * belongs to a LIST endpoint, not to a verification submission. A developer who
 * copies this example gets a request that cannot work. When the endpoint list
 * becomes real, either the verb or the parameters need to change — they are
 * both here, adjacent, so the fix is one edit.
 */

import type { ApiKeysData, ApiKeyRow, ApiTab } from "./types";

/* ----------------------------------------------------------------------------
   Keys, Desktop-44
---------------------------------------------------------------------------- */

const ROWS: ApiKeyRow[] = [
  {
    id: "key-new-1",
    name: "New key",
    key: "sk_live_1aaa…ac16",
    env: "live",
    scope: "Full access",
    rateLimit: "300/min",
    lastUsed: null,
    status: "active",
  },
  {
    id: "key-new-2",
    name: "New key",
    key: "sk_live_be6f…da29",
    env: "live",
    scope: "Full access",
    rateLimit: "300/min",
    lastUsed: null,
    status: "revoked",
  },
  {
    id: "key-production-main",
    name: "Production main",
    key: "sk_live_9f3c…c4d2",
    env: "live",
    scope: "Full access",
    rateLimit: "1200/min",
    lastUsed: "2026-07-21 09:14",
    status: "active",
  },
  {
    id: "key-mobile-ios",
    name: "Mobile app (iOS)",
    key: "sk_live_1a8b…7f10",
    env: "live",
    scope: "Run-only",
    rateLimit: "300/min",
    lastUsed: "2026-07-21 09:12",
    status: "active",
  },
  {
    id: "key-sandbox-qa",
    name: "Sandbox / QA",
    key: "sk_test_44dd…a091",
    env: "test",
    scope: "Full access",
    rateLimit: "600/min",
    lastUsed: "2026-07-20 22:41",
    status: "active",
  },
  {
    id: "key-legacy-webhook",
    name: "Legacy webhook worker",
    key: "sk_live_ee01…9931",
    env: "live",
    scope: "Read-only reporting",
    rateLimit: "120/min",
    lastUsed: "2026-06-14 11:00",
    status: "revoked",
  },
];

/* ----------------------------------------------------------------------------
   Playground, Desktop-45

   The response body. Structure is the frame's, exactly; the identity is not -
   see the header. `SPECIMEN` in a name field and a round placeholder date are
   both unmistakably not a person, while leaving every key, nesting level and
   value type a developer would code against intact.
---------------------------------------------------------------------------- */

const REQUEST_BODY = `{
  "workflow_id": "wf_standard_kyc",
  "vendor_data": "user_8841",
  "document": {
    "type": "passport",
    "country": "RW",
    "front_image": "file_ref_8a12"
  },
  "face_image": "file_ref_4c09"
}`;

const PYTHON_SNIPPET = `import requests

response = requests.post(
    "https://api.verisec.dev/v1/kyc/verify",
    headers={
        "Authorization": "Bearer sk_live_9f3c…c4d2",
        "Content-Type": "application/json",
    },
    json={
        "workflow_id": "wf_standard_kyc",
        "vendor_data": "user_8841",
        "document": {
            "type": "passport",
            "country": "RW",
            "front_image": "file_ref_8a12",
        },
        "face_image": "file_ref_4c09",
    },
)
print(response.json())`;

const RESPONSE_BODY = `{
  "verification_id": "ver_8f2a91c4d20b",
  "status": "approved",
  "decision": {
    "outcome": "PASS",
    "trust_score": 92,
    "risk_level": "LOW",
    "reviewed_by": "auto"
  },
  "breakdown": {
    "document_recognition": {
      "result": "pass",
      "confidence": 0.986
    },
    "document_authenticity": {
      "result": "pass",
      "checks_failed": []
    },
    "face_match": {
      "result": "pass",
      "confidence": 0.941
    },
    "liveness": {
      "result": "pass",
      "score": 0.972,
      "method": "passive"
    },
    "contact": {
      "phone_risk": 12,
      "email_risk": 18,
      "identity_score": 88
    }
  },
  "document": {
    "classification": {
      "type": "passport",
      "country": "RWA",
      "series": "P<RWA",
      "confidence": 0.994
    },
    "mrz": {
      "line1": "P<RWASPECIMEN<<SPECIMEN<<<<<<<<<<<<<<<<<<<<<",
      "line2": "XX000000<0RWA9001011M3001011<<<<<<<<<<<<<<00",
      "valid_checksums": true
    },
    "fields": {
      "given_names": "SPECIMEN",
      "surname": "SAMPLE",
      "date_of_birth": "1990-01-01",
      "expiry": "2030-01-01"
    },
    "image_quality": {
      "glare": 0.03,
      "blur": 0.05,
      "resolution_dpi": 412,
      "edges_detected": true
    }
  },
  "face": {
    "match_confidence": 0.941,
    "bounding_box": {
      "x": 218,
      "y": 96,
      "width": 244,
      "height": 302
    },
    "attributes": {
      "estimated_age": 31,
      "glasses": false,
      "mask": false
    }
  },
  "latency_ms": 187,
  "created_at": "2026-08-12T13:41:02Z"
}`;

const TABS: ApiTab[] = [
  { id: "keys", label: "API Keys" },
  { id: "playground", label: "Playground" },
  { id: "logs", label: "Logs" },
  { id: "sdks", label: "SDKs" },
];

/* ----------------------------------------------------------------------------
   The dataset
---------------------------------------------------------------------------- */

export const DEMO_API_KEYS: ApiKeysData = {
  title: "API Keys & Playground",
  createLabel: "Create API key",
  tabs: TABS,

  emptyTitle: "Not designed yet",
  emptyBody:
    "This tab is named in the console's navigation but no frame supplies its contents, Desktop-46 and Desktop-47 redraw the Playground panel underneath a different highlighted tab. Rather than invent a screen nobody designed, it says so.",

  keys: {
    // Widths are ratios, not pixels — they become `fr` units, so what matters
    // is that the longest cell in each column survives the squeeze at the
    // narrowest width the table is drawn at. "Legacy webhook worker" sets
    // `name`; "2026-07-21 09:14" sets `lastUsed`.
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
    rows: ROWS,
    copyLabel: "Copy",
    revokeLabel: "Revoke",
    revokedLabel: "Revoked",
    neverUsedLabel: "-",

    create: {
      title: "Create API key",
      nameLabel: "Name",
      namePlaceholder: "Backend worker",
      envLabel: "Environment",
      envOptions: ["Test", "Live"],
      permissionsLabel: "Permissions",
      permissions: [
        { label: "Run verifications", on: true },
        { label: "Verification records", on: true },
        { label: "Face gallery", on: false },
        { label: "AML monitoring", on: false },
        { label: "Workflows", on: false },
        { label: "Webhooks", on: false },
        { label: "Media/files", on: false },
        { label: "Usage & billing", on: false },
        { label: "Account/settings", on: false },
      ],
      rateLabel: "Rate limit / min",
      rateOptions: ["300", "600", "1200", "60"],
      submitLabel: "Add",
      closeLabel: "Close",
    },
  },

  playground: {
    method: "POST",
    endpoints: ["/v1/kyc/verify", "/v1/verifications", "/v1/workflows"],
    savedLabel: "Saved",
    envs: ["Sandbox", "Live"],
    activeEnv: "Live",
    keyLabel: "sk_live_1aaa…ac16",
    manageKeysLabel: "Manage keys",
    manageKeysHref: "/api-keys",
    saveTestLabel: "Save Test",
    historyLabel: "History",
    saveTest: {
      title: "Save your test",
      nameLabel: "Name this test",
      namePlaceholder: "Test name",
      saveLabel: "Save",
      closeLabel: "Close",
    },
    history: {
      title: "Run history",
      closeLabel: "Close",
      runs: [
        { method: "POST", endpoint: "/v1/kyc/verify", status: "200 OK", ok: true, latency: "187ms", when: "13 secs ago" },
        { method: "GET", endpoint: "/v1/kyc/verify", status: "404 ER", ok: false, latency: "1857ms", when: "20 min ago" },
        { method: "POST", endpoint: "/v1/face/match", status: "200 OK", ok: true, latency: "118ms", when: "1 hour ago" },
        { method: "POST", endpoint: "/v1/nfc/verify", status: "422 ER", ok: false, latency: "24ms", when: "3 hours ago" },
        { method: "GET", endpoint: "/v1/verifications", status: "200 OK", ok: true, latency: "44ms", when: "Yesterday" },
      ],
    },

    request: {
      title: "Request",
      url: "https://api.verisec.dev/v1/kyc/verify",
      methods: ["POST", "GET", "PUT", "DELETE"],
      sendLabel: "Send",
      tabs: ["Query Params", "Headers", "Body", "Auth"],
      loadSampleLabel: "Load sample",
      params: [
        { name: "page", value: "1" },
        { name: "limit", value: "20" },
        { name: "status", value: "needs_review" },
        { name: "workflow", value: "standard-kyc" },
        { name: "country", value: "RW" },
        { name: "environment", value: "sandbox" },
        { name: "created_after", value: "2026-07-01" },
        { name: "search", value: "ver_8f2a91" },
      ],
      removeParamLabel: "Remove parameter",
      addParamLabel: "Add New Parameter",
      headers: [
        { name: "Content-Type", value: "application/json" },
        { name: "Authorization", value: "Bearer sk_live_9f3c…c4d2" },
        { name: "X-Request-ID", value: "req_08da4cb1" },
        { name: "Idempotency-Key", value: "idem_7f2a91b0" },
        { name: "X-Environment", value: "live" },
      ],
      body: REQUEST_BODY,
      auth: {
        label: "Bearer token",
        token: "sk_live_9f3c…c4d2",
        copyLabel: "Copy",
        manageLabel: "Manage API Keys",
        manageHref: "/api-keys",
      },
    },

    response: {
      title: "Response",
      exportLabel: "Export",
      statusLabel: "Status:",
      status: "200 OK",
      latency: "187ms",
      size: "1.1 KB",
      tabs: ["Response", "Headers", "Code"],
      copyLabel: "Copy",
      body: RESPONSE_BODY,
      headers: [
        { name: "Content-Type", value: "application/json" },
        { name: "X-Request-ID", value: "req_08da4cb1" },
        { name: "X-RateLimit-Remaining", value: "4998" },
        { name: "X-Environment", value: "live" },
        { name: "Date", value: "Wed, 27 Aug 2026 09:02:11 GMT" },
      ],
      code: { languages: ["Python", "JavaScript", "cURL", "Go"], activeLanguage: "Python", snippet: PYTHON_SNIPPET },
    },
  },

  // Desktop-46 — request log.
  logs: {
    columns: { endpoint: "Endpoint", status: "Status", latency: "Latency", when: "When" },
    rows: [
      { method: "POST", path: "/kyc/verify", status: 200, latency: "412ms", when: "2 min ago" },
      { method: "POST", path: "/face/match", status: 200, latency: "118ms", when: "5 min ago" },
      { method: "POST", path: "/nfc/verify", status: 400, latency: "24ms", when: "9 min ago" },
      { method: "POST", path: "/kyc/verify", status: 200, latency: "388ms", when: "15 min ago" },
      { method: "GET", path: "/verifications", status: 200, latency: "44ms", when: "20 min ago" },
    ],
  },
  // Desktop-47 — SDK install cards.
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
      // Mobile capture SDKs — on-device capture with quality checks.
      { key: "react-native", label: "React Native", icon: "react", install: "npm install @veriseclabs/capture-react-native", registry: "npm", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "android", label: "Android", icon: "android", install: 'implementation("com.github.mosesmmoisebidth:verisec-kotlin:0.1.0")', registry: "JitPack", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "flutter", label: "Flutter", icon: "flutter", install: "flutter pub add verisec_api", registry: "pub.dev", docsLabel: "Docs", docsHref: "/developers/" },
      { key: "ios", label: "iOS", icon: "ios", install: "pod 'VeriSecCapture'", soon: true, docsLabel: "Docs", docsHref: "/developers/" },
    ],
  },
};
