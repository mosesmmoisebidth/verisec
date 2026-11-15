/**
 * Confirm Details layout: turns the display fields into grouped, ordered
 * sections that adapt to the document type. Only fields that are actually
 * present (have a value) appear, so the screen is dynamic per country and per
 * document, never a fixed template and never an empty row.
 *
 * Field identity uses the TextFieldType enum NAME on each DisplayField, so the
 * layout stays correct across all countries regardless of the localized label.
 * Anything present but not placed in a named section falls into "Other details"
 * so nothing meaningful is hidden; pure machine artefacts (check digits, raw MRZ
 * strings) are dropped from the confirm view.
 */

import type { ConfirmSection, DisplayField, DocTypeName } from "./types";

interface SectionSpec {
  title: string;
  keys: string[]; // exact enum names, in display order
  prefixes?: string[]; // enum-name prefixes (e.g. all "DL_CLASS_CODE_*")
}

// Shared identity block, first on every document.
const IDENTITY: SectionSpec = {
  title: "Identity",
  keys: [
    "SURNAME_AND_GIVEN_NAMES", "SURNAME", "GIVEN_NAMES", "FULL_NAME", "NAME",
    "DATE_OF_BIRTH", "SEX", "NATIONALITY", "NATIONALITY_CODE", "PLACE_OF_BIRTH", "PERSONAL_NUMBER",
  ],
};

const VALIDITY: SectionSpec = {
  title: "Issue and validity",
  keys: [
    "DATE_OF_ISSUE", "DATE_OF_EXPIRY", "AUTHORITY", "ISSUING_STATE_NAME", "ISSUING_STATE_CODE", "PLACE_OF_ISSUE",
  ],
};

const ADDRESS: SectionSpec = {
  title: "Address",
  keys: ["ADDRESS", "RESIDENT_ADDRESS", "ADDRESS_STREET", "ADDRESS_CITY", "ADDRESS_STATE", "ADDRESS_POSTAL_CODE", "ADDRESS_JURISDICTION_CODE"],
};

const DOCUMENT_BY_TYPE: Record<DocTypeName, SectionSpec> = {
  Passport: { title: "Document", keys: ["DOCUMENT_NUMBER", "DOCUMENT_CLASS_CODE", "DOCUMENT_CLASS_NAME", "MRZ_TYPE"] },
  "National ID": { title: "Document", keys: ["DOCUMENT_NUMBER", "DOCUMENT_CLASS_CODE", "DOCUMENT_CLASS_NAME"] },
  "Driving Licence": { title: "Document", keys: ["DOCUMENT_NUMBER", "DOCUMENT_CLASS_CODE"] },
  "Residence Permit": { title: "Document", keys: ["DOCUMENT_NUMBER", "DOCUMENT_CLASS_CODE", "DOCUMENT_CLASS_NAME"] },
};

// Extra, document-specific sections appended after Document + Validity.
const EXTRA_BY_TYPE: Record<DocTypeName, SectionSpec[]> = {
  Passport: [],
  "National ID": [ADDRESS],
  "Driving Licence": [
    { title: "Driving categories", keys: ["DL_CLASS", "DL_ENDORSED", "DL_RESTRICTION_CODE"], prefixes: ["DL_CLASS", "DL_"] },
    ADDRESS,
  ],
  "Residence Permit": [
    { title: "Permit", keys: ["RESIDENT_STATUS", "PERMIT_TYPE", "CATEGORY", "REMARKS"] },
    ADDRESS,
  ],
};

function layoutFor(docType: DocTypeName): SectionSpec[] {
  return [IDENTITY, DOCUMENT_BY_TYPE[docType], VALIDITY, ...EXTRA_BY_TYPE[docType]];
}

// Machine artefacts that should not appear on a human confirm screen.
const NOISE = /(CHECKDIGIT|CHECK_DIGIT|MRZ_STRINGS|MRZ_LINE|_CHECK$|REMAINDER|FILLER|COMPOSITE)/;

const matches = (spec: SectionSpec, key: string): boolean =>
  spec.keys.includes(key) || (spec.prefixes?.some((p) => key.startsWith(p)) ?? false);

/**
 * Build the Confirm Details sections for a document type from a set of display
 * fields (the merged view, or a single side's fields). Fields are placed in the
 * first section that claims them, in that section's order; anything left over
 * (and not noise) goes to "Other details".
 */
export function buildConfirmSections(fields: DisplayField[], docType: DocTypeName): ConfirmSection[] {
  const specs = layoutFor(docType);
  const withValue = fields.filter((f) => f.value);
  const used = new Set<DisplayField>();

  const sections: ConfirmSection[] = specs.map((spec) => {
    const fields: DisplayField[] = [];
    // Named keys first, in the spec's order.
    for (const key of spec.keys) {
      const f = withValue.find((x) => !used.has(x) && x.key === key);
      if (f) {
        used.add(f);
        fields.push(f);
      }
    }
    // Then any prefix matches (e.g. every driving category code), in field order.
    if (spec.prefixes)
      for (const f of withValue)
        if (!used.has(f) && matches(spec, f.key)) {
          used.add(f);
          fields.push(f);
        }
    return { title: spec.title, fields };
  });

  // Everything present and not yet placed, including fields with no enum name,
  // so no valuable data is hidden. Only pure machine artefacts are dropped.
  const other = withValue.filter((f) => !used.has(f) && !NOISE.test(f.key));
  if (other.length) sections.push({ title: "Other details", fields: other });

  return sections.filter((s) => s.fields.length > 0);
}
