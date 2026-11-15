import { Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The response block — Desktop-45's `Background+Border+Shadow` → `Pre`.
 *
 * Highlighted by a twenty-line tokeniser rather than a syntax library, for the
 * same reason the dashboard's charts are hand-rolled SVG: a highlighter ships a
 * theme, and a theme has to be argued out of its own colours before it will
 * agree with a lime button. This produces the four token classes JSON actually
 * has, renders on the server, and adds nothing to the client bundle.
 *
 * The palette is the brand's, not the frame's. Desktop-45 draws a generic
 * editor theme — blue keys, orange strings — which is what you get by
 * screenshotting an IDE. These are pine, lime and the ramp.
 */

type Kind = "key" | "string" | "number" | "atom" | "plain";

/**
 * Order matters: a key is a string followed by a colon, so it has to be tried
 * before the bare-string alternative or every key matches as a value.
 */
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

  // A plain `while` over `exec`, not a `.map()` — this accumulates, and an
  // accumulator inside a callback the compiler may memoise is the
  // `react-hooks/immutability` trap the dashboard's Donut hit.
  let match: RegExpExecArray | null;
  SCAN.lastIndex = 0;
  while ((match = SCAN.exec(source)) !== null) {
    if (match.index > last) out.push({ text: source.slice(last, match.index), kind: "plain" });

    // Destructured so each branch narrows a local. Groups 1 and 2 always match
    // together (a key IS a string followed by a colon), which the `&&` states
    // rather than assumes.
    const [, key, colon, str, num, atom] = match;
    if (key !== undefined && colon !== undefined) {
      out.push({ text: key, kind: "key" });
      out.push({ text: colon, kind: "plain" });
    } else if (str !== undefined) {
      out.push({ text: str, kind: "string" });
    } else if (num !== undefined) {
      out.push({ text: num, kind: "number" });
    } else if (atom !== undefined) {
      out.push({ text: atom, kind: "atom" });
    }

    last = match.index + match[0].length;
  }

  if (last < source.length) out.push({ text: source.slice(last), kind: "plain" });
  return out;
}

export function CodeBlock({
  label,
  copyLabel,
  body,
  className,
}: {
  label: string;
  copyLabel: string;
  body: string;
  className?: string;
}) {
  const tokens = tokenise(body);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-shell border border-hairline bg-code-bg",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-white/8 bg-code-chrome px-3 py-2">
        {/* The frame's three window dots. Decorative — they are a visual quote
            of a terminal, not controls, so they are hidden rather than
            announced as three unlabelled somethings. */}
        <span aria-hidden className="flex shrink-0 gap-1.5">
          <span className="size-2.5 rounded-pill bg-danger" />
          <span className="size-2.5 rounded-pill bg-caution" />
          <span className="size-2.5 rounded-pill bg-lime" />
        </span>
        <span className="tnum min-w-0 flex-1 truncate font-mono text-[11px] text-code-ink">
          {label}
        </span>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-white/12 px-2.5 py-1 text-micro text-code-ink transition-colors hover:bg-white/8"
        >
          <Copy aria-hidden className="size-3" strokeWidth={1.8} />
          {copyLabel}
        </button>
      </div>

      <pre className="m-0 min-h-0 flex-1 overflow-auto p-4 font-mono text-[12px] leading-[19px] text-code-ink">
        <code>
          {tokens.map((t, i) => (
            <span key={i} className={INK[t.kind]}>
              {t.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
