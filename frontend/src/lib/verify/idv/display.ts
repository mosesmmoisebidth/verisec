/**
 * The client-safe display slice, built ONLY from the ten containers that are
 * consistent across all four document types. No engine names, no raw internals,
 * no bounding boxes reach the client here.
 *
 * Status codes are Regula's CheckResult enum: 0 = ERROR (a real failure),
 * 1 = OK (passed), 2 = WAS_NOT_DONE (the check was not performed, common from a
 * plain photo). So 2 is neutral, not a failure.
 *
 * Field values ARE included: this is the applicant reviewing their own document.
 * Other surfaces (admin lists, logs, model output) must honour the `pii` flag.
 */

import { TEXT_FIELD_TYPES } from "./enums";
import type {
  DisplayField,
  DisplayPage,
  DisplayPhoto,
  DisplayResult,
  DisplaySignal,
  DocSide,
  FullResult,
  NormField,
  Severity,
  Tone,
  Validity,
} from "./types";

/** Regula CheckResult: 1 = OK (pass), 0 = ERROR (fail), 2 = WAS_NOT_DONE (neutral). */
export function toneOf(v: Validity): Tone {
  if (v === 1) return "pass";
  if (v === 0) return "fail";
  return "idle"; // 2 = not performed, -1 = unknown
}
const notPerformed = (v: Validity) => v === 2;

