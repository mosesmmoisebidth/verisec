/**
 * Contact & risk APIs for the Playground. Each one is served by the same engines and checks the AML Explorer uses
 * (screening matcher, wallet screening, web mentions, IP lists, the mailbox check, phone intelligence), and each
 * returns its own designed answer: the facts a developer acts on, not a raw provider dump.
 *
 * Risk levels here come from fixed rules over those facts, and every level lists the reasons that set it.
 * The KYC flow and the Explorer keep calling the engines directly; nothing here changes what they receive.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';

import type { IntelClient } from './intel.client';
import type { KycService } from './kyc.service';
import type { Param, PgEndpoint, RunResult } from './playground.catalog';
import { listNames, opaqueId, plainWhy, topicWords } from './screening-words';

export type RunContext = { intel: IntelClient; kyc: KycService };

type Rec = Record<string, any>;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,]+/) : []).map((x) => String(x).trim()).filter(Boolean);
const fail = (error: Rec | null | undefined, fallback: string): RunResult => ({ ok: false, data: null, error: { code: error?.code ?? 'unavailable', message: error?.message ?? fallback } });
/** A provider's enum in our spelling: nonFixedVoip -> non_fixed_voip, UNDETERMINED -> undetermined. */
const snake = (v: unknown) => (typeof v === 'string' && v ? v.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() : null);
const unwrap = (env: { ok: boolean; data?: any }) => (env.ok ? (env.data?.ok === false ? null : (env.data?.data ?? env.data)) : null);

type Level = 'low' | 'medium' | 'high';
function riskOf(high: string[], medium: string[]): { level: Level; reasons: string[] } {
  if (high.length) return { level: 'high', reasons: [...high, ...medium] };
  if (medium.length) return { level: 'medium', reasons: medium };
  return { level: 'low', reasons: [] };
}

/* ------------------------------------------------------------------------------ email -- */

async function emailRisk(email: string, ctx: RunContext): Promise<RunResult> {
  if (!email) return fail({ code: 'invalid_input', message: 'Enter an email address.' }, '');
  const c = await ctx.kyc.emailLookup(email);
  const high: string[] = [];
  const medium: string[] = [];
  if (!c.syntaxOk) high.push('The address is not written correctly.');
  if (c.disposable) high.push('A temporary inbox service.');
  if (c.syntaxOk && !c.hasMailServer) high.push('The domain cannot receive email.');
  if (c.mailbox === 'missing') high.push('The mail server says this mailbox does not exist.');
  if (c.suggestion) medium.push(`Possibly a typo of ${c.suggestion}.`);
  if (c.mailbox === 'catch_all') medium.push('The domain accepts every address, so this mailbox cannot be confirmed.');
  if (c.mailbox === 'unverified' && c.hasMailServer) medium.push('The mail server did not confirm the mailbox. A one-time code proves it.');
  return {
    ok: true,
    data: {
      email: c.email,
      domain: c.domain,
      syntax_ok: c.syntaxOk,
      suggestion: c.suggestion ?? null,
      disposable: c.disposable,
      free_provider: c.freeProvider,
      mail_server: { found: c.hasMailServer, hosts: c.mailServers ?? [] },
      mailbox: c.mailbox,
      deliverable: c.deliverable,
      risk: riskOf(high, medium),
    },
  };
}

async function emailAccounts(email: string, ctx: RunContext): Promise<RunResult> {
  const env = await ctx.intel.post('/v1/email/footprint', { email }, 150_000);
  const d = unwrap(env);
  if (!d) return fail(env.error, 'The account search could not be completed. Try again.');
  const accounts = ((d.accounts ?? []) as Rec[]).map((a) => ({ site: a.site ?? null, domain: a.domain ?? null, recovery_email_hint: a.email_recovery || null, phone_hint: a.phone_hint || null }));
  return { ok: true, data: { email: d.email ?? email, count: accounts.length, accounts } };
}

/* ------------------------------------------------------------------------------ username -- */

