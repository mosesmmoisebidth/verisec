"use client";

import { Fragment, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronRight, Copy, IdCard, LockKeyhole, Plus, ScanFace, ScanLine, ShieldCheck, Trash2, Workflow } from "lucide-react";

import { highlightLine, TOKEN_INK } from "@/lib/console/playground-snippets";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
   Product identity: every API belongs to one product, and the product is the
   one category worth colouring (every endpoint is a POST, so the verb carries
   no information). Each tint is an existing console token.
---------------------------------------------------------------------------- */

export const GROUP_META: Record<string, { icon: LucideIcon; tile: string; short: string }> = {
  Face: { icon: ScanFace, tile: "bg-lime-tint text-pine", short: "Face" },
  "Face workflows": { icon: Workflow, tile: "bg-lime-wash text-pine", short: "Workflows" },
  Document: { icon: IdCard, tile: "bg-info-tint text-info", short: "Document" },
  MRZ: { icon: ScanLine, tile: "bg-caution-tint text-caution", short: "MRZ" },
  "Contact & risk": { icon: ShieldCheck, tile: "bg-approve-tint text-approve", short: "Contact & risk" },
};

export function GroupTile({ group, size = "md" }: { group: string; size?: "sm" | "md" }) {
  const meta = GROUP_META[group] ?? GROUP_META.Face!;
  const Icon = meta.icon;
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center", meta.tile, size === "md" ? "size-10 rounded-[12px]" : "size-5 rounded-[6px]")}>
      <Icon className={size === "md" ? "size-[19px]" : "size-3"} strokeWidth={1.8} />
    </span>
  );
}

/* ----------------------------------------------------------------------------
   Copy (working), on light and on the dark code surface
---------------------------------------------------------------------------- */

export function CopyButton({ value, label = "Copy", tone = "dark" }: { value: string; label?: string; tone?: "dark" | "light" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked by the browser */
        }
      }}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill px-2.5 text-[11.5px] font-medium transition-colors",
        tone === "dark" ? "border border-white/12 text-code-ink hover:bg-white/8" : "border border-edge bg-page text-pine hover:bg-hover-light",
      )}
    >
      {copied ? <Check aria-hidden className={cn("size-3.5", tone === "dark" ? "text-lime" : "text-approve")} strokeWidth={2.2} /> : <Copy aria-hidden className="size-3.5" strokeWidth={1.8} />}
      {copied ? "Copied" : label}
    </button>
  );
}

/* ----------------------------------------------------------------------------
   Code with line numbers and indent guides, in the console's dark code palette
---------------------------------------------------------------------------- */

/** One line of code: a faint guide at every indent level, then the coloured tokens. */
export function CodeLineText({ line }: { line: string }) {
  const lead = /^ */.exec(line)?.[0].length ?? 0;
  const guides = Math.floor(lead / 2);
  const rest = line.slice(guides * 2);
  return (
    <>
      {Array.from({ length: guides }, (_, i) => (
        <span key={`g${i}`} className="inline-block w-[2ch] border-l border-json-guide">
          {"  "}
        </span>
      ))}
      {highlightLine(rest).map((t, j) => (
        <span key={j} className={TOKEN_INK[t.kind]}>
          {t.text}
        </span>
      ))}
    </>
  );
}

