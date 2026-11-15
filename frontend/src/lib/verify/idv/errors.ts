/**
 * Wire every error Regula reported into a classified list.
 *
 * Nothing here is invented: each error comes from a real Regula result code
 * (a cross-source comparison status of 0, an authenticity element result of 0
 * with its CheckDiagnose, an image-quality check result of 0) and is classified
 * only by Regula's own diagnosis name and CriticalFlag.
 *
 *  - "serious": values do not match, or a fraud / tampering / liveness / critical
 *    indicator. The applicant is stopped.
 *  - "quality": a capture, geometry, resolution, lighting or read-quality issue.
 *    The applicant is asked to re-take; a repeat may be allowed.
 */

import { classifyDiagnose, diagnoseName, TEXT_FIELD_TYPES } from "./enums";
import type { CountryDocProfile } from "./catalog";
import type { DocSide, FullResult, RegulaError } from "./types";

const side = (page: number): DocSide => (page === 0 ? "front" : "back");

/**
 * Core identity fields a document of this type is expected to carry. If the
 * profile expects one and NONE of its acceptable names was read, the field could
 * not be read: a shaded, crossed-out, rubbed or painted-over field reads as
 * missing. (A field that was ALTERED but still present is caught instead by the
 * cross-source comparison, which is serious.)
 */
const CORE_CONCEPTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Document number", ["DOCUMENT_NUMBER"]],
  ["Date of birth", ["DATE_OF_BIRTH"]],
  ["Name", ["SURNAME", "GIVEN_NAMES", "SURNAME_AND_GIVEN_NAMES", "FULL_NAME", "NAME"]],
];

/**
 * The details every identity document must give, whatever its country: a name, a date of birth, and a document (or
 * personal) number. Each lists the field types that carry it; any one read counts.
 */
const REQUIRED_DETAILS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Name", ["SURNAME", "GIVEN_NAMES", "SURNAME_AND_GIVEN_NAMES", "FAMILY_NAME", "FIRST_NAME", "LAST_NAME", "FIRST_SURNAME", "SECOND_SURNAME", "MIDDLE_NAME", "GIVEN_NAMES_RUS", "SURNAME_AND_GIVEN_NAMES_RUS"]],
  ["Date of birth", ["DATE_OF_BIRTH"]],
  ["Document number", ["DOCUMENT_NUMBER", "PERSONAL_NUMBER", "PASSPORT_NUMBER", "IDENTITY_CARD_NUMBER", "LICENSE_NUMBER"]],
];