async function usernameSearch(username: string, top: number, ctx: RunContext): Promise<RunResult> {
  const env = await ctx.intel.post('/v1/osint/username', { username, top }, 200_000);
  const d = unwrap(env);
  if (!d) return fail(env.error, 'The username search could not be completed. Try again.');
  const all = (d.profiles ?? []) as Rec[];
  // A profile must carry the username in its address or path. A site that answers with a page not naming it (some
  // cut a name at a dot), or only with a search for it (?q=name), is not evidence of an account.
  const named = (url: unknown) => {
    try {
      const u = new URL(String(url));
      return decodeURIComponent(`${u.hostname}${u.pathname}`).toLowerCase().includes(username.toLowerCase());
    } catch {
      return false;
    }
  };
  const kept = all.filter((p) => named(p.url));
  return {
    ok: true,
    data: {
      username,
      found: kept.length,
      // a name in use on very many sites is usually common, so one profile says little about one person
      common: kept.length >= 60,
      profiles: kept.map((p) => ({ site: p.site ?? null, url: p.url ?? null })),
      left_out: all.length - kept.length,
    },
  };
}

/* ------------------------------------------------------------------------------ phone -- */

const UNAVAILABLE: Record<number, string> = {
  60600: 'No data for this number.',
  60606: 'This check is not switched on yet.',
  60607: 'Not offered for numbers in this country.',
  60617: 'Needs more details about the person to check.',
};
function pkg<T>(v: Rec | null | undefined, pick: (v: Rec) => T): T | { available: false; reason: string } | null {
  if (!v) return null;
  if (v.error_code) return { available: false, reason: UNAVAILABLE[Number(v.error_code)] ?? 'Not available for this number.' };
  return pick(v);
}

async function phoneIntel(body: Rec, ctx: RunContext): Promise<RunResult> {
  const phone = str(body.phone).replace(/[\s().-]/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(phone)) return fail({ code: 'invalid_input', message: 'Enter a phone number with its country code, for example +250788123456.' }, '');
  const env = await ctx.intel.post('/v1/phone/lookup', {
    phone: phone.startsWith('+') ? phone : `+${phone}`,
    first_name: str(body.first_name) || undefined, last_name: str(body.last_name) || undefined,
    date_of_birth: str(body.date_of_birth) || undefined, country: str(body.country).toLowerCase() || undefined,
  }, 45_000);
  if (!env.ok) return fail(env.error, 'The phone check could not be completed. Try again.');
  const v = env.data?.validity?.ok ? env.data.validity.data ?? {} : {};
  const t = env.data?.line_intelligence?.ok ? env.data.line_intelligence.data ?? {} : {};
  const c = env.data?.confirm?.ok ? env.data.confirm.data ?? {} : {};
  const score = Number(t.sms_pumping_risk?.sms_pumping_risk_score);
  const high: string[] = [];
  const medium: string[] = [];
  const type = t.line_type_intelligence?.type ?? (c.line_type || null);
  if (t.valid === false || c.valid === false) high.push('The number is not valid.');
  if (Number.isFinite(score) && score >= 75) high.push('High SMS pumping risk.');
  if (t.sms_pumping_risk?.number_blocked) high.push('The number is blocked.');
  if (type && /voip/i.test(String(type))) medium.push('A virtual (VoIP) number.');
  if (t.line_status?.status && !/active/i.test(String(t.line_status.status))) medium.push(`The line is ${String(t.line_status.status).toLowerCase()}.`);
  const parsed = parsePhoneNumberFromString(String(v.e164 ?? (phone.startsWith('+') ? phone : `+${phone}`)));
  return {
    ok: true,
    data: {
      phone: v.e164 ?? phone,
      valid: t.valid ?? c.valid ?? null,
      format: {
        e164: v.e164 ?? parsed?.number ?? null,
        national: t.national_format ?? parsed?.formatNational() ?? null,
        international: parsed?.formatInternational() ?? null,
      },
      country: {
        code: t.country_code ?? c.country_code ?? null,
        name: c.country_name ?? v.country ?? null,
        calling_code: parsed ? `+${parsed.countryCallingCode}` : (c.country_prefix || null),
      },
      location: c.location || null,
      // the carrier lookup answers first; when it has no data for the number, the second source's line type still stands
      line:
        t.line_type_intelligence?.error_code && c.line_type
          ? { type: snake(c.line_type), carrier: c.carrier || null, mcc: null, mnc: null }
          : pkg(t.line_type_intelligence, (x) => ({ type: snake(x.type), carrier: x.carrier_name ?? (c.carrier || null), mcc: x.mobile_country_code ?? null, mnc: x.mobile_network_code ?? null })),
      status: pkg(t.line_status, (x) => x.status ?? null),
      sms_pumping: pkg(t.sms_pumping_risk, (x) => ({
        score: x.sms_pumping_risk_score ?? null,
        carrier_risk: snake(x.carrier_risk_category),
        blocked: x.number_blocked ?? null,
        blocked_on: x.number_blocked_date ?? null,
        blocked_last_3_months: x.number_blocked_last_3_months ?? null,
      })),
      sim_swap: pkg(t.sim_swap, (x) => ({ last_swap: x.last_sim_swap ?? null, carrier: x.carrier_name ?? null })),
      call_forwarding: pkg(t.call_forwarding, (x) => ({ enabled: x.call_forwarding_enabled ?? null })),
      caller: pkg(t.caller_name, (x) => ({ name: x.caller_name ?? null, type: snake(x.caller_type) })),
      ...(t.identity_match ? { identity_match: pkg(t.identity_match, (x) => ({ first_name: x.first_name_match ?? null, last_name: x.last_name_match ?? null, date_of_birth: x.date_of_birth_match ?? null, score: x.summary_score ?? null })) } : {}),
      risk: riskOf(high, medium),
    },
  };
}

