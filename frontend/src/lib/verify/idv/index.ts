/**
 * VeriSec IDV parser: public surface.
 *
 * Isomorphic core (browser + Node). The KYC flow resolves the (country, type)
 * expectation profile from the catalog, hands it to `parseIdv`, renders the
 * `display` slice, and keeps `full` on the trusted side.
 */

export { parseIdv, parseIdvFull, extractFull, extractContainerList, analyze, categoryOf, toDisplay, toneOf, documentPortrait, CONSISTENT_CONTAINERS } from "./parse";
export { loadCatalog, loadProfile, getProfile } from "./catalog";
export type { Catalog, CountryDocProfile } from "./catalog";
export { resolveKyc, normalizeDocType } from "./resolve";
export type { ResolveOptions } from "./resolve";
export { collectErrors, classifyErrors } from "./errors";
export { buildConfirmSections } from "./confirm";
export { toAlpha3, toAlpha2, countryName } from "./iso";
export { classifyDiagnose, diagnoseName } from "./enums";
export * from "./types";