const STATUS_LABEL: Record<Tone, string> = {
  pass: "Verified",
  warn: "Needs review",
  fail: "Not verified",
  idle: "Pending",
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

const sideOf = (page: number): DocSide => (page === 0 ? "front" : "back");
const sideLabel = (page: number): string => (page === 0 ? "Front" : "Back");

/** A field crosses when at least one source pair agreed and none disagreed. */
function crossChecked(f: NormField): boolean {
  if (f.comparisons.length === 0) return false;
  const agreed = f.comparisons.some((c) => c.status === 1);
  const disagreed = f.comparisons.some((c) => c.status === 0);
  return agreed && !disagreed;
}

function mapField(f: NormField): DisplayField {
  return {
    type: f.type,
    key: TEXT_FIELD_TYPES[f.type] || "",
    name: f.name,
    value: f.value,
    tone: toneOf(f.validity),
    sources: [...new Set(f.sources.map((s) => s.source).filter(Boolean))],
    crossChecked: crossChecked(f),
    pii: f.pii,
  };
}

/**
 * The final decision shown to the applicant. It reflects the errors we raised,
 * not only the engine's raw status: a serious problem (values do not match, a
 * printed field was altered or obscured, a fraud signal) fails outright, even if
 * the engine passed the document overall on the strength of the barcode.
 */
function finalDecision(full: FullResult): { tone: Tone; label: string } {
  const v = full.verdict;
  const serious = full.errors.some((e) => e.severity === "serious");
  const gating = full.errors.some((e) => e.severity === "quality" && e.gating);
  if (v.specimen || serious || v.overallStatus === 0) return { tone: "fail", label: "Not passed" };
  if (gating) return { tone: "warn", label: "Needs review" };
  if (v.overallStatus === 1) return { tone: "pass", label: "Passed" };
  return { tone: "warn", label: "Could not be fully checked" }; // WAS_NOT_DONE / unknown
}

/** The blended headline: the decision, dropped by any critical or warning note. */
function overallTone(full: FullResult): Tone {
  const d = finalDecision(full).tone;
  const hasCritical = full.anomalies.some((a) => a.severity === "critical");
  const hasWarn = full.anomalies.some((a) => a.severity === "warn");
  if (d === "fail" || hasCritical) return "fail";
  if (d === "warn" || hasWarn) return "warn";
  return "pass";
}

function buildSignals(full: FullResult, hasExpiry: boolean, mrzPresent: boolean): DisplaySignal[] {
  const v = full.verdict;
  const sig: DisplaySignal[] = [];
  const check = (name: string, code: Validity) => sig.push({ name, tone: toneOf(code), note: notPerformed(code) ? "not checked" : undefined });

  check("Document recognised", v.docType);
  check("Printed data consistent", v.text);
  check("Security features", v.security);
  check("Image quality", v.imageQA);
  if (mrzPresent) check("Machine readable zone", v.mrz);
  if (hasExpiry) check("Within validity dates", v.expiry);
  sig.push({ name: "Portrait present", tone: full.faces > 0 ? "pass" : toneOf(v.portrait) });

  let agreed = false;
  let disagreed = false;
  for (const p of full.pages)
    for (const f of p.fields)
      for (const c of f.comparisons) {
        if (c.status === 1) agreed = true;
        if (c.status === 0) disagreed = true;
      }
  if (agreed || disagreed) sig.push({ name: "Front and back data match", tone: disagreed ? "fail" : agreed ? "pass" : "idle" });

  return sig;
}

/** The fields read from one side, taken from each merged field's own sources. */
function fieldsForSide(merged: NormField[], side: DocSide): DisplayField[] {
  const want = side === "front" ? 0 : 1;
  const out: DisplayField[] = [];
  for (const f of merged) {
    const srcs = f.sources.filter((s) => s.page === want && s.value);
    if (srcs.length === 0) continue;
    out.push({
      ...mapField(f),
      value: srcs[0]!.value,
      sources: [...new Set(srcs.map((s) => s.source).filter(Boolean))],
    });
  }
  return out;
}

function photosForPage(full: FullResult, page: number): DisplayPhoto[] {
  const pg = full.pages.find((p) => p.page === page);
  if (!pg) return [];
  // One figure per graphic TYPE per side. The same portrait / signature is
  // returned by more than one container (visual graphics and the images crop)
  // with different bytes, so deduping by the image itself is not enough.
  const seen = new Set<number>();
  const out: DisplayPhoto[] = [];
  for (const g of pg.graphics) {
    if (!g.src || seen.has(g.type)) continue;
    seen.add(g.type);
    // The full-page crop is tagged "document front side" by the engine on both
    // sides; the side header already says which, so name it generically.
    const name = g.type === 207 || g.type === 208 ? "Document image" : g.name;
    out.push({ name, src: g.src, side: sideOf(page) });
  }
  return out;
}

export function toDisplay(full: FullResult): DisplayResult {
  const decision = finalDecision(full);
  const tone = overallTone(full);

  // Merge fields across pages by type; prefer the entry that carries a value.
  const byType = new Map<number, NormField>();
  for (const p of full.pages)
    for (const f of p.fields) {
      const prev = byType.get(f.type);
      if (!prev || (!prev.value && f.value)) byType.set(f.type, f);
    }
  const merged = [...byType.values()].filter((f) => f.value);
  const fields = merged.map(mapField);

  // Per-side views, split by each value's own page (the back barcode data is
  // merged onto the front container but tagged pageIndex 1).
  const pageNums = [...new Set(full.pages.map((p) => p.page))].sort((a, b) => a - b);
  const pages: DisplayPage[] = [];
  for (const n of pageNums) {
    const side = sideOf(n);
    const sf = fieldsForSide(merged, side);
    const sp = photosForPage(full, n);
    if (n === 0 || sf.length > 0 || sp.length > 0)
      pages.push({ side, label: sideLabel(n), documentName: full.pages.find((p) => p.page === n)?.docClass?.documentName || "", fields: sf, photos: sp });
  }

  // Each side's figures are already unique per type; the combined list is just
  // the front figures followed by the back figures.
  const photos: DisplayPhoto[] = pages.flatMap((p) => p.photos);

  const qualityTone = new Map<string, Tone>();
  for (const p of full.pages)
    for (const q of p.quality) {
      const t: Tone = q.passed ? "pass" : "fail";
      if (t === "fail" || !qualityTone.has(q.name)) qualityTone.set(q.name, t);
    }
  const quality = [...qualityTone].map(([name, t]) => ({ name, tone: t }));

  const hasExpiry = full.pages.some((p) => p.fields.some((f) => TEXT_FIELD_TYPES[f.type] === "DATE_OF_EXPIRY" && f.value));
  const mrzPresent = full.pages.some((p) => !!p.mrz && p.mrz.rows.length > 0);
  const signals = buildSignals(full, hasExpiry, mrzPresent);

  const documentName = full.pages.find((p) => p.docClass)?.docClass?.documentName || full.docType;

  // Surface only user-meaningful notes. Orientation is intentionally not shown.
  const noteKinds = new Set([
    "specimen", "expired", "no-expiry", "source-mismatch", "country-mismatch", "doctype-mismatch", "auth-failed", "no-classification",
  ]);
  const seenNote = new Set<string>();
  const notes = full.anomalies
    .filter((a) => noteKinds.has(a.kind))
    .filter((a) => (seenNote.has(a.detail) ? false : (seenNote.add(a.detail), true)))
    .map((a) => ({ severity: a.severity, text: a.detail }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return {
    country: full.country,
    docType: full.docType,
    documentName,
    status: { tone, label: STATUS_LABEL[tone], specimen: full.verdict.specimen },
    decision,
    canProceed: decision.tone !== "fail",
    photos,
    fields,
    pages,
    signals,
    quality,
    faces: full.faces,
    notes,
  };
}
