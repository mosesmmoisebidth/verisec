/**
 * The AML tab for a live record: what the name was screened against, the result of each
 * screen (sanctions, PEP, relatives and close associates, crime, debarment...), and for every
 * list entry the name was compared with, its full profile: listings, positions, relatives,
 * associates, documents, addresses, crypto wallets and sources. Built from the decrypted
 * record for a signed-in operator; never stored. Engine names are never shown.
 */
import { opaqueId } from './screening-words';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Fact = { term: string; detail: string; mono?: boolean };
type Outcome = 'pass' | 'fail' | 'review' | 'pending';
type Check = { label: string; outcome: Outcome; note?: string };
type Group = { title: string; facts?: Fact[]; checks?: Check[]; raw?: string; collapsed?: boolean; layout?: 'grid' | 'rows' };
type Flag = { label: string; severity: 'info' | 'warn' | 'critical' };
type Status = 'confirmed' | 'possible' | 'discounted';

const arr = (v: unknown): Any[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Any[]) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);
const uniq = (xs: string[]) => [...new Set(xs)];
const when = (d: unknown) => (typeof d === 'string' && d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const pct = (s: unknown) => (typeof s === 'number' ? `${Math.round(s * 100)}%` : '');
const pretty = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Facts with unique terms (the page keys on them) and no empty details. */
function facts(xs: (Fact | null | false | undefined | '')[]): Fact[] {
  const seen = new Map<string, number>();
  return (xs.filter(Boolean) as Fact[])
    .filter((f) => f.detail && f.detail.trim())
    .map((f) => {
      const n = (seen.get(f.term) ?? 0) + 1;
      seen.set(f.term, n);
      return n > 1 ? { ...f, term: `${f.term} (${n})` } : f;
    });
}
const fct = (term: string, v: unknown, mono = false): Fact | null => {
  const d = Array.isArray(v) ? strs(v).join(', ') : v === null || v === undefined ? '' : String(v);
  return d ? { term, detail: d.slice(0, 1200), ...(mono ? { mono } : {}) } : null;
};

/** OpenSanctions topic codes in plain words. */
const TOPIC: Record<string, string> = {
  sanction: 'Sanctioned', 'sanction.linked': 'Linked to sanctioned', 'sanction.counter': 'Counter-sanctioned',
  debarment: 'Debarred', 'asset.frozen': 'Assets frozen', 'export.control': 'Export controlled', 'export.risk': 'Export risk',
  crime: 'Crime', 'crime.fraud': 'Fraud', 'crime.cyber': 'Cybercrime', 'crime.fin': 'Financial crime', 'crime.env': 'Environmental crime',
  'crime.theft': 'Theft', 'crime.war': 'War crimes', 'crime.boss': 'Crime boss', 'crime.terror': 'Terrorism', 'crime.traffick': 'Trafficking',
  'crime.traffick.drug': 'Drug trafficking', 'crime.traffick.human': 'Human trafficking', wanted: 'Wanted', 'corp.disqual': 'Disqualified director',
  'role.pep': 'Politically exposed person', 'role.pol': 'Politician', 'role.rca': 'Relative or close associate', 'role.judge': 'Judge',
  'role.civil': 'Civil servant', 'role.diplo': 'Diplomat', 'role.oligarch': 'Oligarch', 'role.spy': 'Intelligence', 'role.act': 'Activist',
  'role.lobby': 'Lobbyist', poi: 'Person of interest', 'reg.warn': 'Regulator warning', 'reg.action': 'Regulator action', mil: 'Military',
  fin: 'Financial services', 'gov.soe': 'State-owned', 'gov.head': 'Head of state or government',
};
const topicLabel = (t: string) => TOPIC[t] ?? pretty(t.replace(/\./g, ' '));
const hasTopic = (h: Any, ...p: string[]) => strs(h.topics).some((t) => p.some((x) => t === x || t.startsWith(`${x}.`)));

/** The screens an operator expects, each decided from the hits that carry its topics. */
const SCREENS: { label: string; topics: string[] }[] = [
  { label: 'Sanctions', topics: ['sanction', 'asset.frozen'] },
  { label: 'Politically exposed person (PEP)', topics: ['role.pep', 'role.pol', 'role.oligarch', 'gov.head'] },
  { label: 'Relative or close associate (RCA)', topics: ['role.rca'] },
  { label: 'Crime and wanted lists', topics: ['crime', 'wanted'] },
  { label: 'Terrorism', topics: ['crime.terror'] },
  { label: 'Debarment and disqualification', topics: ['debarment', 'corp.disqual'] },
  { label: 'Regulator warnings', topics: ['reg.warn', 'reg.action'] },
  { label: 'Export control', topics: ['export.control', 'export.risk'] },
  { label: 'Linked to a sanctioned party', topics: ['sanction.linked'] },
];

const STATUS: Record<Status, string> = { confirmed: 'Confirmed match', possible: 'Possible match', discounted: 'Ruled out' };

/** What each part of the score compared, in a reviewer's words. */
const WHY: Record<string, string> = {
  name: 'Name', alias: 'Other name', id_number: 'ID number', address: 'Address', country: 'Country', nationality: 'Nationality',
  birth_year: 'Birth year', birth_date: 'Birth date', gender: 'Gender',
};
const ID_LABEL: Record<string, string> = {
  innCode: 'INN', ogrnCode: 'OGRN', registrationNumber: 'Registration number', leiCode: 'LEI', swiftBic: 'SWIFT / BIC', vatCode: 'VAT number',
  uniqueEntityId: 'Unique entity id', npiCode: 'NPI',
};

/** One reason as a sentence: its effect on the score and what matched ("74%, raises it: exact john; close smyth for smith"). */
function whyText(w: Any): string {
  // nothing taken off: the detail agrees, or there was nothing to compare (the note says which)
  if (w.effect === 'none') return typeof w.note === 'string' && w.note ? w.note : 'No difference found';
  const effect = w.effect === 'raises' ? 'raises the score' : 'lowers the score';
  const parts: string[] = [];
  if (strs(w.exact).length) parts.push(`same words: ${strs(w.exact).join(', ')}`);
  for (const c of arr(w.close)) parts.push(`close: ${c.yours} for ${c.listed}${typeof c.similarity === 'number' ? ` (${pct(c.similarity)})` : ''}`);
  for (const c of arr(w.equivalent)) parts.push(`same name in another form: ${c.yours} for ${c.listed}`);
  if (strs(w.only_in_listed).length) parts.push(`only on the list: ${strs(w.only_in_listed).join(', ')}`);
  if (strs(w.only_in_yours).length) parts.push(`only in the applicant's name: ${strs(w.only_in_yours).join(', ')}`);
  if (typeof w.note === 'string' && w.note) parts.push(w.note);
  return [`${w.score != null ? `${pct(w.score)}, ` : ''}${effect}`, ...parts].join('\n');
}

/** The record as stored, with the index's own codes swapped for what a reviewer reads (opaque id, list names). */
function rawRecord(h: Any): Any {
  const { datasets: _d, explanations: _e, ...rest } = h;
  return { ...rest, id: opaqueId(h.id) ?? h.id ?? null, lists: arr(h.dataset_titles).map((d) => d.title ?? d.name) };
}

function matchGroups(h: Any, status: Status): Group[] {
  const p = (h.properties ?? {}) as Any;
  const pr = (h.profile ?? {}) as Any;
  const folded = status === 'discounted';
  const ref = (r: Any) => [r.caption, strs(r.topics).length ? `(${strs(r.topics).map(topicLabel).join(', ')})` : ''].filter(Boolean).join(' ');
  return [
    {
      title: 'Summary',
      facts: facts([
        fct('Status', STATUS[status]),
        fct('Match score', pct(h.score)),
        fct('Type', h.schema),
        fct('Full name', h.caption ?? p.name?.[0]),
        fct('Birth date', h.birth_dates),
        fct('Death date', p.deathDate),
        fct('Gender', p.gender),
        fct('Nationality', uniq(strs(h.nationalities).map((c) => c.toUpperCase()))),
        fct('Countries', uniq(strs(h.countries).map((c) => c.toUpperCase()))),
        fct('ID number', p.idNumber, true),
        fct('Passport number', p.passportNumber, true),
        fct('Tax number', p.taxNumber, true),
        fct('First listed', when(h.first_seen)),
        fct('Last changed', when(h.last_change)),
        fct('Wikidata', p.wikidataId, true),
      ]),
    },
    {
      title: 'Profile',
      layout: 'rows',
      facts: facts([
        fct('Why this status', h.why),
        fct('Categories', strs(h.topics).map(topicLabel)),
        fct('Title', p.title),
        fct('Positions', uniq(strs(p.position ?? h.positions)).slice(0, 10).join('\n')),
        fct('Birth place', uniq(strs(p.birthPlace)).slice(0, 3)),
        fct('Political party', p.political),
        fct('Education', p.education),
        fct('Religion', p.religion),
        fct('Address', p.address),
        fct('Notes', strs(p.notes).slice(0, 4).join('\n')),
        fct('Also known as', uniq([...strs(p.alias), ...strs(p.weakAlias)]).slice(0, 15)),
        fct('Other spellings', uniq(strs(p.name)).filter((n) => n !== h.caption).slice(0, 12)),
        fct('Wikipedia', p.wikipediaUrl),
        fct('Website', p.website),
        fct('Source links', strs(p.sourceUrl).slice(0, 6).join('\n')),
      ]),
    },
    {
      title: 'Why it matched', layout: 'rows',
      facts: facts(
        h.matchWhy && typeof h.matchWhy === 'object'
          ? Object.entries(h.matchWhy as Any).map(([about, w]) => fct(WHY[about] ?? pretty(about), whyText(w as Any)))
          : Object.entries((h.explanations ?? {}) as Any).map(([k, e]) =>
              fct(pretty(k.replace(/_/g, ' ')), `${pct(e.score)}${e.query || e.candidate ? `: "${e.query ?? ''}" vs "${e.candidate ?? ''}"` : ''}`),
            ),
      ),
      collapsed: folded,
    },
    {
      title: 'In the ownership and relationship graph', layout: 'rows',
      facts: h.network
        ? facts([
            fct('Linked records', String(h.network.linkedRecords ?? 0)),
            fct('Linked to a sanctioned party', h.network.sanctioned ? 'Yes' : 'No'),
            fct('Linked to a politically exposed person', h.network.pep ? 'Yes' : 'No'),
            fct('On the US OFAC SDN list', h.network.ofacSdn ? 'Yes' : 'No'),
          ])
        : [],
      collapsed: folded,
    },
    {
      title: 'Identifiers on the list', layout: 'rows',
      facts: facts(
        Object.entries((h.identifiers ?? {}) as Any)
          .filter(([key]) => !['idNumber', 'passportNumber', 'taxNumber'].includes(key))
          .map(([key, v]) => fct(ID_LABEL[key] ?? pretty(key), strs(v).slice(0, 5), true)),
      ),
      collapsed: true,
    },
    {
      title: 'Sanction listings', layout: 'rows',
      facts: facts(
        arr(pr.sanctions).map((s) =>
          fct(
            [s.authority ?? (s.country ? String(s.country).toUpperCase() : ''), s.program ?? s.programId].filter(Boolean).join(' · ') || 'Listing',
            [
              [strs(s.provisions).join(', '), s.status, s.listingDate || s.startDate ? `listed ${s.listingDate ?? s.startDate}` : '', s.endDate ? `until ${s.endDate}` : '']
                .filter(Boolean)
                .join(' · '),
              s.reason,
              s.sourceUrl,
            ].filter(Boolean).join('\n'),
          ),
        ),
      ),
      collapsed: folded,
    },
    {
      title: 'Positions held', layout: 'rows',
      facts: facts(
        arr(pr.positions).map((o) =>
          fct(o.post ?? 'Position', [o.startDate ? `from ${o.startDate}` : '', o.endDate ? `to ${o.endDate}` : '', o.status, strs(o.country).map((c) => c.toUpperCase()).join(', ')].filter(Boolean).join(' · ') || 'Held'),
        ),
      ),
      collapsed: true,
    },
    { title: 'Relatives', layout: 'rows', facts: facts(arr(pr.relatives).map((r) => fct(r.relationship ? pretty(r.relationship) : 'Relative', ref(r)))), collapsed: true },
    { title: 'Close associates', layout: 'rows', facts: facts(arr(pr.associates).map((r) => fct(r.relationship ? pretty(r.relationship) : 'Associate', ref(r)))), collapsed: true },
    { title: 'Crypto wallets', layout: 'rows', facts: facts(arr(pr.cryptoWallets).map((w) => fct(w.currency ? String(w.currency).toUpperCase() : 'Wallet', w.address, true))) },
    {
      title: 'Identity documents', layout: 'rows',
      facts: facts(arr(pr.identifiers).map((i) => fct([i.type, i.country ? String(i.country).toUpperCase() : ''].filter(Boolean).join(' · ') || 'Document', i.number, true))),
      collapsed: true,
    },
    { title: 'Addresses', layout: 'rows', facts: facts(strs(pr.addresses).map((a) => fct('Address', a))), collapsed: true },
    {
      title: 'Ownership and memberships', layout: 'rows',
      facts: facts([
        ...arr(pr.owns).map((r) => fct('Owns', ref(r))),
        ...arr(pr.memberOf).map((r) => fct('Member of', ref(r))),
        ...arr(pr.directorships).map((r) => fct('Director of', ref(r))),
        ...arr(pr.otherLinks).map((r) => fct('Linked to', ref(r))),
      ]),
      collapsed: true,
    },
    {
      title: 'Lists', layout: 'rows',
      facts: facts(
        arr(h.dataset_titles).map((d) => fct(d.title ?? d.name, [d.publisher, d.url].filter(Boolean).join(', ') || 'On this list')),
      ),
      collapsed: true,
    },
    { title: 'Raw list record', raw: JSON.stringify(rawRecord(h), null, 2), collapsed: true },
  ].filter((g) => g.raw || (g.facts?.length ?? 0) > 0) as Group[];
}

/** Returns null when the record has no full screening block (recorded before this view). */
export function amlDetail(scr: Any | null | undefined) {
  const walletScreen = scr?.risk?.wallets as Any | undefined;
  const s = (scr?.risk?.screening ?? (walletScreen ? { ran: false, hits: [] } : undefined)) as Any | undefined;
  if (!s) return null;
  const hits = arr(s.hits);
  const rank: Record<Status, number> = { confirmed: 0, possible: 1, discounted: 2 };
  const sorted = [...hits].sort((a, b) => rank[a.status as Status] - rank[b.status as Status] || (b.score ?? 0) - (a.score ?? 0));
  const live = hits.filter((h) => h.status === 'confirmed' || h.status === 'possible');

  const flags: Flag[] = [];
  if (walletScreen?.requiresReview) flags.push({ label: walletScreen.ran ? 'Submitted wallet needs review' : 'Submitted wallet screening unavailable', severity: 'warn' });
  for (const h of live) {
    const confirmed = h.status === 'confirmed';
    if (hasTopic(h, 'sanction', 'crime', 'wanted', 'debarment')) flags.push({ label: `${confirmed ? 'Sanctions / crime match' : 'Possible sanctions / crime match'}: ${h.caption}`, severity: confirmed ? 'critical' : 'warn' });
    else if (hasTopic(h, 'role')) flags.push({ label: `${confirmed ? 'PEP' : 'Possible PEP'}: ${h.caption}`, severity: 'warn' });
    else flags.push({ label: `${STATUS[h.status as Status]}: ${h.caption}`, severity: confirmed ? 'warn' : 'info' });
    if (arr(h.profile?.cryptoWallets).length) flags.push({ label: `Crypto wallets linked to ${h.caption}`, severity: 'warn' });
  }
  for (const h of hits.filter((x) => x.formerly && Number(x.score ?? 0) >= 0.85)) flags.push({ label: `Formerly listed, since removed: ${h.caption}`, severity: 'info' });
  const ruledOut = hits.length - live.length;
  if (ruledOut) flags.push({ label: `${ruledOut} similar name${ruledOut === 1 ? '' : 's'} ruled out`, severity: 'info' });

  const screens: Check[] = SCREENS.map((sc) => {
    const c = live.filter((h) => hasTopic(h, ...sc.topics));
    const conf = c.filter((h) => h.status === 'confirmed');
    return {
      label: sc.label,
      outcome: !s.ran ? 'pending' : conf.length ? 'fail' : c.length ? 'review' : 'pass',
      note: c.length ? c.map((h) => `${h.caption} (${pct(h.score)})`).slice(0, 3).join(', ') : s.ran ? 'No match' : 'Not run',
    };
  });
  const wallets = live.flatMap((h) => arr(h.profile?.cryptoWallets));
  screens.push({ label: 'Crypto wallets on the lists', outcome: !s.ran ? 'pending' : wallets.length ? 'review' : 'pass', note: wallets.length ? `${wallets.length} wallet(s) held by a matched party` : 'None linked to the applicant' });

  const reasons = arr(scr?.risk?.reasons);
  return {
    flags,
    groups: [
      { title: 'Screening results', checks: screens },
      ...(walletScreen ? [{
        title: 'Submitted wallet screening',
        facts: facts([
          fct('Submitted address', walletScreen.address, true),
          fct('Ownership', 'Not verified; the applicant supplied this address'),
          fct('Screening', walletScreen.ran ? 'Completed' : 'Unavailable; manual review required'),
          fct('Screened at', walletScreen.at),
          ...arr(walletScreen.results).flatMap((w) => [
            fct('Verdict', w.verdict === 'no_record' ? 'No record in the sources; this is not a clearance' : pretty(String(w.verdict ?? 'unknown'))),
            fct('Risk', w.risk),
            fct('Address validation', w.format?.valid === true ? 'Valid format' : w.format?.valid === false ? 'Not a valid address' : 'Format not verified'),
            fct('Network', w.format?.network),
            fct('Flags', w.flags),
            fct('Scheme participation', w.flags?.includes('scheme_participant') ? 'May be a victim; involvement does not establish intent' : null),
          ]),
        ]),
      }] : []),
      {
        title: 'What was screened',
        facts: facts([
          fct('Name', s.query?.name),
          fct('Birth date', s.query?.dob),
          fct('Country', s.query?.country ? String(s.query.country).toUpperCase() : null),
          fct('Countries compared', strs(s.query?.countries).map((c) => c.toUpperCase())),
          fct('Lists screened', s.index?.lists ? `${s.index.lists} sanctions, PEP, crime, wanted and regulatory lists` : null),
          fct('Lists updated', when(s.index?.updated)),
          fct('Index refreshed', s.index?.indexed ? new Date(s.index.indexed).toLocaleString('en-US') : null),
          fct('Matching', 'Name similarity, confirmed by birth date and nationality'),
          fct('Entries compared', String(hits.length)),
          fct('Screened at', s.at ? new Date(s.at).toLocaleString('en-US') : null),
        ]),
      },
      ...(reasons.length
        ? [{ title: 'Risk reasons', checks: reasons.map((r) => ({ label: String(r.message ?? r.code), outcome: (r.severity === 'critical' || r.severity === 'high' ? 'fail' : r.severity === 'medium' ? 'review' : r.severity === 'info' ? 'pending' : 'pass') as Outcome, note: r.points ? `+${r.points}` : undefined })) }]
        : []),
    ] as Group[],
    matches: sorted.map((h) => ({
      title: `${h.caption ?? 'Unnamed entry'} · ${h.formerly ? 'Formerly listed' : (STATUS[h.status as Status] ?? 'Ruled out')} · ${pct(h.score)}`,
      status: (h.status as Status) ?? 'discounted',
      groups: matchGroups(h, (h.status as Status) ?? 'discounted'),
    })),
  };
}
