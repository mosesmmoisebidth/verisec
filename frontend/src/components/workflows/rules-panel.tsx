"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Flag } from "@/components/ui/country-select";
import { Select } from "@/components/ui/select";
import type { Country } from "@/lib/countries";
import {
  NEEDS_DOCUMENT,
  ruleSentence,
  sortChecks,
  type Catalogue,
  type Condition,
  type Definition,
  type FieldInfo,
  type Rule,
  type WorkflowCheck,
} from "@/lib/console/workflows-api";
import { cn } from "@/lib/utils";

/** The server keeps the first 20 rules of a workflow. */
const MAX_RULES = 20;
const ACTION = {
  review: "Send to a person",
  decline: "Decline",
  require: "Add a check",
} as const;
const DOC_LABEL: Record<string, string> = {
  passport: "Passport",
  "national-id": "National ID",
  licence: "Driver's licence",
  "residence-permit": "Residence permit",
};
/** Where a new number rule starts (the server keeps it inside the field's range). */
const START: Record<string, number> = {
  "device.risk": 50,
  "email.risk": 60,
  "phone.risk": 60,
  age: 18,
  "face.similarity": 75,
};
const CONTROL =
  "h-9 rounded-[10px] border border-edge bg-white text-body text-pine";

const stageOf = (id: string, catalogue: Catalogue) =>
  catalogue.checks.find((c) => c.id === id)?.stage ?? 0;

/** The checks a rule on `field` can add: available, later in the flow than the fact, and not always on. */
export function addable(
  field: FieldInfo,
  def: Definition,
  catalogue: Catalogue,
) {
  const on = new Set(def.checks.map((c) => c.id));
  return catalogue.checks.filter(
    (c) =>
      c.available &&
      c.stage > stageOf(field.source, catalogue) &&
      !on.has(c.id),
  );
}

/** Why the server would refuse this rule, in words, or null when it is fine. */
export function ruleProblem(
  rule: Rule,
  def: Definition,
  catalogue: Catalogue,
): string | null {
  const field = catalogue.fields.find((f) => f.id === rule.when.field);
  if (!field) return "Pick what this rule tests.";
  if (field.kind === "countries" && !rule.when.values?.length)
    return "Pick at least one country.";
  if (field.kind === "documentTypes" && !rule.when.values?.length)
    return "Pick at least one document type.";
  if (field.kind === "number" && !Number.isFinite(rule.when.number))
    return "Enter a number.";
  if (rule.then === "require") {
    const check = catalogue.checks.find((c) => c.id === rule.check);
    if (!check) return "Pick the check to add.";
    if (def.checks.some((c) => c.id === check.id))
      return `${check.name} is always on, so this rule adds nothing. Pick another check or turn ${check.name} off.`;
    if (check.stage <= stageOf(field.source, catalogue))
      return `${check.name} comes before this is known, so a rule cannot add it.`;
  }
  return null;
}

/**
 * The checks a definition's rules need, added the way the server adds them: the check each fact
 * comes from (always on), and the document for anything that reads it, unless a rule brings the
 * document in itself.
 */
export function withRuleNeeds(
  def: Definition,
  catalogue: Catalogue,
): Definition {
  const have = new Map<string, WorkflowCheck>(def.checks.map((c) => [c.id, c]));
  const add = (id: string) => {
    if (!have.has(id)) have.set(id, { id, required: true, onFail: "decline" });
  };
  for (const r of def.rules) {
    const field = catalogue.fields.find((f) => f.id === r.when.field);
    if (field) add(field.source);
  }
  const added = def.rules
    .filter((r) => r.then === "require" && r.check)
    .map((r) => r.check!);
  if (
    [...have.keys(), ...added].some((id) => NEEDS_DOCUMENT.has(id)) &&
    !added.includes("document")
  )
    add("document");
  return have.size === def.checks.length
    ? def
    : { ...def, checks: sortChecks([...have.values()]) };
}

/**
 * The workflow's rules: each tests one thing learned during the verification (the connection,
 * the document, the face match, the screening) and then sends the applicant to a person, declines,
 * or adds a later check. Edits follow the server's own limits, so what is shown here saves.
 */