/* ------------------------------------------------------------------------------ ip -- */

function ipValid(ip: string) {
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip);
}

async function ipAnonymity(ip: string, ctx: RunContext): Promise<RunResult> {
  if (!ipValid(ip)) return fail({ code: 'invalid_input', message: 'Enter an IPv4 or IPv6 address.' }, '');
  const env = await ctx.intel.post('/v1/ip/analyze', { ip }, 30_000);
  const a = env.ok ? env.data : null;
  if (!a) return fail(env.error, 'The IP check could not be completed. Try again.');
  const f = a.flags ?? {};
  return {
    ok: true,
    data: {
      ip: a.ip ?? ip,
      version: a.version ?? null,
      private: !!a.private,
      location: {
        continent: a.geo?.continent ?? null,
        country_code: a.geo?.countryCode ?? null,
        country: a.geo?.country ?? null,
        region: a.geo?.region ?? null,
        city: a.geo?.city ?? null,
        coordinates: Number.isFinite(a.geo?.latitude) && Number.isFinite(a.geo?.longitude) ? { lat: a.geo.latitude, lon: a.geo.longitude } : null,
        timezones: a.geo?.countryTimezones ?? [],
      },
      network: { asn: a.network?.asn ?? null, organization: a.network?.organization ?? null, connection_type: a.network?.connectionType ?? null },
      anonymity: {
        tor: !!f.tor,
        vpn: !!f.vpn,
        datacenter: !!f.datacenter,
        cloud_provider: f.cloudProvider ?? null,
        private_relay: !!f.privateRelay,
        relay_region: f.relayRegion ?? null,
        blocklisted: !!f.spamhausDrop,
      },
      lists_updated: a.sources?.updated ?? null,
    },
  };
}

