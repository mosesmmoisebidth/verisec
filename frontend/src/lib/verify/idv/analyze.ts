/**
 * Anomaly detection: compare a parsed FullResult against the per-country
 * expectation profile and the document's own verdict, and raise typed anomalies.
 *
 * Pure: operates only on the typed FullResult + ParseOptions (no raw response,
 * no DOM). Never throws; degrades to structural checks when no profile is given.
 * The result is de-duplicated (a two sided document classifies both pages, so the
 * same country / type / cross-source note would otherwise appear twice).
 */

import { DOCUMENT_TYPES, TEXT_FIELD_TYPES, humanize } from "./enums";
import type { Anomaly, DocClass, DocTypeName, FullResult, ParseOptions } from "./types";

/**
 * Map a Regula dType (with the document name as a fallback) to one of the four
 * KYC categories. This MUST mirror the classifier used to build the expectation
 * catalog, otherwise a genuine document would be flagged as the wrong type.
 */
export function categoryOf(dType: number, documentName?: string): DocTypeName | null {
  const n = DOCUMENT_TYPES[dType] || "";
  const c = (documentName || "").toLowerCase();
  if (n.includes("PASSPORT") || c.includes("passport")) return "Passport";
  if (n.includes("RESIDEN") || c.includes("residen")) return "Residence Permit";
  if (n.includes("DRIVING") || n.includes("DRIVER") || c.includes("driving") || (c.includes("driver") && c.includes("licen")))
    return "Driving Licence";
  if (n === "IDENTITY_CARD" || c.includes("identity card") || c.includes("national id") || c.includes("id card"))
    return "National ID";
  if (n.includes("IDENTITY_CARD")) return "National ID";
  return null;
}

const typeName = (code: number): string | undefined => TEXT_FIELD_TYPES[code];

/**
 * Core identity concepts checked for presence, each satisfied by any of several
 * acceptable TextFieldType enum names (a document uses one naming or another,
 * never all of them). Keeps the missing-field check high-signal.
 */
const CORE_CONCEPTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Document number", ["DOCUMENT_NUMBER"]],
  ["Date of birth", ["DATE_OF_BIRTH"]],
  ["Date of expiry", ["DATE_OF_EXPIRY"]],
  ["Name", ["SURNAME", "GIVEN_NAMES", "SURNAME_AND_GIVEN_NAMES", "FULL_NAME", "NAME"]],
];

