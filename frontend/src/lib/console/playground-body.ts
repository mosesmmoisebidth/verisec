/**
 * Turns the Playground form into the exact request body the API takes, for three jobs: to send (images as the JWE
 * encrypted in the browser), to show in the Request panel, and to fill the code snippets (images as placeholders).
 *
 * One image field becomes one value at its path. A list field (a gallery of faces, a sequence of frames, the two
 * match images) becomes an array, each item carrying its image plus its own fields (id, label, source, and so on).
 */
import type { Param, PgEndpoint } from "@/lib/console/playground-run";

export type ListItem = { file: File | null; fields: Record<string, string | boolean> };
export type FormState = {
  values: Record<string, string | boolean>;
  files: Record<string, File | null>;
  lists: Record<string, ListItem[]>;
};

type Body = Record<string, unknown>;

export function isImageParam(p: Param) {
  return p.kind === "image" || p.kind === "images";
}

/* ---------------------------------------------------------------- initial state -- */

function initItemFields(fields: Param[] | undefined): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const f of fields ?? []) out[f.name] = f.kind === "boolean" ? f.default === true : f.default !== undefined ? String(f.default) : "";
  return out;
}

export function initialState(ep: PgEndpoint): FormState {
  const values: Record<string, string | boolean> = {};
  const lists: Record<string, ListItem[]> = {};
  for (const p of ep.params) {
    if (p.kind === "images" && p.list) {
      // start with the minimum number of empty slots so the shape is clear
      lists[p.name] = Array.from({ length: Math.max(p.list.min, p.list.imageKey ? 1 : p.list.min) }, () => ({ file: null, fields: initItemFields(p.list!.fields) }));
      continue;
    }
    if (p.kind === "image") continue;
    if (p.default === undefined) {
      if (p.kind === "boolean") values[p.name] = false;
      continue;
    }
    if (p.kind === "boolean") values[p.name] = p.default === true;
    else if (p.kind === "json") values[p.name] = JSON.stringify(p.default, null, 2);
    else if (p.kind === "string[]") values[p.name] = (p.default as string[]).join("\n");
    else if (p.kind === "rgb") values[p.name] = (p.default as number[]).join(", ");
    else values[p.name] = String(p.default);
  }
  return { values, files: {}, lists };
}

/* ---------------------------------------------------------------- value coercion -- */

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

/** Coerce a scalar form value to the type the API expects. Returns undefined to leave the field out. */
function coerce(p: Param, raw: string | boolean | undefined): unknown {
  if (p.kind === "boolean") return raw === true || raw === "true";
  if (raw === undefined || raw === "" || raw === null) return undefined;
  if (p.kind === "number" || p.kind === "integer") {
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }
  if (p.kind === "enum") return /^-?\d+$/.test(String(raw)) ? Number(raw) : raw;
  if (p.kind === "rgb") {
    const nums = String(raw).split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
    return nums.length === 3 ? nums : undefined;
  }
  if (p.kind === "string[]") return String(raw).split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (p.kind === "json") {
    try {
      return JSON.parse(String(raw));
    } catch {
      throw new Error(`${p.label}: not valid JSON`);
    }
  }
  return raw;
}

/* ---------------------------------------------------------------- the body -- */

export type ImageFor = (field: string, file: File | null, meta: { param: Param; index?: number }) => unknown;

/** Build the request body. `img` supplies what each image becomes (a JWE when sending, a placeholder otherwise). */
export function buildBody(ep: PgEndpoint, state: FormState, img: ImageFor): Body {
  const body: Body = {};
  for (const p of ep.params) {
    if (p.kind === "image") {
      const file = state.files[p.name] ?? null;
      const present = !!file || p.required;
      if (present) setPath(body, p.path ?? p.name, img(p.name, file, { param: p }));
      continue;
    }
    if (p.kind === "images" && p.list) {
      const spec = p.list;
      const items = (state.lists[p.name] ?? []).filter((it) => it.file || Object.values(it.fields).some((v) => v !== "" && v !== false));
      const arr = items.map((it, i) => {
        if (!spec.imageKey) return img(p.name, it.file, { param: p, index: i }); // the item is the image itself
        const o: Body = {};
        if (spec.indexKey) o[spec.indexKey] = i;
        o[spec.imageKey] = img(p.name, it.file, { param: p, index: i });
        // an id left empty is the one the field shows (face-1, frame-2, ...)
        if (spec.idKey) o[spec.idKey] = String(it.fields[spec.idKey] ?? "").trim() || `${spec.itemLabel}-${i + 1}`;
        if (spec.labelKey && it.fields[spec.labelKey]) o[spec.labelKey] = it.fields[spec.labelKey];
        for (const f of spec.fields ?? []) {
          const v = coerce(f, it.fields[f.name]);
          if (v !== undefined) o[f.name] = v;
        }
        return o;
      });
      setPath(body, p.path ?? p.name, arr);
      continue;
    }
    const v = coerce(p, state.values[p.name]);
    if (v !== undefined) setPath(body, p.path ?? p.name, v);
  }
  return body;
}

/** Every image file in the form, with the body path it will occupy, so each can be encrypted before sending. */
export function imageFiles(ep: PgEndpoint, state: FormState): { key: string; file: File }[] {
  const out: { key: string; file: File }[] = [];
  for (const p of ep.params) {
    if (p.kind === "image" && state.files[p.name]) out.push({ key: p.name, file: state.files[p.name]! });
    if (p.kind === "images" && p.list) {
      (state.lists[p.name] ?? []).forEach((it, i) => {
        if (it.file) out.push({ key: `${p.name}#${i}`, file: it.file });
      });
    }
  }
  return out;
}

/** A short placeholder for an image in the Request view and the snippets. */
export function placeholderFor(param: Param, file: File | null): string {
  if (param.token) return file ? `<token for ${file.name}, from /v1/vault/documents>` : "<token from /v1/vault/documents>";
  if (file) return `<${file.name}, encrypted in your browser>`;
  return `<${param.label.toLowerCase()}>`;
}
