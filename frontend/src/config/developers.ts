/**
 * Developers page content. Everything here describes the API exactly as it is served today at
 * https://verisec.mmose.me: KYC APIs under /v1, Financial under /v2, grouped and priced as in the SDKs'
 * shared contract (vsec_sdks/spec). No invented endpoints, versions or claims.
 *
 * KYC answers come in an envelope {ok, request_id, latency_ms, data, warnings, error}; the SDKs return `data`.
 * Financial answers are objects. Calls are charged in credits only when they succeed.
 */

export const BASE_URL = "https://verisec.mmose.me";
const DOCS_URL = "https://docs.verisec.dev";

export const developersHero = {
  heading: "Identity, documents and payments, in one API.",
  subline: "Face, documents, MRZ, NFC, AML, cheques and cards. One key, 69 endpoints, seven official SDKs.",
  primaryCta: { label: "Get API keys", href: "/signup" },
  secondaryCta: { label: "Read the docs", href: "https://docs.verisec.dev" },
} as const;

export const quickstart = {
  badge: "Quickstart",
  heading: "First call in 3 steps",
  note: "Time to first response ≈ 2 minutes",
  steps: [
    {
      id: "project",
      title: "Create a project",
      body: "Sign up and name your project. Every new project starts with free credits, no card and no approval.",
    },
    {
      id: "key",
      title: "Copy your test key",
      body: "Portal → API Keys. Test keys start with sk_test_ and are sent straight as a bearer token.",
    },
    {
      id: "request",
      title: "Make your first request",
      body: "Run the snippet below. It reads a passport's machine-readable zone and checks every check digit.",
    },
  ],
  codeTitle: "read a passport MRZ",
  code: `curl -X POST ${BASE_URL}/v1/mrz/parse \\
  -H "Authorization: Bearer sk_test_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "lines": [
      "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
      "L898902C36UTO7408122F1204159ZE184226B<<<<<10"
    ]
  }'`,
} as const;

export const productApis = {
  badge: "Products as APIs",
  heading: "Nine products, one key.",
  items: [
    {
      id: "kyc",
      href: "/api-keys/playground/",
      name: "KYC",
      description: "Document, chip, face, liveness and screening, composed into one decision.",
      icon: "id-card",
      featured: true,
    },
    {
      id: "documents",
      href: "/api-keys/playground/?group=Document",
      name: "Document Recognition & Authenticity",
      description: "Read ~1,400 document types and detect tampering.",
      icon: "file-check",
      featured: true,
    },
    {
      id: "mrz",
      href: "/api-keys/playground/?group=MRZ",
      name: "MRZ",
      description: "Read the machine-readable zone on passports, IDs and visas.",
      icon: "scan-line",
      featured: true,
    },
    {
      id: "nfc",
      href: "/api-keys/playground/?group=Document",
      name: "NFC / ePassport",
      description: "Read and cryptographically verify the chip.",
      icon: "nfc",
      featured: false,
    },
    {
      id: "face",
      href: "/api-keys/playground/?group=Face",
      name: "Face",
      description: "1:1 match, 1:N search, liveness and attributes.",
      icon: "scan-face",
      featured: false,
    },
    {
      id: "aml",
      href: "/api-keys/playground/?group=Contact%20%26%20risk",
      name: "AML Screening",
      description: "Sanctions, PEP, adverse media and crypto-risk lists.",
      icon: "user-search",
      featured: false,
    },
    {
      id: "cards",
      href: "/fin/api-keys/playground/",
      name: "Cards & BIN",
      description: "Read a payment card and resolve its BIN to a network and issuer.",
      icon: "credit-card",
      featured: false,
    },
    {
      id: "micr",
      href: "/fin/api-keys/playground/",
      name: "MICR",
      description: "Read the magnetic line on bank cheques in one shot.",
      icon: "receipt",
      featured: false,
    },
    {
      id: "contact",
      href: "/api-keys/playground/?group=Contact%20%26%20risk",
      name: "Contact & Risk",
      description: "Email, phone, IP and wallet risk in one dossier.",
      icon: "file-scan",
      featured: false,
    },
  ],
} as const;

