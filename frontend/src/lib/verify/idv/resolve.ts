/**
 * KYC resolution: turn a raw Regula read plus the applicant's selection into one
 * decision the Confirm Details screen acts on.
 *
 * Rules:
 *  - The document is classified from what Regula detected, not from what the user
 *    picked. If it is one of the four accepted types, the details are always
 *    built for the DETECTED country and type (self-correcting), and any change
 *    from the selection is flagged with advice to re-take.
 *  - A recognised document that is not one of the four (a visa, a student card,
 *    and so on) is rejected immediately with no details shown.
 *  - A document that cannot be recognised at all asks for a clearer re-take.
 *
 * This is the impure orchestration layer (it loads the catalog); the parsing,
 * analysis and display stages it calls stay pure.
 */

import { extractFull } from "./extractors";
import { analyze, categoryOf } from "./analyze";
import { collectErrors, classifyErrors } from "./errors";
import { toDisplay } from "./display";
import { buildConfirmSections } from "./confirm";
import { loadCatalog, getProfile, type Catalog } from "./catalog";
import { toAlpha3, countryName } from "./iso";
import type {
  CountryDocProfile,
} from "./catalog";
import type { CrossMatch, DocClass, DocSelection, DocTypeName, FullResult, KycGate, KycResolution } from "./types";
import { TEXT_FIELD_TYPES } from "./enums";

const FOUR = "Passport, National ID, Driving Licence, or Residence Permit";

/** Map a flow slug or a free label to one of the four document types. */
export function normalizeDocType(input: string | undefined): DocTypeName | null {
  const s = (input || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s.includes("passport")) return "Passport";
  if (s.includes("residence") || s.includes("resident")) return "Residence Permit";
  if (s.includes("licence") || s.includes("license") || s.includes("driving") || s.includes("driver") || s === "dl")
    return "Driving Licence";
  if (s.includes("nationalid") || s === "id" || s.includes("identity") || s.includes("idcard")) return "National ID";
  return null;
}

/** Pick the primary classification: the front page if classified, else any. */
function primaryClass(full: FullResult): DocClass | undefined {
  const front = full.pages.find((p) => p.page === 0)?.docClass;
  return front || full.pages.find((p) => p.docClass)?.docClass;
}

/**
 * Guidance is only shown for a DOCUMENT-TYPE correction, which may mean the wrong
 * document was captured. A country difference is not nagged: the engine's country
 * detection is authoritative, the selection is only a starting hint, so we simply
 * self-correct to the detected country and show it in the summary.
 */
function autocorrectGuidance(
  countryAlsoChanged: boolean,
  detectedCountry: string,
  detectedDoc: DocTypeName,
  selDoc: DocTypeName | null,
): string {
  const chosen = selDoc ?? "document";
  if (countryAlsoChanged)
    return `This looks like a ${detectedDoc} issued by ${countryName(detectedCountry)}, not the ${chosen} you chose. We have updated the details to match. If that is not your document, please re-take the photo.`;
  return `This looks like a ${detectedDoc}, not the ${chosen} you chose. We have updated the details to match. If that is not your document, please re-take the photo.`;
}

export interface ResolveOptions {
  /** 1-based index of the current capture attempt for this document. */
  attempt?: number;
}

/** Identity details: their agreement between the printed side and the code is what makes a cross-match count. */
const IDENTITY_KEYS = new Set(["DOCUMENT_NUMBER", "PERSONAL_NUMBER", "SURNAME", "GIVEN_NAMES", "SURNAME_AND_GIVEN_NAMES", "DATE_OF_BIRTH"]);

/** Every field the reader compared between the printed side and the barcode / MRZ / chip, one entry per field. */
export function crossMatchOf(full: FullResult): CrossMatch {
  const byField = new Map<string, CrossMatch["fields"][number]>();
  for (const p of full.pages)
    for (const f of p.fields) {
      if (!f.comparisons.length) continue;
      const key = TEXT_FIELD_TYPES[f.type] ?? "";
      const id = key || f.name;
      const entry = byField.get(id) ?? { name: f.name, key, pairs: [] };
      for (const c of f.comparisons) entry.pairs.push({ left: c.left, right: c.right, agree: c.status === 1 });
      byField.set(id, entry);
    }
  const fields = [...byField.values()];
  const agree = fields.length >= 2 && fields.every((f) => f.pairs.every((x) => x.agree)) && fields.some((f) => IDENTITY_KEYS.has(f.key));
  return { agree, fields };
}

/**
 * The proceed gate, driven by Regula's own errors and final decision:
 *  - a serious error (values differ / fraud / critical) always stops,
 *  - otherwise if Regula did not fail (overallStatus is OK or not-performed) the
 *    applicant proceeds,
 *  - a Regula ERROR that is only capture / quality asks for a re-take, and is
 *    allowed on the second attempt (flagged and recorded),
 *  - any other Regula ERROR asks for a re-take, allowed on the second attempt,
 *  - a photo with only quality problems (glare, not sharp) whose printed details and barcode / MRZ agree goes on at
 *    once, with a warning recorded: what matters was read and cross-checked,
 *  - a required detail nothing could read (name, date of birth, document number) always asks for a new photo.
 */
