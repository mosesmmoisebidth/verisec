/**
 * Name screening for the KYC flow on the integrated AML engine (the same index, matcher and graph the AML Explorer
 * uses): the OpenSanctions lists plus the added African sanctions, Interpol red notices, wanted and debarment lists,
 * the wider PEP sources and the formerly-listed history, refreshed every hour.
 *
 * One screening is four kinds of call, run together:
 *   - the scored match (name, birth date, nationality/country);
 *   - for each serious candidate, its full record (listings, positions, relatives, associates, documents, addresses,
 *     wallets, ownership), flattened here into the same profile shape the record kept before;
 *   - for each name match, its place in the ownership and relationship graph (sanctioned or PEP links);
 *   - and the list catalogue (how many lists, how current).
 * Every hit keeps the fields the risk rules and the AML tab already read, plus what the new engine adds. The index's
 * own vocabulary (list codes, matcher notes) is turned into plain words before anything is shown.
 */
import type { IntelClient } from './intel.client';
import { listNames, plainWhy } from './screening-words';
import { SCREENING_LISTS } from './screening-lists';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = Record<string, any>;

const PROPS = [
  'name', 'alias', 'weakAlias', 'firstName', 'lastName', 'gender', 'birthDate', 'birthPlace', 'deathDate', 'nationality', 'citizenship',
  'country', 'position', 'political', 'education', 'religion', 'title', 'topics', 'notes', 'sourceUrl', 'wikidataId', 'wikipediaUrl',
  'website', 'idNumber', 'passportNumber', 'taxNumber', 'address', 'program', 'programId', 'classification',
];
const LIST_CAP = 25;
/** Candidates worth a full record, and name matches worth a look in the graph. */
const PROFILE_MIN = 0.5;
const PROFILE_MAX = 6;
const GRAPH_MIN = 0.7;
const GRAPH_MAX = 3;
/** The list of people once listed and since removed: never a live hit on its own. */
const FORMER = 'verisec_history';

const p = (e: Rec | undefined, k: string): any[] => {
  const v = e?.properties?.[k];
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
};
const first = (e: Rec | undefined, k: string) => p(e, k)[0] ?? null;
const clip = (xs: any[], n = LIST_CAP) => xs.slice(0, n).map((x) => (typeof x === 'string' ? x.slice(0, 600) : x));
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

/** A linked record as {id, caption, schema, topics}; a link pointing back at the record itself is skipped. */
function ref(v: unknown, self: string | null) {
  if (!isRec(v) || v.id === self) return null;
  return { id: v.id ?? null, caption: v.caption ?? null, schema: v.schema ?? null, topics: p(v, 'topics').slice(0, 6) };
}
const refs = (xs: unknown[], self: string | null) => xs.map((x) => ref(x, self)).filter((r): r is NonNullable<typeof r> => !!r);

/** Everything linked to a record, flattened (sanctions, PEP roles, family, associates, documents, wallets...). */
function profileOf(e: Rec) {
  const me = (e.id as string) ?? null;
  const sanctions = p(e, 'sanctions').filter(isRec).slice(0, LIST_CAP).map((s) => ({
    authority: first(s, 'authority'), program: first(s, 'program'), programId: first(s, 'programId'), country: first(s, 'country'),
    provisions: clip(p(s, 'provisions'), 5), status: first(s, 'status'), listingDate: first(s, 'listingDate'), startDate: first(s, 'startDate'),
    endDate: first(s, 'endDate'), reason: String(first(s, 'reason') ?? '').slice(0, 800) || null, sourceUrl: first(s, 'sourceUrl'),
    programUrl: first(s, 'programUrl'),
  }));
  const positions = p(e, 'positionOccupancies').filter(isRec).slice(0, LIST_CAP).map((o) => {
    const post = p(o, 'post').find(isRec) ?? {};
    return { post: post.caption ?? null, country: p(post, 'country').slice(0, 2), topics: p(post, 'topics').slice(0, 4),
      startDate: first(o, 'startDate'), endDate: first(o, 'endDate'), status: first(o, 'status') };
  });
  const relatives = ['familyPerson', 'familyRelative'].flatMap((k) =>
    p(e, k).filter(isRec).slice(0, LIST_CAP).map((f) => {
      const other = refs([...p(f, 'relative'), ...p(f, 'person')], me)[0];
      return other ? { ...other, relationship: p(f, 'relationship').slice(0, 3).join(', ') || null } : null;
    }),
  ).filter(Boolean);
  const associates = p(e, 'associations').filter(isRec).slice(0, LIST_CAP).map((a) => {
    const other = refs([...p(a, 'person'), ...p(a, 'associate')], me)[0];
    return other ? { ...other, relationship: first(a, 'relationship') } : null;
  }).filter(Boolean);
  const identifiers = p(e, 'identification').filter(isRec).slice(0, 10)
    .filter((i) => first(i, 'number'))
    .map((i) => ({ type: first(i, 'type') ?? i.schema ?? null, number: first(i, 'number'), country: first(i, 'country'), authority: first(i, 'authority') }));
  const addresses = p(e, 'addressEntity').filter(isRec).slice(0, 10)
    .map((a) => first(a, 'full') ?? [first(a, 'street'), first(a, 'city'), first(a, 'country')].filter(Boolean).join(', '))
    .filter(Boolean);
  const cryptoWallets = p(e, 'cryptoWallets').filter(isRec).slice(0, LIST_CAP)
    .map((w) => ({ address: first(w, 'publicKey'), currency: first(w, 'currency'), balance: first(w, 'balance'), topics: p(w, 'topics').slice(0, 4) }));
  const linked = (k: string, inner: string) => refs(p(e, k).filter(isRec).slice(0, LIST_CAP).flatMap((x) => p(x, inner)), me);
  return {
    sanctions, positions, relatives, associates, identifiers, addresses, cryptoWallets,
    owns: linked('ownershipOwner', 'asset'),
    memberOf: linked('membershipMember', 'organization'),
    directorships: linked('directorshipDirector', 'organization'),
    otherLinks: [...linked('unknownLinkFrom', 'subject'), ...linked('unknownLinkFrom', 'object'), ...linked('unknownLinkTo', 'subject'), ...linked('unknownLinkTo', 'object')].slice(0, LIST_CAP),
  };
}