async function ipRisk(ip: string, ctx: RunContext): Promise<RunResult> {
  if (!ipValid(ip)) return fail({ code: 'invalid_input', message: 'Enter an IPv4 or IPv6 address.' }, '');
  const [anon, rep] = await Promise.all([ipAnonymity(ip, ctx), ctx.intel.post('/v1/screen/ip', { ip }, 30_000)]);
  if (!anon.ok) return anon;
  const a = anon.data as Rec;
  const geo = rep.ok && rep.data?.geo?.ok ? rep.data.geo.data ?? {} : {};
  const ab = rep.ok && rep.data?.abuse?.ok ? rep.data.abuse.data ?? {} : null;
  const score = ab ? Number(ab.abuseConfidenceScore ?? 0) : null;
  const high: string[] = [];
  const medium: string[] = [];
  if (a.anonymity.tor || ab?.isTor) high.push('A Tor exit node.');
  if (a.anonymity.blocklisted) high.push('On a blocklist of hijacked or criminal networks.');
  if (score !== null && score >= 75) high.push(`Reported for abuse with ${score}% confidence.`);
  if (a.anonymity.vpn) medium.push('A VPN address.');
  if (geo.proxy) medium.push('A proxy.');
  if (a.anonymity.datacenter || geo.hosting) medium.push('A data centre or hosting address, not a home or mobile connection.');
  if (score !== null && score >= 25 && score < 75) medium.push(`Some abuse reports (${score}% confidence).`);
  return {
    ok: true,
    data: {
      ip: a.ip,
      version: a.version,
      location: { ...a.location, region: a.location.region ?? geo.regionName ?? null, city: a.location.city ?? geo.city ?? null },
      network: {
        ...a.network,
        isp: geo.isp ?? ab?.isp ?? null,
        operator: geo.org || null,
        domain: ab?.domain || null,
        hostnames: ab?.hostnames ?? [],
        mobile: geo.mobile ?? null,
      },
      anonymity: { ...a.anonymity, proxy: !!geo.proxy },
      reputation: ab
        ? {
            abuse_score: score,
            reports: ab.totalReports ?? 0,
            distinct_reporters: ab.numDistinctUsers ?? 0,
            last_reported: ab.lastReportedAt ?? null,
            usage: ab.usageType ?? null,
            allowlisted: ab.isWhitelisted ?? null,
          }
        : { available: false, reason: 'Abuse reports were not available this time.' },
      risk: riskOf(high, medium),
    },
    warnings: ab ? [] : ['Abuse reports were not available this time; the rest is complete.'],
  };
}

/* ------------------------------------------------------------------------------ screening -- */

/** Same text in another case or punctuation ("26/1 SOFIYSKAYA EMB." and "26/1 Sofiyskaya Emb") counts once. */
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/…/g, '...').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function uniq(xs: unknown[], cap: number) {
  const seen = new Map<string, string>();
  for (const x of xs) if (typeof x === 'string' && x.trim() && !seen.has(norm(x))) seen.set(norm(x), x.trim());
  return [...seen.values()].slice(0, cap);
}
const first = (xs: unknown) => (Array.isArray(xs) && typeof xs[0] === 'string' ? xs[0] : null);

/**
 * The record behind a confirmed match, cut to what a reviewer decides on: other names, where, which sanctions (who
 * imposed them, the programme, why, since when), roles held, and how current the record is. A large company record
 * runs to hundreds of kilobytes of ownership and registry rows; those stay out.
 */
