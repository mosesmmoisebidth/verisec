/**
 * The request schema a developer reads on the Request panel's Schema tab: every field the API accepts, with its type,
 * whether it is required, its default and its allowed values. It is built from the same field list the form uses, so
 * the schema and the form can never drift apart.
 */
import type { Param, PgEndpoint } from "@/lib/console/playground-run";

type Body = Record<string, unknown>;

function setPath(obj: Body, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Body;
  }
  cur[parts[parts.length - 1]!] = value;
}

function flags(p: Param): string {
  const out = [p.required ? "required" : "optional"];
  if (p.default !== undefined && p.default !== "" && !Array.isArray(p.default) && p.kind !== "json") {
    out.push(`default ${p.kind === "enum" ? String(p.default) : JSON.stringify(p.default)}`);
  }
  if (p.min !== undefined || p.max !== undefined) out.push(`${p.min ?? "…"} to ${p.max ?? "…"}`);
  return out.join(", ");
}

function scalarType(p: Param): string {
  if (p.kind === "enum") {
    const vals = (p.choices ?? []).map((c) => c.value).filter(Boolean);
    const numeric = vals.length > 0 && vals.every((v) => /^-?\d+$/.test(v));
    return `${numeric ? "integer" : "string"}, one of ${vals.join(" | ")} (${flags(p)})`;
  }
  if (p.kind === "rgb") return `[red, green, blue], each 0 to 255 (${flags(p)})`;
  if (p.kind === "image") return p.token ? "string, the vault token of the encrypted document (required)" : `string, base64 image or a doc_ token (${p.required ? "required" : "optional"})`;
  return `${p.kind} (${flags(p)})`;
}

function fieldType(p: Param): unknown {
  if (p.kind === "string[]") {
    if (p.widget === "chips") return [`string, one of ${(p.choices ?? []).map((c) => c.value).join(" | ")}`];
    return [`string (${flags(p)})`];
  }
  if (p.kind === "json" && p.widget === "checks") return [{ name: `string, one of ${(p.checks ?? []).map((c) => c.name).join(" | ")}`, range: ["number (minimum)", "number (maximum)"] }];
  if (p.kind === "json") return ["object"];
  return scalarType(p);
}

/** The full request body as the API accepts it: one entry per field, described. */
export function requestSchema(ep: PgEndpoint): Body {
  const out: Body = {};
  for (const p of ep.params) {
    if (p.kind === "images" && p.list) {
      const spec = p.list;
      const item: Body = {};
      if (spec.indexKey) item[spec.indexKey] = "integer";
      if (spec.imageKey) item[spec.imageKey] = "string, base64 image or a doc_ token (required)";
      if (spec.idKey) item[spec.idKey] = "string, your own id (required)";
      if (spec.labelKey) item[spec.labelKey] = "string, your label";
      for (const f of spec.fields ?? []) item[f.name] = scalarType(f);
      setPath(out, p.path ?? p.name, spec.imageKey ? [item] : ["string, base64 image or a doc_ token"]);
      continue;
    }
    setPath(out, p.path ?? p.name, fieldType(p));
  }
  return out;
}
