import world from "world-countries";

/**
 * The full ISO 3166-1 country list, from the `world-countries` dataset.
 *
 * Imported here in a server module and handed to `CountrySelect` as props, so
 * the ~1 MB source dataset never reaches the client bundle — only this slim
 * `{ code, name }[]` (a few KB) crosses in the RSC payload. `code` is the
 * alpha-2 (lowercased), which is also the flag filename in `public/flags/`.
 */
export type Country = { code: string; name: string; dial?: string };

export const COUNTRIES: Country[] = world
  .map((c) => ({ code: c.cca2.toLowerCase(), name: c.name.common }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Resolve a stored value (a name or an alpha-2 code) to its country. */
export function findCountry(value: string | undefined): Country | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  return COUNTRIES.find((c) => c.code === v || c.name.toLowerCase() === v);
}

/**
 * Every country that has an international calling code, with that code, built
 * from the same dataset's `idd` (root "+2" plus suffix "50" = "+250"). Where a
 * country has several suffixes that share one plan (the +1 NANP islands, +7),
 * the root alone is the dial code. Server-side like COUNTRIES, so only this
 * slim list reaches the browser.
 */
export const DIAL_COUNTRIES: Country[] = world
  .flatMap((c) => {
    const root = c.idd?.root ?? "";
    const suffixes = c.idd?.suffixes ?? [];
    if (!root) return [];
    const dial = suffixes.length === 1 ? `${root}${suffixes[0]}` : root;
    return [{ code: c.cca2.toLowerCase(), name: c.name.common, dial }];
  })
  .sort((a, b) => a.name.localeCompare(b.name));