async function matchDetails(id: string, ctx: RunContext): Promise<Rec | null> {
  const env = await ctx.intel.get(`/v1/aml/screen/entity/${encodeURIComponent(id)}`, 30_000);
  const e = env.ok ? (env.data as Rec) : null;
  if (!e?.properties) return null;
  const p = e.properties as Rec;
  // one row per authority + programme + start date (lists republish the same measure), measures still in force first
  const byKey = new Map<string, Rec>();
  for (const s of (p.sanctions ?? []) as Rec[]) {
    if (!s || typeof s !== 'object') continue;
    const sp = (s.properties ?? {}) as Rec;
    const row = {
      authority: first(sp.authority),
      program: first(sp.program),
      reason: first(sp.reason),
      country: first(sp.country),
      start_date: first(sp.startDate),
      end_date: first(sp.endDate),
    };
    const key = [row.authority, row.program, row.country, row.start_date].map((v) => norm(String(v ?? ''))).join('|');
    const had = byKey.get(key);
    if (!had) byKey.set(key, row);
    else for (const k of Object.keys(row) as (keyof typeof row)[]) had[k] ??= row[k];
  }
  const sanctions = [...byKey.values()].sort((a, b) => Number(!!a.end_date) - Number(!!b.end_date) || String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')));
  const addresses = ((p.addressEntity ?? []) as Rec[]).map((a) => (a && typeof a === 'object' ? a.caption : a));
  return {
    aliases: uniq([...(p.alias ?? []), ...(p.name ?? []), ...(p.weakAlias ?? [])].filter((n) => typeof n === 'string' && norm(n) !== norm(String(e.caption ?? ''))), 10),
    addresses: uniq([...addresses, ...(p.address ?? [])], 5),
    sanctions: sanctions.slice(0, 10),
    sanctions_total: sanctions.length,
    ...(e.schema === 'Person'
      ? { positions: uniq(p.position ?? [], 5), birth_places: uniq(p.birthPlace ?? [], 3), gender: first(p.gender) }
      : { status: first(p.status), jurisdiction: first(p.jurisdiction), incorporation_date: first(p.incorporationDate), websites: uniq(p.website ?? [], 3) }),
    first_seen: e.first_seen ?? null,
    last_seen: e.last_seen ?? null,
    last_change: e.last_change ?? null,
  };
}

async function screening(body: Rec, ctx: RunContext): Promise<RunResult> {
  const name = str(body.name);
  if (name.length < 2) return fail({ code: 'invalid_input', message: 'Enter the name to screen.' }, '');
  const req = {
    name,
    schema: str(body.schema) || undefined,
    birth_date: str(body.birth_date) || undefined,
    countries: list(body.countries).map((c) => c.toLowerCase()).slice(0, 5),
    id_numbers: list(body.id_numbers).slice(0, 5),
    limit: Number.isInteger(Number(body.limit)) ? Math.min(50, Math.max(1, Number(body.limit))) : 10,
  };
  const env = await ctx.intel.post('/v1/aml/screen/match', req, 30_000);
  if (!env.ok) return fail(env.error, 'The screening could not be completed. Try again.');
  // the index's own vocabulary (record ids, list and topic codes, matcher notes) is turned into the client's here
  const rows = (env.data?.results ?? []) as Rec[];
  const results = rows.map((r) => ({
    id: opaqueId(r.id),
    name: r.caption,
    type: r.schema,
    score: r.score,
    match: !!r.match,
    topics: topicWords(r.topics),
    lists: listNames(r.datasets),
    countries: r.countries ?? [],
    birth_dates: r.birth_dates ?? [],
    nationalities: r.nationalities ?? [],
    identifiers: r.identifiers ?? {},
    why: plainWhy(r.reasons),
  })) as Rec[];
  // the full record for the confirmed matches (the first three), fetched together by the index's own id
  const matched = results.map((r, i) => ({ r, indexId: String(rows[i]?.id ?? '') })).filter(({ r }) => r.match).slice(0, 3);
  const details = await Promise.all(matched.map(({ indexId }) => matchDetails(indexId, ctx).catch(() => null)));
  matched.forEach(({ r }, i) => (r.details = details[i] ?? { available: false, reason: 'The full record was not available this time.' }));
  return {
    ok: true,
    data: {
      query: { name, type: env.data?.query?.schema ?? req.schema ?? null, birth_date: req.birth_date ?? null, countries: req.countries, id_numbers: req.id_numbers },
      summary: { results: results.length, matches: results.filter((r) => r.match).length, top_score: results[0]?.score ?? null },
      results,
    },
  };
}

const SCREENING_DATABASE_SITES = new Set(['opensanctions.org']);

async function webMentions(query: string, mode: string, ctx: RunContext): Promise<RunResult> {
  if (query.length < 2) return fail({ code: 'invalid_input', message: 'Enter a name or a phrase to search.' }, '');
  const m = mode === 'all' ? 'all' : 'aml';
  const env = await ctx.intel.get(`/v1/aml/web/search?${new URLSearchParams({ q: query, mode: m })}`, 45_000);
  if (!env.ok) return fail(env.error, 'The web search could not be completed. Try again.');
  const d = env.data ?? {};
  const site = (url: unknown) => {
    try {
      return new URL(String(url)).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  };
  // An entry page on a screening database is not media, and the same facts come from Screening; such pages also
  // carry the database's own record ids. They are counted, not listed.
  const all = (d.results ?? []) as Rec[];
  const kept = all.filter((r) => !SCREENING_DATABASE_SITES.has(site(r.url) ?? ''));
  const results = kept.map((r) => ({ title: r.title ?? null, site: site(r.url), url: r.url ?? null, date: r.date ?? null, topics: r.topics ?? [], snippet: r.content ? String(r.content).slice(0, 280) : null }));
  return {
    ok: true,
    data: {
      query,
      mode: m === 'aml' ? 'adverse' : 'all',
      complete: d.complete !== false,
      count: results.length,
      results,
      left_out: { not_about_this_name: Number(d.dropped_not_mentioning ?? 0), not_adverse: Number(d.dropped_not_adverse ?? 0), list_entries: all.length - kept.length },
    },
    warnings: d.complete === false ? ['Some web sources did not answer this time, so the list may be incomplete.'] : [],
  };
}

/**
 * A label as a name: the label sources tag entries in brackets with their own codes ("[mint] [l2-eoa]"); the name
 * stays ("mint"), the code-like tags (lower case joined by hyphens) go.
 */
function cleanLabel(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v
    .replace(/\[([^\]]*)\]/g, (_, inner: string) => (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(inner.trim()) ? '' : inner))
    .replace(/\s+/g, ' ')
    .trim();
  return s || null;
}

/** Where a row came from inside our data (file names, ingest runs) is ours, not part of the answer. */
const INTERNAL_KEYS = new Set(['source', 'sources', 'source_file', 'source_files', 'ingest_version', 'key']);

async function wallets(addresses: string[], ctx: RunContext): Promise<RunResult> {
  if (!addresses.length || addresses.length > 100) return fail({ code: 'invalid_input', message: 'Enter 1 to 100 wallet addresses.' }, '');
  const env = await ctx.intel.post('/v1/aml/crypto/screen', { addresses }, 30_000);
  if (!env.ok) return fail(env.error, 'Wallet screening could not be completed. Try again.');
  const d = env.data ?? {};
  const rows = (d.results ?? []) as Rec[];
  // an address on record gets its full answer: why (in words), each listing, who disputes it, and what it is labelled
  const detail: (Rec | null)[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    detail.push(...(await Promise.all(rows.slice(i, i + 10).map(async (r) => {
      if (!r.found) return null;
      const w = await ctx.intel.get(`/v1/aml/crypto/address?${new URLSearchParams({ address: String(r.address) })}`, 20_000).catch(() => null);
      return w?.ok ? (w.data as Rec) : null;
    }))));
  }
  return {
    ok: true,
    data: {
      checked: d.checked ?? addresses.length,
      counts: d.counts ?? {},
      results: rows.map((r, i) => {
        const x = detail[i];
        const labels = new Map<string, { network: string | null; label: string }>();
        for (const a of (x?.attributions ?? []) as Rec[]) {
          const label = cleanLabel(a?.label);
          if (label && !labels.has(`${a.network}|${norm(label)}`)) labels.set(`${a.network}|${norm(label)}`, { network: a.network ?? null, label });
        }
        return {
          address: r.address,
          network: r.format?.network ?? null,
          valid_format: r.format?.valid ?? null,
          checksum_ok: r.format?.checksum ?? null,
          ...(r.format?.note ? { format_note: r.format.note } : {}),
          verdict: r.verdict ?? 'no_record',
          risk: r.risk ?? 'unknown',
          summary: x?.summary ?? r.summary ?? null,
          flags: r.flags ?? [],
          ...(x
            ? {
                listings: ((x.listings ?? []) as Rec[]).map((l) => ({ network: l.network ?? null, categories: l.categories ?? [], risk_class: l.risk_class ?? null, subcategory: l.subcategory ?? null, victim_contract: !!l.victim_contract })),
                disputed_by: ((x.disputed_by ?? []) as Rec[]).map((p) => ({ network: p.network ?? null, legitimate_as: cleanLabel(p.legitimate_as), listed_as: p.listed_as ?? null })),
                schemes: ((x.schemes ?? []) as Rec[]).map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !INTERNAL_KEYS.has(k)))),
                labels: [...labels.values()].slice(0, 12),
              }
            : r.found
              ? { details: { available: false, reason: 'The full record was not available this time.' } }
              : {}),
        };
      }),
    },
  };
}

