/**
 * Screening results in the client's words. The screening index files its records under its own codes (list codes such
 * as `us_ofac_sdn`, topic codes such as `role.pep`, matcher features such as `dob_year_disjoint` with token notes such
 * as `literalMatch`), and its record ids carry its own prefixes. None of that is ours to show: a client gets the
 * published list names, the standard risk words, plain reasons and an opaque id.
 */

import { createHash } from 'node:crypto';

import { SCREENING_LISTS } from './screening-lists';

type Rec = Record<string, any>;

/** A record's id, stable for the same record and opaque (the index's own ids name the source). */
export function opaqueId(id: unknown): string | null {
  return typeof id === 'string' && id
    ? `ent_${createHash('sha256').update(id).digest('hex').slice(0, 20)}`
    : null;
}

/** The lists a record is on, by their published names (a code the catalogue does not know is spelled out). */
export function listNames(codes: unknown): string[] {
  const names = (Array.isArray(codes) ? codes : []).map((c) => {
    const known = SCREENING_LISTS[String(c)];
    if (known) return known[0];
    return String(c)
      .replace(/^(verisec|ext|ann)_/, '')
      .split('_')
      .map((w, i) => (i === 0 && w.length === 2 ? w.toUpperCase() : w))
      .join(' ');
  });
  return [...new Set(names)];
}

/**
 * The standard risk words, in the order a reviewer weighs them (the same words the AML Explorer shows). Each entry:
 * [code pattern, rank, word].
 */
const TOPICS: [RegExp, number, string][] = [
  [/^sanction$/, 0, 'Sanction'],
  [/^asset\.frozen$/, 1, 'Asset freeze'],
  [/^wanted$/, 2, 'Wanted'],
  [/^crime\.terror/, 3, 'Terrorism'],
  [/^crime\.war/, 3, 'War crimes'],
  [/^crime\.fin/, 4, 'Financial crime'],
  [/^crime\.fraud/, 4, 'Fraud'],
  [/^crime\.cyber/, 4, 'Cybercrime'],
  [/^crime\.traffick/, 4, 'Trafficking'],
  [/^crime\.boss/, 4, 'Organised crime'],
  [/^crime\.env/, 4, 'Environmental crime'],
  [/^crime\.theft/, 4, 'Theft'],
  [/^crime/, 5, 'Crime'],
  [/^role\.pep$/, 6, 'PEP'],
  [/^role\.rca$/, 7, 'RCA'],
  [/^sanction\.linked$/, 8, 'Sanction-linked'],
  [/^sanction\.counter$/, 9, 'Counter-sanction'],
  [/^debarment$/, 10, 'Debarment'],
  [/^export\.control/, 11, 'Export control'],
  [/^export\.risk/, 11, 'Trade risk'],
  [/^corp\.disqual$/, 12, 'Disqualified director'],
  [/^reg\.action$/, 13, 'Regulatory action'],
  [/^reg\.warn$/, 13, 'Regulatory warning'],
  [/^role\.oligarch$/, 14, 'Oligarch'],
  [/^poi$/, 15, 'Person of interest'],
  [/^mare\.detained/, 16, 'Detained in port'],
  [/^mare\.shadow/, 16, 'Shadow fleet'],
  [/^mare\.illegal/, 16, 'Illegal fishing'],
  [/^gov\.soe$/, 17, 'State-owned'],
  [/^gov\.igo$/, 18, 'International organisation'],
  [/^gov\.head$/, 18, 'Head of state or government'],
  [
    /^gov\.(national|state|muni|admin|executive|legislative|judicial|security|financial)$/,
    18,
    'Government body',
  ],
  [/^gov/, 18, 'Government'],
  [/^corp\.public$/, 19, 'Listed company'],
  [/^corp\.offshore$/, 19, 'Offshore company'],
  [/^corp\.shell$/, 19, 'Shell company'],
  [/^fin\.bank$/, 19, 'Bank'],
  [/^fin\.fund$/, 19, 'Fund'],
  [/^fin/, 19, 'Financial services'],
  [/^role\.judge$/, 20, 'Judge'],
  [/^role\.diplo$/, 20, 'Diplomat'],
  [/^role\.civil$/, 20, 'Civil servant'],
  [/^role\.pol$/, 20, 'Politician'],
  [/^role\.lawyer$/, 20, 'Lawyer'],
  [/^role\.acct$/, 20, 'Accountant'],
  [/^role\.spy$/, 20, 'Intelligence officer'],
  [/^role\.journo$/, 20, 'Journalist'],
  [/^role\.act$/, 20, 'Activist'],
  [/^role\.lobby$/, 20, 'Lobbyist'],
  [/^pol\.party$/, 20, 'Political party'],
  [/^pol\.union$/, 20, 'Trade union'],
  [/^mil$/, 20, 'Military'],
  [/^rel$/, 20, 'Religious body'],
];

