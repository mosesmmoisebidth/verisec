import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { JsonSchema } from "@/lib/console/integrations-api";
import { cn } from "@/lib/utils";

import { field } from "./parts";

/**
 * The arguments of an app action, as a form built from the action's JSON Schema (from
 * Composio). Values are kept as text while editing, so any of them can hold
 * `{{placeholders}}`; `toArguments` turns them back into the types the action expects.
 */

export type FieldValues = Record<string, string>;

const typeOf = (s: JsonSchema | undefined): string => {
  const t = s?.type;
  return (Array.isArray(t) ? t.find((x) => x !== "null") : t) ?? "string";
};

const humanize = (key: string) => key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());

/** Text for a value the form shows. */
export function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function toValues(args: Record<string, unknown>): FieldValues {
  return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, toText(v)]));
}

/** The action's arguments from the form, typed by the schema; throws with a readable reason. */
export function toArguments(values: FieldValues, schema: JsonSchema | undefined, alsoRequired: string[] = []): Record<string, unknown> {
  const props = schema?.properties ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(values)) {
    const text = raw.trim();
    if (!text) continue;
    const type = typeOf(props[key]);
    const label = props[key]?.title ?? humanize(key);
    if (type === "array" || type === "object") {
      try {
        out[key] = JSON.parse(text);
      } catch {
        throw new Error(`${label} must be written as JSON (for example ${type === "array" ? '["one", "two"]' : '{"key": "value"}'}).`);
      }
    } else if ((type === "integer" || type === "number") && !text.includes("{{")) {
      const n = Number(text);
      if (Number.isNaN(n)) throw new Error(`${label} must be a number.`);
      out[key] = n;
    } else if (type === "boolean" && (text === "true" || text === "false")) {
      out[key] = text === "true";
    } else {
      out[key] = raw;
    }
  }
  for (const key of [...(schema?.required ?? []), ...alsoRequired]) {
    if (out[key] === undefined) throw new Error(`Fill in ${props[key]?.title ?? humanize(key)}.`);
  }
  return out;
}

const LONG = /text|body|content|message|description|summary|values|blocks/i;

export function SchemaFields({
  schema,
  values,
  onChange,
  onFocusField,
  labels,
  idPrefix,
}: {
  schema: JsonSchema | undefined;
  values: FieldValues;
  onChange: (values: FieldValues) => void;
  /** The field that last had focus, for inserting placeholders. */
  onFocusField?: (name: string) => void;
  /** Labels and hints that replace the schema's, e.g. from a preset; `required` adds to the schema's. */
  labels?: Record<string, { label: string; hint: string; required?: boolean }>;
  idPrefix: string;
}) {
  const [more, setMore] = useState(false);
  const props = schema?.properties ?? {};
  const required = new Set([...(schema?.required ?? []), ...Object.entries(labels ?? {}).filter(([, l]) => l.required).map(([n]) => n)]);
  const names = Object.keys(props);
  // Required, preset and already-filled fields first; the rest behind "More options".
  const main = names.filter((n) => required.has(n) || labels?.[n] || (values[n] ?? "") !== "");
  const rest = names.filter((n) => !main.includes(n));
  const order = Object.keys(labels ?? {});
  const rank = (n: string) => (order.includes(n) ? order.indexOf(n) : order.length + (required.has(n) ? 0 : 1));
  main.sort((a, b) => rank(a) - rank(b));

  const one = (name: string) => (
    <Field
      key={name}
      id={`${idPrefix}-${name}`}
      name={name}
      schema={props[name]}
      required={required.has(name)}
      label={labels?.[name]?.label}
      hint={labels?.[name]?.hint}
      value={values[name] ?? ""}
      onChange={(v) => onChange({ ...values, [name]: v })}
      onFocus={() => onFocusField?.(name)}
    />
  );

  if (!names.length) return <p className="m-0 text-micro text-slate">This action needs no settings.</p>;
  return (
    <div className="flex flex-col gap-3">
      {main.map(one)}
      {rest.length ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
            className="inline-flex w-fit items-center gap-1.5 text-micro text-pine underline underline-offset-2 hover:text-pine/70"
          >
            <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", more && "rotate-180")} strokeWidth={2} />
            {more ? "Fewer options" : `More options (${rest.length})`}
          </button>
          {more ? rest.map(one) : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  id,
  name,
  schema,
  required,
  label,
  hint,
  value,
  onChange,
  onFocus,
}: {
  id: string;
  name: string;
  schema: JsonSchema | undefined;
  required: boolean;
  label?: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  const hintId = useId();
  const type = typeOf(schema);
  const title = label ?? schema?.title ?? humanize(name);
  const help = hint ?? (schema?.description ? (schema.description.split(/(?<=\.)\s/)[0] ?? "").slice(0, 220) : undefined);
  const common = { id, name, value, onFocus, "aria-describedby": help ? hintId : undefined, required };
  let control: React.ReactNode;
  if (schema?.enum?.length) {
    control = (
      <select {...common} onChange={(e) => onChange(e.target.value)} className={cn(field, "h-10")}>
        <option value="">{required ? "Choose…" : "Default"}</option>
        {schema.enum.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    );
  } else if (type === "boolean") {
    control = (
      <select {...common} onChange={(e) => onChange(e.target.value)} className={cn(field, "h-10")}>
        <option value="">Default</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else if (type === "array" || type === "object" || LONG.test(name) || value.length > 60 || value.includes("\n")) {
    control = (
      <textarea
        {...common}
        rows={type === "array" || type === "object" ? 3 : 4}
        onChange={(e) => onChange(e.target.value)}
        placeholder={type === "array" ? '["…"]' : type === "object" ? '{"…": "…"}' : undefined}
        spellCheck={false}
        className={cn(field, "py-2 font-mono text-[12.5px] leading-[1.5]")}
      />
    );
  } else {
    control = (
      <input
        {...common}
        onChange={(e) => onChange(e.target.value)}
        inputMode={type === "integer" || type === "number" ? "decimal" : undefined}
        autoComplete="off"
        spellCheck={false}
        className={cn(field, "h-10")}
      />
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-pine">
        {title}
        {required ? null : <span className="font-normal text-slate"> (optional)</span>}
      </label>
      {control}
      {help ? (
        <span id={hintId} className="text-micro text-slate">
          {help}
        </span>
      ) : null}
    </div>
  );
}