/* ------------------------------------------------------------------------------ dossier -- */

async function dossier(body: Rec, ctx: RunContext): Promise<RunResult> {
  const email = str(body.email);
  const phone = str(body.phone);
  const name = str(body.name);
  const ip = str(body.ip);
  const wallet = str(body.wallet);
  const include = new Set(list(body.include));
  if (!email && !phone && !name && !ip && !wallet) return fail({ code: 'invalid_input', message: 'Send at least one of email, phone, name, ip or wallet.' }, '');
  const part = async (on: boolean, f: () => Promise<RunResult>) => {
    if (!on) return null;
    try {
      const r = await f();
      return r.ok ? r.data : { error: r.error?.message ?? 'Not available.' };
    } catch {
      return { error: 'Not available.' };
    }
  };
  const [emailR, phoneR, ipR, screenR, walletR, accountsR, usernameR, webR] = await Promise.all([
    part(!!email, () => emailRisk(email, ctx)),
    part(!!phone, () => phoneIntel({ phone }, ctx)),
    part(!!ip, () => ipRisk(ip, ctx)),
    part(!!name, () => screening({ name, birth_date: body.dob, countries: body.country ? [body.country] : [], limit: 10 }, ctx)),
    part(!!wallet, () => wallets([wallet], ctx)),
    part(!!email && include.has('accounts'), () => emailAccounts(email, ctx)),
    part(!!email && include.has('username'), () => usernameSearch(email.split('@')[0] ?? '', 100, ctx)),
    part(!!name && include.has('web'), () => webMentions(name, 'aml', ctx)),
  ]);
  return {
    ok: true,
    data: {
      email: emailR, phone: phoneR, ip: ipR, screening: screenR, wallet: walletR,
      ...(include.has('accounts') ? { accounts: accountsR } : {}),
      ...(include.has('username') ? { username: usernameR } : {}),
      ...(include.has('web') ? { web: webR } : {}),
    },
  };
}