export function CodeLines({ code, maxLines }: { code: string; maxLines?: number }) {
  const all = code.split("\n");
  const lines = maxLines && all.length > maxLines ? all.slice(0, maxLines) : all;
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] font-mono text-[12.5px] leading-[21px] selection:bg-lime/25">
      {lines.map((line, i) => (
        <Fragment key={i}>
          <span className="tnum pr-4 text-right text-code-ink/30 select-none">{i + 1}</span>
          <span className="whitespace-pre">
            <CodeLineText line={line} />
          </span>
        </Fragment>
      ))}
      {maxLines && all.length > maxLines ? (
        <>
          <span />
          <span className="pt-1 font-sans text-[11.5px] text-code-ink/55">{`${all.length - maxLines} more lines in the download`}</span>
        </>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   JSON tree: every level sits inside a guide line, keys and values in their
   own colours, foldable, long values clipped, and base64 images rendered as
   thumbnails (a face crop or a document portrait shows up as the picture).
---------------------------------------------------------------------------- */

const IMG_PREFIX: [string, string][] = [
  ["/9j/", "image/jpeg"],
  ["iVBORw0KGgo", "image/png"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
];

function imageSrc(s: string): string | null {
  if (s.length < 200) return null;
  if (s.startsWith("data:image/")) return s;
  const hit = IMG_PREFIX.find(([p]) => s.startsWith(p));
  return hit ? `data:${hit[1]};base64,${s}` : null;
}

function preview(v: unknown): string {
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? "item" : "items"}`;
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    const parts = entries.slice(0, 3).map(([k, x]) => {
      if (x === null || typeof x !== "object") {
        const s = typeof x === "string" ? (x.length > 18 ? `"${x.slice(0, 16)}…"` : `"${x}"`) : String(x);
        return `${k}: ${s}`;
      }
      return `${k}: ${Array.isArray(x) ? "[…]" : "{…}"}`;
    });
    return parts.join(", ") + (entries.length > 3 ? ", …" : "");
  }
  return "";
}

/** Nodes that start folded whatever their depth (e.g. bounding boxes); they open on click like any other. */
export type FoldWhen = (name: string | null, value: unknown) => boolean;

export function JsonTree({ value, openDepth, foldWhen }: { value: unknown; openDepth: number; foldWhen?: FoldWhen }) {
  return (
    <div className="font-mono text-[12.5px] leading-[21px] text-code-ink selection:bg-lime/25">
      <JsonNode name={null} value={value} depth={0} openDepth={openDepth} last foldWhen={foldWhen} />
    </div>
  );
}

const P = ({ children }: { children: string }) => <span className="text-json-punct">{children}</span>;

function Scalar({ value }: { value: unknown }) {
  const [full, setFull] = useState(false);
  const [showB64, setShowB64] = useState(false);
  if (value === null || typeof value === "boolean") return <span className="text-json-atom">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-json-number">{value}</span>;
  const s = String(value);
  const img = imageSrc(s);
  if (img) {
    const kb = Math.round((s.length * 3) / 4 / 1024);
    return (
      <span className="inline-flex flex-col gap-1.5 py-1 align-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="Returned by the API" className="max-h-[140px] max-w-[240px] rounded-[8px] border border-white/10 bg-white/5 object-contain" />
        <span className="flex items-center gap-2 font-sans text-[11px] text-code-ink/60">
          {`Image, about ${kb} KB`}
          <button type="button" onClick={() => setShowB64((x) => !x)} className="rounded-pill border border-white/12 px-2 py-px text-code-ink hover:bg-white/8">
            {showB64 ? "Hide base64" : "Show base64"}
          </button>
        </span>
        {showB64 ? <span className="max-w-[60ch] break-all text-json-string">{`"${s}"`}</span> : null}
      </span>
    );
  }
  if (s.length > 160 && !full) {
    return (
      <span>
        <span className="text-json-string">{`"${s.slice(0, 120)}…"`}</span>{" "}
        <button type="button" onClick={() => setFull(true)} className="rounded-pill border border-white/12 px-2 py-px font-sans text-[11px] text-code-ink hover:bg-white/8">
          {`+${s.length - 120} characters`}
        </button>
      </span>
    );
  }
  return <span className="break-all text-json-string">{`"${s}"`}</span>;
}

/** A list whose items are all short enough to flow across the line (no images, tokens or deep objects). */
function packs(v: unknown[]): boolean {
  return v.length > 1 && v.every((x) => (x === null || typeof x !== "object" ? typeof x !== "string" || x.length <= 40 : isShort(x)));
}

/** A short array or object on one line, coloured like the rest of the tree. */
function inlineLength(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + inlineLength(x) + 2, 4);
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).reduce((n: number, [k, x]) => n + k.length + 4 + inlineLength(x) + 2, 4);
  return (JSON.stringify(v) ?? "null").length;
}
function nest(v: unknown): number {
  if (Array.isArray(v)) return 1 + Math.max(0, ...v.map(nest));
  if (v && typeof v === "object") return 1 + Math.max(0, ...Object.values(v as Record<string, unknown>).map(nest));
  return 0;
}
function isShort(v: unknown) {
  if (!v || typeof v !== "object") return false;
  const n = Array.isArray(v) ? v.length : Object.keys(v as object).length;
  if (n === 0) return true;
  if (nest(v) > 2 || inlineLength(v) > 72) return false;
  // never inline a long string (an image or a token): those get their own row
  return noLongStrings(v);
}
function noLongStrings(v: unknown): boolean {
  if (typeof v === "string") return v.length <= 46;
  if (Array.isArray(v)) return v.every(noLongStrings);
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).every(noLongStrings);
  return true;
}
function InlineJson({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (!value.length) return <P>[]</P>;
    return (
      <>
        <P>{"[ "}</P>
        {value.map((x, i) => (
          <span key={i}>
            <InlineJson value={x} />
            {i < value.length - 1 ? <P>{", "}</P> : null}
          </span>
        ))}
        <P>{" ]"}</P>
      </>
    );
  }
  if (value && typeof value === "object") {
    const e = Object.entries(value as Record<string, unknown>);
    if (!e.length) return <P>{"{}"}</P>;
    return (
      <>
        <P>{"{ "}</P>
        {e.map(([k, x], i) => (
          <span key={k}>
            <span className="text-json-key">{`"${k}"`}</span>
            <P>{": "}</P>
            <InlineJson value={x} />
            {i < e.length - 1 ? <P>{", "}</P> : null}
          </span>
        ))}
        <P>{" }"}</P>
      </>
    );
  }
  if (value === null || typeof value === "boolean") return <span className="text-json-atom">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-json-number">{value}</span>;
  return <span className="text-json-string">{`"${String(value)}"`}</span>;
}

function JsonNode({
  name,
  value,
  depth,
  openDepth,
  last,
  foldWhen,
}: {
  name: string | null;
  value: unknown;
  depth: number;
  openDepth: number;
  last: boolean;
  foldWhen?: FoldWhen;
}) {
  const isArr = Array.isArray(value);
  const isObj = !!value && typeof value === "object";
  // a node the caller folds (a bounding box, a list of boxes) starts closed and is always expandable, even when short
  const folded = isObj && !!foldWhen?.(name, value);
  // Expand all (a deep openDepth) opens the folded ones too; otherwise they start closed
  const [open, setOpen] = useState(folded ? openDepth >= 99 : depth < openDepth);
  const keyEl =
    name !== null ? (
      <>
        <span className="text-json-key">{`"${name}"`}</span>
        <P>{": "}</P>
      </>
    ) : null;

  if (!isObj || (isShort(value) && !folded)) {
    return (
      <div className="pl-[18px]">
        {keyEl}
        {isObj ? <InlineJson value={value} /> : <Scalar value={value} />}
        {last ? null : <P>,</P>}
      </div>
    );
  }
  const entries: [string, unknown][] = isArr ? (value as unknown[]).map((v, i) => [String(i), v]) : Object.entries(value as Record<string, unknown>);
  const [l, r] = isArr ? ["[", "]"] : ["{", "}"];
  return (
    <div>
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="mt-[4px] mr-1 grid size-[14px] shrink-0 place-items-center rounded-[4px] text-code-ink/50 hover:bg-white/10 hover:text-lime"
        >
          <ChevronRight aria-hidden className={cn("size-3 transition-transform", open && "rotate-90")} strokeWidth={2.4} />
        </button>
        <span className="min-w-0">
          {keyEl}
          {open ? (
            <P>{l}</P>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="text-left">
              <P>{l}</P>
              <span className="mx-1 rounded-[4px] bg-white/8 px-1.5 font-sans text-[11px] text-code-ink/75 hover:bg-white/12">{entries.length ? preview(value) : "empty"}</span>
              <P>{r}</P>
              {last ? null : <P>,</P>}
            </button>
          )}
        </span>
      </div>
      {open ? (
        <>
          {isArr && packs(value as unknown[]) ? (
            <div className="ml-[6px] flex flex-wrap gap-x-[1ch] border-l border-json-guide pl-[30px]">
              {(value as unknown[]).map((x, i, all) => (
                <span key={i} className="whitespace-nowrap">
                  {x !== null && typeof x === "object" ? <InlineJson value={x} /> : <Scalar value={x} />}
                  {i < all.length - 1 ? <P>,</P> : null}
                </span>
              ))}
            </div>
          ) : (
            <div className="ml-[6px] border-l border-json-guide pl-[12px]">
              {entries.map(([k, v], i) => (
                <JsonNode key={k} name={isArr ? null : k} value={v} depth={depth + 1} openDepth={openDepth} last={i === entries.length - 1} foldWhen={foldWhen} />
              ))}
            </div>
          )}
          <div className="pl-[18px]">
            <P>{r}</P>
            {last ? null : <P>,</P>}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   `code` spans inside reference copy
---------------------------------------------------------------------------- */

export function InlineCode({ text, tone = "dark" }: { text: string; tone?: "dark" | "light" }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className={cn("rounded-[5px] px-1.5 py-px font-mono text-[11.5px]", tone === "dark" ? "bg-white/8 text-json-key" : "bg-well text-pine")}>
            {p}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/* ----------------------------------------------------------------------------
   Headers and the raw JSON body editor
---------------------------------------------------------------------------- */

export type HeaderRow = { name: string; value: string; on: boolean };

export function HeaderEditor({ rows, setRows }: { rows: HeaderRow[]; setRows: (fn: (r: HeaderRow[]) => HeaderRow[]) => void }) {
  const cell = "h-9 min-w-0 rounded-[9px] border border-edge bg-page px-2.5 font-mono text-[12px] text-pine outline-none hover:border-[#cbd3dd] focus:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/60";
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_32px] gap-2 px-0.5 text-[11px] font-medium text-slate">
        <span />
        <span>Header</span>
        <span>Value</span>
        <span />
      </div>
      <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_32px] items-center gap-2">
        <span aria-hidden className="grid size-[18px] place-items-center rounded-[5px] bg-pine/40 text-page">
          <Check className="size-3" strokeWidth={3} />
        </span>
        <span className="flex h-9 items-center gap-1.5 rounded-[9px] bg-well px-2.5 font-mono text-[12px] text-slate">
          <LockKeyhole aria-hidden className="size-3.5" strokeWidth={1.8} />
          Content-Type
        </span>
        <span className="flex h-9 items-center rounded-[9px] bg-well px-2.5 font-mono text-[12px] text-slate">application/json</span>
        <span />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_32px] items-center gap-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={row.on}
            aria-label={`Send header ${row.name || i + 1}`}
            onClick={() => setRows((r) => r.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
            className={cn("grid size-[18px] place-items-center rounded-[5px] border transition-colors", row.on ? "border-pine bg-pine text-lime" : "border-[#c9d1db] bg-page text-transparent hover:border-pine/50")}
          >
            <Check aria-hidden className="size-3" strokeWidth={3} />
          </button>
          <input aria-label={`Header ${i + 1} name`} value={row.name} placeholder="X-Request-Id" onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={cell} />
          <input aria-label={`Header ${i + 1} value`} value={row.value} placeholder="Value" onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, value: e.target.value, on: e.target.value.trim() ? true : x.on } : x)))} className={cell} />
          <button type="button" aria-label="Remove header" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-pill text-slate hover:bg-danger-tint hover:text-danger">
            <Trash2 aria-hidden className="size-3.5" strokeWidth={1.8} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows((r) => [...r, { name: "", value: "", on: true }])} className="mt-1 inline-flex h-9 items-center gap-1.5 self-start rounded-pill border border-edge bg-page px-3.5 text-[12.5px] font-medium text-pine hover:bg-hover-light">
        <Plus aria-hidden className="size-3.5" strokeWidth={2.2} />
        Add header
      </button>
    </div>
  );
}

/**
 * A JSON editor that looks like one: the console's dark code surface, line numbers, and live syntax colour. The
 * colours come from a highlighted layer drawn under a transparent textarea with identical metrics, so typing,
 * selection and the caret stay native while every key, string, number and atom keeps its colour.
 */
export function JsonEditor({
  value,
  onChange,
  onBlur,
  error,
  label = "Request body JSON",
  minLines = 8,
  maxLines = 24,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error: string | null;
  label?: string;
  minLines?: number;
  maxLines?: number;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLPreElement>(null);
  const lines = value.split("\n");
  const height = Math.min(maxLines, Math.max(minLines, lines.length)) * 21 + 26;
  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-[14px] bg-code-bg shadow-[0_10px_26px_-16px_rgb(10_35_28/0.7)] ring-1 transition-shadow",
        error ? "ring-destructive/70" : "ring-black/10 focus-within:ring-2 focus-within:ring-lime/55",
      )}
    >
      <div ref={gutter} aria-hidden className="w-11 shrink-0 overflow-hidden border-r border-white/8 bg-code-chrome py-[13px] text-right font-mono text-[12.5px] leading-[21px] text-code-ink/35 select-none" style={{ height }}>
        {lines.map((_, i) => (
          <div key={i} className="tnum pr-2.5">
            {i + 1}
          </div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1" style={{ height }}>
        <pre ref={layer} aria-hidden className="pointer-events-none absolute inset-0 m-0 overflow-hidden px-3 py-[13px] font-mono text-[12.5px] leading-[21px] whitespace-pre text-code-ink">
          {lines.map((line, i) => (
            <div key={i}>
              <CodeLineText line={line} />
              {line === "" ? " " : null}
            </div>
          ))}
        </pre>
        <textarea
          aria-label={label}
          aria-invalid={!!error}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onScroll={(e) => {
            const t = e.currentTarget;
            if (layer.current) {
              layer.current.scrollTop = t.scrollTop;
              layer.current.scrollLeft = t.scrollLeft;
            }
            if (gutter.current) gutter.current.scrollTop = t.scrollTop;
          }}
          className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent px-3 py-[13px] font-mono text-[12.5px] leading-[21px] whitespace-pre text-transparent caret-lime outline-none selection:bg-lime/25 [scrollbar-color:rgb(207_224_216/0.25)_transparent] [scrollbar-width:thin]"
        />
      </div>
    </div>
  );
}
