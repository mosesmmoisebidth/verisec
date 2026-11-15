"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Braces, Check, ChevronRight, ListPlus, Plus, Trash2, X } from "lucide-react";

import { JsonEditor } from "@/components/api-keys/playground-parts";
import { UploadSlot } from "@/components/api-keys/playground-upload";
import type { UploadKind } from "@/components/api-keys/playground-upload";
import { Select } from "@/components/ui/select";
import type { ListItem } from "@/lib/console/playground-body";
import type { Param } from "@/lib/console/playground-run";
import { cn } from "@/lib/utils";

/**
 * The request fields of the API Playground, built for people rather than for the wire format: a small labelled cell
 * for a short value, and a full-width editor card for anything structured (a set of attributes to pick, a list of
 * checks with ranges, MRZ lines). Every structured editor can still be switched to raw JSON.
 */

type Value = string | boolean | undefined;

export const COMPACT_KINDS = new Set<Param["kind"]>(["string", "number", "integer", "boolean", "enum", "rgb"]);
export const isCompact = (p: Param) => COMPACT_KINDS.has(p.kind) && !p.widget;
/** A structured picker (attributes, quality checks, MRZ lines): its own card, placed beside the others. */
export const isStructured = (p: Param) => !!p.widget && p.kind !== "image" && p.kind !== "images";

const TYPE_LABEL: Record<Param["kind"], string> = {
  image: "file",
  images: "files",
  string: "string",
  number: "number",
  integer: "integer",
  boolean: "boolean",
  enum: "enum",
  rgb: "[r,g,b]",
  "string[]": "array",
  json: "array",
};

const FIELD =
  "w-full rounded-[10px] border border-edge bg-page text-[13px] text-pine outline-none transition-colors placeholder:text-slate/70 hover:border-[#c6cfda] focus:border-pine/45 focus-visible:ring-2 focus-visible:ring-lime/60";

export function humanize(name: string) {
  const s = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function RequiredChip({ required }: { required?: boolean }) {
  return required ? (
    <span className="rounded-[6px] bg-danger-tint px-1.5 py-px text-[10.5px] font-medium text-danger">required</span>
  ) : (
    <span className="rounded-[6px] bg-well px-1.5 py-px text-[10.5px] text-slate">optional</span>
  );
}

/** Where the value goes in the request body, and its type: the developer's view of the field. */
function WireName({ param }: { param: Param }) {
  const path = param.path ?? param.name;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <code className="truncate font-mono text-[11px] text-slate" title={path}>
        {path}
      </code>
      <span className="shrink-0 rounded-[5px] bg-well px-1.5 py-px font-mono text-[10px] text-slate">{TYPE_LABEL[param.kind]}</span>
    </span>
  );
}

function defaultText(p: Param): string | null {
  if (p.default === undefined || p.default === "" || p.kind === "json" || p.kind === "string[]") return null;
  if (p.kind === "enum") return p.choices?.find((c) => c.value === String(p.default))?.label ?? null;
  if (p.kind === "boolean") return p.default ? "On" : "Off";
  if (p.kind === "rgb") return Array.isArray(p.default) ? (p.default as number[]).join(", ") : null;
  return String(p.default);
}

/* --------------------------------------------------- a colour (r, g, b) ---- */