/** The record's own properties, the ones a reviewer reads (nested records left out). */
function propsOf(e: Rec): Rec {
  const out: Rec = {};
  for (const k of PROPS) {
    const v = p(e, k).filter((x) => typeof x === 'string' || typeof x === 'number');
    if (v.length) out[k] = clip(v);
  }
  return out;
}

export type ScreeningResult = {
  ran: boolean;
  /** Every candidate the index scored, with its full record where it was worth fetching. */
  hits: Rec[];
  index: { lists: number; updated: string | null; indexed: string | null } | null;
  query: { name: string; dob: string | null; countries: string[] };
};

/** Screen a person by name, birth date and countries (ISO alpha-2) on the integrated engine. */
export async function screenPerson(intel: IntelClient, q: { name: string; dob?: string | null; countries: string[] }): Promise<ScreeningResult> {
  const countries = [...new Set(q.countries.map((c) => c.trim().toLowerCase()).filter((c) => /^[a-z]{2}$/.test(c)))].slice(0, 5);
  const query = { name: q.name, dob: q.dob ?? null, countries };
  const [match, catalog] = await Promise.all([
    intel.post<Rec>('/v1/aml/screen/match', { name: q.name, schema: 'Person', ...(q.dob ? { birth_date: q.dob } : {}), countries, limit: 10 }, 30_000),
    intel.get<Rec>('/v1/aml/screen/catalog', 15_000),
  ]);
  const index = catalog.ok && catalog.data
    ? { lists: Number(catalog.data.lists ?? 0) || Object.keys(SCREENING_LISTS).length, updated: catalog.data.updated ?? null, indexed: catalog.data.indexed ?? null }
    : null;
  if (!match.ok) return { ran: false, hits: [], index, query };
  const rows: Rec[] = Array.isArray(match.data?.results) ? match.data!.results : [];

  // the full record for the serious candidates, and the graph for the name matches, all at once
  const forProfile = rows.filter((r) => Number(r.score ?? 0) >= PROFILE_MIN).slice(0, PROFILE_MAX);
  const forGraph = rows.filter((r) => Number(r.score ?? 0) >= GRAPH_MIN).slice(0, GRAPH_MAX);
  const [entities, graphs] = await Promise.all([
    Promise.all(forProfile.map((r) => intel.get<Rec>(`/v1/aml/screen/entity/${encodeURIComponent(String(r.id))}`, 20_000).catch(() => null))),
    Promise.all(forGraph.map((r) => intel.get<Rec>(`/v1/aml/graph/node?id=${encodeURIComponent(String(r.id))}`, 10_000).catch(() => null))),
  ]);
  const entityOf = new Map(forProfile.map((r, i) => [String(r.id), entities[i]?.ok && isRec(entities[i]?.data) ? (entities[i]!.data as Rec) : null]));
  const graphOf = new Map(forGraph.map((r, i) => [String(r.id), graphs[i]?.ok && isRec(graphs[i]?.data) ? (graphs[i]!.data as Rec) : null]));

  const hits = rows.slice(0, 10).map((r) => {
    const datasets: string[] = Array.isArray(r.datasets) ? r.datasets.map(String) : [];
    const e = entityOf.get(String(r.id)) ?? null;
    const g = graphOf.get(String(r.id)) ?? null;
    const why = plainWhy(r.reasons);
    return {
      id: r.id ?? null,
      caption: r.caption ?? null,
      schema: r.schema ?? null,
      score: Number(r.score ?? 0),
      match: !!r.match,
      topics: Array.isArray(r.topics) ? r.topics : [],
      datasets,
      // the published list names (a code never reaches a reviewer)
      dataset_titles: datasets.map((code) => {
        const known = SCREENING_LISTS[code];
        const title = known?.[0] ?? listNames([code])[0] ?? 'List';
        return { name: title, title, publisher: known?.[1] ?? null };
      }),
      birth_dates: Array.isArray(r.birth_dates) ? r.birth_dates : [],
      nationalities: Array.isArray(r.nationalities) ? r.nationalities : [],
      countries: Array.isArray(r.countries) ? r.countries : [],
      identifiers: isRec(r.identifiers) ? r.identifiers : {},
      // why the score came out as it did, in plain words (name parts, birth date, country, id numbers);
      // not `why`, which the record uses for why the status was given
      matchWhy: why,
      explanations: Object.fromEntries(Object.entries(why).map(([k, w]) => [k, { score: w.score }])),
      // on the history list only: removed from the lists, never a live hit
      formerly: datasets.length > 0 && datasets.every((d) => d === FORMER),
      ...(e
        ? {
            positions: clip(p(e, 'position'), 3),
            first_seen: e.first_seen ?? null,
            last_seen: e.last_seen ?? null,
            last_change: e.last_change ?? null,
            target: e.target ?? null,
            properties: propsOf(e),
            profile: profileOf(e),
          }
        : {}),
      ...(g
        ? {
            network: {
              sanctioned: !!g.sanctioned,
              pep: !!g.pep,
              ofacSdn: !!g.ofac_sdn,
              linkedRecords: Number(g.linked_records ?? 0) || 0,
            },
          }
        : {}),
    };
  });
  return { ran: true, hits, index, query };
}