export const codeExamples = {
  badge: "Code examples",
  heading: "Verify a face, in your language.",
  responseTitle: "response",
  response: `{
  "ok": true,
  "request_id": "req_cd1d47ea5bf34b7a",
  "latency_ms": 2362,
  "data": {
    "similarity": 0.9984,
    "score": 0.2399,
    "match": true,
    "threshold": 0.75,
    "compared": [
      { "image": "image1", "roi": [182, 241, 173, 220] },
      { "image": "image2", "roi": [940, 245, 176, 216] }
    ]
  }
}`,
  languages: [
    {
      id: "curl",
      label: "cURL",
      code: `curl -X POST ${BASE_URL}/v1/face/verify \\
  -H "Authorization: Bearer $VERISEC_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"image1\\": \\"$(base64 -w0 selfie.jpg)\\",
    \\"image2\\": \\"$(base64 -w0 id-photo.jpg)\\",
    \\"threshold\\": 0.8
  }"`,
    },
    {
      id: "python",
      label: "Python",
      code: `from verisec import VeriSec

client = VeriSec()  # reads VERISEC_API_KEY

result = client.face.verify(
    image1="selfie.jpg",       # a path, bytes, or base64
    image2="id-photo.jpg",
    threshold=0.8,
)

print(result.match, result.similarity)`,
    },
    {
      id: "node",
      label: "Node",
      code: `import { VeriSec } from "@veriseclabs/node";

const client = new VeriSec(); // reads VERISEC_API_KEY

const result = await client.face.verify({
  image1: "selfie.jpg",        // a path, Buffer, or base64
  image2: "id-photo.jpg",
  threshold: 0.8,
});

console.log(result.match, result.similarity);`,
    },
    {
      id: "ruby",
      label: "Ruby",
      code: `require "verisec"

client = VeriSec::Client.new # reads VERISEC_API_KEY

result = client.face.verify(
  image1: "selfie.jpg",        # a path, IO, or base64
  image2: "id-photo.jpg",
  threshold: 0.8,
)

puts "#{result.match} #{result.similarity}"`,
    },
    {
      id: "go",
      label: "Go",
      code: `client, _ := verisec.New(os.Getenv("VERISEC_API_KEY"))

result, err := client.Face.Verify(ctx, &verisec.FaceVerifyParams{
    Image1:    verisec.ImageFromPath("selfie.jpg"),
    Image2:    verisec.ImageFromPath("id-photo.jpg"),
    Threshold: verisec.Float(0.8),
})
if err != nil {
    log.Fatal(err)
}

fmt.Println(result.Match, result.Similarity)`,
    },
    {
      id: "java",
      label: "Java",
      code: `VeriSec client = VeriSec.builder().build(); // reads VERISEC_API_KEY

FaceVerify result = client.face().verify(
    FaceVerifyParams.builder()
        .image1(Image.fromPath(Path.of("selfie.jpg")))
        .image2(Image.fromPath(Path.of("id-photo.jpg")))
        .threshold(0.8)
        .build());

System.out.println(result.match() + " " + result.similarity());`,
    },
    {
      id: "dotnet",
      label: ".NET",
      code: `var client = new VeriSecClient(); // reads VERISEC_API_KEY

var result = await client.Face.VerifyAsync(new FaceVerifyParams
{
    Image1 = Image.FromPath("selfie.jpg"),
    Image2 = Image.FromPath("id-photo.jpg"),
    Threshold = 0.8,
});

Console.WriteLine($"{result.Match} {result.Similarity}");`,
    },
    {
      id: "php",
      label: "PHP",
      code: `$client = new VeriSec\\Client(getenv('VERISEC_API_KEY'));

$result = $client->face->verify([
    'image1' => 'selfie.jpg',    // a path, stream, or base64
    'image2' => 'id-photo.jpg',
    'threshold' => 0.8,
]);

echo $result->match . ' ' . $result->similarity;`,
    },
  ],
} as const;

