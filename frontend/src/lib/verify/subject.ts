import { toAlpha2 } from "@/lib/verify/idv";

/**
 * The applicant's screening subject, read from the document fields the person
 * confirmed on Confirm Details: full name, date of birth (ISO), nationality and
 * the document's country (both ISO-2, lowercase).
 */
export type Subject = { name?: string; dob?: string; nationality?: string; documentCountry?: string; address?: string };

type Field = { key: string; value: string };

const clean = (s: string) =>
  s.replace(/[<^]+/g, " ").replace(/\s+/g, " ").trim();

/** Document dates arrive as YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY or YYYYMMDD. */
export function isoDate(raw: string | undefined): string | undefined {
  const v = (raw ?? "").trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{4})$/);
  if (m) return m[1];
  return undefined;
}

export function extractSubject(fields: Field[], documentCountry?: string): Subject {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const f = fields.find((x) => x.key === k && x.value?.trim());
      if (f) return f.value;
    }
    return undefined;
  };
  const given = get("GIVEN_NAMES", "FIRST_NAME");
  const surname = get("SURNAME", "LAST_NAME");
  const combined = get("SURNAME_AND_GIVEN_NAMES");
  const name = given && surname ? clean(`${given} ${surname}`) : combined ? clean(combined) : clean(given ?? surname ?? "");
  const nationality = toAlpha2(get("NATIONALITY_CODE") ?? get("NATIONALITY"));
  // Some IDs print the holder's address (one field, or split into parts).
  const address =
    get("ADDRESS", "RESIDENT_ADDRESS") ??
    (["ADDRESS_STREET", "ADDRESS_AREA", "ADDRESS_CITY", "ADDRESS_STATE", "ADDRESS_POSTAL_CODE"]
      .map((k) => get(k))
      .filter(Boolean)
      .join(", ") || undefined);
  return {
    name: name || undefined,
    dob: isoDate(get("DATE_OF_BIRTH")),
    nationality: nationality || undefined,
    documentCountry: toAlpha2(documentCountry) || undefined,
    address: address ? clean(address) : undefined,
  };
}
