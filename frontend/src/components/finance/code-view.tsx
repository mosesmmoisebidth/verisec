"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { JsonTree } from "@/components/api-keys/playground-parts";
import { isBoundingBox } from "@/lib/finance/json-brief";

import { cn } from "@/lib/utils";

/**
 * The console's code block (window dots, label, brand-palette highlighting)
 * with a Copy button that actually copies, and says so. Used for the API
 * responses and code snippets in this portal, where copying is the point.
 *
 * Highlighting is the same four-token scan as `api-keys/code-block.tsx`:
 * keys, strings, numbers, and true / false / null.
 */
type Kind = "key" | "string" | "number" | "atom" | "plain";

const SCAN =
  /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

const INK: Record<Kind, string> = {
  key: "text-code-key",
  string: "text-code-string",
  number: "text-code-number",
  atom: "text-code-atom",
  plain: "text-code-ink",
};

function tokenise(source: string): { text: string; kind: Kind }[] {
  const out: { text: string; kind: Kind }[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const scan = new RegExp(SCAN.source, "g");
  while ((match = scan.exec(source)) !== null) {
    if (match.index > last) out.push({ text: source.slice(last, match.index), kind: "plain" });
    const [, key, colon, str, num, atom] = match;
    if (key !== undefined && colon !== undefined) {
      out.push({ text: key, kind: "key" });
      out.push({ text: colon, kind: "plain" });
    } else if (str !== undefined) out.push({ text: str, kind: "string" });
    else if (num !== undefined) out.push({ text: num, kind: "number" });
    else if (atom !== undefined) out.push({ text: atom, kind: "atom" });
    last = match.index + match[0].length;
  }
  if (last < source.length) out.push({ text: source.slice(last), kind: "plain" });
  return out;
}

export function CodeView({
  label,
  body,
  copyValue,
  className,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  tree,
}: {
  label: string;
  body: string;
  /** A JSON value to show as an expandable tree (bounding boxes start folded) instead of the text body. */
  tree?: unknown;
  /** What Copy puts on the clipboard when the panel shows a shortened view (default: body). */
  copyValue?: string;
  className?: string;
  copyLabel?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const tokens = tokenise(body);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue ?? body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked by the browser */
    }
  }

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-shell border border-hairline bg-code-bg", className)}>
      <div className="flex shrink-0 items-center gap-3 border-b border-white/8 bg-code-chrome px-3 py-2">
        <span aria-hidden className="flex shrink-0 gap-1.5">
          <span className="size-2.5 rounded-pill bg-danger" />
          <span className="size-2.5 rounded-pill bg-caution" />
          <span className="size-2.5 rounded-pill bg-lime" />
        </span>
        <span className="tnum min-w-0 flex-1 truncate font-mono text-[11px] text-code-ink">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-1 text-micro transition-colors",
            copied ? "border-lime/40 text-lime" : "border-white/12 text-code-ink hover:bg-white/8",
          )}
        >
          {copied ? <Check aria-hidden className="size-3" strokeWidth={2.2} /> : <Copy aria-hidden className="size-3" strokeWidth={1.8} />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      {tree !== undefined ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <JsonTree value={tree} openDepth={3} foldWhen={isBoundingBox} />
        </div>
      ) : (
        <pre className="m-0 min-h-0 flex-1 overflow-auto p-4 font-mono text-[12px] leading-[19px] text-code-ink">
          <code>
            {tokens.map((t, i) => (
              <span key={i} className={INK[t.kind]}>
                {t.text}
              </span>
            ))}
          </code>
        </pre>
      )}
    </div>
  );
}
