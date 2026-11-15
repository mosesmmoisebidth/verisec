/**
 * What a developer sends to, and gets back from, the Financial APIs the
 * Playground runs: one entry per call (cheque MICR, cheque deep read, card).
 * The parameters are exactly the ones the services accept; the example
 * responses are real reads of the sample images (fixtures.ts), so the
 * Playground can show the full request and a true response before anything
 * is run, and the response structure is derived from those reads, not typed by hand.
 */

import { API_HOST } from "@/lib/finance/content";
import { cardMc, cardTerminal, cardVisa, chequeBr, chequeCa, chequeDeepUs, chequeUs } from "@/lib/finance/fixtures";
import type { FinProduct } from "@/lib/finance/types";

export type ApiMode = "cheque" | "cheque_read" | "card";
export type SnippetLang = "cURL" | "Python" | "Node.js";

export interface ApiParam {
  name: string;
  in: "header" | "form";
  required: boolean;
  /** What goes in: "file", "string", or the allowed values. */
  type: string;
  default?: string;
  note: string;
}

export interface ApiDoc {
  title: string;
  method: "POST";
  path: string;
  params: ApiParam[];
  /** The example shown before a run, and which sample it is. */
  example: unknown;
  exampleOf: string;
  /** Every real read of this call, merged into the response structure. */
  reads: unknown[];
}

export function modeOf(product: FinProduct, deep: boolean): ApiMode {
  return product === "card" ? "card" : deep ? "cheque_read" : "cheque";
}

const HEADERS: ApiParam[] = [
  { name: "Authorization", in: "header", required: true, type: "Bearer <API key>", note: "Your secret API key. Keep it on your server." },
  { name: "Content-Type", in: "header", required: true, type: "multipart/form-data", note: "Set by your HTTP client when you attach the image." },
  { name: "X-VeriSec-Env", in: "header", required: false, type: "test | live", default: "test", note: "Which environment the read is recorded in." },
  { name: "X-VeriSec-Source", in: "header", required: false, type: "api | sdk", default: "api", note: "Where the call comes from, shown in your logs." },
];
const IMAGE: ApiParam = {
  name: "image",
  in: "form",
  required: true,
  type: "file",
  note: "JPG, PNG or BMP, up to 10 MB. Sent exactly as uploaded; never resized.",
};
const FORMAT: ApiParam = {
  name: "format",
  in: "form",
  required: false,
  type: "auto | e13b | cmc7",
  default: "auto",
  note: "The MICR font. auto finds it for you.",
};

export const API_DOCS: Record<ApiMode, ApiDoc> = {
  cheque: {
    title: "Cheque MICR read",
    method: "POST",
    path: "/v2/cheques/micr",
    params: [...HEADERS, IMAGE, FORMAT],
    example: chequeUs,
    exampleOf: "the US sample cheque",
    reads: [chequeUs, chequeCa, chequeBr],
  },
  cheque_read: {
    title: "Cheque deep read",
    method: "POST",
    path: "/v2/cheques/read",
    params: [...HEADERS, IMAGE, FORMAT],
    example: chequeDeepUs,
    exampleOf: "the US sample cheque",
    reads: [chequeDeepUs],
  },
  card: {
    title: "Card read",
    method: "POST",
    path: "/v2/cards/read",
    params: [...HEADERS, IMAGE],
    example: cardVisa,
    exampleOf: "the Visa debit sample",
    reads: [cardVisa, cardMc, cardTerminal],
  },
};

/** The file a request carries: the picked image, or a placeholder before one is picked. */
export interface RequestFile {
  name: string;
  type: string;
  size: number | null;
}

function kb(size: number | null): string {
  return size == null ? "" : `, ${Math.max(1, Math.round(size / 1024))} KB`;
}

/** The whole request as JSON: method, URL, headers (with the Bearer key) and body fields. */
export function requestJson(mode: ApiMode, file: RequestFile, format: string): Record<string, unknown> {
  const doc = API_DOCS[mode];
  const body: Record<string, string> = { image: `@${file.name} (${file.type}${kb(file.size)})` };
  if (doc.params.some((p) => p.name === "format")) body.format = format;
  return {
    method: doc.method,
    url: `${API_HOST}${doc.path}`,
    headers: {
      Authorization: "Bearer YOUR_API_KEY",
      "Content-Type": "multipart/form-data",
      "X-VeriSec-Env": "test",
    },
    body,
  };
}

