/**
 * The per-country, per-document expectation catalog.
 *
 * Built from the merged/hybrid Regula DB (idv_output/catalog/regula_catalog.json,
 * 839 country x document profiles across 257 countries). It tells the parser what
 * a genuine document of a given (country, type) is expected to contain, so the
 * parser can flag anything missing, unexpected, or new.
 *
 * Isomorphic: fetched from /catalog in the browser, read from disk on the server.
 * The core parser never loads this itself; the caller passes the resolved profile
 * in, which keeps the parser pure and testable.
 */

import type { DocTypeName } from "./types";

export interface CountryDocProfile {
  docCount: number;
  containers: {
    mrz: boolean;
    barcode: boolean;
    authenticity: boolean;
    chip: boolean;
    twoSided: boolean;
  };
  textFields: string[]; // enum names, e.g. "DOCUMENT_NUMBER"
  graphicFields: string[]; // enum names, e.g. "PORTRAIT"
  authChecks: string[];
  captions: string[];
}

export type Catalog = Record<string, Partial<Record<DocTypeName, CountryDocProfile>>>;

let cached: Catalog | null = null;

/** Location of the catalog JSON, overridable via runtime config. */
function catalogUrl(): string {
  if (typeof window !== "undefined") {
    const c = (window as unknown as { __RECOG_CONFIG__?: { catalogUrl?: string } }).__RECOG_CONFIG__;
    if (c?.catalogUrl) return String(c.catalogUrl);
  }
  return "/catalog/regula_catalog.json";
}

/** Load and cache the whole catalog. */
export async function loadCatalog(): Promise<Catalog> {
  if (cached) return cached;
  if (typeof window !== "undefined" && typeof fetch !== "undefined") {
    const res = await fetch(catalogUrl());
    if (!res.ok) throw new Error(`catalog load failed (${res.status})`);
    cached = (await res.json()) as Catalog;
    return cached;
  }
  // Server-side (Node): read from disk. The webpackIgnore comments keep the
  // browser/static-export bundle from trying to resolve these Node built-ins;
  // this branch only runs when there is no window (a real Node backend).
  const fs = await import(/* webpackIgnore: true */ "node:fs/promises");
  const path = await import(/* webpackIgnore: true */ "node:path");
  const p =
    process.env.VERISEC_CATALOG || path.resolve(process.cwd(), "public/catalog/regula_catalog.json");
  cached = JSON.parse(await fs.readFile(p, "utf-8")) as Catalog;
  return cached;
}

/** Resolve the expectation profile for a (country ISO, document type). */
export function getProfile(
  catalog: Catalog,
  iso: string,
  docType: DocTypeName,
): CountryDocProfile | null {
  const c = catalog[(iso || "").toUpperCase()];
  return (c && c[docType]) || null;
}

/** Convenience: load the catalog and resolve one profile. */
export async function loadProfile(
  iso: string,
  docType: DocTypeName,
): Promise<CountryDocProfile | null> {
  try {
    const cat = await loadCatalog();
    return getProfile(cat, iso, docType);
  } catch {
    return null; // parser degrades gracefully to structural checks only
  }
}