/** Topic codes as the standard words, gravest first, each word once ("Crime" is dropped beside a specific crime). */
export function topicWords(codes: unknown): string[] {
  const all = (Array.isArray(codes) ? codes : []).map((c) => String(c));
  const specificCrime = all.some((c) => c.startsWith('crime.'));
  const words = all
    .filter((c) => !(c === 'crime' && specificCrime))
    .map((c) => {
      const t = TOPICS.find(([re]) => re.test(c));
      return t
        ? { rank: t[1], word: t[2] }
        : { rank: 99, word: c.replace(/[._]/g, ' ') };
    })
    .sort((a, b) => a.rank - b.rank)
    .map((t) => t.word);
  return [...new Set(words)];
}

/* ------------------------------------------------------------------------------ why it matched -- */

/** Each matcher feature as the detail it is about, and whether it raises or lowers the score. */
const FEATURES: Record<string, { about: string; raises: boolean }> = {
  name_match: { about: 'name', raises: true },
  name_literal_match: { about: 'name', raises: true },
  weak_alias_match: { about: 'alias', raises: true },
  identifier_match: { about: 'id_number', raises: true },
  org_identifier_match: { about: 'id_number', raises: true },
  address_match: { about: 'address', raises: true },
  country_mismatch: { about: 'country', raises: false },
  nationality_mismatch: { about: 'nationality', raises: false },
  dob_year_disjoint: { about: 'birth_year', raises: false },
  dob_day_disjoint: { about: 'birth_date', raises: false },
  gender_mismatch: { about: 'gender', raises: false },
  orgid_disjoint: { about: 'id_number', raises: false },
};

const TOKEN =
  /\['([^']*)'(?:≈'([^']*)')?\s+([A-Za-z]+)(?:\s+\[[^\]]*\])?:\s*([\d.]+),\s*weight\s*([\d.]+)\]/g;

/** A name comparison note, split into the words that matched exactly, closely or as an equivalent, and the extras. */
function nameParts(detail: string) {
  const exact: string[] = [];
  const close: { yours: string; listed: string; similarity: number }[] = [];
  const equivalent: { yours: string; listed: string }[] = [];
  const onlyListed: string[] = [];
  const onlyYours: string[] = [];
  for (const m of detail.matchAll(TOKEN)) {
    const [, a, b, kind, score] = m;
    if (kind === 'literalMatch') exact.push(a);
    else if (kind === 'fuzzyMatch')
      close.push({ yours: a, listed: b ?? a, similarity: Number(score) });
    else if (kind === 'symbolMatch')
      equivalent.push({ yours: a, listed: b ?? a });
    else if (/ResultPart$/.test(kind)) onlyListed.push(a);
    else if (/QueryPart$/.test(kind)) onlyYours.push(a);
  }
  return {
    exact,
    close,
    equivalent,
    only_in_listed: onlyListed,
    only_in_yours: onlyYours,
  };
}

/** A plain note: Python list spellings and quotes taken out ("Different countries: us / za"). */
const plainNote = (s: unknown) =>
  typeof s === 'string' && s
    ? s
        .replace(/\[([^\]]*)\]/g, (_, inner: string) =>
          inner.replace(/'/g, '').toUpperCase(),
        )
        .replace(/\s+/g, ' ')
        .trim()
    : null;

/** The matcher's reasons as what each detail did to the score, in plain words. */
type Reason = { score?: unknown; detail?: unknown };
type Why = { score: number | null; effect: 'raises' | 'lowers' | 'none' } & Rec;

export function plainWhy(reasons: unknown): Record<string, Why> {
  const out: Record<string, Why> = {};
  const all =
    reasons && typeof reasons === 'object'
      ? (reasons as Record<string, Reason | null>)
      : {};
  for (const [key, r] of Object.entries(all)) {
    const f = FEATURES[key] ?? {
      about: key.replace(/_(match|mismatch|disjoint)$/, ''),
      raises: /match$/.test(key) && !/mismatch$/.test(key),
    };
    const score = typeof r?.score === 'number' ? r.score : null;
    const effect = !score ? 'none' : f.raises ? 'raises' : 'lowers';
    const detail = typeof r?.detail === 'string' ? r.detail : null;
    const entry: Why =
      f.about === 'name' && detail?.includes('[')
        ? { score, effect, ...nameParts(detail) }
        : { score, effect, note: plainNote(detail) };
    // the same detail can come from two features (e.g. two kinds of id): keep the stronger
    const had = out[f.about];
    if (!had || (score ?? 0) > (had.score ?? 0)) out[f.about] = entry;
  }
  return out;
}