/** The same request as it goes over the wire (HTTP/1.1, multipart body). */
export function requestHttp(mode: ApiMode, file: RequestFile, format: string): string {
  const doc = API_DOCS[mode];
  const b = "----VeriSecBoundary";
  const parts = [
    `--${b}`,
    `Content-Disposition: form-data; name="image"; filename="${file.name}"`,
    `Content-Type: ${file.type}`,
    "",
    `<${file.size == null ? "image bytes" : `${file.size} bytes of image`}>`,
  ];
  if (doc.params.some((p) => p.name === "format")) {
    parts.push(`--${b}`, 'Content-Disposition: form-data; name="format"', "", format);
  }
  parts.push(`--${b}--`);
  return [
    `${doc.method} ${doc.path} HTTP/1.1`,
    `Host: ${API_HOST.replace(/^https?:\/\//, "")}`,
    "Authorization: Bearer YOUR_API_KEY",
    `Content-Type: multipart/form-data; boundary=${b}`,
    "X-VeriSec-Env: test",
    "Accept: application/json",
    "",
    ...parts,
  ].join("\n");
}

/* ----------------------------------------------------------------------------
   Response structure: every field the call returned in its real reads, with its
   type. A field missing from some reads is marked optional (the API leaves out
   fields that have no value).
---------------------------------------------------------------------------- */

type Shape = { kinds: Set<string>; seen: number; total: number; keys?: Map<string, Shape>; items?: Shape };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function shapeOf(values: unknown[], total: number): Shape {
  const s: Shape = { kinds: new Set(), seen: values.length, total };
  const objs: Record<string, unknown>[] = [];
  const items: unknown[] = [];
  for (const v of values) {
    if (v === null) s.kinds.add("null");
    else if (Array.isArray(v)) {
      s.kinds.add("array");
      items.push(...v);
    } else if (isObj(v)) {
      s.kinds.add("object");
      objs.push(v);
    } else s.kinds.add(typeof v);
  }
  if (objs.length) {
    const keys = new Map<string, Shape>();
    const order: string[] = [];
    for (const o of objs) for (const k of Object.keys(o)) if (!order.includes(k)) order.push(k);
    for (const k of order) {
      const present = objs.filter((o) => k in o).map((o) => o[k]);
      keys.set(k, shapeOf(present, objs.length));
    }
    s.keys = keys;
  }
  if (items.length) s.items = shapeOf(items, items.length);
  return s;
}

function render(s: Shape): unknown {
  if (s.kinds.has("object") && s.keys) {
    const out: Record<string, unknown> = {};
    // "name?" = left out of some responses (the API drops fields that have no value).
    for (const [k, v] of s.keys) out[v.seen < v.total ? `${k}?` : k] = render(v);
    return out;
  }
  if (s.kinds.has("array")) return s.items ? [render(s.items)] : [];
  return [...s.kinds].join(" | ") || "unknown";
}

/** The response structure of a call: field names in order, each with its type
 * ("name?" marks a field that is left out when it has no value). */
export function responseStructure(mode: ApiMode): unknown {
  const reads = API_DOCS[mode].reads;
  return render(shapeOf(reads, reads.length));
}

/* ----------------------------------------------------------------------------
   Code snippets: the exact call, reading fields the real response has.
---------------------------------------------------------------------------- */

export const SNIPPET_LANGS: SnippetLang[] = ["cURL", "Python", "Node.js"];

