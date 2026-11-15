/**
 * Drawing a MICR line, and naming the fields the MICR API returns.
 *
 * No parsing happens here. The MICR API splits the line into routing,
 * account and cheque numbers and runs the check digit; this file only turns
 * its answer into something a person reads.
 *
 * E-13B control symbols arrive as letters and are drawn as their printed
 * glyphs (Unicode OCR block):
 *
 *   A  ⑆  transit    brackets the routing / transit number
 *   B  ⑇  amount     brackets the encoded amount
 *   C  ⑈  on-us      ends the account field, brackets the serial
 *   D  ⑉  dash       a separator inside a field
 *
 * CMC-7 control symbols (letters F to J) have no Unicode glyph and are drawn
 * as a neutral marker.
 */

import type { ChequeResponse, MicrZone } from "./types";

export type MicrSymbol = "transit" | "amount" | "on-us" | "dash" | "control";

export interface MicrToken {
  kind: "digit" | MicrSymbol;
  glyph: string;
  confidence: number;
}

const E13B: Record<string, Exclude<MicrSymbol, "control">> = {
  A: "transit",
  B: "amount",
  C: "on-us",
  D: "dash",
};

export const MICR_GLYPH: Record<Exclude<MicrSymbol, "control">, string> = {
  transit: "⑆",
  amount: "⑇",
  "on-us": "⑈",
  dash: "⑉",
};

export const MICR_SYMBOL_NAME: Record<MicrSymbol, string> = {
  transit: "Transit",
  amount: "Amount",
  "on-us": "On-us",
  dash: "Dash",
  control: "Control symbol",
};

export function micrTokens(micr: NonNullable<ChequeResponse["micr"]>): MicrToken[] {
  return [...micr.text].map((ch, i) => {
    const confidence = micr.char_confidences[i] ?? micr.confidence;
    if (/\d/.test(ch)) return { kind: "digit", glyph: ch, confidence };
    const kind = micr.font === "E-13B" ? E13B[ch] : undefined;
    return kind ? { kind, glyph: MICR_GLYPH[kind], confidence } : { kind: "control", glyph: ch, confidence };
  });
}

/** A readable label for an engine field key (card fields such as "valid_thru").
 * MICR field names arrive already readable and are shown as sent. */
export function fieldLabel(key: string): string {
  const m = /^field_(\d+)$/.exec(key);
  return m ? `Field ${m[1]}` : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human label for a layout id: the demo's templates and the national standards.
 * Unknown ids show their own name. */
export const STANDARD_LABEL: Record<string, string> = {
  us_business: "US business cheque",
  us_personal: "US personal cheque",
  br_cmc7: "CMC-7 · Brazil",
  fr_cmc7: "CMC-7 · France",
  ca_cpa_006: "Canada",
  in_cts_2010: "India",
};

export function standardLabel(standard: string | undefined): string {
  return standard ? (STANDARD_LABEL[standard] ?? standard) : "";
}

type ZoneNaming = Pick<MicrZone, "fields" | "standard"> | undefined;

/** Every named value of a line: the demo-style fields, then the national layout's. */
export function micrNamedFields(zone: ZoneNaming): { name: string; value: string }[] {
  const demo = (zone?.fields ?? []).flatMap((d) => Object.entries(d).map(([name, value]) => ({ name, value })));
  const national = (zone?.standard?.fields ?? []).map(({ name, value }) => ({ name, value }));
  return [...demo, ...national];
}

/** The value of the first field with one of these names, if any. */
export function micrField(zone: ZoneNaming, ...names: string[]): string | undefined {
  const all = micrNamedFields(zone);
  for (const n of names) {
    const hit = all.find((f) => f.name === n);
    if (hit) return hit.value;
  }
  return undefined;
}

/** The short identifier a table shows for a cheque: its routing / bank code,
 * falling back to the line as read. */
export function chequeSummary(r: ChequeResponse): string {
  const z = r.micr;
  const routing = micrField(z, "Routing", "MICR Code");
  if (routing) return routing;
  const branch = micrField(z, "Branch (Transit)");
  if (branch) return `${branch}-${micrField(z, "Institution") ?? ""}`;
  const bank = micrField(z, "Bank");
  if (bank) return `${bank} / ${micrField(z, "Agency") ?? ""}`;
  return micrField(z, "Bank code") ?? z?.printed ?? z?.text ?? "";
}

/** Below this a character is flagged for a second look. */
export const WEAK_CHAR = 80;
