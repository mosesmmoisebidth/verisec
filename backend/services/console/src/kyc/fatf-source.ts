import { fetch } from 'undici';

import { country2 } from './iso-country';

/**
 * The current FATF lists, read from a bot-friendly mirror.
 *
 * FATF publishes its two lists (High-Risk Jurisdictions subject to a Call for Action, and Jurisdictions under
 * Increased Monitoring) only as web statements after each plenary, three times a year, and its own site refuses
 * automated requests. This reads the maintained English Wikipedia article, whose "Current FATF blacklist" and
 * "Current FATF grey list" sections list each country as a `{{flag|Name}}` item. It is a mirror, not the source of
 * record, so the result is only ever a CANDIDATE for a person to confirm, never an automatic change to a live list.
 */

const PAGE = 'Financial Action Task Force blacklist';
const API = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(PAGE)}&prop=wikitext&format=json&formatversion=2&redirects=1`;
const UA = 'VeriSec-FATF-sync/1.0 (KYC compliance list check; operator-confirmed)';

export type FatfLists = {
  /** ISO alpha-2 of the "call for action" list (the black list). */
  blacklist: string[];
  /** ISO alpha-2 of the "increased monitoring" list (the grey list). */
  greylist: string[];
  /** Both lists combined and sorted: what the workflow rules screen a country against. */
  countries: string[];
  asOf: { blacklist: string | null; greylist: string | null };
  source: string;
  fetchedAt: string;
};

// Names the article uses that our ISO table spells differently; everything else resolves through country2().
const ALIAS: Record<string, string> = {
  "côte d'ivoire": 'CI',
  "cote d'ivoire": 'CI',
  'democratic republic of the congo': 'CD',
  'republic of the congo': 'CG',
  'the gambia': 'GM',
  'cape verde': 'CV',
};

/** The wikitext between a heading and the next heading of the same or a higher level. */
function sectionBody(wikitext: string, heading: string): string | null {
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const h = new RegExp(`^==+\\s*${esc}\\s*==+\\s*$`, 'mi');
  const m = h.exec(wikitext);
  if (!m) return null;
  const rest = wikitext.slice(m.index + m[0].length);
  const next = /^==+\s*.+?\s*==+\s*$/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Every `{{flag|Name}}` in a section, as ISO alpha-2; `unresolved` holds any name we could not map (never dropped silently). */
function codesIn(body: string): { codes: string[]; unresolved: string[] } {
  const codes: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{\s*flag(?:icon|country|u)?\s*\|\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const name = m[1].trim();
    if (!name) continue;
    const code = ALIAS[name.toLowerCase()] ?? country2(name);
    if (!code) {
      unresolved.push(name);
      continue;
    }
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return { codes, unresolved };
}

function asOf(body: string | null): string | null {
  const m = body && /as of\s+(\d{1,2}\s+\w+\s+\d{4})/i.exec(body);
  return m ? m[1] : null;
}

/**
 * Fetch and parse the current FATF lists. Throws on anything unexpected (HTTP error, the article structure changed,
 * a country name we do not recognise, or a list size outside sane bounds) so a bad read never becomes a silent change.
 */
export async function fetchFatfLists(timeoutMs = 20_000): Promise<FatfLists> {
  const res = await fetch(API, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`wikipedia HTTP ${res.status}`);
  const json = (await res.json()) as { parse?: { wikitext?: string } };
  const wt = json.parse?.wikitext;
  if (!wt) throw new Error('no wikitext in response');

  const blackBody = sectionBody(wt, 'Current FATF blacklist');
  const greyBody = sectionBody(wt, 'Current FATF grey list');
  if (!blackBody || !greyBody) throw new Error('could not locate the current-list sections (article structure changed)');

  const black = codesIn(blackBody);
  const grey = codesIn(greyBody);
  const unresolved = [...black.unresolved, ...grey.unresolved];
  if (unresolved.length) throw new Error(`unrecognised country name(s): ${unresolved.join(', ')}`);

  // Sanity bounds: the call-for-action list is always tiny; the monitoring list is a few dozen at most.
  if (black.codes.length < 1 || black.codes.length > 10) throw new Error(`blacklist size ${black.codes.length} out of range`);
  if (grey.codes.length < 5 || grey.codes.length > 60) throw new Error(`greylist size ${grey.codes.length} out of range`);

  return {
    blacklist: black.codes,
    greylist: grey.codes,
    countries: [...new Set([...black.codes, ...grey.codes])].sort(),
    asOf: { blacklist: asOf(blackBody), greylist: asOf(greyBody) },
    source: 'en.wikipedia.org/wiki/Financial_Action_Task_Force_blacklist',
    fetchedAt: new Date().toISOString(),
  };
}