export function computeGate(errors: FullResult["errors"], overallStatus: number, attempt: number, crossMatched = false): KycGate {
  if (errors.some((e) => e.severity === "serious")) return { canProceed: false, reason: "serious", attempt, flagged: false };

  const anyQuality = errors.some((e) => e.severity === "quality");
  // A required detail that could not be read gates even when the engine passed
  // overall: we still could not get a required identity field.
  const gatingQuality = errors.some((e) => e.severity === "quality" && e.gating);

  // a required detail (name, date of birth, document number) that nothing could read: always a new photo, never let
  // through, not on a second try and not when the front and back agree
  if (gatingQuality) return { canProceed: false, reason: "quality-retake", attempt, flagged: false };

  if (overallStatus !== 0) return { canProceed: true, reason: "ok", attempt, flagged: false };

  // quality problems only, every required detail read, and the front and back details agree: a warning, not a stop
  if (anyQuality && !gatingQuality && crossMatched) return { canProceed: true, reason: "quality-allowed", attempt, flagged: true, crossMatched: true };

  if (gatingQuality || anyQuality)
    return attempt >= 2
      ? { canProceed: true, reason: "quality-allowed", attempt, flagged: true }
      : { canProceed: false, reason: "quality-retake", attempt, flagged: false };

  return attempt >= 2
    ? { canProceed: true, reason: "quality-allowed", attempt, flagged: true }
    : { canProceed: false, reason: "failed", attempt, flagged: false };
}

/**
 * Resolve a Regula read against the applicant's selection.
 * `selection` may carry a flow slug and any country form (ISO-3, alpha-2, name).
 */
export async function resolveKyc(resp: unknown, selection: DocSelection, opts: ResolveOptions = {}): Promise<KycResolution> {
  const attempt = Math.max(1, Math.trunc(opts.attempt ?? 1));
  const selCountry = toAlpha3(selection.country);
  const selDoc = normalizeDocType(selection.docType);

  let catalog: Catalog | null = null;
  try {
    catalog = await loadCatalog();
  } catch {
    catalog = null; // degrade to structural checks only
  }
  const profile = (iso: string, dt: DocTypeName | null): CountryDocProfile | null =>
    catalog && dt ? getProfile(catalog, iso, dt) : null;

  // Extraction never depends on the selection; do it once.
  const full = extractFull(resp, { country: selCountry, docType: selDoc ?? "Passport" });

  const pc = primaryClass(full);
  const detectedCategory = pc ? categoryOf(pc.dType, pc.documentName) : null;
  const detectedCountry = pc && pc.country && pc.country.length === 3 ? pc.country.toUpperCase() : "";

  // --- Not one of the four, or unreadable: stop, no details. ---
  if (!pc || !detectedCategory) {
    full.anomalies = analyze(full, { country: selCountry, docType: selDoc ?? "Passport", profile: profile(selCountry, selDoc) });
    full.errors = collectErrors(full, profile(selCountry, selDoc));
    const outcome = pc ? "wrong-document" : "unreadable";
    const guidance = pc
      ? `This does not look like one of the documents we can verify. Please upload your ${FOUR}.`
      : `We could not read this document clearly. Please re-take a sharp, well lit photo of your ${FOUR}.`;
    return {
      outcome,
      selected: { country: selCountry, docType: selDoc },
      effective: null,
      corrected: { country: false, docType: false },
      guidance,
      adviseRetake: true,
      errors: full.errors,
      errorClass: classifyErrors(full.errors),
      gate: { canProceed: false, reason: "failed", attempt, flagged: false },
      crossMatch: crossMatchOf(full),
      full,
    };
  }

  // --- Supported document: self-correct to what was detected. ---
  const effectiveDocType = detectedCategory;
  const effectiveCountry = detectedCountry && catalog && catalog[detectedCountry] ? detectedCountry : detectedCountry || selCountry;
  const correctedDoc = selDoc != null && effectiveDocType !== selDoc;
  const correctedCountry = !!selCountry && !!effectiveCountry && effectiveCountry !== selCountry;

  full.anomalies = analyze(full, {
    country: effectiveCountry,
    docType: effectiveDocType,
    profile: profile(effectiveCountry, effectiveDocType),
  });
  full.errors = collectErrors(full, profile(effectiveCountry, effectiveDocType));
  const errorClass = classifyErrors(full.errors);
  const crossMatch = crossMatchOf(full);
  const gate = computeGate(full.errors, full.verdict.overallStatus, attempt, crossMatch.agree);

  const display = toDisplay(full);
  display.country = effectiveCountry;
  display.docType = effectiveDocType;
  // What the screen says follows what the flow does. The reader's own overall status turns to "error" for photo
  // problems alone (glare, a barcode layout off the template), so a document the check lets through with warnings
  // (the front and back details agree, or a second photo with only quality problems and every required detail read)
  // reads as passed, with the warnings listed beside it: never "Not passed" while the applicant may continue.
  if (gate.canProceed && gate.flagged) {
    display.decision = { tone: "pass", label: "Passed with warnings" };
    display.status = { ...display.status, tone: "pass", label: "Verified with warnings" };
    display.canProceed = true;
  }
  const sections = buildConfirmSections(display.fields, effectiveDocType);

  // Only a document-type change warrants the "we adjusted, re-take" banner. A
  // country-only difference is corrected silently (the detected country is shown
  // in the summary), so a stale or defaulted country selection never nags.
  const outcome = correctedDoc ? "autocorrected" : "accept";
  const guidance = correctedDoc ? autocorrectGuidance(correctedCountry, effectiveCountry, effectiveDocType, selDoc) : "";

  return {
    outcome,
    selected: { country: selCountry, docType: selDoc },
    effective: { country: effectiveCountry, docType: effectiveDocType },
    corrected: { country: correctedCountry, docType: correctedDoc },
    guidance,
    adviseRetake: correctedDoc || !gate.canProceed,
    errors: full.errors,
    errorClass,
    gate,
    crossMatch,
    display,
    sections,
    full,
  };
}