function toHex(v: string): string {
  const [r, g, b] = String(v).split(/[\s,]+/).map((n) => Math.max(0, Math.min(255, Number(n) || 0)));
  return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, "0")).join("")}`;
}
function fromHex(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "255, 255, 255";
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function RgbControl({ id, value, onChange, invalid }: { id: string; value: Value; onChange: (v: string) => void; invalid: boolean }) {
  const text = String(value ?? "255, 255, 255");
  return (
    <span className="flex items-center gap-2">
      <label className="relative grid size-10 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-[10px] border border-edge" style={{ backgroundColor: toHex(text) }}>
        <input type="color" value={toHex(text)} onChange={(e) => onChange(fromHex(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a colour" />
      </label>
      <input
        id={id}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        inputMode="numeric"
        aria-invalid={invalid}
        placeholder="255, 255, 255"
        className={cn(FIELD, "h-10 flex-1 px-3 font-mono", invalid && "border-danger")}
      />
    </span>
  );
}

/* ----------------------------------------------------------------------------
   A short value: label, the wire name, the control, then the help
---------------------------------------------------------------------------- */

export function FieldCell({ param, value, onChange, error }: { param: Param; value: Value; onChange: (v: string | boolean) => void; error?: string | null }) {
  // Several endpoints stay mounted at once and share field names (ip, email), so each label needs its own id.
  const uid = useId();
  const id = `f-${param.name}${uid}`;
  const errId = `${id}-err`;
  const dflt = defaultText(param);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="truncate text-[13px] font-medium text-pine">
          {param.label}
        </label>
        <RequiredChip required={param.required} />
      </div>
      <Control param={param} id={id} value={value} onChange={onChange} invalid={!!error} describedBy={error ? errId : undefined} />
      {error ? (
        <p id={errId} role="alert" className="m-0 text-[12px] font-medium text-danger">
          {error}
        </p>
      ) : null}
      <WireName param={param} />
      {param.note || dflt ? (
        <p className="m-0 text-[12px] leading-[17px] text-slate">
          {param.note}
          {param.note && dflt ? " " : null}
          {dflt ? <span className="text-ink-soft">{`Default: ${dflt}.`}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

function Control({ param, id, value, onChange, invalid, describedBy }: { param: Param; id: string; value: Value; onChange: (v: string | boolean) => void; invalid: boolean; describedBy?: string }) {
  if (param.kind === "boolean") {
    const on = value === true;
    return (
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-3 rounded-[10px] border px-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-lime/60 focus-visible:outline-none",
          on ? "border-pine/25 bg-lime-wash" : "border-edge bg-page hover:border-[#c6cfda]",
        )}
      >
        <span className={cn("text-[13px] font-medium", on ? "text-pine" : "text-slate")}>{on ? "On" : "Off"}</span>
        <span className={cn("relative h-5 w-9 shrink-0 rounded-pill transition-colors", on ? "bg-pine" : "bg-[#cfd5dd]")}>
          <span className={cn("absolute top-0.5 size-4 rounded-pill bg-page shadow-[0_1px_3px_rgb(14_50_40/0.3)] transition-[left]", on ? "left-[18px]" : "left-0.5")} />
        </span>
      </button>
    );
  }
  if (param.kind === "enum") {
    const choices = param.choices ?? [];
    const labels = choices.map((c) => c.label);
    const current = choices.find((c) => c.value === String(value ?? ""))?.label ?? labels[0] ?? "";
    return (
      <Select
        id={id}
        label={param.label}
        options={labels}
        value={current}
        onValueChange={(lbl) => onChange(choices.find((c) => c.label === lbl)?.value ?? "")}
        block
        menuFixed
        className={cn(FIELD, "h-10 pr-9 pl-3")}
      />
    );
  }
  if (param.kind === "rgb") {
    return <RgbControl id={id} value={value} onChange={onChange} invalid={invalid} />;
  }
  return (
    <input
      id={id}
      type={param.kind === "number" || param.kind === "integer" ? "number" : "text"}
      inputMode={param.kind === "integer" ? "numeric" : param.kind === "number" ? "decimal" : undefined}
      spellCheck={false}
      autoComplete="off"
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder={param.required ? `Enter ${param.label.toLowerCase()}` : "Optional"}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={cn(FIELD, "h-10 px-3", invalid && "border-danger focus:border-danger")}
    />
  );
}

/* ----------------------------------------------------------------------------
   A structured value: a collapsible card with a summary, a friendly editor,
   and a switch to raw JSON
---------------------------------------------------------------------------- */

function parseList(value: Value): unknown[] | null {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** The picked names of a chips field. A `string[]` field stores plain lines; a `json` field stores `[{name}]`. */
function readChips(param: Param, value: Value): string[] {
  if (param.kind === "string[]") return String(value ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const list = parseList(value) ?? [];
  return list.map((x) => (x && typeof x === "object" ? String((x as { name?: unknown }).name ?? "") : String(x))).filter(Boolean);
}
function writeChips(param: Param, names: string[]): string {
  return param.kind === "string[]" ? names.join("\n") : JSON.stringify(names.map((name) => ({ name })), null, 2);
}

/** The JSON a developer edits for a chips field: every choice as true/false, so they toggle selections in JSON. */
function chipsToJson(param: Param, value: Value): string {
  const sel = new Set(readChips(param, value));
  const obj: Record<string, boolean> = {};
  for (const c of param.choices ?? []) obj[c.value] = sel.has(c.value);
  return JSON.stringify(obj, null, 2);
}
/** A boolean still being typed ("t", "tru", "fa") counts as the word it is becoming, so a toggle lands on the first key. */
function completeBooleans(text: string): string {
  return text.replace(/:(\s*)(?:t|tr|tru)(?=\s*[,}\n])/g, ":$1true").replace(/:(\s*)(?:f|fa|fal|fals)(?=\s*[,}\n])/g, ":$1false");
}

/** Read a chips boolean-map (or a plain array of names) back to the selected names, or null when the JSON is invalid. */
function chipsFromJson(param: Param, text: string): string[] | null {
  if (!text.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    try {
      parsed = JSON.parse(completeBooleans(text));
    } catch {
      return null;
    }
  }
  const values = (param.choices ?? []).map((c) => c.value);
  if (Array.isArray(parsed)) return values.filter((v) => parsed.includes(v));
  if (parsed && typeof parsed === "object") return values.filter((v) => (parsed as Record<string, unknown>)[v] === true);
  return null;
}

/** The map text for a set of picked names (every choice, true or false), as the editor shows it. */
function mapText(param: Param, names: string[]): string {
  const sel = new Set(names);
  return JSON.stringify(Object.fromEntries((param.choices ?? []).map((c) => [c.value, sel.has(c.value)])), null, 2);
}

/**
 * The "edit as JSON" surface for a chips field: a true/false map the developer can flip, kept in sync with the chips.
 * A toggle lands on the first key ("t" already reads as true), the error waits until typing pauses, and the text is
 * tidied back to clean JSON when the editor loses focus.
 */
function ChipsJson({ param, value, onChange }: { param: Param; value: Value; onChange: (v: string) => void }) {
  const [text, setText] = useState(() => chipsToJson(param, value));
  const invalid = useMemo(() => chipsFromJson(param, text) === null, [param, text]);
  const [pausedOn, setPausedOn] = useState<string | null>(null);
  useEffect(() => {
    if (!invalid) return;
    const id = setTimeout(() => setPausedOn(text), 900);
    return () => clearTimeout(id);
  }, [invalid, text]);
  const error = invalid && pausedOn === text ? "Each option is true or false. Check for a missing comma, quote or brace." : null;
  return (
    <div className="flex flex-col gap-1.5">
      <JsonEditor
        value={text}
        onBlur={() => {
          const names = chipsFromJson(param, text);
          if (names) setText(mapText(param, names));
        }}
        error={error}
        label={`${param.label} as JSON`}
        minLines={Math.min(16, Math.max(4, (param.choices?.length ?? 4) + 2))}
        maxLines={18}
        onChange={(t) => {
          setText(t);
          const names = chipsFromJson(param, t);
          if (names) onChange(writeChips(param, names));
        }}
      />
      <p className="m-0 text-[11.5px] text-slate">Set any option to true or false. The chips and the request follow as you type.</p>
    </div>
  );
}

export function summarize(param: Param, value: Value): string {
  if (param.widget === "lines") {
    const n = String(value ?? "").split("\n").filter((l) => l.trim()).length;
    return `${n} ${n === 1 ? "line" : "lines"}`;
  }
  if (param.widget === "chips") return `${readChips(param, value).length} of ${param.choices?.length ?? 0} selected`;
  const list = parseList(value);
  if (list === null) return "Not valid JSON";
  if (param.widget === "checks") return list.length ? `${list.length} ${list.length === 1 ? "check" : "checks"}` : "No checks";
  return `${list.length} ${list.length === 1 ? "item" : "items"}`;
}

export function WideField({
  param,
  value,
  onChange,
  error,
  defaultOpen,
}: {
  param: Param;
  value: Value;
  onChange: (v: string | boolean) => void;
  error?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen || !!error);
  const [raw, setRaw] = useState(false);
  const structured = !!param.widget;
  const rawError = useMemo(() => {
    if (param.kind !== "json" || typeof value !== "string" || !value.trim()) return null;
    try {
      JSON.parse(value);
      return null;
    } catch {
      return "This is not valid JSON.";
    }
  }, [param.kind, value]);

  return (
    <div className={cn("rounded-[14px] border bg-page transition-colors", error || rawError ? "border-danger/60" : "border-edge")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left transition-colors hover:bg-hover-light/70">
        <ChevronRight aria-hidden className={cn("size-4 shrink-0 text-slate transition-transform", open && "rotate-90")} strokeWidth={2.2} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-medium text-pine">{param.label}</span>
            <RequiredChip required={param.required} />
          </span>
          <span className="mt-0.5 block">
            <WireName param={param} />
          </span>
        </span>
        <span className={cn("tnum shrink-0 rounded-pill px-2.5 py-1 text-[11.5px] font-medium", rawError ? "bg-danger-tint text-danger" : "bg-well text-pine")}>{summarize(param, value)}</span>
      </button>
      {open ? (
        <div className="border-t border-rule px-4 pt-3.5 pb-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            {param.note ? <p className="m-0 max-w-[70ch] text-[12.5px] leading-[18px] text-slate">{param.note}</p> : <span />}
            {structured ? (
              <button type="button" onClick={() => setRaw((r) => !r)} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill border border-edge bg-page px-2.5 text-[11.5px] font-medium text-pine hover:bg-hover-light">
                <Braces aria-hidden className="size-3.5" strokeWidth={2} />
                {raw ? "Use the editor" : param.widget === "lines" ? "Edit as text" : "Edit as JSON"}
              </button>
            ) : null}
          </div>
          {raw || !structured ? (
            <JsonEditor value={String(value ?? "")} onChange={onChange} error={rawError} label={`${param.label} as JSON`} minLines={param.kind === "json" ? 6 : 3} maxLines={18} />
          ) : param.widget === "chips" ? (
            <ChipsEditor param={param} value={value} onChange={onChange} />
          ) : param.widget === "checks" ? (
            <ChecksEditor param={param} value={value} onChange={onChange} />
          ) : (
            <LinesEditor param={param} value={value} onChange={onChange} />
          )}
          {rawError ? <p role="alert" className="m-0 mt-2 text-[12px] font-medium text-danger">{rawError}</p> : null}
          {error ? <p role="alert" className="m-0 mt-2 text-[12px] font-medium text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   A compact structured picker (attributes, quality checks, MRZ lines) that sits
   in the options grid beside the others, not a full-width card
---------------------------------------------------------------------------- */

export function StructuredField({
  param,
  value,
  onChange,
  error,
  paired,
}: {
  param: Param;
  value: Value;
  onChange: (v: string | boolean) => void;
  error?: string | null;
  /** Beside another picker: both keep one fixed height. On its own, the card fits what it holds. */
  paired?: boolean;
}) {
  const [raw, setRaw] = useState(false);
  const rawError = useMemo(() => {
    if (param.kind !== "json" || typeof value !== "string" || !value.trim()) return null;
    try {
      JSON.parse(value);
      return null;
    } catch {
      return "This is not valid JSON.";
    }
  }, [param.kind, value]);
  // side-by-side pickers keep one fixed size; the part that grows (chips, check rows, JSON) scrolls inside.
  // A picker on its own fits its content, and its chips or rows still cap their height and scroll.
  const fixed = !!paired && param.widget !== "lines";
  return (
    <div className={cn("flex min-w-0 flex-col rounded-[13px] border bg-page", fixed && "h-[360px]", error || rawError ? "border-danger/55" : "border-edge")}>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium text-pine">{param.label}</span>
          <RequiredChip required={param.required} />
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className={cn("tnum rounded-pill px-2 py-0.5 text-[11px] font-medium", rawError ? "bg-danger-tint text-danger" : "bg-well text-slate")}>{summarize(param, value)}</span>
          <button type="button" onClick={() => setRaw((r) => !r)} className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-edge bg-page px-2.5 text-[11px] font-medium text-pine hover:bg-hover-light">
            <Braces aria-hidden className="size-3" strokeWidth={2} />
            {raw ? "Editor" : param.widget === "lines" ? "Text" : "JSON"}
          </button>
        </span>
      </div>
      <div className={cn("flex flex-col gap-2 px-3.5 py-3", fixed && "min-h-0 flex-1")}>
        {param.note ? <p className="m-0 shrink-0 text-[12px] leading-[17px] text-slate">{param.note}</p> : null}
        {raw ? (
          <div className={cn(fixed && "min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]")}>
            {param.widget === "chips" ? (
              <ChipsJson param={param} value={value} onChange={onChange} />
            ) : (
              <JsonEditor value={String(value ?? "")} onChange={onChange} error={rawError} label={`${param.label} as JSON`} minLines={param.kind === "json" ? 6 : 3} maxLines={16} />
            )}
          </div>
        ) : param.widget === "chips" ? (
          <ChipsEditor param={param} value={value} onChange={onChange} fill={fixed} />
        ) : param.widget === "checks" ? (
          <ChecksEditor param={param} value={value} onChange={onChange} fill={fixed} />
        ) : (
          <LinesEditor param={param} value={value} onChange={onChange} />
        )}
        <span className="shrink-0">
          <WireName param={param} />
        </span>
        {rawError ? <p role="alert" className="m-0 shrink-0 text-[12px] font-medium text-danger">{rawError}</p> : null}
        {error ? <p role="alert" className="m-0 shrink-0 text-[12px] font-medium text-danger">{error}</p> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------- pick from a set ---- */

function ChipsEditor({ param, value, onChange, fill }: { param: Param; value: Value; onChange: (v: string) => void; fill?: boolean }) {
  const choices = param.choices ?? [];
  const selected = new Set(readChips(param, value));
  const write = (next: Set<string>) => onChange(writeChips(param, choices.filter((c) => next.has(c.value)).map((c) => c.value)));
  return (
    <div className={cn("flex flex-col gap-3", fill && "min-h-0 flex-1")}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="tnum text-[12px] text-slate">{`${selected.size} of ${choices.length} selected`}</span>
        <span className="ml-auto flex gap-1.5">
          <button type="button" onClick={() => write(new Set(choices.map((c) => c.value)))} className="h-7 rounded-pill px-2.5 text-[12px] font-medium text-pine hover:bg-hover-light">
            Select all
          </button>
          <button type="button" onClick={() => write(new Set())} className="h-7 rounded-pill px-2.5 text-[12px] font-medium text-pine hover:bg-hover-light">
            Clear
          </button>
        </span>
      </div>
      <div className={cn("flex flex-wrap content-start gap-2 overflow-y-auto pr-1 [scrollbar-width:thin]", fill ? "min-h-0 flex-1" : "max-h-[220px]")}>
        {choices.map((c) => {
          const on = selected.has(c.value);
          return (
            <button
              key={c.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              title={c.value}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(c.value);
                else next.add(c.value);
                write(next);
              }}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-pill border pr-3.5 pl-2.5 text-[12.5px] font-medium transition-colors",
                on ? "border-pine bg-pine text-lime" : "border-edge bg-page text-pine hover:border-pine/35 hover:bg-hover-light",
              )}
            >
              {on ? <Check aria-hidden className="size-3.5" strokeWidth={2.6} /> : <Plus aria-hidden className="size-3.5 text-slate" strokeWidth={2.2} />}
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------- checks with min and max ---- */

type CheckRow = { name: string; range: [number | string, number | string] };

function ChecksEditor({ param, value, onChange, fill }: { param: Param; value: Value; onChange: (v: string) => void; fill?: boolean }) {
  const defs = param.checks ?? [];
  const rows: CheckRow[] = (parseList(value) ?? [])
    .filter((x): x is { name: string; range?: unknown } => !!x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string")
    .map((x) => ({ name: x.name, range: Array.isArray(x.range) ? [x.range[0] as number, x.range[1] as number] : ["", ""] }));
  const used = new Set(rows.map((r) => r.name));
  const write = (next: CheckRow[]) =>
    onChange(
      JSON.stringify(
        next.map((r) => ({ name: r.name, range: r.range.map((v) => (v === "" || Number.isNaN(Number(v)) ? v : Number(v))) })),
        null,
        2,
      ),
    );
  const label = (n: string) => {
    const d = defs.find((x) => x.name === n);
    return d ? `${humanize(n)}, ${d.group.toLowerCase()}` : humanize(n);
  };
  const options = defs.filter((d) => !used.has(d.name)).map((d) => label(d.name));
  const cell = "h-9 w-full rounded-[9px] border border-edge bg-page px-2.5 text-right font-mono text-[12px] text-pine outline-none hover:border-[#c6cfda] focus:border-pine/45 focus-visible:ring-2 focus-visible:ring-lime/60";

  return (
    <div className={cn("flex flex-col gap-3", fill && "min-h-0 flex-1")}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="tnum text-[12px] text-slate">{rows.length ? `${rows.length} ${rows.length === 1 ? "check" : "checks"} will run` : "No checks yet"}</span>
        <span className="ml-auto flex gap-1.5">
          <button type="button" onClick={() => write(defs.map((d) => ({ name: d.name, range: d.range })))} className="inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-[12px] font-medium text-pine hover:bg-hover-light">
            <ListPlus aria-hidden className="size-3.5" strokeWidth={2} />
            Start from ICAO
          </button>
          {rows.length ? (
            <button type="button" onClick={() => write([])} className="h-7 rounded-pill px-2.5 text-[12px] font-medium text-pine hover:bg-hover-light">
              Clear
            </button>
          ) : null}
        </span>
      </div>

      {rows.length ? (
        <div className={cn("flex flex-col overflow-hidden rounded-[12px] border border-edge", fill && "min-h-0 flex-1")}>
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_96px_96px_36px] items-center gap-2 bg-panel px-3 py-2 text-[11px] font-medium text-slate sm:grid-cols-[minmax(0,1fr)_120px_120px_36px]">
            <span>Check</span>
            <span className="text-right">Minimum</span>
            <span className="text-right">Maximum</span>
            <span />
          </div>
          <div className={cn("overflow-y-auto [scrollbar-width:thin]", fill ? "min-h-0 flex-1" : "max-h-[300px]")}>
          {rows.map((r, i) => {
            const def = defs.find((d) => d.name === r.name);
            const bad = r.range[0] !== "" && r.range[1] !== "" && Number(r.range[0]) > Number(r.range[1]);
            return (
              <div key={`${r.name}-${i}`} className="border-t border-rule px-3 py-2">
                <div className="grid grid-cols-[minmax(0,1fr)_96px_96px_36px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_120px_120px_36px]">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-pine">{humanize(r.name)}</span>
                    <span className="flex items-center gap-1.5">
                      <code className="truncate font-mono text-[10.5px] text-slate">{r.name}</code>
                      {def ? <span className="shrink-0 rounded-[5px] bg-well px-1.5 text-[10px] text-slate">{def.group}</span> : null}
                    </span>
                  </span>
                  {[0, 1].map((k) => (
                    <input
                      key={k}
                      type="number"
                      step="any"
                      inputMode="decimal"
                      aria-label={`${humanize(r.name)} ${k ? "maximum" : "minimum"}`}
                      value={String(r.range[k] ?? "")}
                      onChange={(e) => write(rows.map((x, j) => (j === i ? { ...x, range: (k ? [x.range[0], e.target.value] : [e.target.value, x.range[1]]) as CheckRow["range"] } : x)))}
                      className={cn(cell, bad && "border-danger")}
                    />
                  ))}
                  <button type="button" aria-label={`Remove ${humanize(r.name)}`} onClick={() => write(rows.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-pill text-slate hover:bg-danger-tint hover:text-danger">
                    <X aria-hidden className="size-4" strokeWidth={2} />
                  </button>
                </div>
                {bad ? <p role="alert" className="m-0 mt-1 text-[11.5px] font-medium text-danger">The minimum is above the maximum.</p> : null}
              </div>
            );
          })}
          </div>
        </div>
      ) : fill ? (
        <div className="grid min-h-0 flex-1 place-items-center rounded-[12px] border border-dashed border-edge px-4 text-center text-[12px] text-slate">
          No checks yet. Start from ICAO, or add one below.
        </div>
      ) : null}

      {options.length ? (
        <div className="max-w-[420px] shrink-0">
          <Select
            label="Add a check"
            options={options}
            value="Add a check"
            onValueChange={(lbl) => {
              const d = defs.find((x) => label(x.name) === lbl);
              if (d) write([...rows, { name: d.name, range: d.range }]);
            }}
            block
            menuFixed
            className={cn(FIELD, "h-10 pr-9 pl-3 text-pine/80")}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   A gallery, a list of frames, or the two match images: one card per item,
   with its upload and its own fields (id, label, source), add and remove
---------------------------------------------------------------------------- */

/** One of an item's own fields (its source, "every face", a liveness id), labelled like every other field. */
function ItemField({ field, value, onChange }: { field: Param; value: string | boolean; onChange: (v: string | boolean) => void }) {
  const uid = useId();
  const id = `item-${field.name}${uid}`;
  let control: React.ReactNode;
  if (field.kind === "boolean") {
    const on = value === true;
    control = (
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-3 rounded-[10px] border px-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-lime/60 focus-visible:outline-none",
          on ? "border-pine/25 bg-lime-wash" : "border-edge bg-page hover:border-[#c6cfda]",
        )}
      >
        <span className={cn("text-[12.5px] font-medium", on ? "text-pine" : "text-slate")}>{on ? "On" : "Off"}</span>
        <span className={cn("relative h-5 w-9 shrink-0 rounded-pill transition-colors", on ? "bg-pine" : "bg-[#cfd5dd]")}>
          <span className={cn("absolute top-0.5 size-4 rounded-pill bg-page shadow-[0_1px_3px_rgb(14_50_40/0.3)] transition-[left]", on ? "left-[18px]" : "left-0.5")} />
        </span>
      </button>
    );
  } else if (field.kind === "enum") {
    const choices = field.choices ?? [];
    const current = choices.find((c) => c.value === String(value ?? ""))?.label ?? choices[0]?.label ?? "";
    control = (
      <Select
        id={id}
        label={field.label}
        options={choices.map((c) => c.label)}
        value={current}
        onValueChange={(lbl) => onChange(choices.find((c) => c.label === lbl)?.value ?? "")}
        block
        menuFixed
        className={cn(FIELD, "h-9 pr-8 pl-3 text-[12.5px]")}
      />
    );
  } else {
    control = (
      <input
        id={id}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? (field.required ? `Enter ${field.label.toLowerCase()}` : "Optional")}
        spellCheck={false}
        autoComplete="off"
        className={cn(FIELD, "h-9 px-3 text-[12.5px]")}
      />
    );
  }
  return (
    <ItemRow id={id} label={field.label} required={field.required} note={field.note}>
      {control}
    </ItemRow>
  );
}

/** A label, the control, and a line on what it does: the same order as the other fields, a size smaller. */
function ItemRow({ id, label, required, note, children }: { id: string; label: string; required?: boolean; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="truncate text-[12px] font-medium text-pine">
          {label}
        </label>
        <RequiredChip required={required} />
      </div>
      {children}
      {note ? <p className="m-0 text-[11.5px] leading-[16px] text-slate">{note}</p> : null}
    </div>
  );
}

/** The id each item is sent with, and the label shown with a hit (watchlists). */
function ItemText({ value, onChange, label, placeholder, note, mono }: { value: string; onChange: (v: string) => void; label: string; placeholder: string; note: string; mono?: boolean }) {
  const uid = useId();
  const id = `item-text${uid}`;
  return (
    <ItemRow id={id} label={label} note={note}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className={cn(FIELD, "h-9 px-3 text-[12.5px]", mono && "font-mono")}
      />
    </ItemRow>
  );
}

export function GalleryField({ param, kind, items, onChange, error }: { param: Param; kind: UploadKind; items: ListItem[]; onChange: (next: ListItem[]) => void; error?: string | null }) {
  const spec = param.list!;
  const label = (i: number) => `${spec.itemLabel} ${i + 1}`.replace(/^./, (c) => c.toUpperCase());
  const set = (i: number, patch: Partial<ListItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const setField = (i: number, name: string, v: string | boolean) => set(i, { fields: { ...items[i]!.fields, [name]: v } });
  const add = () => onChange([...items, { file: null, fields: Object.fromEntries((spec.fields ?? []).map((f) => [f.name, f.kind === "boolean" ? f.default === true : f.default !== undefined ? String(f.default) : ""])) }]);
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  // two items (the match pair) get half the width each; a longer list three to a row
  const pair = spec.max <= 2;
  const cols = pair ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3";
  const added = items.filter((it) => it.file).length;
  const count = spec.min === spec.max ? `${added} of ${spec.max} added` : `${added} of up to ${spec.max} added`;

  return (
    <div className={cn("flex flex-col gap-3 rounded-[14px] border bg-page p-3.5", error ? "border-danger/55" : "border-edge")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-pine">{param.label}</span>
          <RequiredChip required={param.required} />
        </span>
        <span className={cn("tnum ml-auto rounded-pill px-2 py-0.5 text-[11px] font-medium", added >= spec.min ? "bg-pass-tint text-positive" : "bg-well text-slate")}>
          {count}
        </span>
      </div>
      {param.note ? <p className="m-0 text-[12px] text-slate">{param.note}</p> : null}
      <div className={cn("grid gap-3", cols)}>
        {items.map((it, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-3 rounded-[12px] border border-rule bg-panel/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-pine">
                <span className="tnum grid size-5 place-items-center rounded-pill bg-pine text-[10.5px] font-semibold text-lime">{i + 1}</span>
                {label(i)}
              </span>
              {items.length > spec.min ? (
                <button
                  type="button"
                  aria-label={`Remove ${label(i).toLowerCase()}`}
                  onClick={() => remove(i)}
                  className="grid size-7 place-items-center rounded-pill text-slate transition-colors hover:bg-danger-tint hover:text-danger"
                >
                  <X aria-hidden className="size-3.5" strokeWidth={2} />
                </button>
              ) : null}
            </div>
            <UploadSlot kind={kind} file={it.file} onPick={(f) => set(i, { file: f })} invalid={!!error && !it.file} caption={label(i)} tall={pair} />
            {spec.idKey || spec.labelKey || spec.fields?.length ? (
              <div className="flex flex-col gap-2.5 border-t border-rule pt-3">
                {spec.idKey ? (
                  <ItemText
                    label="Your ID"
                    value={String(it.fields[spec.idKey] ?? "")}
                    onChange={(v) => setField(i, spec.idKey!, v)}
                    placeholder={`${spec.itemLabel}-${i + 1}`}
                    note={`Sent back with each result. Left empty, it is ${spec.itemLabel}-${i + 1}.`}
                    mono
                  />
                ) : null}
                {spec.labelKey ? (
                  <ItemText
                    label="Label"
                    value={String(it.fields[spec.labelKey] ?? "")}
                    onChange={(v) => setField(i, spec.labelKey!, v)}
                    placeholder="blocked"
                    note="Shown with a hit, for example blocked, VIP or staff."
                  />
                ) : null}
                {(spec.fields ?? []).map((f) => (
                  <ItemField key={f.name} field={f} value={it.fields[f.name] ?? (f.kind === "boolean" ? false : "")} onChange={(v) => setField(i, f.name, v)} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {items.length < spec.max ? (
          <button
            type="button"
            onClick={add}
            className="group flex min-h-[196px] flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-edge bg-panel/40 px-3 py-4 text-slate transition-colors hover:border-pine/40 hover:bg-lime-wash/50 hover:text-pine focus-visible:ring-2 focus-visible:ring-lime/60 focus-visible:outline-none"
          >
            <span className="grid size-9 place-items-center rounded-pill border border-edge bg-page text-pine transition-colors group-hover:border-pine/30">
              <Plus aria-hidden className="size-4" strokeWidth={2.2} />
            </span>
            <span className="text-[12.5px] font-medium text-pine">{`Add another ${spec.itemLabel}`}</span>
            <span className="tnum text-[11px]">{`${items.length} of ${spec.max} used`}</span>
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[12px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- MRZ lines ---- */

const MRZ_FORMATS: { lines: number; len: number; name: string }[] = [
  { lines: 3, len: 30, name: "ID card (TD1)" },
  { lines: 2, len: 36, name: "ID card (TD2)" },
  { lines: 2, len: 44, name: "Passport (TD3)" },
];

/**
 * One entry per line. An MRZ list is written the way the zone is printed (upper case, `<` for spaces) and counts
 * characters per line; any other list (countries, ID numbers, wallet addresses) keeps exactly what was typed, so a
 * mixed-case wallet checksum survives. Pasting several lines fills several rows.
 */
function LinesEditor({ param, value, onChange }: { param: Param; value: Value; onChange: (v: string) => void }) {
  const mrz = param.format === "mrz";
  const cap = param.max ?? (mrz ? 3 : 100);
  const lines = String(value ?? "").split("\n");
  const write = (next: string[]) => onChange(next.slice(0, cap).join("\n"));
  const clean = (s: string) => (mrz ? s.toUpperCase().replace(/\s/g, "<") : s);
  const filled = lines.filter((l) => l.trim());
  const format = mrz ? MRZ_FORMATS.find((f) => filled.length === f.lines && filled.every((l) => l.length === f.len)) : undefined;
  const badChars = mrz && filled.some((l) => /[^A-Z0-9<]/.test(l));
  return (
    <div className="flex flex-col gap-2.5">
      <div className={cn("flex flex-col gap-2", !mrz && lines.length > 6 && "max-h-[300px] overflow-y-auto pr-1 [scrollbar-width:thin]")}>
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="tnum grid size-7 shrink-0 place-items-center rounded-pill bg-well text-[11px] font-semibold text-slate">{i + 1}</span>
            <input
              aria-label={`${mrz ? "MRZ line" : param.label} ${i + 1}`}
              spellCheck={false}
              autoComplete="off"
              value={l}
              onChange={(e) => write(lines.map((x, j) => (j === i ? clean(e.target.value) : x)))}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (!/[\r\n]/.test(text)) return;
                e.preventDefault();
                const pasted = text.split(/\r?\n/).map((s) => clean(s.trim())).filter(Boolean);
                write([...lines.slice(0, i), ...pasted, ...lines.slice(i + 1).filter((x) => x.trim())]);
              }}
              placeholder={param.placeholder ?? ""}
              className={cn(FIELD, "h-10 min-w-0 flex-1 px-3 font-mono text-[12.5px]", mrz && "tracking-[0.06em]")}
            />
            {mrz ? (
              <span className={cn("tnum w-11 shrink-0 text-right text-[11.5px] font-medium", [30, 36, 44].includes(l.length) ? "text-ramp-2" : "text-slate")}>{l.length}</span>
            ) : null}
            <button
              type="button"
              aria-label={`Remove line ${i + 1}`}
              disabled={lines.length === 1}
              onClick={() => write(lines.filter((_, j) => j !== i))}
              className="grid size-8 shrink-0 place-items-center rounded-pill text-slate hover:bg-danger-tint hover:text-danger disabled:pointer-events-none disabled:opacity-30"
            >
              <Trash2 aria-hidden className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-9">
        {lines.length < cap ? (
          <button type="button" onClick={() => write([...lines, ""])} className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-edge bg-page px-3 text-[12px] font-medium text-pine hover:bg-hover-light">
            <Plus aria-hidden className="size-3.5" strokeWidth={2.2} />
            Add a line
          </button>
        ) : null}
        {!mrz ? <span className="tnum text-[11.5px] text-slate">{`${filled.length} of up to ${cap}`}</span> : null}
        {mrz && filled.length ? (
          format ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-lime-tint px-2.5 py-1 text-[11.5px] font-medium text-ramp-2">
              <Check aria-hidden className="size-3.5" strokeWidth={2.6} />
              {`Looks like a ${format.name}`}
            </span>
          ) : (
            <span className="rounded-pill bg-caution-tint px-2.5 py-1 text-[11.5px] font-medium text-caution">An ID card has 3 lines of 30, a passport 2 lines of 44</span>
          )
        ) : null}
        {badChars ? <span className="rounded-pill bg-caution-tint px-2.5 py-1 text-[11.5px] font-medium text-caution">Only A to Z, 0 to 9 and &lt; belong in an MRZ</span> : null}
      </div>
    </div>
  );
}