function dedupe(items: RegulaError[]): RegulaError[] {
  const seen = new Set<string>();
  const out: RegulaError[] = [];
  for (const e of items) {
    const key = `${e.area}|${e.label}|${e.detail ?? ""}|${e.side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function collectErrors(full: FullResult, profile?: CountryDocProfile | null): RegulaError[] {
  const out: RegulaError[] = [];

  // Document-level: a specimen or sample is a serious stop.
  if (full.verdict.specimen)
    out.push({ area: "authenticity", label: "Specimen or sample document", page: 0, side: "front", critical: true, severity: "serious" });

  // --- Printed vs encoded identity: global tamper detection ---
  // On a genuine document an identity field that is printed on the front AND
  // stored in the barcode / MRZ / chip both read and agree. If the printed value
  // is missing while the code still holds it, or the two differ, the physical
  // document was altered. This uses ONLY which source each value came from, so it
  // is engine and country agnostic (no per-document rules).
  // A printed identity field that was ALTERED but still readable is caught by the
  // engine's own cross-source comparison (status 0 above, flagged serious). We do
  // NOT re-compare raw values here: the engine normalises name splits and date
  // formats, and a naive compare produces false mismatches on genuine documents.
  const CODE_SOURCES = new Set(["BARCODE", "MRZ", "RFID"]);
  const documentHasVisual = full.pages.some((p) =>
    p.fields.some((f) => f.sources.some((s) => s.source === "VISUAL" && s.value)),
  );

  // Per core identity concept: expected and present in the code but NOT printed,
  // on a document whose print otherwise read. This is the obscured / rubbed /
  // painted-over case, where the printed field fails OCR while the barcode keeps
  // the real value. If nothing read it at all, it is a softer quality re-take.
  if (profile) {
    for (const [label, names] of CORE_CONCEPTS) {
      const expected = names.some((n) => profile.textFields.includes(n));
      if (!expected) continue;
      let any = false;
      let hasVisual = false;
      let hasCode = false;
      for (const p of full.pages)
        for (const f of p.fields) {
          const nm = TEXT_FIELD_TYPES[f.type];
          if (!nm || !names.includes(nm)) continue;
          if (f.value) any = true;
          for (const s of f.sources) {
            if (!s.value) continue;
            if (s.source === "VISUAL") hasVisual = true;
            else if (CODE_SOURCES.has(s.source)) hasCode = true;
          }
        }
      if (hasCode && !hasVisual && documentHasVisual && any)
        out.push({
          area: "cross-source",
          label: `Printed ${label.toLowerCase()} could not be read`,
          detail: "the barcode or chip still shows it, the printed field may be altered or obscured",
          page: 0,
          side: "front",
          critical: true,
          severity: "serious",
          affects: [...names],
        });
    }
  }

  // Required details, for every document of every country (no per-country list): read means some text container
  // returned it with a value (the printed side, the barcode, the MRZ, the chip or the merged text). One that nothing
  // read gates: the applicant takes a new photo, and it is never let through. It is missing from the whole document,
  // so no side is named.
  const readKeys = new Set(full.readFields.filter((f) => f.sources.length).map((f) => f.key));
  for (const [label, names] of REQUIRED_DETAILS) {
    if (names.some((n) => readKeys.has(n))) continue;
    out.push({
      area: "cross-source",
      label: `${label} could not be read`,
      detail: "take a sharp, glare free photo so it can be read",
      page: 0,
      critical: false,
      severity: "quality",
      gating: true,
      affects: [...names],
    });
  }

  // Cross-source value mismatch (visual vs barcode / MRZ / RFID): status 0 = the
  // values actually disagree. This is the clearest serious signal.
  for (const p of full.pages)
    for (const f of p.fields) {
      const key = TEXT_FIELD_TYPES[f.type];
      for (const c of f.comparisons)
        if (c.status === 0)
          out.push({
            area: "cross-source",
            label: f.name,
            detail: `Differs between the ${c.left.toLowerCase()} and ${c.right.toLowerCase()} data`,
            page: p.page,
            side: side(p.page),
            critical: true,
            severity: "serious",
            affects: key ? [key] : [],
          });
    }

  // Authenticity element errors: classify by Regula's diagnose name + critical.
  for (const g of full.authChecks) {
    let anyElem = false;
    for (const e of g.elements)
      if (e.result === 0) {
        anyElem = true;
        const critical = !!e.critical;
        out.push({
          area: "authenticity",
          label: g.name,
          detail: e.diagnose != null ? diagnoseName(e.diagnose) : undefined,
          diagnose: e.diagnose,
          page: g.page,
          side: side(g.page),
          critical,
          severity: classifyDiagnose(e.diagnose ?? -1, critical),
        });
      }
    // A group that errored with no element detail: soft, so it is never a silent
    // pass but also not a hard fraud stop.
    if (!anyElem && g.result === 0)
      out.push({ area: "authenticity", label: g.name, page: g.page, side: side(g.page), critical: false, severity: "quality" });
  }

  // Image-quality failures are capture / quality issues.
  for (const p of full.pages)
    for (const q of p.quality)
      if (!q.passed)
        out.push({ area: "image-quality", label: "Image quality", page: p.page, side: side(p.page), critical: false, severity: "quality" });

  return dedupe(out);
}

export type ErrorClass = "none" | "serious" | "quality";
export function classifyErrors(errors: RegulaError[]): ErrorClass {
  if (errors.some((e) => e.severity === "serious")) return "serious";
  if (errors.some((e) => e.severity === "quality")) return "quality";
  return "none";
}