export const SNIPPETS: Record<ApiMode, Record<SnippetLang, string>> = {
  cheque: {
    cURL: `curl -X POST ${API_HOST}/v2/cheques/micr \\
  -H "Authorization: Bearer $VERISEC_API_KEY" \\
  -H "X-VeriSec-Env: test" \\
  -F image=@cheque.jpg \\
  -F format=auto`,
    Python: `import os
import requests

res = requests.post(
    "${API_HOST}/v2/cheques/micr",
    headers={"Authorization": f"Bearer {os.environ['VERISEC_API_KEY']}"},
    files={"image": open("cheque.jpg", "rb")},
    data={"format": "auto"},                  # auto | e13b | cmc7
    timeout=60,
)
cheque = res.json()

if cheque["status"] in ("read", "partial"):
    line = cheque["micr"]                     # the strongest MICR line
    print(line["printed"])                    # as printed, with the MICR symbols
    for field in line["field_list"]:          # every field the font can carry
        print(field["name"], field["value"])  # "" when this line doesn't have it
else:
    print(cheque["issue"])                    # why nothing was read, in plain words`,
    "Node.js": `import { readFile } from "node:fs/promises";

const form = new FormData();
form.append("image", new Blob([await readFile("cheque.jpg")]), "cheque.jpg");
form.append("format", "auto"); // auto | e13b | cmc7

const res = await fetch("${API_HOST}/v2/cheques/micr", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.VERISEC_API_KEY}\` },
  body: form,
});
const cheque = await res.json();

if (cheque.status === "read" || cheque.status === "partial") {
  console.log(cheque.micr.printed);
  for (const f of cheque.micr.field_list) console.log(f.name, f.value);
} else {
  console.log(cheque.issue);
}`,
  },
  cheque_read: {
    cURL: `curl -X POST ${API_HOST}/v2/cheques/read \\
  -H "Authorization: Bearer $VERISEC_API_KEY" \\
  -H "X-VeriSec-Env: test" \\
  -F image=@cheque.jpg \\
  -F format=auto`,
    Python: `import os
import requests

res = requests.post(
    "${API_HOST}/v2/cheques/read",
    headers={"Authorization": f"Bearer {os.environ['VERISEC_API_KEY']}"},
    files={"image": open("cheque.jpg", "rb")},
    data={"format": "auto"},
    timeout=60,
)
read = res.json()

micr = read["micr"]                              # same shape as /v2/cheques/micr
vision = read.get("vision") or {}                # what is written on the cheque
amount = vision.get("amount") or {}
print(vision.get("payee"), amount.get("figures"), amount.get("agreement"))

bank = (read.get("bank") or {}).get("resolved")  # the bank, from our directory
if bank:
    print(bank["name"], bank.get("bic"), bank.get("city"))

for cheque in read.get("cheques", []):           # only when one photo holds several
    print(cheque["index"], (cheque.get("vision") or {}).get("payee"))`,
    "Node.js": `import { readFile } from "node:fs/promises";

const form = new FormData();
form.append("image", new Blob([await readFile("cheque.jpg")]), "cheque.jpg");
form.append("format", "auto");

const res = await fetch("${API_HOST}/v2/cheques/read", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.VERISEC_API_KEY}\` },
  body: form,
});
const read = await res.json();

console.log(read.vision?.payee, read.vision?.amount?.figures, read.bank?.resolved?.name);
for (const c of read.cheques ?? []) console.log(c.index, c.vision?.payee); // several cheques in one photo`,
  },
  card: {
    cURL: `curl -X POST ${API_HOST}/v2/cards/read \\
  -H "Authorization: Bearer $VERISEC_API_KEY" \\
  -H "X-VeriSec-Env: test" \\
  -F image=@card.jpg`,
    Python: `import os
import requests

res = requests.post(
    "${API_HOST}/v2/cards/read",
    headers={"Authorization": f"Bearer {os.environ['VERISEC_API_KEY']}"},
    files={"image": open("card.jpg", "rb")},
    timeout=60,
)
card = res.json()

if card["status"] in ("read", "partial"):
    c = card["card"]
    print(c.get("number"))                    # full number: in this response only, never stored
    expiry = next((f["value"] for f in c.get("fields", []) if f["name"] == "valid_thru"), None)
    print(expiry, c["luhn_valid"])
    print((card.get("bin") or {}).get("network"),
          ((card.get("bank") or {}).get("resolved") or {}).get("name"))
else:
    print(card["issue"])`,
    "Node.js": `import { readFile } from "node:fs/promises";

const form = new FormData();
form.append("image", new Blob([await readFile("card.jpg")]), "card.jpg");

const res = await fetch("${API_HOST}/v2/cards/read", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.VERISEC_API_KEY}\` },
  body: form,
});
const card = await res.json();

if (card.status === "read" || card.status === "partial") {
  const expiry = card.card.fields?.find((f) => f.name === "valid_thru")?.value;
  console.log(card.card.number, expiry, card.bin?.network, card.bank?.resolved?.name);
} else {
  console.log(card.issue);
}`,
  },
};