export function analyze(full: FullResult, opts: ParseOptions): Anomaly[] {
  const out: Anomaly[] = [];
  const add = (a: Anomaly) => out.push(a);
  const selectedCountry = (opts.country || "").toUpperCase().trim();

  const rtsPresent = new Set(full.containersPresent.map((c) => c.resultType));
  const classes = full.pages.map((p) => p.docClass).filter(Boolean) as DocClass[];

  if (!classes.length)
    add({ kind: "no-classification", severity: "critical", detail: "The document could not be classified." });

  // --- Selection vs detection: country and document type. ---
  for (const dc of classes) {
    const detectedCountry = (dc.country || "").toUpperCase().trim();
    // Only compare full 3 letter codes. Some issuers use short ICAO codes
    // (Germany is "D"), which do not line up with the ISO-3 selection and would
    // otherwise raise a false mismatch that blocks a genuine holder.
    if (selectedCountry.length === 3 && detectedCountry.length === 3 && detectedCountry !== selectedCountry)
      add({
        kind: "country-mismatch",
        severity: "warn",
        page: dc.page,
        detail: `Detected country ${detectedCountry} does not match the selected ${selectedCountry}.`,
      });

    const cat = categoryOf(dc.dType, dc.documentName);
    if (cat && cat !== opts.docType)
      add({
        kind: "doctype-mismatch",
        severity: "warn",
        page: dc.page,
        detail: `This looks like a ${cat}, but a ${opts.docType} was expected.`,
      });
  }

  // --- Verdict driven flags. Codes are Regula CheckResult: 0 = ERROR (failed),
  // 1 = OK (passed), 2 = WAS_NOT_DONE (not performed). So 0 is the failure. ---
  const v = full.verdict;
  if (v.specimen) add({ kind: "specimen", severity: "critical", detail: "The document appears to be a specimen or sample." });

  // Expiry: 0 = expired/invalid, 1 = valid, 2 = not checked. Only flag expired on
  // a real error, and only note "no expiry" when no expiry date was read at all.
  const hasExpiry = full.pages.some((p) => p.fields.some((f) => TEXT_FIELD_TYPES[f.type] === "DATE_OF_EXPIRY" && f.value));
  if (hasExpiry) {
    if (v.expiry === 0) add({ kind: "expired", severity: "warn", detail: "The document is expired." });
  } else {
    add({ kind: "no-expiry", severity: "info", detail: "This document does not show a date of expiry." });
  }

  let hasCriticalAuth = false;
  for (const a of full.authChecks)
    for (const e of a.elements)
      if (e.result === 0 && e.critical) {
        hasCriticalAuth = true;
        add({ kind: "auth-failed", severity: "critical", page: a.page, detail: `A critical security check did not pass: ${a.name}.` });
      }
  // Generic security note only on a real failure, and only if nothing more
  // specific was raised. A "not performed" security check is not a failure.
  if (v.security === 0 && !hasCriticalAuth)
    add({ kind: "auth-failed", severity: "warn", detail: "One or more security checks did not pass." });

  // --- Cross-source disagreement (visual vs barcode / MRZ / RFID). A real
  // disagreement is status 0 (ERROR); status 2 means the comparison was not
  // performed, which is not a mismatch. ---
  for (const pg of full.pages)
    for (const f of pg.fields)
      for (const cmp of f.comparisons)
        if (cmp.status === 0)
          add({
            kind: "source-mismatch",
            severity: "warn",
            page: pg.page,
            field: f.name,
            detail: `"${f.name}" does not agree between the ${cmp.left.toLowerCase()} and ${cmp.right.toLowerCase()} data.`,
          });

  // --- Expectation profile: containers and fields. ---
  const prof = opts.profile;
  if (prof) {
    const hasMrz = rtsPresent.has(3) || rtsPresent.has(87) || rtsPresent.has(7);
    const hasBarcode = rtsPresent.has(5) || rtsPresent.has(18);
    const hasAuth = rtsPresent.has(20);
    if (prof.containers.mrz && !hasMrz)
      add({ kind: "missing-container", severity: "warn", detail: "Expected a machine readable zone for this document but none was read." });
    if (prof.containers.barcode && !hasBarcode)
      add({ kind: "missing-container", severity: "warn", detail: "Expected a barcode for this document but none was read." });
    if (prof.containers.authenticity && !hasAuth)
      add({ kind: "missing-container", severity: "info", detail: "No authenticity results were produced for this document." });
    if (!prof.containers.mrz && hasMrz)
      add({ kind: "unexpected-container", severity: "info", detail: "A machine readable zone was read that this document is not expected to carry." });

    // Precompute the seen sets once, then diff against the expected names.
    const expected = new Set(prof.textFields);
    const seenTypes = new Set<number>();
    for (const pg of full.pages) for (const f of pg.fields) seenTypes.add(f.type);
    const seenNames = new Set<string>();
    for (const t of seenTypes) {
      const nm = typeName(t);
      if (nm) seenNames.add(nm);
    }
    // Missing fields are checked only for a small set of core identity concepts,
    // each satisfied by any of several acceptable field names. The profile's
    // textFields is the UNION across every variant of this country + type, so a
    // per-name "missing" check would fire dozens of false positives on a single
    // genuine variant. A concept is flagged only when the document expects it
    // (the profile carries at least one of its names) yet none was read.
    for (const [label, names] of CORE_CONCEPTS) {
      const expectsConcept = names.some((n) => expected.has(n));
      const sawConcept = names.some((n) => seenNames.has(n));
      if (expectsConcept && !sawConcept)
        add({ kind: "missing-field", severity: "info", field: label, detail: `Expected field not present: ${label}.` });
    }
    // New / unexpected fields stay per-name: this is the high-signal detection of
    // anything the document carries that the country profile does not describe.
    // Fields the engine derives for every document (computed ages and terms, the issuing state
    // from the document type, a full name split into parts, MRZ bookkeeping) are not new: they
    // never appear in a country profile, and noting them only adds noise.
    for (const name of seenNames)
      if (!expected.has(name) && !isDerivedField(name))
        add({ kind: "unexpected-field", severity: "info", field: humanize(name), detail: `New or unexpected field for this document: ${humanize(name)}.` });
  }

  return dedupe(out);
}

/** Field types the engine adds on its own for any document, never a sign of an unusual document. */
const DERIVED_FIELDS = new Set([
  "AGE",
  "AGE_AT_ISSUE",
  "REMAINDER_TERM",
  "YEARS_SINCE_ISSUE",
  "ISSUING_STATE_CODE",
  "ISSUING_STATE_NAME",
  "SURNAME",
  "GIVEN_NAMES",
  "FIRST_NAME",
  "LAST_NAME",
  "MIDDLE_NAME",
  "SURNAME_AND_GIVEN_NAMES",
  "NATIONALITY",
  "NATIONALITY_CODE",
  "DOCUMENT_CLASS_CODE",
  "DOCUMENT_CLASS_NAME",
  "OPTIONAL_DATA",
]);
export function isDerivedField(name: string): boolean {
  const n = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return DERIVED_FIELDS.has(n) || /CHECK_?DIGIT/.test(n) || n.startsWith("MRZ_");
}

/** Collapse identical anomalies (same kind + field + message), keeping order. */
function dedupe(items: Anomaly[]): Anomaly[] {
  const seen = new Set<string>();
  const out: Anomaly[] = [];
  for (const a of items) {
    const key = `${a.kind}|${a.field ?? ""}|${a.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
