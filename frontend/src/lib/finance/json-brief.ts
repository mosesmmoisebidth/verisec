/**
 * A short, readable view of an API response for the JSON panels. Display only:
 * the API always returns everything, and the panels' Copy / Download give the
 * full response.
 *
 *   "box": [8, 494, …]                       a box shows its first corner (x1, y1)
 *   "confidences": [99.8, 98.1, … 30 more]   long number lists show their head
 *   "boxes": [ {…}, {…}, {…}, … 49 more ]    long lists of boxes show the first three
 */

const BOX_KEY = /^(box|bbox|warpedbox|warped_box|polygon|points|quad|corners)$/i;
const NUMBERS_SHOWN = 6;
const BOXES_SHOWN = 3;

const isNumber = (x: unknown): x is number => typeof x === "number";
const isNumbers = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every(isNumber);
const isPoints = (v: unknown): v is number[][] => Array.isArray(v) && v.length > 0 && v.every((p) => isNumbers(p) && p.length <= 3);
const hasBox = (v: unknown): boolean =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).some((k) => BOX_KEY.test(k));

function list(values: string[], more: number): string {
  if (more <= 0) return `[${values.join(", ")}]`;
  return `[${values.join(", ")}, … ${more} more]`;
}

function render(v: unknown, key: string | null, indent: string): string {
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    if (isNumbers(v)) {
      if (key && BOX_KEY.test(key)) return `[${v.slice(0, 2).map(String).join(", ")}${v.length > 2 ? ", …" : ""}]`;
      return list(v.slice(0, NUMBERS_SHOWN).map(String), v.length - NUMBERS_SHOWN);
    }
    if (isPoints(v)) return `[[${(v[0] ?? []).join(", ")}]${v.length > 1 ? ", …" : ""}]`;
    const inner = indent + "  ";
    if (v.length > BOXES_SHOWN && v.every(hasBox)) {
      const head = v.slice(0, BOXES_SHOWN).map((x) => `${inner}${oneLine(x)}`);
      return `[\n${head.join(",\n")},\n${inner}… ${v.length - BOXES_SHOWN} more\n${indent}]`;
    }
    return `[\n${v.map((x) => `${inner}${render(x, null, inner)}`).join(",\n")}\n${indent}]`;
  }
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return "{}";
    const inner = indent + "  ";
    return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${render(x, k, inner)}`).join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function oneLine(v: unknown): string {
  return render(v, null, "").replace(/\n\s*/g, " ");
}

const BOX_LIST_KEY = /^(boxes|text_boxes|regions|detections|lines|words|fields_boxes)$/i;

/**
 * For the JSON tree: a bounding box (or a list of them) starts folded and opens on click, so the response reads
 * cleanly and every coordinate is still one click away.
 */
export function isBoundingBox(name: string | null, value: unknown): boolean {
  if (name && BOX_KEY.test(name) && (isNumbers(value) || isPoints(value))) return true;
  if (Array.isArray(value) && value.length > 0 && ((name && BOX_LIST_KEY.test(name)) || value.every(hasBox))) return value.every((x) => hasBox(x) || isNumbers(x) || isPoints(x));
  return false;
}

export function briefJson(value: unknown): string {
  return render(value, null, "");
}