export type ServerSdk = {
  id: string;
  name: string;
  /** How to add the package. */
  install: string;
  /** The first line of code: import and construct. */
  importLine: string;
  /** One real call, to show the shape. */
  use: string;
  /** The public repository, when the source is on one. */
  repo?: string;
  /** The package is live on its registry. */
  published: boolean;
  /** Where it is published, shown when it is live (e.g. "PyPI"). */
  registry?: string;
};

export const sdks = {
  badge: "SDKs & libraries",
  heading: "Official clients, generated from the same contract.",
  serverHeading: "Server SDKs",
  serverNote:
    "One per language, version 1.0.0, generated from the API spec: typed requests and answers, images from files, safe retries that never charge a call twice, and webhook verification.",
  mobileHeading: "Mobile capture SDKs",
  mobileNote:
    "On-device capture with quality checks before an image leaves the handset. React Native, Android and Flutter are live; iOS is publishing soon.",
  soon: "Publishing soon",
  liveLabel: "Live",
  server: [
    {
      id: "python",
      name: "Python",
      install: "pip install verisec",
      importLine: "from verisec import VeriSec",
      use: 'client = VeriSec()\nclient.face.verify(image1="a.jpg", image2="b.jpg")',
      published: true,
      registry: "PyPI",
    },
    {
      id: "node",
      name: "Node.js",
      install: "npm install @veriseclabs/node",
      importLine: 'import { VeriSec } from "@veriseclabs/node";',
      use: 'const client = new VeriSec();\nawait client.bin.lookup("424242");',
      published: true,
      registry: "npm",
    },
    {
      id: "go",
      name: "Go",
      install: "go get github.com/mosesmmoisebidth/verisec-go",
      importLine: 'import "github.com/mosesmmoisebidth/verisec-go"',
      use: 'client, _ := verisec.New(key)\nclient.Bin.Lookup(ctx, "424242")',
      repo: "github.com/mosesmmoisebidth/verisec-go",
      published: true,
      registry: "Go",
    },
    {
      id: "java",
      name: "Java",
      install: 'implementation("io.github.mosesmmoisebidth:verisec-java:1.0.0")',
      importLine: "import dev.verisec.VeriSec;",
      use: "VeriSec client = VeriSec.builder().build();\nclient.bin().lookup(\"424242\");",
      published: true,
      registry: "Maven Central",
    },
    {
      id: "dotnet",
      name: ".NET",
      install: "dotnet add package VeriSec",
      importLine: "using VeriSec;",
      use: 'var client = new VeriSecClient();\nawait client.Bin.LookupAsync("424242");',
      repo: "github.com/mosesmmoisebidth/verisec-nuget",
      published: true,
      registry: "NuGet",
    },
    {
      id: "php",
      name: "PHP",
      install: "composer require verisec/verisec-php",
      importLine: "use VeriSec\\Client;",
      use: "$client = new Client($key);\n$client->bin->lookup('424242');",
      repo: "github.com/mosesmmoisebidth/packagist-verisec",
      published: true,
      registry: "Packagist",
    },
    {
      id: "ruby",
      name: "Ruby",
      install: "gem install verisec",
      importLine: 'require "verisec"',
      use: 'client = VeriSec::Client.new\nclient.bin.lookup("424242")',
      published: true,
      registry: "RubyGems",
    },
  ] satisfies ServerSdk[],
  mobile: [
    {
      id: "react-native",
      name: "React Native",
      install: "npm install @veriseclabs/capture-react-native",
      importLine: 'import { VeriSecCapture } from "@veriseclabs/capture-react-native";',
      use: 'const result = await VeriSecCapture.start({\n  steps: ["id-front", "id-back", "selfie"],\n});',
      published: true,
      registry: "npm",
    },
    {
      id: "android",
      name: "Android · Kotlin",
      install: 'implementation("com.github.mosesmmoisebidth:verisec-kotlin:0.1.0")',
      importLine: '// settings.gradle: maven { url "https://jitpack.io" }',
      use: "val capture = VeriSecCapture(context)\ncapture.start(listOf(Step.ID_FRONT, Step.SELFIE))",
      repo: "github.com/mosesmmoisebidth/verisec-kotlin",
      published: true,
      registry: "JitPack",
    },
    {
      id: "flutter",
      name: "Flutter",
      install: "flutter pub add verisec_api",
      importLine: "import 'package:verisec_api/verisec_api.dart';",
      use: "final result = await VeriSecCapture.start(\n  steps: [Step.idFront, Step.selfie],\n);",
      published: true,
      registry: "pub.dev",
    },
    {
      id: "ios",
      name: "iOS · Swift",
      install: "pod 'VeriSecCapture'",
      importLine: "import VeriSecCapture",
      use: "let capture = VeriSecCapture()\ncapture.start(steps: [.idFront, .selfie])",
      published: false,
    },
  ] satisfies ServerSdk[],
} as const;