/* ------------------------------------------------------------------------------ the endpoints -- */

const text = (name: string, label: string, required = false, note?: string): Param => ({ name, kind: 'string', label, required, note });
const ep = (e: Omit<PgEndpoint, 'method' | 'group'>): PgEndpoint => ({ method: 'POST', group: 'Contact & risk', ...e });

export const CONTACT_ENDPOINTS: PgEndpoint[] = [
  ep({
    id: 'email.verify', tier: 'minor', name: 'Email Risk', path: '/v1/email/verify',
    summary: 'Can this address receive mail, does the mailbox exist, is it a temporary inbox, and how risky is it.',
    params: [text('email', 'Email', true)],
    run: (b, ctx) => emailRisk(str(b.email), ctx),
  }),
  ep({
    id: 'email.footprint', tier: 'minor', name: 'Email Accounts', path: '/v1/email/footprint', timeoutMs: 160_000,
    summary: 'The sites where this email address has an account.',
    params: [text('email', 'Email', true)],
    run: (b, ctx) => emailAccounts(str(b.email), ctx),
  }),
  ep({
    id: 'osint.username', tier: 'minor', name: 'Username Search', path: '/v1/osint/username', timeoutMs: 210_000,
    summary: 'Public profiles that use this username. A shared username is a lead, not proof.',
    params: [text('username', 'Username', true), { name: 'top', kind: 'integer', label: 'Sites to check', default: 150, min: 10, max: 500, note: 'The most visited sites first.' }],
    run: (b, ctx) => usernameSearch(str(b.username), Number(b.top) || 150, ctx),
  }),
  ep({
    id: 'phone.lookup', tier: 'minor', name: 'Phone Intelligence', path: '/v1/phone/lookup',
    summary: 'Is the number valid and live: format, country, line type, carrier, SMS pumping, SIM swap, forwarding, and a risk level.',
    params: [
      text('phone', 'Phone', true, 'With its country code, for example +250788123456.'),
      text('first_name', 'First name', false, 'With a name, the carrier is asked whether it belongs to that person (some countries only).'),
      text('last_name', 'Last name'),
      text('date_of_birth', 'Date of birth', false, 'YYYY-MM-DD.'),
      text('country', 'Country', false, 'ISO alpha-2, for example RW.'),
    ],
    run: (b, ctx) => phoneIntel(b, ctx),
  }),
  ep({
    id: 'phone.otp.send', tier: 'minor', name: 'Send Phone Code', path: '/v1/phone/otp/send',
    summary: 'Send a one-time code by SMS to prove the person holds the number.',
    params: [text('phone', 'Phone', true, 'A real SMS is sent to this number.')],
  }),
  ep({
    id: 'phone.otp.check', tier: 'minor', name: 'Check Phone Code', path: '/v1/phone/otp/check',
    summary: 'Check the code the person received.',
    params: [text('phone', 'Phone', true), text('code', 'Code', true)],
  }),
  ep({
    id: 'screen.ip', tier: 'major', name: 'IP Risk', path: '/v1/screen/ip',
    summary: 'Where an IP address is, who runs it, whether it hides the user (VPN, proxy, Tor, data centre), its abuse reports, and a risk level.',
    params: [text('ip', 'IP address', true, 'IPv4 or IPv6.')],
    run: (b, ctx) => ipRisk(str(b.ip), ctx),
  }),
  ep({
    id: 'ip.analyze', tier: 'minor', name: 'IP Anonymity', path: '/v1/ip/analyze',
    summary: 'The fast answer from our own lists: Tor, VPN, data centre, cloud, private relay, blocklist, network owner.',
    params: [text('ip', 'IP address', true, 'IPv4 or IPv6.')],
    run: (b, ctx) => ipAnonymity(str(b.ip), ctx),
  }),
  ep({
    id: 'screen.sanctions', tier: 'major', name: 'Sanctions & PEP Screening', path: '/v1/screen/sanctions',
    summary: 'Screen a person or a company against sanctions, politically exposed person and crime lists, with every detail you know scored together.',
    params: [
      text('name', 'Name', true),
      { name: 'schema', kind: 'enum', label: 'Type', choices: [{ value: 'Person', label: 'Person' }, { value: 'Company', label: 'Company' }, { value: 'Organization', label: 'Organization' }, { value: 'LegalEntity', label: 'Any entity' }], default: 'Person' },
      text('birth_date', 'Date of birth', false, 'YYYY, YYYY-MM or YYYY-MM-DD. People only.'),
      { name: 'countries', kind: 'string[]', widget: 'lines', max: 5, placeholder: 'RU', label: 'Countries', note: 'Up to 5 ISO alpha-2 codes (nationality for a person, country for a company).' },
      { name: 'id_numbers', kind: 'string[]', widget: 'lines', max: 5, placeholder: 'A1234567', label: 'ID numbers', note: 'Up to 5: passport, national ID, tax or registration numbers.' },
      { name: 'limit', kind: 'integer', label: 'Results', default: 10, min: 1, max: 50 },
    ],
    run: (b, ctx) => screening(b, ctx),
  }),
  ep({
    id: 'osint.web', tier: 'minor', name: 'Adverse Media', path: '/v1/osint/web', timeoutMs: 60_000,
    summary: 'Web pages that name this person or company, filtered to adverse news by default and tagged with risk topics.',
    params: [text('query', 'Name', true), { name: 'mode', kind: 'enum', label: 'Show', choices: [{ value: 'aml', label: 'Adverse media only' }, { value: 'all', label: 'Everything about this name' }], default: 'aml' }],
    run: (b, ctx) => webMentions(str(b.query), str(b.mode), ctx),
  }),
  ep({
    id: 'screen.crypto', tier: 'minor', name: 'Wallet Screening', path: '/v1/screen/crypto',
    summary: 'A verdict and a risk level for up to 100 wallet addresses, on any supported network.',
    params: [{ name: 'addresses', kind: 'string[]', widget: 'lines', max: 100, placeholder: '0x… or bc1…', label: 'Wallet addresses', required: true, note: 'One per line, up to 100.' }],
    run: (b, ctx) => wallets(list(b.addresses), ctx),
  }),
  ep({
    id: 'verify.contact', tier: 'major', name: 'Contact Dossier', path: '/v1/verify/contact', timeoutMs: 220_000,
    summary: 'Everything above in one call: email, phone, IP, screening and wallet, each in the same shape as its own API.',
    params: [
      text('email', 'Email'),
      text('phone', 'Phone', false, 'With its country code.'),
      text('name', 'Name'),
      text('dob', 'Date of birth', false, 'YYYY-MM-DD.'),
      text('country', 'Country', false, 'ISO alpha-2.'),
      text('ip', 'IP address'),
      text('wallet', 'Wallet address'),
      { name: 'include', kind: 'string[]', widget: 'chips', label: 'Slower checks', choices: [{ value: 'accounts', label: 'Email accounts' }, { value: 'username', label: 'Username search' }, { value: 'web', label: 'Adverse media' }], default: [], note: 'Each adds up to a few minutes.' },
    ],
    run: (b, ctx) => dossier(b, ctx),
  }),
];