export function RulesPanel({
  definition: def,
  catalogue,
  countries,
  onChange,
}: {
  definition: Definition;
  catalogue: Catalogue;
  countries: readonly Country[];
  onChange: (next: Definition) => void;
}) {
  const set = (rules: Rule[]) =>
    onChange(withRuleNeeds({ ...def, rules }, catalogue));
  const add = () =>
    set([...def.rules, { when: { field: "ip.vpn" }, then: "review" }]);
  const full = def.rules.length >= MAX_RULES;

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-hairline bg-panel p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-xs leading-4 font-medium tracking-[0.6px] text-pine uppercase">
            Rules
          </h2>
          <p className="m-0 text-micro text-muted">
            Change the flow or the decision from what is learned during the
            verification. Every rule is checked for every applicant.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={full}
          title={full ? "A workflow can have up to 20 rules." : undefined}
          className="inline-flex h-9 items-center gap-2 rounded-pill border border-hairline bg-white px-4 text-body font-medium text-pine transition-colors hover:bg-hover-panel disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus aria-hidden className="size-4" strokeWidth={1.8} />
          Add rule
        </button>
      </header>

      {def.rules.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="flex flex-col items-center gap-1 rounded-[14px] border border-dashed border-pine/25 bg-white/70 px-4 py-6 text-center transition-colors hover:border-pine/45"
        >
          <span className="text-[13px] font-medium text-pine">
            No rules yet
          </span>
          <span className="max-w-[560px] text-[11px] leading-4 text-muted">
            For example: if a VPN is detected, add Face Liveness. Or: if the
            document country is on the FATF list, send to a person.
          </span>
        </button>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {def.rules.map((rule, i) => (
            <RuleRow
              key={i}
              index={i}
              rule={rule}
              def={def}
              catalogue={catalogue}
              countries={countries}
              onChange={(next) =>
                set(def.rules.map((r, j) => (j === i ? next : r)))
              }
              onRemove={() => set(def.rules.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RuleRow({
  index,
  rule,
  def,
  catalogue,
  countries,
  onChange,
  onRemove,
}: {
  index: number;
  rule: Rule;
  def: Definition;
  catalogue: Catalogue;
  countries: readonly Country[];
  onChange: (next: Rule) => void;
  onRemove: () => void;
}) {
  const field = catalogue.fields.find((f) => f.id === rule.when.field);
  const can = field ? addable(field, def, catalogue) : [];
  const problem = ruleProblem(rule, def, catalogue);
  const nameOf = (id: string) =>
    catalogue.checks.find((c) => c.id === id)?.name ?? id;

  const actions = [
    ACTION.review,
    ACTION.decline,
    ...(can.length || rule.then === "require" ? [ACTION.require] : []),
  ];
  const checkOptions = [
    ...can.map((c) => c.name),
    ...(rule.check && !can.some((c) => c.id === rule.check)
      ? [nameOf(rule.check)]
      : []),
  ];

  const setField = (label: string) => {
    const f = catalogue.fields.find((x) => x.label === label);
    if (!f || f.id === rule.when.field) return;
    const when: Condition = { field: f.id };
    if (f.kind === "countries")
      when.values = [...catalogue.presets.highRisk.countries];
    if (f.kind === "documentTypes")
      when.values = [
        def.settings.documentTypes[0] ?? catalogue.documentTypes[0]!,
      ];
    if (f.kind === "number") when.number = START[f.id] ?? f.min ?? 0;
    if (rule.then !== "require") return onChange({ when, then: rule.then });
    // keep the added check when it still comes after the new fact; otherwise the first that does
    const ok = addable(f, def, catalogue);
    const check = ok.some((c) => c.id === rule.check) ? rule.check : ok[0]?.id;
    onChange(
      check ? { when, then: "require", check } : { when, then: "review" },
    );
  };

  const setAction = (label: string) => {
    if (label === ACTION.require) {
      const check =
        rule.check && can.some((c) => c.id === rule.check)
          ? rule.check
          : can[0]?.id;
      if (check) onChange({ when: rule.when, then: "require", check });
      return;
    }
    onChange({
      when: rule.when,
      then: label === ACTION.decline ? "decline" : "review",
    });
  };

  const setWhen = (patch: Partial<Condition>) =>
    onChange({ ...rule, when: { ...rule.when, ...patch } });

  return (
    <li
      className={cn(
        "flex flex-col gap-2.5 rounded-[14px] border bg-white p-3",
        problem ? "border-caution/60" : "border-hairline",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* the condition and the action each stay together when the row wraps */}
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Word>If</Word>
          <Select
            label={`Rule ${index + 1}: what it tests`}
            options={catalogue.fields.map((f) => f.label)}
            value={field?.label ?? ""}
            onValueChange={setField}
            className={cn(CONTROL, "w-[290px] max-w-full pr-9 pl-3 text-left")}
          />

          {field?.kind === "countries" ? (
            <CountriesPicker
              values={rule.when.values ?? []}
              onChange={(values) => setWhen({ values })}
              countries={countries}
              preset={catalogue.presets.highRisk}
            />
          ) : field?.kind === "documentTypes" ? (
            <span
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Document types"
            >
              {catalogue.documentTypes.map((t) => {
                const on = (rule.when.values ?? []).includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setWhen({
                        values: on
                          ? (rule.when.values ?? []).filter((v) => v !== t)
                          : [...(rule.when.values ?? []), t],
                      })
                    }
                    className={cn(
                      "h-9 rounded-pill border px-3 text-[13px] transition-colors",
                      on
                        ? "border-pine bg-pine text-lime"
                        : "border-edge bg-white text-pine hover:bg-hover-panel",
                    )}
                  >
                    {DOC_LABEL[t] ?? t}
                  </button>
                );
              })}
            </span>
          ) : field?.kind === "number" ? (
            <NumberField
              field={field}
              value={rule.when.number ?? field.min ?? 0}
              onChange={(number) => setWhen({ number })}
            />
          ) : null}
        </span>

        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Word>then</Word>
          <Select
            label={`Rule ${index + 1}: what happens`}
            options={actions}
            value={ACTION[rule.then]}
            onValueChange={setAction}
            className={cn(CONTROL, "w-[172px] pr-9 pl-3 text-left")}
          />
          {rule.then === "require" ? (
            <Select
              label={`Rule ${index + 1}: check to add`}
              options={checkOptions}
              value={rule.check ? nameOf(rule.check) : ""}
              onValueChange={(name) => {
                const c = catalogue.checks.find((x) => x.name === name);
                if (c) onChange({ ...rule, check: c.id });
              }}
              className={cn(
                CONTROL,
                "w-[230px] max-w-full pr-9 pl-3 text-left",
              )}
            />
          ) : null}
        </span>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove rule ${index + 1}`}
          title="Remove rule"
          className="ml-auto grid size-9 shrink-0 place-items-center rounded-[10px] text-pine/55 transition-colors hover:bg-danger-tint hover:text-danger"
        >
          <Trash2 aria-hidden className="size-4" strokeWidth={1.7} />
        </button>
      </div>

      <p
        className={cn(
          "m-0 flex items-start gap-1.5 text-[12px] leading-4",
          problem ? "text-caution" : "text-muted",
        )}
      >
        {problem ? (
          <TriangleAlert
            aria-hidden
            className="mt-px size-3.5 shrink-0"
            strokeWidth={2}
          />
        ) : (
          <span
            aria-hidden
            className="mt-[5px] size-1.5 shrink-0 rounded-pill bg-lime"
          />
        )}
        {problem ?? ruleSentence(rule, catalogue)}
      </p>
    </li>
  );
}

function Word({ children }: { children: string }) {
  return (
    <span className="px-0.5 text-[13px] font-medium text-pine/55">
      {children}
    </span>
  );
}

/** A whole number inside the field's range, settled when the input loses focus or on Enter. */
function NumberField({
  field,
  value,
  onChange,
}: {
  field: FieldInfo;
  value: number;
  onChange: (n: number) => void;
}) {
  const lo = field.min ?? 0;
  const hi = field.max ?? 100;
  return (
    <span className="flex items-center gap-1.5">
      <input
        key={value}
        type="number"
        inputMode="numeric"
        min={lo}
        max={hi}
        step={1}
        defaultValue={value}
        aria-label={`${field.label} (${lo} to ${hi})`}
        title={`${lo} to ${hi}`}
        onBlur={(e) => {
          const n = e.currentTarget.valueAsNumber;
          const next = Number.isFinite(n)
            ? Math.round(Math.min(hi, Math.max(lo, n)))
            : value;
          e.currentTarget.value = String(next);
          if (next !== value) onChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn(CONTROL, "tnum w-[84px] px-3")}
      />
      {field.unit ? (
        <span className="text-[13px] text-pine/60">{field.unit.trim()}</span>
      ) : null}
    </span>
  );
}

/** Many countries at once: search, the FATF list in one click, picked countries first. */
function CountriesPicker({
  values,
  onChange,
  countries,
  preset,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  countries: readonly Country[];
  preset: Catalogue["presets"]["highRisk"];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const picked = new Set(values);
  const isPreset =
    values.length === preset.countries.length &&
    preset.countries.every((c) => picked.has(c));
  const nameOf = (code: string) =>
    countries.find((c) => c.code === code.toLowerCase())?.name ?? code;
  const summary = isPreset
    ? preset.label
    : values.length === 0
      ? "Pick countries"
      : values.length <= 2
        ? values.map(nameOf).join(", ")
        : `${nameOf(values[0]!)} and ${values.length - 1} more`;

  const q = query.trim().toLowerCase();
  const list = q
    ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.code === q)
    : [
        ...countries.filter((c) => picked.has(c.code.toUpperCase())),
        ...countries.filter((c) => !picked.has(c.code.toUpperCase())),
      ];

  const flip = (code: string) => {
    const up = code.toUpperCase();
    onChange(picked.has(up) ? values.filter((v) => v !== up) : [...values, up]);
  };

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Countries: ${summary}`}
        title={summary}
        className={cn(
          CONTROL,
          "flex max-w-[360px] items-center gap-2 pr-2.5 pl-3 text-left transition-colors hover:border-pine/30",
          !values.length && "border-caution",
        )}
      >
        {values.length ? (
          <span aria-hidden className="flex shrink-0 -space-x-1.5">
            {values.slice(0, 3).map((v) => (
              <Flag key={v} code={v.toLowerCase()} />
            ))}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <span className="tnum shrink-0 rounded-pill bg-pine/8 px-1.5 text-[11px] leading-4">
          {values.length}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-pine/60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Pick countries"
          className="absolute top-full left-0 z-40 mt-1.5 flex w-[min(320px,85vw)] flex-col gap-2 rounded-[14px] border border-hairline bg-white p-2 shadow-[0_16px_40px_-16px_rgba(14,50,40,0.35)]"
        >
          <label className="flex h-9 items-center gap-2 rounded-[10px] border border-edge px-2.5 focus-within:border-pine/40">
            <Search
              aria-hidden
              className="size-4 shrink-0 text-pine/50"
              strokeWidth={1.8}
            />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries"
              aria-label="Search countries"
              className="min-w-0 flex-1 bg-transparent text-body text-pine outline-none placeholder:text-placeholder"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={isPreset}
              onClick={() => onChange([...preset.countries])}
              title={preset.label}
              className={cn(
                "rounded-pill border px-2.5 py-1 text-[11px] font-medium transition-colors",
                isPreset
                  ? "border-pine bg-pine text-lime"
                  : "border-hairline text-pine hover:bg-hover-panel",
              )}
            >
              FATF list ({preset.countries.length})
            </button>
            {values.length ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded-pill px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-pine"
              >
                Clear
              </button>
            ) : null}
            <span className="tnum ml-auto text-[11px] text-muted">
              {values.length} picked
            </span>
          </div>
          <ul className="m-0 flex max-h-64 [scrollbar-width:thin] list-none flex-col overflow-y-auto p-0">
            {list.map((c) => {
              const on = picked.has(c.code.toUpperCase());
              return (
                <li key={c.code}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[13px] text-pine hover:bg-hover-panel">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => flip(c.code)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-[4px] border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-pine",
                        on
                          ? "border-pine bg-pine text-lime"
                          : "border-edge bg-white",
                      )}
                    >
                      {on ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <Flag code={c.code} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] text-muted">
                      {c.code.toUpperCase()}
                    </span>
                  </label>
                </li>
              );
            })}
            {!list.length ? (
              <li className="px-2 py-3 text-center text-micro text-muted">
                No country matches &ldquo;{query}&rdquo;.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