export const environments = {
  badge: "Authentication & environments",
  heading: "Two key types, one code path.",
  note: "Keys are created in the console, scoped per project, and shown once. Each call is charged in credits only when it succeeds; a refused call (no credits, no permission, rate limited) is free.",
  cards: [
    {
      id: "test",
      name: "Test",
      keyPrefix: "sk_test_…",
      body: `A test key is sent straight as Authorization: Bearer. It runs against the real engines at ${BASE_URL}, with your free credits and no live data.`,
      limits: "Every endpoint is available. Refused calls are never charged.",
      featured: false,
    },
    {
      id: "live",
      name: "Live",
      keyPrefix: "ak_live_…",
      body: "A live key is paired with a client id and secret. Your SDK exchanges them at POST /v2/oauth/token for a short-lived bearer token and renews it for you; the long-lived key is never sent on a request.",
      limits: "Per-key rate limits, an optional spend cap, and an IP allow-list.",
      featured: true,
    },
  ],
} as const;

export const sandbox = {
  badge: "Test data",
  heading: "Try the APIs with a test key.",
  intro:
    "A test key runs against the real engines for free. Use the Playground for the image APIs, or send one of these ready-made inputs straight to the live endpoints.",
  samplesHeading: "Sample cheques and cards",
  samplesNote:
    "Three cheques and three cards, run through our engines. Each image shows every text region found; on cheques the MICR line the read returned is outlined in amber. Open one in the Playground to try it yourself.",
  /** The images and JSON come from src/config/developer-samples.ts (generated from the engines' real output). */
  samplesHref: "/fin/api-keys/playground/",
  inputsHeading: "Test inputs for the other APIs",
  inputsNote: "Copy a value and paste it into the matching endpoint. Every one is synthetic test data.",
  /** Real, varied fixtures across the products we actually serve (not just cards). */
  inputs: [
    {
      id: "mrz",
      icon: "scan-line" as const,
      label: "Passport MRZ",
      endpoint: "/v1/mrz/read",
      hint: "An ICAO specimen passport. Paste both lines into the MRZ reader.",
      value:
        "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10",
      mono: true,
    },
    {
      id: "aml",
      icon: "user-search" as const,
      label: "AML screening name",
      endpoint: "/v1/screen/sanctions",
      hint: "A sanctioned public figure, so the screen returns scored hits.",
      value: "Vladimir Vladimirovich Putin",
      mono: false,
    },
    {
      id: "bin",
      icon: "credit-card" as const,
      label: "BIN lookup",
      endpoint: "/v2/bin",
      hint: "The first 8 digits resolve to the network, country and issuing bank.",
      value: "42424242",
      mono: true,
    },
  ],
  imagesNote:
    "Sample passports, IDs, cheques and selfies for the image APIs are built into the Playground, so you do not need your own files to start.",
  playgroundCta: { label: "Open the Playground", href: "/api-keys/playground/" },
  playgroundNote: "The Playground runs inside the portal and asks you to sign in first.",
} as const;

