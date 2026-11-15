/**
 * JSON and code for the API Playground: a compact pretty-printer (short objects stay on one line, nesting is
 * indented), client snippets generated live from the request, and a highlighter that gives keys, strings, numbers,
 * atoms and punctuation clearly separate colours.
 *
 * Image fields are shown as a placeholder: the public API takes a base64 image (or a vault token), while the
 * Playground itself encrypts the file in the browser before it is sent.
 */

export const PUBLIC_BASE = "https://verisec.mmose.me";

export type SnippetLang = "curl" | "python" | "javascript";
export const SNIPPET_LANGS: { id: SnippetLang; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
];

/* ---------------------------------------------------------------- pretty JSON -- */

function inline(v: unknown): string {
  if (Array.isArray(v)) return v.length ? `[ ${v.map(inline).join(", ")} ]` : "[]";
  if (v && typeof v === "object") {
    const e = Object.entries(v as Record<string, unknown>);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v) ?? "null";
}

function depth(v: unknown): number {
  if (Array.isArray(v)) return 1 + Math.max(0, ...v.map(depth));
  if (v && typeof v === "object") return 1 + Math.max(0, ...Object.values(v as Record<string, unknown>).map(depth));
  return 0;
}

/** Every item short enough to share a line with its neighbours (no long strings such as images or tokens). */
function packable(v: unknown[]): boolean {
  return (
    v.length > 1 &&
    v.every((x) => {
      if (x === null || typeof x !== "object") return typeof x !== "string" || x.length <= 40;
      return depth(x) <= 2 && inline(x).length <= 44;
    })
  );
}

function fmt(v: unknown, indent: number, used: number, width: number, root: boolean): string {
  const one = inline(v);
  const container = !!v && typeof v === "object";
  if (!container || (!root && used + one.length <= width && depth(v) <= 2)) return one;
  const pad = " ".repeat(indent);
  const inner = " ".repeat(indent + 2);
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    // a list of short items flows across the line, like words in a paragraph
    if (packable(v)) {
      const max = Math.max(24, width - (indent + 2));
      const lines: string[] = [];
      let cur = "";
      v.forEach((x, i) => {
        const piece = inline(x) + (i < v.length - 1 ? "," : "");
        if (cur && cur.length + 1 + piece.length > max) {
          lines.push(cur);
          cur = piece;
        } else cur = cur ? `${cur} ${piece}` : piece;
      });
      if (cur) lines.push(cur);
      return `[\n${lines.map((l) => inner + l).join("\n")}\n${pad}]`;
    }
    return `[\n${v.map((x) => inner + fmt(x, indent + 2, indent + 2, width, false)).join(",\n")}\n${pad}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length) return "{}";
  return `{\n${entries
    .map(([k, x]) => {
      const key = `${JSON.stringify(k)}: `;
      return inner + key + fmt(x, indent + 2, indent + 2 + key.length, width, false);
    })
    .join(",\n")}\n${pad}}`;
}

/** Readable JSON: nested levels indented, short objects and arrays kept on one line. */
export function prettyJson(value: unknown, width = 76): string {
  return fmt(value, 0, 0, width, true);
}

/* ---------------------------------------------------------------- snippets -- */

function indentAfterFirst(text: string, spaces: number) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l, i) => (i === 0 ? l : pad + l))
    .join("\n");
}

/** JSON rendered as a Python literal (True / False / None). */
function pythonLiteral(value: unknown): string {
  return prettyJson(value).replace(/("(?:[^"\\]|\\.)*")|\b(true|false|null)\b/g, (m, str: string | undefined, atom: string | undefined) => {
    if (str) return str;
    return atom === "true" ? "True" : atom === "false" ? "False" : "None";
  });
}

/** A client snippet for the request. `payload` is the body exactly as the public API takes it (see playground-api.ts). */
export function buildSnippet(lang: SnippetLang, path: string, payload: Record<string, unknown>, apiKey: string): string {
  const url = `${PUBLIC_BASE}${path}`;
  if (lang === "python") {
    return [
      "import requests",
      "",
      "response = requests.post(",
      `    "${url}",`,
      `    headers={"Authorization": "Bearer ${apiKey}"},`,
      `    json=${indentAfterFirst(pythonLiteral(payload), 4)},`,
      "    timeout=180,",
      ")",
      "print(response.status_code, response.json())",
    ].join("\n");
  }
  if (lang === "javascript") {
    return [
      `const response = await fetch("${url}", {`,
      `  method: "POST",`,
      `  headers: {`,
      `    Authorization: "Bearer ${apiKey}",`,
      `    "Content-Type": "application/json",`,
      `  },`,
      `  body: JSON.stringify(${indentAfterFirst(prettyJson(payload), 2)}),`,
      `});`,
      ``,
      `console.log(response.status, await response.json());`,
    ].join("\n");
  }
  return [`curl -X POST ${url} \\`, `  -H "Authorization: Bearer ${apiKey}" \\`, `  -H "Content-Type: application/json" \\`, `  -d '${prettyJson(payload)}'`].join("\n");
}

/* ---------------------------------------------------------------- highlighting -- */

export type TokenKind = "key" | "string" | "number" | "atom" | "keyword" | "flag" | "comment" | "punct" | "plain";
export type Token = { text: string; kind: TokenKind };

const KEYWORDS = /^(curl|import|from|const|let|await|async|return|print|requests|fetch|console|JSON|method|headers|body|json|timeout)$/;
const ATOMS = /^(true|false|null|True|False|None)$/;

/**
 * One line at a time, so a code view can number its lines and draw indent guides. JSON keys, strings (double or
 * single quoted), numbers, atoms, flags (-X, -H, -d), keywords and punctuation each get their own colour.
 */
export function highlightLine(line: string): Token[] {
  const out: Token[] = [];
  // a comment starts at `#` or `//` only at the start of a line or after a space, so `https://` stays a URL
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|('(?:[^'\\]|\\.)*')|((?:^|(?<=\s))(?:#|\/\/).*$)|(\s-{1,2}[A-Za-z][\w-]*)|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_][\w]*)|([{}[\](),:])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), kind: "plain" });
    const [whole, dq, colon, sq, comment, flag, num, word, punct] = m;
    if (dq !== undefined) {
      out.push({ text: dq, kind: colon ? "key" : "string" });
      if (colon) out.push({ text: colon, kind: "punct" });
    } else if (sq !== undefined) out.push({ text: sq, kind: "string" });
    else if (comment !== undefined) out.push({ text: comment, kind: "comment" });
    else if (flag !== undefined) out.push({ text: flag, kind: "flag" });
    else if (num !== undefined) out.push({ text: num, kind: "number" });
    else if (word !== undefined) out.push({ text: word, kind: ATOMS.test(word) ? "atom" : KEYWORDS.test(word) ? "keyword" : "plain" });
    else if (punct !== undefined) out.push({ text: punct, kind: "punct" });
    else out.push({ text: whole, kind: "plain" });
    last = m.index + whole.length;
  }
  if (last < line.length) out.push({ text: line.slice(last), kind: "plain" });
  return out;
}

export const TOKEN_INK: Record<TokenKind, string> = {
  key: "text-json-key",
  string: "text-json-string",
  number: "text-json-number",
  atom: "text-json-atom",
  keyword: "text-json-atom",
  flag: "text-json-number",
  comment: "text-code-ink/45 italic",
  punct: "text-json-punct",
  plain: "text-code-ink",
};