export const webhooks = {
  badge: "Webhooks",
  heading: "Every decision, pushed to you.",
  columns: ["Event", "Description"],
  events: [
    { event: "verification.completed", description: "A verification finished and a decision is available." },
    { event: "verification.needs_review", description: "A verification landed in the manual review queue." },
    { event: "verification.declined", description: "A verification was declined by the workflow rules." },
    { event: "aml.hit", description: "A screening returned one or more scored hits." },
    { event: "credits.low", description: "Remaining credits fell below your configured threshold." },
  ],
  payloadTitle: "sample payload",
  payload: `{
  "type": "verification.completed",
  "timestamp": "2026-10-17T14:02:15.221Z",
  "environment": "test",
  "data": {
    "verification_id": "ver_7Kq2W9xLm3Ab",
    "reference": "u_10422",
    "decision": "approved",
    "trust_seal": { "score": 94 },
    "checks": {
      "document_authenticity": "pass",
      "face_match": "pass",
      "liveness": "pass",
      "aml_screening": "clear"
    }
  }
}`,
  signatureHeading: "Verifying the signature",
  signatureBody:
    "Deliveries are signed as Standard Webhooks: webhook-id, webhook-timestamp and webhook-signature. Your SDK verifies them in one call; here it is by hand. Pass the raw body before parsing, and reject a stale timestamp.",
  signatureTitle: "verify-signature.js",
  signatureCode: `import crypto from "node:crypto";

// Headers: webhook-id, webhook-timestamp, webhook-signature: "v1,<base64 HMAC>"
export function verify(rawBody, headers, secret) {
  const id = headers["webhook-id"];
  const ts = headers["webhook-timestamp"];
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");

  const expected = crypto
    .createHmac("sha256", key)
    .update(\`\${id}.\${ts}.\${rawBody}\`)
    .digest("base64");

  const ok = headers["webhook-signature"]
    .split(" ")
    .some((part) => {
      const [, value] = part.split(",");
      return value && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
    });

  const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300;
  return ok && fresh;
}`,
} as const;

export const guides = {
  badge: "Guides & tutorials",
  heading: "Task-based walkthroughs.",
  items: [
    {
      id: "face-match",
      minutes: "5 min",
      title: "1:1 face match against an ID",
      description: "Compare a live selfie to the portrait on a document, with a threshold you set.",
      href: `${DOCS_URL}/docs/api/face`,
    },
    {
      id: "document",
      minutes: "6 min",
      title: "Read and authenticate a document",
      description: "Classify ~1,400 document types, read every field, and check for tampering.",
      href: `${DOCS_URL}/docs/api/document`,
    },
    {
      id: "aml",
      minutes: "5 min",
      title: "Screen a name against AML lists",
      description: "Run a sanctions and PEP screening, then read the scored hits.",
      href: `${DOCS_URL}/docs/kyc/screening`,
    },
    {
      id: "card",
      minutes: "5 min",
      title: "Scan a bank card → issuer",
      description: "Read the card, validate Luhn, and resolve the BIN to a network and issuer.",
      href: `${DOCS_URL}/docs/api/cards`,
    },
    {
      id: "webhooks",
      minutes: "4 min",
      title: "Receive and verify webhooks",
      description: "Register an endpoint, verify the Standard Webhooks signature, and read the event.",
      href: `${DOCS_URL}/docs/webhooks`,
    },
  ],
} as const;

export const apiReference = {
  badge: "API reference",
  heading: "Endpoints, grouped by product.",
  note: `Base URL ${BASE_URL}. KYC APIs are under /v1, Financial under /v2. Full request and answer types are in each SDK and the OpenAPI spec.`,
  defaultOpen: "face",
  groups: [
    {
      id: "face",
      name: "Face",
      endpoints: [
        { method: "POST", path: "/v1/face/verify", description: "Compare two faces (1:1) and decide on a threshold." },
        { method: "POST", path: "/v1/face/match", description: "Match faces across images and return every pair." },
        { method: "POST", path: "/v1/face/search", description: "Search a gallery (1:N) for the closest faces." },
        { method: "POST", path: "/v1/liveness", description: "Passive liveness from one image." },
        { method: "POST", path: "/v1/face/attributes", description: "Age, expression, glasses, mask and more." },
        { method: "POST", path: "/v1/age/verify", description: "Estimate age and check a minimum." },
      ],
    },
    {
      id: "documents",
      name: "Documents & MRZ",
      endpoints: [
        { method: "POST", path: "/v1/idv/read", description: "Classify a document and read every field." },
        { method: "POST", path: "/v1/idv/authenticity", description: "Run tamper and recapture detection." },
        { method: "POST", path: "/v1/idv/portrait", description: "Crop the portrait as a reusable token." },
        { method: "POST", path: "/v1/mrz/read", description: "Find and read the MRZ on a document image." },
        { method: "POST", path: "/v1/mrz/parse", description: "Parse MRZ lines and check every check digit." },
        { method: "POST", path: "/v1/poa/analyze", description: "Read a proof-of-address document." },
      ],
    },
    {
      id: "contact",
      name: "Contact & risk",
      endpoints: [
        { method: "POST", path: "/v1/screen/sanctions", description: "Screen a person or entity against sanctions and PEP lists." },
        { method: "POST", path: "/v1/email/verify", description: "Check an email's deliverability and risk." },
        { method: "POST", path: "/v1/phone/lookup", description: "Line type, carrier and risk for a phone number." },
        { method: "POST", path: "/v1/screen/ip", description: "Reputation and anonymiser signals for an IP." },
        { method: "POST", path: "/v1/verify/contact", description: "Email, phone, IP and wallet in one dossier." },
      ],
    },
    {
      id: "financial",
      name: "Cheques, cards & BIN",
      endpoints: [
        { method: "POST", path: "/v2/cheques/read", description: "Read the whole cheque: MICR, face and bank." },
        { method: "POST", path: "/v2/cards/read", description: "Read a payment card and resolve its BIN." },
        { method: "POST", path: "/v2/cards/check", description: "Check a typed card number: Luhn, scheme, expiry." },
        { method: "GET", path: "/v2/bin/{digits}", description: "Look up a BIN: network, type, issuer and country." },
        { method: "GET", path: "/v2/banks", description: "Find a bank by name, country or BIC." },
      ],
    },
  ],
  responseHeading: "Response shape",
  responseBody:
    "A KYC answer comes in an envelope { ok, request_id, latency_ms, data, warnings, error } and the SDKs return its data. A Financial answer is an object with an object type. A field with no value is left out, never null.",
  statusHeading: "Status codes",
  statusCodes: [
    { code: "200", description: "The call ran. Check ok in the body: a result is in data." },
    { code: "400", description: "A field is missing or not valid, see error.code and error.param." },
    { code: "401", description: "Missing, malformed, revoked or expired key." },
    { code: "402", description: "Not enough credits, or the key hit its spend cap. Nothing was charged." },
    { code: "403", description: "The key may not call this API, or live access isn't approved." },
    { code: "404", description: "Nothing was found." },
    { code: "429", description: "Rate limited, retry after the Retry-After header. Not charged." },
    { code: "5xx", description: "Our side. The call did not complete and was not charged." },
  ],
  errorTitle: "standard error format",
  errorExample: `{
  "ok": false,
  "request_id": "req_9Xb2LpQ4",
  "error": {
    "code": "document_image_unreadable",
    "message": "The front image could not be read. Send a JPEG or PNG under 12 MB.",
    "param": "image_front"
  }
}`,
} as const;

export const changelog = {
  badge: "Changelog & versioning",
  heading: "What shipped.",
  note: "The API is versioned in its path: KYC under /v1, Financial under /v2. New fields are added without breaking the ones already there, and a field is never removed from a version, so your integration keeps working. There is no version header to set.",
  entries: [
    {
      version: "v1.0",
      date: "17 Oct 2026",
      body: "First public release: 69 endpoints across Face, Documents, MRZ, NFC, AML, Contact & risk, Cheques, Cards and BIN, with seven official server SDKs (Python, Node, Go, Java, .NET, PHP, Ruby) generated from the same contract.",
    },
  ],
} as const;
