"use client";

/**
 * AML Explorer: one search box over every AML data set, for signed-in operators.
 * Screening records, vessels (with AIS tracks), aircraft, companies and their owners, AML news, source documents
 * and the raw data catalog. The tab follows the input: an IMO or MMSI opens Vessels, an ICAO24 code opens Aircraft,
 * an LEI opens Companies. Everything loads through the Console API; nothing here talks to a data store directly.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Ban,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  FileText,
  Gavel,
  Globe,
  Landmark,
  Link2,
  ListChecks,
  Loader2,
  LockKeyhole,
  MapPin,
  Network,
  MonitorSmartphone,
  Route,
  Plane,
  Search,
  ShieldAlert,
  Ship,
  Siren,
  SlidersHorizontal,
  Table2,
  Tags,
  UserSearch,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { siteIcon } from "@/lib/explorer/site-icons";
import { cn } from "@/lib/utils";

import { ActiveFilter, Chip, CopyButton, Drawer, Empty, EntityGlyph, Facts, FilterMenu, Ident, ListSkeleton, Panel, RecordSkeleton, Rows, SectionTitle, TabStrip, Tag, Tile } from "./kit";
import type { Option, Tone as KitTone } from "./kit";
import { assetFacets, buildTagBank, CRYPTO_CATEGORY, newsFilters, screeningFilters, TAG_GROUPS, tagHome, tagTabs, tagText, walletFilters } from "./tags";
import type { Tag as TagDef, TagGroupId, TagTab } from "./tags";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

type Kind = "screening" | "contact" | "companies" | "assets" | "wallets" | "catalog";
type AnyRec = Record<string, any>;
type View =
  | { s: "idle" }
  | { s: "loading"; note?: string }
  | { s: "signin" }
  | { s: "error"; message: string }
  // moved: the search found nothing in the tab it was typed in and was found in this one
  | { s: "ready"; kind: Kind; data: AnyRec; seq: number; query: string; moved?: { from: Kind; data: AnyRec | null } };

const KINDS: { id: Kind; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "screening", label: "Screening", icon: UserSearch, hint: "A person or organisation, for example Viktor Bout, or Viktor Bout 1967-01-13" },
  { id: "contact", label: "Email, phone & IP", icon: MonitorSmartphone, hint: "Any mix of clues, for example Moses Mucyo mosesm@gmail.com +250788123456" },
  { id: "companies", label: "Companies", icon: Building2, hint: "Company name, LEI or register number, for example Rosneft" },
  { id: "assets", label: "Vessels & aircraft", icon: Ship, hint: "Ship IMO, MMSI or name, or aircraft registration, transponder code or owner, for example IMO 9811000 or N123AB" },
  { id: "wallets", label: "Wallets", icon: Wallet, hint: "A wallet address (or up to 100), or a name such as Tornado Cash, Lazarus Group or Binance" },
  { id: "catalog", label: "Data catalog", icon: Database, hint: "Part of a file path, for example ransomware" },
];
const tabWord = (k: Kind) => KINDS.find((x) => x.id === k)?.label ?? k;
/** Tabs that take the same kind of input (a name or a number): when one finds nothing, the others are asked. */
const FALLBACK: Kind[] = ["screening", "companies", "assets", "wallets"];

const IMO = /^(IMO)?\d{7}$/i;
const MMSI = /^\d{9}$/;
const ICAO24 = /^[0-9a-f]{6}$/i;
const LEI = /^[A-Z0-9]{20}$/;

// wallet address shapes: EVM, Bitcoin / Litecoin bech32, Bitcoin legacy, Tron
const WALLET = /^(0x[0-9a-fA-F]{40}|(bc1|tb1|ltc1)[02-9ac-hj-np-z]{6,87}|(BC1|TB1|LTC1)[02-9AC-HJ-NP-Z]{6,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34}|T[1-9A-HJ-NP-Za-km-z]{33})$/;
const tokens = (q: string) => q.split(/[\s,;]+/).filter(Boolean);

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
// at least two colons in hex groups, so a time such as 12:30 or a word like cafe:bad is not taken for an address
const IPV6 = /^(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only the general search (Screening) jumps to another tab by the shape of the input. On a tab the operator chose, a
 *  value is searched where they are: a wallet-shaped file name in the catalog stays in the catalog. */
function guess(q: string, current: Kind): Kind {
  if (current !== "screening") return current;
  const t = tokens(q);
  if (t.length && t.every((x) => WALLET.test(x))) return "wallets";
  const exact = q.trim();
  const v = exact.replace(/\s+/g, "");
  if (IPV4.test(exact) || IPV6.test(exact) || EMAIL.test(exact)) return "contact";
  if (/^\+[0-9 ()-]{7,20}$/.test(exact)) return "contact"; // a phone number with its country code
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(exact) || /(^|\s)\+\d[\d ()-]{6,}/.test(exact)) return "contact"; // clues with an email or phone
  if (IMO.test(v) || MMSI.test(v)) return "assets";
  if (ICAO24.test(v) && /\d/.test(v) && /[a-f]/i.test(v)) return "assets";
  if (LEI.test(v.toUpperCase()) && /\d/.test(v)) return "companies";
  return current;
}

function vesselUrl(q: string) {
  const v = q.replace(/\s+/g, "");
  const p = new URLSearchParams();
  if (IMO.test(v)) p.set("imo", v.toUpperCase());
  else if (/^\d{1,9}$/.test(v)) p.set("mmsi", v);
  else p.set("name", q);
  return `/api/explorer/vessel?${p}`;
}
// registration, transponder code, owner or operator: the engine tries each, then the closest matches
const aircraftUrl = (q: string) => `/api/explorer/aircraft?${new URLSearchParams({ q })}`;

function request(kind: Kind, raw: string): string {
  const q = raw.trim();
  const v = q.replace(/\s+/g, "");
  const p = new URLSearchParams();
  switch (kind) {
    case "screening":
      p.set("q", splitScreeningQuery(q).name);
      p.set("limit", "20");
      return `/api/explorer/screen/search?${p}`;
    case "companies":
      if (LEI.test(v.toUpperCase())) p.set("lei", v.toUpperCase());
      // register keys are stored in capitals, so "gb-coh-00000118" and "sl012217" find the same records as typed in capitals
      else if (/^[A-Z]{2}-[A-Z0-9-]+$/i.test(v)) p.set("record_id", v.toUpperCase());
      else if (/^[A-Z0-9-]*\d[A-Z0-9-]*$/i.test(v) && !/\s/.test(q.trim())) p.set("registration", v.toUpperCase());
      else p.set("name", q);
      return `/api/explorer/company?${p}`;
    case "wallets": {
      const t = tokens(q);
      if (t.length > 1) return `/api/explorer/crypto/screen?${new URLSearchParams({ addresses: t.join(",") })}`;
      return `/api/explorer/crypto?${new URLSearchParams({ address: t[0] ?? "" })}`;
    }
    case "assets": // both registers are asked in fetchKind
    case "contact": // the investigation runs its sources itself (InvestigationView); nothing is fetched up front
      return "";
    case "catalog":
      if (q) p.set("q", q);
      p.set("limit", "100");
      return `/api/explorer/catalog?${p}`;
  }
}

async function getJson(path: string, body?: unknown): Promise<{ ok: true; data: AnyRec } | { ok: false; status: number; message: string }> {
  try {
    const r = await fetch(`${API}${path}`, { credentials: "include", cache: "no-store",
      ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const reply = (await r.json().catch(() => null)) as AnyRec | null;
    if (r.ok && reply) return { ok: true, data: reply };
    const message =
      r.status === 401
        ? "signin"
        : r.status === 503
          ? reply?.code === "preparing"
            ? "This data set is still being prepared. Please try again later."
            : "This service is not responding right now. Please try again shortly."
          : r.status === 400 || r.status === 422
            ? (typeof reply?.message === "string" ? reply.message : "Check the value you entered.")
            : r.status === 404
              ? "Nothing found."
              : "The explorer is unavailable right now.";
    return { ok: false, status: r.status, message };
  } catch {
    return { ok: false, status: 0, message: "The Console API is unreachable. Check that it is running." };
  }
}

type Fetched = Awaited<ReturnType<typeof getJson>>;
type FetchedOk = Extract<Fetched, { ok: true }>;

const isAddresses = (text: string) => tokens(text).length > 0 && tokens(text).every((x) => WALLET.test(x));

/** Who is behind wallet addresses, by a name, a category or a chain. */
async function walletNames(params: Record<string, string>): Promise<Fetched> {
  const p = new URLSearchParams({ limit: "25", ...params });
  const r = await getJson(`/api/explorer/wallet/search?${p}`);
  return r.ok ? { ok: true, data: { names: r.data, nameQuery: Object.fromEntries([...p].filter(([k]) => k !== "limit")) } } : r;
}

/** One tab's search. Vessels & aircraft asks both registers, or only the one an identifier's shape points to; Wallets
 *  checks addresses, and finds the names behind addresses when what was typed is not an address. */
async function fetchKind(k: Kind, text: string): Promise<Fetched> {
  if (k === "wallets" && !isAddresses(text)) return walletNames({ q: text.trim() });
  if (k === "wallets" && tokens(text).length > 1) return getJson("/api/explorer/crypto/screen", { addresses: tokens(text) });
  if (k !== "assets") return getJson(request(k, text));
  const q = text.trim();
  const v = q.replace(/\s+/g, "");
  const shipOnly = IMO.test(v) || MMSI.test(v);
  const planeOnly = ICAO24.test(v) && /\d/.test(v) && /[a-f]/i.test(v);
  const [ships, planes] = await Promise.all([planeOnly ? null : getJson(vesselUrl(q)), shipOnly ? null : getJson(aircraftUrl(q))]);
  const asked = [ships, planes].filter((x): x is Fetched => x !== null);
  if (!asked.some((x) => x.ok)) return asked.find((x) => !x.ok) ?? { ok: false, status: 404, message: "Nothing found." };
  return { ok: true, data: { vessels: ships?.ok ? ships.data : null, aircraft: planes?.ok ? planes.data : null } };
}

/** Whether a search found the thing itself and not only near spellings: what decides trying another tab. The list and
 *  register searches match words anywhere in a record, so a hit counts only when the record's name carries the name
 *  searched ("Ever Given" is not found by a company whose notes say "ever" and "given"). */
function found(kind: Kind, d: AnyRec, query = ""): boolean {
  const exact = (rows: unknown) => ((rows ?? []) as AnyRec[]).some((r) => r.match !== "similar");
  if (kind === "screening") return ((d.results ?? []) as AnyRec[]).some((r) => r.match !== "similar" && namedIn(String(r.caption ?? ""), splitScreeningQuery(query).name));
  if (kind === "companies")
    return (
      ((d.lei ?? []) as AnyRec[]).length > 0 ||
      exact(d.results) ||
      ((d.register_results ?? []) as AnyRec[]).some((r) => namedIn(plainText(r.name, r.alt_names ?? []), query))
    );
  if (kind === "assets") return exact(d.vessels?.results) || exact(d.aircraft?.results);
  if (kind === "wallets" && d.names) return ((d.names.results ?? []) as AnyRec[]).some((r) => namedIn(String(r.name ?? ""), query));
  return true;
}

/* ---------------------------------------------------------------- small parts -- */

/** Readable names for codes (topics, countries, source lists), taken from the labels the search returns with its facets. */
function facetLabels(facets: AnyRec): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["topics", "countries", "datasets", "schema"]) {
    for (const v of ((facets?.[k]?.values ?? []) as AnyRec[])) if (v?.name && v.label) out[`${k}:${v.name}`] = String(v.label);
  }
  return out;
}
const label = (labels: Record<string, string>, kind: string, code: string) => labels[`${kind}:${code}`] ?? code;
/** Records kept only in the history list: once listed, no longer in any current release. */
const isHistorical = (r: AnyRec) => {
  const ds = (r?.datasets ?? []) as string[];
  return ds.length > 0 && ds.every((d) => d === "verisec_history");
};
const RISK: Record<string, { tone: KitTone; label: string }> = {
  sanctioned: { tone: "danger", label: "Sanctioned" },
  watch: { tone: "caution", label: "Watch" },
  info: { tone: "inert", label: "No risk flag" },
};

/** one entry per spelling, ignoring case: "CENTURION" and "Centurion" are the same name */
function uniqueCI(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out;
}

const programs = (v: unknown) =>
  uniqueCI((Array.isArray(v) ? v : [v]).flatMap((x) => String(x ?? "").split(/\]\s*\[|;/)).map((x) => x.replace(/[[\]]/g, "").trim())).join(", ") || null;

const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== "").join(", ") : (v as string) ?? null);

/** Highlighted snippets arrive with <em> marks; render them as text with emphasis, never as HTML. */
function Snippet({ text }: { text?: string }) {
  if (!text) return null;
  const parts = text.replace(/<(?!\/?em>)[^>]*>/g, "").split(/(<em>.*?<\/em>)/g);
  return (
    <p className="m-0 max-w-[90ch] text-micro text-slate">
      {parts.map((p, i) =>
        p.startsWith("<em>") ? (
          <mark key={i} className="rounded-[3px] bg-lime-tint px-0.5 text-pine">
            {p.slice(4, -5)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

/* ---------------------------------------------------------------- result views -- */

/* ---------------------------------------------------------------- screening: filters, paging, full profiles -- */

type Filters = { schema: string[]; topics: string[]; countries: string[]; datasets: string[] };
const NO_FILTERS: Filters = { schema: [], topics: [], countries: [], datasets: [] };
const FACET_ORDER: (keyof Filters)[] = ["schema", "topics", "countries", "datasets"];
const FACET_LABEL: Record<keyof Filters, string> = { schema: "Entity type", topics: "Risk topic", countries: "Country", datasets: "Source list" };

/** The screening search counts exactly and pages only within its first 10,000 records. */
const SCREEN_MAX = 10000;

function screeningUrl(query: string, f: Filters, offset: number) {
  const p = new URLSearchParams({ q: query, limit: "20", offset: String(offset) });
  for (const k of FACET_ORDER) for (const v of f[k]) p.append(k, v);
  return `/api/explorer/screen/search?${p}`;
}

/** Caption of a property value: nested records show their caption, plain values as they are. */
const cap = (v: unknown): string => (v && typeof v === "object" ? String((v as AnyRec).caption ?? (v as AnyRec).id ?? "") : String(v ?? ""));
const vals = (p: AnyRec, k: string): unknown[] => (Array.isArray(p?.[k]) ? (p[k] as unknown[]) : []);
const text = (p: AnyRec, k: string) => uniqueCI(vals(p, k).map(cap)).join(", ") || null;

/** A long list of values (names in 60 scripts, aliases...): the first ones, then the rest on request. */
function Many({ values, limit = 12, chips = false }: { values: string[]; limit?: number; chips?: boolean }) {
  const [all, setAll] = useState(false);
  if (!values.length) return null;
  const shown = all ? values : values.slice(0, limit);
  const more = values.length > limit && (
    <button type="button" onClick={() => setAll((a) => !a)} className="text-micro text-slate underline-offset-2 hover:text-pine hover:underline">
      {all ? "Show fewer" : `${values.length - limit} more`}
    </button>
  );
  if (chips)
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {shown.map((v) => (
          <Chip key={v}>{v}</Chip>
        ))}
        {more}
      </span>
    );
  return (
    <span>
      {shown.join(", ")}
      {more && <span className="ml-2">{more}</span>}
    </span>
  );
}
const many = (p: AnyRec, k: string) => {
  const v = uniqueCI(vals(p, k).map(cap));
  return v.length ? <Many values={v} /> : null;
};

/** Country names in English from ISO 3166-1 alpha-2 codes; the search's own labels first (they also name places with no
 *  ISO code). With `withCode`, the code follows the name, so a reviewer can match it against other systems. */
const REGION = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
function countryName(code: unknown, labels: Record<string, string> = {}, withCode = false): string {
  const c = String(code ?? "").trim();
  if (!c) return "";
  const sub = c.match(/^([a-z]{2})-([a-z0-9]{1,3})$/i); // a subdivision (ISO 3166-2), for example US-DE
  if (sub) return `${countryName(sub[1], labels)} (${c.toUpperCase()})`;
  let name = labels[`countries:${c.toLowerCase()}`] ?? "";
  if (!name && /^[a-z]{2}$/i.test(c)) {
    try {
      const n = REGION?.of(c.toUpperCase());
      if (n && n !== c.toUpperCase()) name = n;
    } catch {
      /* not a region code */
    }
  }
  if (!name) return c.toUpperCase();
  return withCode && /^[a-z]{2}$/i.test(c) ? `${name} (${c.toUpperCase()})` : name;
}
const countries = (codes: unknown[], labels: Record<string, string>) => uniqueCI(codes.map((c) => countryName(cap(c), labels, true))).join(", ") || null;

/** A source list's name: the search's label, else its code made readable. */
function listName(code: string, labels: Record<string, string>) {
  const known = labels[`datasets:${code}`];
  if (known) return known;
  return code.replace(/^verisec_/, "").split("_").map((w, i) => (i === 0 && w.length === 2 ? w.toUpperCase() : w)).join(" ");
}

/** The standard risk categories, in the screening industry's vocabulary (sanction, PEP, RCA, enforcement, debarment...),
 *  in the order a reviewer weighs them. Every topic code maps to one; codes outside the list keep their own label and
 *  are shown last. The same word and colour are used on every data set. */
type Category = { test: RegExp; rank: number; tone: KitTone; label: string; define: string; codes: string };
const STANDARD: Category[] = [
  { test: /^sanction$/, rank: 0, tone: "danger", label: "Sanction", codes: "sanction", define: "On a government or international sanctions list: asset freeze, travel ban or trade restrictions." },
  { test: /^asset\.frozen$/, rank: 1, tone: "danger", label: "Asset freeze", codes: "asset.frozen", define: "Assets frozen by an authority." },
  { test: /^wanted$/, rank: 2, tone: "danger", label: "Wanted", codes: "wanted", define: "Sought by law enforcement, for example an Interpol Red Notice or an FBI wanted notice." },
  { test: /^crime\.terror/, rank: 3, tone: "danger", label: "Terrorism", codes: "crime.terror", define: "Linked to terrorism or its financing." },
  { test: /^crime\.war/, rank: 3, tone: "danger", label: "War crimes", codes: "crime.war", define: "Accused or convicted of war crimes." },
  { test: /^crime\.fin/, rank: 4, tone: "danger", label: "Financial crime", codes: "crime.fin", define: "Money laundering, bribery, corruption or other financial crime." },
  { test: /^crime\.fraud/, rank: 4, tone: "danger", label: "Fraud", codes: "crime.fraud", define: "Fraud or deception." },
  { test: /^crime\.cyber/, rank: 4, tone: "danger", label: "Cybercrime", codes: "crime.cyber", define: "Hacking, ransomware or other computer crime." },
  { test: /^crime\.traffick/, rank: 4, tone: "danger", label: "Trafficking", codes: "crime.traffick", define: "Trafficking in drugs, people, weapons or wildlife." },
  { test: /^crime\.boss/, rank: 4, tone: "danger", label: "Organised crime", codes: "crime.boss", define: "Leads or belongs to an organised crime group." },
  { test: /^crime/, rank: 5, tone: "danger", label: "Crime", codes: "crime, crime.*", define: "Convicted, charged or investigated for a criminal offence." },
  { test: /^role\.pep$/, rank: 6, tone: "caution", label: "PEP", codes: "role.pep", define: "Politically exposed person: holds or held a prominent public function (FATF Recommendation 12)." },
  { test: /^role\.rca$/, rank: 7, tone: "caution", label: "RCA", codes: "role.rca", define: "Relative or close associate of a politically exposed person (FATF)." },
  { test: /^sanction\.linked$/, rank: 8, tone: "caution", label: "Sanction-linked", codes: "sanction.linked", define: "Owned or controlled by, or acting for, a sanctioned party, without being listed itself." },
  { test: /^sanction\.counter$/, rank: 9, tone: "caution", label: "Counter-sanction", codes: "sanction.counter", define: "Listed by a state in response to sanctions against it." },
  { test: /^debarment$/, rank: 10, tone: "caution", label: "Debarment", codes: "debarment", define: "Excluded from public procurement or development-bank contracts." },
  { test: /^export\.control/, rank: 11, tone: "caution", label: "Export control", codes: "export.control", define: "Subject to export-control restrictions, for example the US Entity List." },
  { test: /^corp\.disqual$/, rank: 12, tone: "caution", label: "Disqualified director", codes: "corp.disqual", define: "Barred from acting as a company director." },
  { test: /^reg\./, rank: 13, tone: "caution", label: "Regulatory action", codes: "reg.action, reg.warn", define: "Subject to an enforcement action or a warning by a regulator." },
  { test: /^role\.oligarch$/, rank: 14, tone: "caution", label: "Oligarch", codes: "role.oligarch", define: "Named as an oligarch by an authority or a recognised list." },
  { test: /^poi$/, rank: 15, tone: "caution", label: "Person of interest", codes: "poi", define: "Named in investigations or reports without a formal listing." },
  { test: /^mare\.(detained|shadow)/, rank: 16, tone: "caution", label: "Maritime risk", codes: "mare.detained, mare.shadow", define: "Detained in port or reported as part of a shadow fleet." },
  { test: /^gov\.soe$/, rank: 17, tone: "inert", label: "State-owned", codes: "gov.soe", define: "Owned or controlled by a state." },
];
const categoryOf = (code: string) => STANDARD.find((c) => c.test.test(code));
/** A topic code as its standard keyword (or the source's own label for codes outside the standard set). */
const standardLabel = (code: string, labels: Record<string, string> = {}) => categoryOf(code)?.label ?? labels[`topics:${code}`] ?? registerWords(code.replaceAll(".", " "));

function riskTags(topics: unknown, labels: Record<string, string>) {
  return [...new Set((Array.isArray(topics) ? topics : []) as string[])]
    .map((t) => {
      const c = categoryOf(t);
      return { code: t, rank: c && c.rank < 16 ? c.rank : 50, tone: c?.tone ?? ("inert" as KitTone), label: c?.label ?? label(labels, "topics", t), define: c?.define ?? "" };
    })
    // the most specific crime code says it best; a bare "crime" next to it adds nothing
    .filter((t, _, all) => !(t.code === "crime" && all.some((x) => x.code.startsWith("crime."))))
    .filter((t, i, all) => all.findIndex((x) => x.label === t.label) === i)
    .sort((a, b) => a.rank - b.rank);
}

/** The gravest tags in full, the rest folded into a count (named on hover). Each tag carries its definition and code. */
function RiskTags({ topics, labels, limit = 3, historical }: { topics: unknown; labels: Record<string, string>; limit?: number; historical?: boolean }) {
  if (historical) return <Tag title="No longer on any current list; kept for history.">Formerly listed</Tag>;
  const tags = riskTags(topics, labels);
  const shown = tags.filter((t) => t.rank < 50).slice(0, limit);
  const rest = tags.filter((t) => !shown.includes(t));
  return (
    <>
      {shown.map((t) => (
        <Tag key={t.code} tone={t.tone} title={`${t.define} Topic code: ${t.code}`}>
          {t.label}
        </Tag>
      ))}
      {rest.length > 0 && (
        <span title={rest.map((t) => `${t.label} (${t.code})`).join(", ")} className="tnum inline-flex items-center rounded-pill bg-inert-tint px-2 py-0.5 text-micro text-inert">
          {shown.length ? `${rest.length} more` : `${rest.length} topic${rest.length === 1 ? "" : "s"}`}
        </span>
      )}
    </>
  );
}
const gravest = (topics: unknown, labels: Record<string, string>): KitTone => riskTags(topics, labels).find((t) => t.rank < 50)?.tone ?? "inert";

const SCHEMA_WORD: Record<string, string> = { LegalEntity: "Legal entity", PublicBody: "Public body", RealEstate: "Real estate", Airplane: "Aircraft" };
const schemaWord = (s: unknown) => SCHEMA_WORD[String(s)] ?? String(s ?? "Record");

/** The headline categories, the frames' AML buttons, each one topic so its count is exact. */
const CATEGORIES: { code: string; icon: LucideIcon }[] = [
  { code: "sanction", icon: Gavel },
  { code: "role.pep", icon: Landmark },
  { code: "role.rca", icon: Users },
  { code: "wanted", icon: Siren },
  { code: "crime", icon: Siren },
  { code: "sanction.linked", icon: Link2 },
  { code: "debarment", icon: Ban },
];

function CategoryTiles({ facets, selected, onToggle, busy }: { facets: AnyRec; selected: string[]; onToggle: (code: string) => void; busy: boolean }) {
  const counts = new Map(((facets?.topics?.values ?? []) as AnyRec[]).map((v) => [String(v.name), Number(v.count)]));
  const tiles = CATEGORIES.filter((c) => (counts.get(c.code) ?? 0) > 0).slice(0, 6);
  if (!tiles.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map(({ code, icon: Icon }) => {
        const on = selected.includes(code);
        const cat = categoryOf(code);
        const tone = cat?.tone ?? "inert";
        const text = code === "role.rca" ? "RCA (relatives, associates)" : cat?.label ?? code;
        return (
          <button
            key={code}
            type="button"
            disabled={busy}
            aria-pressed={on}
            title={`${cat?.define ?? ""} Topic code: ${code}`}
            onClick={() => onToggle(code)}
            className={cn(
              "flex items-center gap-3 rounded-box border px-3 py-2.5 text-left transition-colors disabled:opacity-60",
              on ? "border-pine/30 bg-lime-tint" : "border-hairline bg-page hover:bg-hover-light",
            )}
          >
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-well", tone === "danger" ? "bg-danger-tint text-danger" : "bg-caution-tint text-caution")}>
              <Icon aria-hidden className="size-4" strokeWidth={1.8} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-micro text-slate">{text}</span>
              <span className="tnum text-section font-medium text-pine">{(counts.get(code) ?? 0).toLocaleString()}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- screening on several details -- */

type MatchDetails = { schema?: string; dob?: string; country?: string; id?: string };
type DetailKey = keyof MatchDetails;
const DETAIL_WORD: Record<DetailKey, string> = { schema: "Type", dob: "Date of birth", country: "Nationality or country", id: "ID number" };
const DETAIL_ORDER: DetailKey[] = ["schema", "dob", "country", "id"];
const MATCH_TYPES = ["Person", "Company", "Organization"];

/** A date of birth typed with the name ("Vladimir Putin 1952-10-07") is taken out of the name and used as a detail. */
function splitScreeningQuery(raw: string): { name: string; dob?: string } {
  const q = raw.trim();
  const m = /(?:^|\s)((?:19|20)\d{2}-\d{2}-\d{2})(?=\s|$)/.exec(q);
  if (!m) return { name: q };
  const name = `${q.slice(0, m.index)} ${q.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
  return name.length >= 2 ? { name, dob: m[1] } : { name: q };
}

function detailOk(k: DetailKey, v: string): boolean {
  const t = v.trim();
  if (k === "dob") return /^(19|20)\d{2}(-\d{2}(-\d{2})?)?$/.test(t);
  if (k === "country") return /^[a-z]{2}$/i.test(t);
  if (k === "id") return /^[A-Za-z0-9 ./-]{2,64}$/.test(t);
  return MATCH_TYPES.includes(t);
}

function matchUrl(name: string, d: MatchDetails) {
  const p = new URLSearchParams({ name });
  if (d.schema) p.set("schema", d.schema);
  else if (d.dob) p.set("schema", "Person");
  if (d.dob) p.set("dob", d.dob);
  if (d.country) p.set("country", d.country);
  if (d.id) p.set("id", d.id);
  return `/api/explorer/screen/match?${p}`;
}

/** weight: how specific a confirmed detail is (an ID number or exact birth date singles a person out, a country barely). */
type Verdict = { key: DetailKey | "name"; tone: "agree" | "differ" | "none"; text: string; weight?: number };
const plainId = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** How one list record stands on each detail given: the same, different, or not stated on the record (which neither
 *  confirms nor rules it out). Worked out from the record's own values, so it reads the same whatever the score. */
function verdicts(r: AnyRec, d: MatchDetails, labels: Record<string, string>): Verdict[] {
  const out: Verdict[] = [];
  const nameScore = Number(r.reasons?.name_match?.score ?? r.score ?? 0);
  out.push({ key: "name", tone: nameScore >= 0.95 ? "agree" : "none", text: nameScore >= 0.995 ? "Name: same" : `Name: ${Math.round(nameScore * 100)}% similar` });
  if (d.dob) {
    const dates = ((r.birth_dates ?? []) as string[]).map(String);
    // compared on what both state: a record giving only the year agrees with a full date in that year
    const shared = dates.map((x) => Math.min(x.length, d.dob!.length)).find((n, i) => dates[i]!.slice(0, n) === d.dob!.slice(0, n));
    if (!dates.length) out.push({ key: "dob", tone: "none", text: "Date of birth: not on the record" });
    else if (shared !== undefined) out.push({ key: "dob", tone: "agree", text: `Date of birth: same ${shared >= 10 ? "day" : shared >= 7 ? "month" : "year"}`, weight: shared >= 10 ? 3 : shared >= 7 ? 2 : 1 });
    else out.push({ key: "dob", tone: "differ", text: `Date of birth: differs (${dates.slice(0, 2).join(", ")})` });
  }
  if (d.country) {
    const held = [...new Set([...((r.nationalities ?? []) as string[]), ...((r.countries ?? []) as string[])].map((x) => String(x).toLowerCase()))];
    if (!held.length) out.push({ key: "country", tone: "none", text: "Country: not on the record" });
    else if (held.includes(d.country.toLowerCase())) out.push({ key: "country", tone: "agree", text: `Country: ${countryName(d.country, labels)}`, weight: 1 });
    else out.push({ key: "country", tone: "differ", text: `Country: differs (${held.slice(0, 3).map((x) => countryName(x, labels)).join(", ")})` });
  }
  if (d.id) {
    const held = Object.values((r.identifiers ?? {}) as Record<string, string[]>).flat();
    if (held.some((x) => plainId(x) === plainId(d.id))) out.push({ key: "id", tone: "agree", text: "ID number: same", weight: 4 });
    else if (held.length) out.push({ key: "id", tone: "differ", text: `ID number: not among the ${held.length} on the record` });
    else out.push({ key: "id", tone: "none", text: "ID number: none on the record" });
  }
  return out;
}

const VERDICT_TONE: Record<Verdict["tone"], KitTone> = { agree: "approve", differ: "caution", none: "inert" };

/** One kind of search detail a chip can hold: its name, how a typed value is checked and stored, and how it shows. */
type ChipSpec = {
  key: string;
  word: string;
  ok: (v: string) => boolean;
  clean: (v: string) => string;
  show?: (v: string) => string;
  choose?: "country" | string[];
  placeholder?: string;
  mono?: boolean;
};

/** Search details as chips: each can be removed, and the add button offers the kinds not given yet. Used before a
 *  search (under the search box) and on its results, where changing a chip searches again. */
function ChipFilters({ specs, value, onChange, lead, busy, keepOne, addWord, offered }: {
  specs: ChipSpec[];
  value: Record<string, string | undefined>;
  onChange: (v: Record<string, string>) => void;
  lead?: React.ReactNode;
  busy?: boolean;
  keepOne?: boolean;
  addWord: string;
  offered?: (key: string) => boolean;
}) {
  const [adding, setAdding] = useState<ChipSpec | null>(null);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const countries = useMemo(() => (adding?.choose === "country" ? countryOptions() : []), [adding]);
  const given = specs.filter((x) => value[x.key]);
  const missing = specs.filter((x) => !value[x.key] && (!offered || offered(x.key)));
  const ok = adding ? adding.ok(draft) : false;
  const set = (key: string, v?: string) => {
    const next: Record<string, string> = {};
    for (const [k, x] of Object.entries(value)) if (x && k !== key) next[k] = x;
    if (v) next[key] = v;
    onChange(next);
  };
  const apply = () => {
    if (!adding || !ok) return;
    set(adding.key, adding.clean(draft));
    setAdding(null);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {lead}
      {given.map((x) => {
        const v = String(value[x.key]);
        return (
          <span key={x.key} className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-edge bg-page py-1 pr-1 pl-2.5 text-micro text-pine">
            <span className="text-slate">{x.word}</span>
            <span className={cn("truncate font-medium", x.mono && "font-mono text-[11.5px]")}>{x.show ? x.show(v) : v}</span>
            {x.mono && <CopyButton value={v} className="size-4 rounded-full" />}
            <button
              type="button"
              disabled={busy || (keepOne && given.length === 1)}
              onClick={() => set(x.key)}
              aria-label={`Remove ${x.word}`}
              className="grid size-4 place-items-center rounded-full text-muted hover:bg-hover-light hover:text-pine disabled:opacity-30"
            >
              <X aria-hidden className="size-3" strokeWidth={2.4} />
            </button>
          </span>
        );
      })}
      {adding ? (
        <form
          className="inline-flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <span className="text-micro text-slate">{adding.word}</span>
          {adding.choose ? (
            <select value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={adding.word} className="h-8 max-w-[220px] rounded-pill border border-edge bg-page px-2.5 text-micro text-pine outline-none">
              <option value="">{adding.choose === "country" ? "Choose a country" : `Choose a ${adding.word.toLowerCase()}`}</option>
              {adding.choose === "country"
                ? countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code.toUpperCase()})
                    </option>
                  ))
                : adding.choose.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
            </select>
          ) : (
            <input
              ref={(el) => el?.focus()}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={adding.placeholder}
              aria-label={adding.word}
              className={cn("h-8 w-[240px] rounded-pill border bg-page px-3 text-micro text-pine outline-none", draft && !ok ? "border-caution" : "border-edge")}
            />
          )}
          <button type="submit" disabled={!ok} className="inline-flex h-8 items-center rounded-pill bg-lime px-3 text-micro font-medium text-pine disabled:opacity-50">
            Add
          </button>
          <button type="button" onClick={() => (setAdding(null), setDraft(""))} className="text-micro text-slate hover:text-pine">
            Cancel
          </button>
        </form>
      ) : (
        missing.length > 0 && (
          <span className="relative">
            <button
              type="button"
              disabled={busy}
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              className="inline-flex h-7 items-center gap-1 rounded-pill border border-dashed border-edge px-2.5 text-micro text-slate hover:border-pine/40 hover:text-pine disabled:opacity-50"
            >
              {addWord}
            </button>
            {menu && (
              <>
                <span aria-hidden className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
                <span className="absolute top-[calc(100%+6px)] left-0 z-30 flex w-[220px] flex-col rounded-box border border-hairline bg-page p-1.5 shadow-[0_16px_40px_-12px_rgba(14,50,40,0.28)]">
                  {missing.map((x) => (
                    <button
                      key={x.key}
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        setAdding(x);
                        setDraft("");
                      }}
                      className="rounded-well px-2.5 py-2 text-left text-micro text-pine hover:bg-hover-light"
                    >
                      {x.word}
                    </button>
                  ))}
                </span>
              </>
            )}
          </span>
        )
      )}
    </div>
  );
}

const SCREEN_SPECS: ChipSpec[] = DETAIL_ORDER.map((k) => ({
  key: k,
  word: DETAIL_WORD[k],
  ok: (v: string) => detailOk(k, v),
  clean: (v: string) => (k === "country" ? v.trim().toLowerCase() : v.trim()),
  show: k === "country" ? (v: string) => countryName(v, {}, true) : undefined,
  choose: k === "country" ? "country" : k === "schema" ? MATCH_TYPES : undefined,
  placeholder: k === "dob" ? "YYYY or YYYY-MM-DD" : k === "id" ? "Passport, national ID, tax or registration number" : undefined,
  mono: k === "dob" || k === "id",
}));
/** A date of birth belongs to people, so a company or organisation type and a date of birth exclude each other. */
const screenOffered = (d: MatchDetails) => (k: string) => !(k === "dob" && d.schema && d.schema !== "Person") && !(k === "schema" && !!d.dob);

/** One screening record as a row: what it is, where, how many lists, and its gravest risks. Opens the profile. */
function ScreeningRow({ r, labels, onOpen, verdicts: vs }: { r: AnyRec; labels: Record<string, string>; onOpen: () => void; verdicts?: Verdict[] }) {
  const historical = isHistorical(r);
  const lists = ((r.datasets ?? []) as string[]).length;
  const where = countries((r.countries ?? []) as string[], labels);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 rounded-box border border-hairline bg-page px-4 py-3.5 text-left transition-colors hover:border-edge hover:bg-hover-light/50 md:grid-cols-[auto_1fr_auto_auto]"
    >
      <EntityGlyph schema={r.schema} tone={historical ? "inert" : gravest(r.topics, labels)} />
      <span className="min-w-0">
        <span className="line-clamp-2 text-[15px] leading-5 font-medium text-pine">{r.caption}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-micro text-slate">
          <span>{schemaWord(r.schema)}</span>
          {where && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden className="size-3 shrink-0" strokeWidth={2} />
              <span className="truncate">{where}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <ListChecks aria-hidden className="size-3" strokeWidth={2} />
            {historical ? "History record" : `On ${lists} list${lists === 1 ? "" : "s"}`}
          </span>
          {r.match === "similar" && <span className="text-caution">Closest match, {Math.round(Number(r.score ?? 0) * 100)}%</span>}
          {vs && <span className="tnum">Match score {Math.round(Number(r.score ?? 0) * 100)}%</span>}
        </span>
        {vs && (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {vs.map((v) => (
              <Tag key={v.key} tone={VERDICT_TONE[v.tone]} check={v.tone === "agree"}>
                {v.text}
              </Tag>
            ))}
          </span>
        )}
      </span>
      <span className="col-span-3 flex flex-wrap items-center gap-1.5 md:col-span-1 md:justify-end">
        <RiskTags topics={r.topics} labels={labels} historical={historical} />
      </span>
      <ChevronRight aria-hidden className="hidden size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-pine md:block" strokeWidth={2} />
    </button>
  );
}

/** Match results in order: strong name matches first, then by the match score raised for every detail the record
 *  confirms, by how specific it is. The matcher already lowers a score for each conflict but never raises it for a
 *  confirmed detail, so an exact name with the same birth date would otherwise sit below a near name with no dates. */
function rankMatches(rows: AnyRec[], d: MatchDetails, labels: Record<string, string>): { r: AnyRec; v: Verdict[] }[] {
  const strong = (r: AnyRec) => Number(Number(r.score ?? 0) >= 0.7);
  const fit = (x: { r: AnyRec; v: Verdict[] }) => Number(x.r.score ?? 0) + 0.1 * x.v.reduce((n, v) => n + (v.tone === "agree" ? (v.weight ?? 0) : 0), 0);
  return rows
    .map((r) => ({ r, v: verdicts(r, d, labels) }))
    .sort((a, b) => strong(b.r) - strong(a.r) || fit(b) - fit(a));
}

function ScreeningPanel({ data, query: typed }: { data: AnyRec; query: string }) {
  // a date of birth typed after the name, and details set before searching, narrow the screening from the start
  const split = splitScreeningQuery(typed);
  const query = split.name;
  const [details, setDetails] = useState<MatchDetails>(() => ({ ...(split.dob ? { dob: split.dob } : {}), ...((data.details ?? {}) as MatchDetails) }));
  // details narrow a name: a search made of tags alone has none
  const matching = !!query && DETAIL_ORDER.some((k) => details[k]);
  const matched = useLoad(matching ? matchUrl(query, details) : null);
  const [filters, setFilters] = useState<Filters>(() => ({ ...NO_FILTERS, ...((data.tagFilters ?? {}) as Partial<Filters>) }));
  const [rows, setRows] = useState<AnyRec[]>((data.results ?? []) as AnyRec[]);
  const [total, setTotal] = useState<number>(Number(data.total ?? (data.results ?? []).length));
  const [facets, setFacets] = useState<AnyRec>((data.facets ?? {}) as AnyRec);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AnyRec[]>([]); // the drawer's trail: opening a related record pushes it
  // labels seen so far, so a chosen filter keeps its name after the facets narrow
  const [labels, setLabels] = useState<Record<string, string>>(() => facetLabels((data.facets ?? {}) as AnyRec));
  const similar = rows.length > 0 && rows.every((r) => r.match === "similar");

  /** Filters only change once their results have arrived, so the chips never sit over rows they did not select. */
  const load = async (f: Filters, offset: number) => {
    setBusy(true);
    setError(null);
    const r = await getJson(screeningUrl(query, f, offset));
    setBusy(false);
    if (!r.ok) {
      setError(r.message === "signin" ? "Sign in to search." : "The search could not be completed. Try again.");
      return;
    }
    const next = (r.data.results ?? []) as AnyRec[];
    setFilters(f);
    setRows((old) => (offset ? [...old, ...next] : next));
    setTotal(Number(r.data.total ?? next.length));
    if (r.data.facets && Object.keys(r.data.facets).length) {
      setFacets(r.data.facets as AnyRec);
      setLabels((l) => ({ ...l, ...facetLabels(r.data.facets as AnyRec) }));
    }
  };
  const toggle = (k: keyof Filters, v: string) => {
    const f = { ...filters, [k]: filters[k].includes(v) ? filters[k].filter((x) => x !== v) : [...filters[k], v] };
    void load(f, 0);
  };
  const active = FACET_ORDER.flatMap((k) => filters[k].map((v) => ({ k, v })));
  // the search counts and pages exactly only up to 10,000 records
  const capped = total >= SCREEN_MAX;
  const canPage = rows.length < total && rows.length < SCREEN_MAX - 500;
  const options = (k: keyof Filters): Option[] =>
    ((facets[k]?.values ?? []) as AnyRec[])
      .filter((x) => x.count > 0 || filters[k].includes(x.name))
      .map((x) => ({ value: String(x.name), label: k === "countries" ? countryName(x.name, labels, true) : k === "schema" ? schemaWord(x.label ?? x.name) : k === "topics" ? `${standardLabel(String(x.name), labels)} (${x.name})` : String(x.label ?? x.name), count: Number(x.count) }));
  const chipLabel = (k: keyof Filters, v: string) =>
    k === "countries" ? countryName(v, labels, true) : k === "topics" ? standardLabel(v, labels) : k === "schema" ? schemaWord(v) : label(labels, k, v);

  if (matching) {
    const ranked = matched.s === "ready" ? rankMatches((matched.data.results ?? []) as AnyRec[], details, labels) : [];
    const weakFrom = ranked.findIndex((x) => Number(x.r.score ?? 0) < 0.7);
    return (
      <Panel>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-section font-medium text-pine">
            {matched.s === "ready" ? `${ranked.length} record${ranked.length === 1 ? "" : "s"}` : "Screening"}
            <span className="ml-1.5 font-normal text-slate">that fit “{query}” and the details given</span>
          </h2>
          {matched.s === "loading" && (
            <span className="inline-flex items-center gap-1.5 text-micro text-slate">
              <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
              Scoring every list record on all the details
            </span>
          )}
        </div>
        <ChipFilters
          specs={SCREEN_SPECS}
          value={details}
          onChange={(v) => setDetails(v as MatchDetails)}
          busy={matched.s === "loading"}
          addWord="+ Add a detail"
          offered={screenOffered(details)}
          lead={
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-edge bg-page px-2.5 py-1 text-micro text-pine">
              <span className="text-slate">Name</span>
              <span className="truncate font-medium">{query}</span>
            </span>
          }
        />
        <p className="m-0 text-micro text-slate">
          Ranked by match score, raised for each detail a record confirms (an ID number or exact birth date most) and lowered by the matcher for each it contradicts. A detail the record does not state neither confirms nor rules it out.
        </p>
        {matched.s === "error" && <p role="status" className="m-0 rounded-box bg-danger-tint px-4 py-2.5 text-micro text-danger">{matched.message}</p>}
        {matched.s === "loading" && (
          <div className="flex animate-pulse flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="h-[76px] rounded-box bg-well" />
            ))}
          </div>
        )}
        {matched.s === "ready" && (
          <div className="flex flex-col gap-2">
            {!ranked.length && (
              <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-8 text-center text-body text-inert">
                No list record comes close to this name with these details. Remove a detail or check the spelling.
              </p>
            )}
            {ranked.map(({ r, v }, i) => (
              <div key={r.id} className="flex flex-col gap-2">
                {i === weakFrom && i > 0 && <p className="m-0 mt-2 text-micro text-slate">Weaker name matches</p>}
                <ScreeningRow r={r} labels={labels} verdicts={v} onOpen={() => setProfile([r])} />
              </div>
            ))}
          </div>
        )}
        <ProfileDrawer trail={profile} setTrail={setProfile} labels={labels} />
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-section font-medium text-pine">
          {capped ? `More than ${SCREEN_MAX.toLocaleString()} records` : `${Number(total).toLocaleString()} record${total === 1 ? "" : "s"}`}
          <span className="ml-1.5 font-normal text-slate">{query ? `for “${query}”` : "matching the tags"}</span>
        </h2>
        {rows.length < total && <span className="tnum text-micro text-muted">Showing {rows.length.toLocaleString()}</span>}
      </div>
      {query && (
        <ChipFilters
          specs={SCREEN_SPECS}
          value={details}
          onChange={(v) => setDetails(v as MatchDetails)}
          busy={busy}
          addWord="+ Add a detail"
          offered={screenOffered(details)}
          lead={
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-edge bg-page px-2.5 py-1 text-micro text-pine">
              <span className="text-slate">Name</span>
              <span className="truncate font-medium">{query}</span>
            </span>
          }
        />
      )}

      {!similar && <CategoryTiles facets={facets} selected={filters.topics} onToggle={(c) => toggle("topics", c)} busy={busy} />}

      {!similar && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {FACET_ORDER.map((k) => (
              <FilterMenu key={k} label={FACET_LABEL[k]} options={options(k)} selected={filters[k]} onToggle={(v) => toggle(k, v)} disabled={busy} />
            ))}
          </div>
          {active.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {active.map(({ k, v }) => (
                <ActiveFilter key={`${k}:${v}`} disabled={busy} onRemove={() => toggle(k, v)}>
                  {chipLabel(k, v)}
                </ActiveFilter>
              ))}
              <button type="button" disabled={busy} onClick={() => void load(NO_FILTERS, 0)} className="ml-1 text-micro text-slate underline-offset-2 hover:text-pine hover:underline">
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p role="status" className="m-0 rounded-box bg-danger-tint px-4 py-2.5 text-micro text-danger">{error}</p>}
      {similar && (
        <p className="m-0 rounded-box bg-caution-tint px-4 py-2.5 text-micro text-caution">
          No exact match. These are the closest records by name, with listed parties ranked a little higher. Check the details before relying on them.
        </p>
      )}

      <div className={cn("flex flex-col gap-2 transition-opacity", busy && "pointer-events-none opacity-60")}>
        {!rows.length && (
          <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-8 text-center text-body text-inert">
            {active.length ? "No records match these filters. Remove one to widen the search." : "No screening records match this name."}
          </p>
        )}
        {rows.map((r) => (
          <ScreeningRow key={r.id} r={r} labels={labels} onOpen={() => setProfile([r])} />
        ))}
      </div>

      {!similar && capped && !canPage && rows.length < total && (
        <p className="m-0 self-center text-micro text-muted">Add a filter or a more specific name to see the rest.</p>
      )}
      {!similar && canPage && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void load(filters, rows.length)}
          className="inline-flex h-9 items-center gap-2 self-center rounded-pill border border-edge bg-page px-4 text-micro text-pine hover:bg-hover-light disabled:opacity-60"
        >
          {busy && <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />}
          Show {Math.min(20, total - rows.length)} more
          <span className="tnum text-muted">of {(total - rows.length).toLocaleString()}</span>
        </button>
      )}

      <ProfileDrawer trail={profile} setTrail={setProfile} labels={labels} />
    </Panel>
  );
}

/* ---------------------------------------------------------------- the profile drawer -- */

/** Which property holds each side of a link, and how to say what the profiled entity is on each side. FtM states a
 *  link once (owner/asset, person/relative...), so the same record must read differently on the two profiles. */
const LINK_SIDES: Record<string, { a: string; b: string; asA: string; asB: string }> = {
  Ownership: { a: "owner", b: "asset", asA: "Owns", asB: "Owned by" },
  Directorship: { a: "director", b: "organization", asA: "Director or officer of", asB: "Director or officer" },
  Employment: { a: "employee", b: "employer", asA: "Employed by", asB: "Employs" },
  Membership: { a: "member", b: "organization", asA: "Member of", asB: "Member" },
  Representation: { a: "agent", b: "client", asA: "Represents", asB: "Represented by" },
  Family: { a: "person", b: "relative", asA: "Relative", asB: "Relative" },
  Associate: { a: "person", b: "associate", asA: "Associate", asB: "Associate" },
  UnknownLink: { a: "subject", b: "object", asA: "Linked to", asB: "Linked from" },
  Occupancy: { a: "holder", b: "post", asA: "Position", asB: "Held by" },
  Succession: { a: "predecessor", b: "successor", asA: "Succeeded by", asB: "Successor of" },
};
const holds = (p: AnyRec, k: string, selfId: string) => vals(p, k).some((x) => (x && typeof x === "object" ? (x as AnyRec).id : x) === selfId);
const today = () => new Date().toISOString().slice(0, 10);
const first = (p: AnyRec, ...keys: string[]) => {
  for (const k of keys) {
    const v = vals(p, k).map(cap).find(Boolean);
    if (v) return v;
  }
  return "";
};

/** Family wording. FtM's "relationship" says what the relative is to the person ("father": the relative is the person's
 *  father); a "(reverse)" suffix means it describes the person instead. Returns the other party's role when the record
 *  states it, else a sentence about the profiled person. */
function familyWords(rel: string | null, selfIsRelative: boolean): { role: string; note: string } {
  if (!rel) return { role: "", note: "" };
  const reverse = /\(reverse\)\s*$/i.test(rel);
  const term = rel.replace(/\s*\(reverse\)\s*$/i, "").trim();
  const describesSelf = selfIsRelative !== reverse; // the term names the relative's role unless reversed
  return describesSelf ? { role: "", note: `This person is their ${term}` } : { role: term.charAt(0).toUpperCase() + term.slice(1), note: "" };
}

const IDENTIFIERS = ["idNumber", "passportNumber", "taxNumber", "innCode", "ogrnCode", "registrationNumber", "leiCode", "swiftBic", "imoNumber", "mmsi", "wikidataId"];
const IDENT_WORD: Record<string, string> = {
  idNumber: "National ID", passportNumber: "Passport", taxNumber: "Tax ID", innCode: "INN (Russian tax number)", ogrnCode: "OGRN (Russian state registration)",
  registrationNumber: "Registration number", leiCode: "LEI (ISO 17442)", swiftBic: "SWIFT/BIC (ISO 9362)", imoNumber: "IMO number", mmsi: "MMSI", wikidataId: "Wikidata QID",
};
const RELATION_GROUPS: [string, string[]][] = [
  ["Family", ["familyPerson", "familyRelative"]],
  ["Associates and memberships", ["associates", "associations", "membershipMember", "membershipOrganization", "employers", "employees"]],
  ["Ownership and control", ["ownershipOwner", "ownershipAsset", "directorshipDirector", "directorshipOrganization", "representativeRepresentative", "representativeClient"]],
  ["Other links", ["unknownLinkFrom", "unknownLinkTo", "successors", "predecessors"]],
];

type ProfileTab = "overview" | "lists" | "positions" | "links" | "ownership" | "sources";

function ProfileDrawer({ trail, setTrail, labels }: { trail: AnyRec[]; setTrail: (t: AnyRec[]) => void; labels: Record<string, string> }) {
  const current = trail[trail.length - 1];
  const [loaded, setLoaded] = useState<AnyRec | null>(null);
  const head = loaded && current && loaded.id === current.id ? { ...current, ...loaded, topics: vals(loaded.properties ?? {}, "topics") } : current;
  const close = () => setTrail([]);
  return (
    <Drawer
      open={!!current}
      onClose={close}
      label={current ? `Profile of ${current.caption}` : "Profile"}
      header={
        head && (
          <div className="flex items-start gap-3.5">
            <EntityGlyph schema={head.schema} tone={isHistorical(head) ? "inert" : gravest(head.topics, labels)} size="lg" />
            <div className="flex min-w-0 flex-col gap-1.5">
              {trail.length > 1 && (
                <button type="button" onClick={() => setTrail(trail.slice(0, -1))} className="inline-flex w-fit items-center gap-1 text-micro text-crumb hover:text-pine">
                  <ChevronLeft aria-hidden className="size-3.5" strokeWidth={2} />
                  Back to {trail[trail.length - 2]?.caption}
                </button>
              )}
              <h2 className="m-0 text-[20px] leading-7 font-medium tracking-[-0.3px] text-pine">{head.caption}</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-micro text-slate">{schemaWord(head.schema)}</span>
                <span className="mr-1 inline-flex items-center gap-1 text-micro text-slate">
                  Record <Ident>{String(head.id)}</Ident>
                </span>
                <RiskTags topics={head.topics} labels={labels} limit={5} historical={isHistorical(head)} />
                {head.match === "similar" ? (
                  <Tag tone="caution">Closest match, {Math.round(Number(head.score ?? 0) * 100)}%</Tag>
                ) : head.match === "exact" ? (
                  <Tag tone="approve" check>
                    Exact match
                  </Tag>
                ) : null}
              </div>
            </div>
          </div>
        )
      }
    >
      {current && (
        <EntityProfile
          key={current.id}
          id={String(current.id)}
          labels={labels}
          onLoaded={setLoaded}
          onOpen={(e) => setTrail([...trail, e])}
        />
      )}
    </Drawer>
  );
}

function EntityProfile({ id, labels, onLoaded, onOpen }: { id: string; labels: Record<string, string>; onLoaded: (d: AnyRec) => void; onOpen: (e: AnyRec) => void }) {
  const [d, setD] = useState<AnyRec | "loading" | "error">("loading");
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    let live = true;
    void getJson(`/api/explorer/screen/entity/${encodeURIComponent(id)}`).then((r) => {
      if (!live) return;
      setD(r.ok ? r.data : "error");
      if (r.ok) onLoaded(r.data);
    });
    return () => {
      live = false;
    };
    // onLoaded is a state setter from the drawer and never changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (d === "loading")
    return (
      <div className="flex animate-pulse flex-col gap-4">
        <span className="h-11 rounded-tab bg-well" />
        <span className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="flex flex-col gap-1.5">
              <span className="h-3 w-20 rounded-well bg-well" />
              <span className="h-4 w-3/4 rounded-well bg-well" />
            </span>
          ))}
        </span>
      </div>
    );
  if (d === "error") return <p className="m-0 rounded-box bg-danger-tint px-4 py-3 text-body text-danger">The profile could not be loaded. Close it and try again.</p>;

  const p = (d.properties ?? {}) as AnyRec;
  const selfId = String(d.id);
  const sanctions = vals(p, "sanctions").filter((x) => x && typeof x === "object") as AnyRec[];
  const occupancies = vals(p, "positionOccupancies").filter((x) => x && typeof x === "object") as AnyRec[];
  const groups = RELATION_GROUPS.map(([title, keys]) => [title, keys.flatMap((k) => vals(p, k).filter((x) => x && typeof x === "object") as AnyRec[])] as const).filter(([, items]) => items.length);
  const linkCount = groups.reduce((n, [, items]) => n + items.length, 0);
  const links = uniqueCI([...vals(p, "sourceUrl"), ...vals(p, "wikipediaUrl"), ...vals(p, "website")].map(String));
  const names = uniqueCI([...vals(p, "name"), ...vals(p, "alias"), ...vals(p, "weakAlias")].map(cap)).filter((n) => n.toLowerCase() !== String(d.caption).toLowerCase());
  const idents = IDENTIFIERS.flatMap((k) => uniqueCI(vals(p, k).map(cap)).map((v) => ({ k, v })));
  const company = !["Person"].includes(String(d.schema));

  const tabs: { id: ProfileTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    ...(sanctions.length ? [{ id: "lists" as const, label: "Sanctions", count: sanctions.length }] : []),
    ...(occupancies.length ? [{ id: "positions" as const, label: "Positions", count: occupancies.length }] : []),
    ...(linkCount ? [{ id: "links" as const, label: "Relationships", count: linkCount }] : []),
    { id: "ownership", label: "Ownership" },
    { id: "sources", label: "Sources", count: ((d.datasets ?? []) as string[]).length },
  ];
  const shown = tabs.some((t) => t.id === tab) ? tab : "overview";

  return (
    <div className="flex flex-col gap-5">
      <TabStrip label="Profile" tabs={tabs} current={shown} onSelect={setTab} />

      {shown === "overview" && (
        <div className="flex flex-col gap-5">
          {isHistorical(d) && (
            <p className="m-0 rounded-box bg-inert-tint px-4 py-2.5 text-micro text-inert">
              No longer on any current list. Kept for history; the notes say where it was listed.
            </p>
          )}
          <Facts
            facts={[
              { term: "Born", detail: text(p, "birthDate") },
              { term: "Place of birth", detail: vals(p, "birthPlace").length ? <Many values={uniqueCI(vals(p, "birthPlace").map(cap))} limit={2} /> : null },
              { term: "Died", detail: text(p, "deathDate") },
              { term: "Nationality", detail: countries(vals(p, "nationality"), labels) },
              { term: "Citizenship", detail: countries(vals(p, "citizenship"), labels) },
              { term: company ? "Country" : "Linked countries", detail: countries([...vals(p, "country"), ...vals(p, "jurisdiction")], labels) },
              { term: "Gender", detail: text(p, "gender") },
              { term: "Legal form", detail: text(p, "legalForm") },
              { term: "Incorporated", detail: text(p, "incorporationDate") },
              { term: "Status", detail: text(p, "status") },
              { term: "Political party", detail: text(p, "political") },
              { term: "Positions", detail: vals(p, "position").length ? <Many values={uniqueCI(vals(p, "position").map(cap))} limit={3} /> : null, wide: true },
              { term: "Address", detail: vals(p, "address").length ? <Many values={uniqueCI(vals(p, "address").map(cap))} limit={2} /> : null, wide: true },
            ]}
          />
          {idents.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-micro text-muted">Identifiers</span>
              <span className="flex flex-wrap gap-1.5">
                {idents.slice(0, 16).map(({ k, v }) => (
                  <span key={`${k}:${v}`} className="inline-flex items-center gap-1.5">
                    <span className="text-micro text-slate">{IDENT_WORD[k]}</span>
                    <Ident>{v}</Ident>
                  </span>
                ))}
              </span>
            </div>
          )}
          {names.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-micro text-muted">Other names and spellings</span>
              <Many values={names} limit={14} chips />
            </div>
          )}
          {(text(p, "notes") || text(p, "description") || text(p, "summary")) && (
            <div className="flex flex-col gap-2">
              <span className="text-micro text-muted">Notes</span>
              {[...vals(p, "description"), ...vals(p, "summary"), ...vals(p, "notes")].map(cap).filter(Boolean).slice(0, 6).map((n, i) => (
                <p key={i} className="m-0 max-w-[70ch] text-body text-pine">
                  {n}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {shown === "lists" && (
        <Rows
          cols={[
            { key: "list", header: "List", width: 5 },
            { key: "programme", header: "Programme and reason", width: 6 },
            { key: "listed", header: "Listed", width: 3 },
            { key: "src", header: "", width: 1, align: "right" },
          ]}
          minWidth={600}
          rows={sanctions
            .map((s) => {
              const sp = (s.properties ?? {}) as AnyRec;
              const end = first(sp, "endDate");
              const ended = !!end && end.slice(0, 10) < today();
              const url = vals(sp, "sourceUrl").map(String)[0];
              const listed = first(sp, "listingDate", "startDate", "date");
              return {
                sort: listed,
                list: (
                  <span className="flex flex-col">
                    <span className="font-medium">{listName(String((s.datasets ?? [])[0] ?? ""), labels) || s.caption}</span>
                    {text(sp, "authority") && <span className="text-micro text-slate">{text(sp, "authority")}</span>}
                    {(s.datasets ?? [])[0] && <span className="mt-1"><Ident>{String((s.datasets ?? [])[0])}</Ident></span>}
                  </span>
                ),
                programme: (
                  <span className="flex flex-col gap-0.5">
                    {(text(sp, "program") || text(sp, "programId")) && <span className="line-clamp-3" title={text(sp, "program") ?? text(sp, "programId") ?? ""}>{text(sp, "program") ?? text(sp, "programId")}</span>}
                    {(text(sp, "reason") || text(sp, "provisions")) && <span className="line-clamp-2 text-micro text-slate">{text(sp, "reason") ?? text(sp, "provisions")}</span>}
                    {!text(sp, "program") && !text(sp, "programId") && !text(sp, "reason") && !text(sp, "provisions") && <span className="text-muted">Not stated</span>}
                  </span>
                ),
                listed: (
                  <span className="flex flex-col items-start gap-1">
                    <span>{listed ? listed.slice(0, 10) : <span className="text-muted">Not stated</span>}</span>
                    {ended && <Tag>Ended {end.slice(0, 10)}</Tag>}
                  </span>
                ),
                src: url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label="Open the source" className="inline-grid size-7 place-items-center rounded-full text-slate hover:bg-hover-light hover:text-pine">
                    <ExternalLink aria-hidden className="size-3.5" strokeWidth={2} />
                  </a>
                ) : null,
              };
            })
            .sort((a, b) => String(b.sort).localeCompare(String(a.sort)))}
        />
      )}

      {shown === "positions" && (
        <Rows
          cols={[
            { key: "post", header: "Position", width: 7 },
            { key: "country", header: "Country", width: 3 },
            { key: "from", header: "From", width: 2 },
            { key: "until", header: "Until", width: 2 },
          ]}
          minWidth={560}
          rows={occupancies
            .map((o) => {
              const op = (o.properties ?? {}) as AnyRec;
              const post = vals(op, "post").find((x) => x && typeof x === "object") as AnyRec | undefined;
              const from = first(op, "startDate").slice(0, 10);
              const until = first(op, "endDate").slice(0, 10);
              const current = !until || until >= today();
              return {
                sort: from,
                post: (
                  <span className="flex flex-col items-start gap-1">
                    <span>{post?.caption ?? (text(op, "post") || "Position")}</span>
                    {current && (from || first(op, "status") === "current") && (
                      <Tag tone="caution">Current</Tag>
                    )}
                  </span>
                ),
                country: countries(vals(post?.properties ?? {}, "country"), labels),
                from: from || null,
                until: until || (from ? <span className="text-slate">Present</span> : null),
              };
            })
            .sort((a, b) => String(b.sort).localeCompare(String(a.sort)))}
        />
      )}

      {shown === "links" &&
        groups.map(([title, items]) => (
          <div key={title} className="flex flex-col gap-2">
            <SectionTitle count={items.length}>{title}</SectionTitle>
            <Rows
              cols={[
                { key: "rel", header: "Relationship", width: 3 },
                { key: "who", header: "Name", width: 4 },
                { key: "detail", header: "Details", width: 4 },
              ]}
              minWidth={560}
              rows={items.map((e) => {
                const ep = (e.properties ?? {}) as AnyRec;
                const sides = LINK_SIDES[String(e.schema)];
                const selfIsA = sides ? holds(ep, sides.a, selfId) : false;
                const selfIsB = sides ? holds(ep, sides.b, selfId) : false;
                const otherKey = sides ? (selfIsA ? sides.b : selfIsB ? sides.a : null) : null;
                const others = (otherKey
                  ? vals(ep, otherKey)
                  : Object.values(ep).flatMap((v) => (Array.isArray(v) ? v : []))
                ).filter((x) => x && typeof x === "object" && (x as AnyRec).id !== selfId) as AnyRec[];
                const end = first(ep, "endDate");
                const fam = e.schema === "Family" ? familyWords(text(ep, "relationship"), selfIsB) : null;
                const facts = [
                  fam ? fam.note : text(ep, "relationship") ?? "",
                  text(ep, "role") ?? "",
                  text(ep, "percentage") ? `${pct(String(text(ep, "percentage")).split(",")[0])} share` : "",
                  first(ep, "startDate") ? `From ${first(ep, "startDate").slice(0, 10)}` : "",
                  end ? `Until ${end.slice(0, 10)}` : "",
                ].filter(Boolean);
                return {
                  key: `${others.map((o) => o.id).join(",")}|${fam?.role ?? ""}|${facts.join(".")}`,
                  rel: fam?.role || (sides ? (selfIsA ? sides.asA : selfIsB ? sides.asB : schemaWord(e.schema)) : schemaWord(e.schema)),
                  who: others.length ? (
                    <span className="flex flex-col items-start gap-0.5">
                      {others.slice(0, 4).map((o) => (
                        <button key={o.id} type="button" onClick={() => onOpen({ id: o.id, caption: o.caption, schema: o.schema, datasets: o.datasets })} className="text-left font-medium text-pine underline-offset-2 hover:underline">
                          {o.caption}
                        </button>
                      ))}
                    </span>
                  ) : (
                    e.caption
                  ),
                  detail: facts.length ? <span className="text-slate">{facts.join(". ")}</span> : null,
                };
              }).filter((r, i, all) => all.findIndex((x) => x.key === r.key) === i)}
            />
          </div>
        ))}

      {shown === "ownership" && <GraphPanel id={`ftm:${id}`} />}

      {shown === "sources" && (
        <div className="flex flex-col gap-5">
          <Facts
            facts={[
              { term: "First seen", detail: d.first_seen ? String(d.first_seen).slice(0, 10) : null },
              { term: "Last seen", detail: d.last_seen ? String(d.last_seen).slice(0, 10) : null },
              { term: "Last changed", detail: d.last_change ? String(d.last_change).slice(0, 10) : null },
              { term: "Record", detail: <Ident>{selfId}</Ident> },
            ]}
            columns={4}
          />
          <div className="flex flex-col gap-2">
            <SectionTitle count={((d.datasets ?? []) as string[]).length}>Source lists</SectionTitle>
            <Rows
              cols={[
                { key: "name", header: "List", width: 6 },
                { key: "code", header: "List code", width: 4 },
              ]}
              minWidth={420}
              rows={((d.datasets ?? []) as string[]).map((ds) => ({ name: listName(ds, labels), code: <Ident>{ds}</Ident> }))}
            />
          </div>
          {links.length > 0 && (
            <div className="flex flex-col">
              <span className="mb-1 text-micro text-muted">Links</span>
              {links.slice(0, 12).map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 border-t border-rule py-2 text-body text-pine first:border-t-0 hover:underline">
                  <ExternalLink aria-hidden className="size-3.5 shrink-0 text-slate" strokeWidth={2} />
                  <span className="truncate">{u.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </a>
              ))}
            </div>
          )}
          <RecordMentions name={String(d.caption ?? "")} />
          <div>
            <button type="button" onClick={() => setRaw((a) => !a)} className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-edge bg-page px-3.5 text-micro text-pine hover:bg-hover-light">
              <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", raw && "rotate-180")} strokeWidth={2} />
              {raw ? "Hide recorded fields" : `Every recorded field (${Object.keys(p).length})`}
            </button>
            {raw && (
              <dl className="m-0 mt-3 flex flex-col">
                {Object.keys(p)
                  .sort()
                  .map((k) => (
                    <div key={k} className="grid grid-cols-[160px_1fr] gap-3 border-t border-rule py-2 first:border-t-0">
                      <dt className="text-micro text-muted">{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt>
                      <dd className="m-0 min-w-0 text-micro break-words text-pine">{many(p, k)}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- browse with filters (vessels, aircraft) -- */

const FIELD_LABEL: Record<string, string> = {
  risk: "Risk", flag: "Flag", type: "Vessel type", sanctioner: "Sanctioned by", topic: "Risk topic", program: "Programme",
  source: "Source", detained: "Detained", ais: "AIS activity", screening: "Screening record", country: "Country",
  manufacturer: "Manufacturer", typecode: "Type code", operator: "Operator", flight_data: "Flight data",
};
const FIELD_ORDER: Record<"vessel" | "aircraft", string[]> = {
  vessel: ["risk", "sanctioner", "program", "flag", "type", "topic", "detained", "ais", "screening", "source"],
  aircraft: ["risk", "sanctioner", "program", "country", "manufacturer", "typecode", "operator", "topic", "flight_data", "screening", "source"],
};

function BrowsePanel({ type, initial, initialText }: { type: "vessel" | "aircraft"; initial?: Record<string, string[]>; initialText?: string }) {
  const [sel, setSel] = useState<Record<string, string[]>>(initial ?? {});
  const [years, setYears] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [text, setText] = useState(initialText ?? "");
  const [rows, setRows] = useState<AnyRec[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Record<string, AnyRec[]>>({});
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const url = (s: Record<string, string[]>, offset: number) => {
    const p = new URLSearchParams({ type, limit: "20", offset: String(offset), facet_top: "40" });
    for (const [k, vs] of Object.entries(s)) for (const v of vs) p.append(`f.${k}`, v);
    if (years.min) p.set("f.build_year_min", years.min);
    if (years.max) p.set("f.build_year_max", years.max);
    if (text.trim()) p.set("q", text.trim());
    return `/api/explorer/filter?${p}`;
  };
  const load = async (s: Record<string, string[]>, offset: number) => {
    setBusy(true);
    const r = await getJson(url(s, offset));
    setBusy(false);
    if (!r.ok) return setErr(r.message === "signin" ? "Your session has ended. Sign in again." : r.message);
    setErr(null);
    const next = (r.data.results ?? []) as AnyRec[];
    setRows((old) => (offset ? [...old, ...next] : next));
    setTotal(Number(r.data.total ?? 0));
    setFacets((r.data.facets ?? {}) as Record<string, AnyRec[]>);
  };
  useEffect(() => {
    // the first page loads after the first paint; later loads come from the filters
    const t = setTimeout(() => void load(initial ?? {}, 0), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  const toggle = (k: string, v: string) => {
    const cur = sel[k] ?? [];
    const nextValues = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    const s: Record<string, string[]> = { ...sel, [k]: nextValues };
    if (!nextValues.length) delete s[k];
    setSel(s);
    void load(s, 0);
  };
  const Results = type === "vessel" ? VesselResults : AircraftResults;
  const nameOf = (k: string, v: string) => (k === "flag" || k === "country" ? countryName(v) : k === "topic" ? topicWords(v) : v);
  const active = Object.entries(sel).flatMap(([k, vs]) => vs.map((v) => ({ k, v })));
  const field = "h-9 rounded-pill border border-edge bg-page px-3.5 text-micro text-pine outline-none placeholder:text-placeholder focus:border-pine/40";

  return (
    <Panel>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(sel, 0);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={type === "vessel" ? "Name, IMO or MMSI (optional)" : "Registration, owner or operator (optional)"} maxLength={200} className={cn(field, "min-w-[220px] flex-1")} />
        <span className="text-micro text-slate">Built</span>
        <input value={years.min} onChange={(e) => setYears((y) => ({ ...y, min: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="from" aria-label="Built from" className={cn(field, "w-[76px] px-3")} />
        <input value={years.max} onChange={(e) => setYears((y) => ({ ...y, max: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="to" aria-label="Built until" className={cn(field, "w-[76px] px-3")} />
        <button type="submit" className="inline-flex h-9 items-center rounded-pill bg-lime px-4 text-micro font-medium text-pine hover:opacity-90">
          Apply
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {FIELD_ORDER[type].map((k) => (
          <FilterMenu
            key={k}
            label={FIELD_LABEL[k] ?? k}
            options={((facets[k] ?? []) as AnyRec[]).map((x) => ({ value: String(x.value), label: nameOf(k, String(x.value)), count: Number(x.count) }))}
            selected={sel[k] ?? []}
            onToggle={(v) => toggle(k, v)}
            disabled={busy}
          />
        ))}
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map(({ k, v }) => (
            <ActiveFilter key={`${k}:${v}`} disabled={busy} onRemove={() => toggle(k, v)}>
              {nameOf(k, v)}
            </ActiveFilter>
          ))}
          <button type="button" disabled={busy} onClick={() => (setSel({}), void load({}, 0))} className="ml-1 text-micro text-slate underline-offset-2 hover:text-pine hover:underline">
            Clear all
          </button>
        </div>
      )}
      {err && <p className="m-0 rounded-box bg-danger-tint px-4 py-2.5 text-micro text-danger">{err}</p>}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-section font-medium text-pine">
          {total.toLocaleString()} {type === "vessel" ? (total === 1 ? "vessel" : "vessels") : "aircraft"}
          <span className="ml-1.5 font-normal text-slate">highest risk first</span>
        </h2>
        {rows.length < total && <span className="tnum text-micro text-muted">Showing {rows.length.toLocaleString()}</span>}
      </div>
      {busy && !rows.length ? (
        <div className="flex animate-pulse flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="h-28 rounded-box bg-well" />
          ))}
        </div>
      ) : (
        <div className={cn("transition-opacity", busy && "pointer-events-none opacity-60")}>
          {rows.length > 0 ? <Results data={{ results: rows }} bare /> : <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-8 text-center text-body text-inert">Nothing matches these filters. Remove one to widen the list.</p>}
        </div>
      )}
      {rows.length < total && (
        <button type="button" disabled={busy} onClick={() => void load(sel, rows.length)} className="inline-flex h-9 items-center gap-2 self-center rounded-pill border border-edge bg-page px-4 text-micro text-pine hover:bg-hover-light disabled:opacity-60">
          {busy && <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />}
          Show {Math.min(20, total - rows.length)} more
          <span className="tnum text-muted">of {(total - rows.length).toLocaleString()}</span>
        </button>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- web (adverse media on the open web) -- */

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Two options in one control (the ownership panel's direction switch). */
function Segmented<T extends string>({ options, value, onChange, disabled, label }: { options: [T, string][]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-pill border border-edge bg-page p-0.5">
      {options.map(([v, t]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onChange(v)} className={cn("h-8 rounded-pill px-3.5 text-micro transition-colors", value === v ? "bg-pine text-lime" : "text-slate hover:text-pine")}>
          {t}
        </button>
      ))}
    </div>
  );
}

function WebResults({ data, query, why }: { data: AnyRec; query: string; why?: string }) {
  const [mode, setMode] = useState<"aml" | "all">((data.mode as "aml" | "all") ?? "aml");
  const [rows, setRows] = useState<AnyRec[]>((data.results ?? []) as AnyRec[]);
  const [dropped, setDropped] = useState<number>(Number(data.dropped_not_mentioning ?? 0) + Number(data.dropped_not_adverse ?? 0));
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // complete:false means some web sources did not answer, so an empty list is not a clear result
  const [complete, setComplete] = useState<boolean>(data.complete !== false);
  const [notAdverse, setNotAdverse] = useState<number>(Number(data.dropped_not_adverse ?? 0));
  const [exhausted, setExhausted] = useState(false);
  /** The mode and rows change only once the new results have arrived, so the label always matches what is shown. */
  const load = async (m: "aml" | "all", pg: number) => {
    setBusy(true);
    setError(null);
    const r = await getJson(`/api/explorer/web?${new URLSearchParams({ q: query, mode: m, page: String(pg) })}`);
    setBusy(false);
    if (!r.ok) {
      setError("The web search could not be completed. Try again.");
      return;
    }
    const next = (r.data.results ?? []) as AnyRec[];
    const left = Number(r.data.dropped_not_mentioning ?? 0) + Number(r.data.dropped_not_adverse ?? 0);
    setMode(m);
    setRows((old) => (pg > 1 ? [...old, ...next] : next));
    setDropped((d) => (pg > 1 ? d : 0) + left);
    setNotAdverse((d) => (pg > 1 ? d : 0) + Number(r.data.dropped_not_adverse ?? 0));
    setComplete(r.data.complete !== false);
    setExhausted(next.length === 0 && left === 0);
    setPage(pg);
  };
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-section font-medium text-pine">
          Web
          <span className="ml-1.5 font-normal text-slate">
            {rows.length} result{rows.length === 1 ? "" : "s"} for “{query}”
          </span>
        </h2>
        <Segmented label="What to show" options={[["aml", "Adverse media only"], ["all", "Everything about this name"]]} value={mode} onChange={(m) => void load(m, 1)} disabled={busy} />
      </div>
      {why && <p className="m-0 text-micro text-slate">{why}</p>}
      {dropped > 0 && <p className="m-0 text-micro text-slate">{dropped} left out: not about this name{mode === "aml" ? ", or not adverse" : ""}.</p>}
      {error && <p className="m-0 rounded-box bg-danger-tint px-4 py-2.5 text-micro text-danger">{error}</p>}
      {!complete && <p className="m-0 rounded-box bg-caution-tint px-4 py-2.5 text-micro text-caution">Some web sources did not answer this time, so this list may be incomplete. Searching again later can fill it in.</p>}
      {!rows.length && (
        <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-8 text-center text-body text-inert">
          {mode === "aml" && notAdverse > 0
            ? `${notAdverse} result${notAdverse === 1 ? "" : "s"} name it, none of them adverse. Choose "Everything about this name" to see them.`
            : "No web page names it as written."}
        </p>
      )}
      <div className={cn("flex flex-col gap-2 transition-opacity", busy && "pointer-events-none opacity-60")}>
        {rows.map((r, i) => (
          <Tile key={`${r.url}:${i}`} className="flex flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-slate">
              <span className="inline-flex items-center gap-1">
                <Globe aria-hidden className="size-3" strokeWidth={2} />
                {host(String(r.url))}
              </span>
              {r.date && <span>{String(r.date).slice(0, 10)}</span>}
            </span>
            <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[15px] leading-5 font-medium text-pine underline-offset-2 hover:underline">
              {r.title || r.url}
            </a>
            <MediaTopics topics={r.topics} />
            {r.content && <p className="m-0 line-clamp-3 max-w-[90ch] text-micro text-slate">{String(r.content)}</p>}
          </Tile>
        ))}
      </div>
      {rows.length > 0 && page < 10 && !exhausted && (
        <button type="button" disabled={busy} onClick={() => void load(mode, page + 1)} className="inline-flex h-9 items-center gap-2 self-center rounded-pill border border-edge bg-page px-4 text-micro text-pine hover:bg-hover-light disabled:opacity-60">
          {busy && <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />}
          More results
        </button>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- mailbox verdicts -- */

/** What the mail server said about this exact address, in words a reviewer can act on. */
const MAILBOX_WORDS: Record<string, string> = {
  exists: "Exists: the mail server confirmed this address and refused a made-up one",
  missing: "Does not exist: the mail server refused this address",
  catch_all: "Cannot be confirmed: the mail server accepts every address on this domain",
  unverified: "Not checked: the mail server did not answer the question",
};

/** One line verdict per section, so the risk is read before the details. */
function checkVerdict(name: string, d: AnyRec): { tone: KitTone; text: string }[] {
  const out: { tone: KitTone; text: string }[] = [];
  if (name === "geo") {
    if (d.proxy) out.push({ tone: "caution", text: "Proxy or VPN" });
    if (d.hosting) out.push({ tone: "caution", text: "Hosting or data centre" });
    if (d.mobile) out.push({ tone: "inert", text: "Mobile network" });
  }
  if (name === "abuse") {
    const s = Number(d.abuseConfidenceScore ?? 0);
    if (d.isTor) out.push({ tone: "danger", text: "Tor exit node" });
    out.push(s >= 75 ? { tone: "danger", text: `High abuse confidence ${s}%` } : s >= 25 ? { tone: "caution", text: `Some abuse reports, confidence ${s}%` } : { tone: "approve", text: "No significant abuse reports" });
  }
  if (name === "mailbox") {
    if (d.syntax_ok === false) out.push({ tone: "danger", text: "Not a valid email address" });
    else if (d.disposable) out.push({ tone: "danger", text: "Temporary email address" });
    else if (!d.has_mail_server) out.push({ tone: "danger", text: "Domain has no mail server" });
    else if (d.mailbox === "exists") out.push({ tone: "approve", text: "Mailbox exists" });
    else if (d.mailbox === "missing") out.push({ tone: "danger", text: "Mailbox does not exist" });
    else if (d.mailbox === "catch_all") out.push({ tone: "caution", text: "Mailbox cannot be confirmed" });
    else out.push({ tone: "caution", text: "Mailbox not checked" });
    if (d.suggestion) out.push({ tone: "caution", text: `Did you mean ${d.suggestion}?` });
    if (d.free_provider) out.push({ tone: "inert", text: "Free email provider" });
  }
  if (name === "deliverability") {
    if (d.syntax_ok === false) out.push({ tone: "danger", text: "Not a valid email address" });
    else out.push(d.has_mail_server ? { tone: "approve", text: "Domain accepts mail" } : { tone: "danger", text: "Domain has no mail server" });
  }
  return out;
}

/* ---------------------------------------------------------------- investigation: email, phone, IP, username -- */

type Criteria = { name?: string; email?: string; phone?: string; ip?: string; username?: string; country?: string; dob?: string };
type CriterionKey = keyof Criteria;
const CRITERION_WORD: Record<CriterionKey, string> = { name: "Name", email: "Email", phone: "Phone", username: "Username", ip: "IP address", country: "Country", dob: "Date of birth" };
const CRITERION_ORDER: CriterionKey[] = ["name", "email", "phone", "username", "ip", "country", "dob"];

/** The usernames people most often make from their name: joined, with a dot, with an underscore (at most three). */
function nameUsernames(name: string): string[] {
  const words = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  if (words.length < 2) return [];
  const pair = [words[0]!, words[words.length - 1]!];
  return [...new Set([words.join(""), pair.join("."), pair.join("_")])].filter((u) => /^[a-z0-9._-]{2,40}$/.test(u)).slice(0, 3);
}

/** One line of clues split into criteria: an email, an IP, a phone with its country code, an @handle, then the words
 *  left over as a name (two words or more) or a username (one word). */
function parseCriteria(raw: string): Criteria {
  let rest = ` ${raw.trim()} `;
  const take = (re: RegExp) => {
    const m = re.exec(rest);
    if (!m) return undefined;
    rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
    return (m[1] ?? m[0]).trim();
  };
  const c: Criteria = {};
  const email = take(/\s([^\s@]+@[^\s@]+\.[^\s@]+)(?=\s)/);
  if (email) c.email = email.toLowerCase();
  const ip = take(/\s((?:\d{1,3}\.){3}\d{1,3})(?=\s)/) ?? take(/\s((?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4})(?=\s)/i);
  if (ip && (IPV4.test(ip) || IPV6.test(ip))) c.ip = ip;
  const dob = take(/\s((?:19|20)\d{2}-\d{2}-\d{2})(?=\s)/);
  if (dob) c.dob = dob;
  const phone = take(/\s(\+\d[\d ().-]{5,20}\d)(?=\s)/) ?? take(/\s(\d{9,15})(?=\s)/);
  if (phone) {
    const d = phone.replace(/[\s().-]/g, "");
    if (/^\+?\d{7,15}$/.test(d)) c.phone = d.startsWith("+") ? d : `+${d}`;
  }
  const handle = take(/\s@([A-Za-z0-9._-]{2,40})(?=\s)/);
  if (handle) c.username = handle;
  const words = rest.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1 && /^[A-Za-z0-9._-]{2,40}$/.test(words[0]!) && !c.username) c.username = words[0];
  else if (words.length >= 2) {
    const letters = words.filter((w) => /^\p{L}[\p{L}'’.-]*$/u.test(w));
    if (letters.length >= 2) c.name = letters.slice(0, 5).join(" ");
  }
  return c;
}

/** Whether one criterion's value has the right shape, for values added by hand. */
function criterionOk(k: CriterionKey, v: string): boolean {
  const t = v.trim();
  if (k === "email") return EMAIL.test(t);
  if (k === "ip") return IPV4.test(t) || IPV6.test(t);
  if (k === "phone") return /^\+?\d{7,15}$/.test(t.replace(/[\s().-]/g, ""));
  if (k === "username") return /^@?[A-Za-z0-9._-]{2,40}$/.test(t);
  if (k === "name") return /^\p{L}[\p{L}'’.-]*(\s+\p{L}[\p{L}'’.-]*){1,4}$/u.test(t);
  if (k === "dob") return /^(19|20)\d{2}(-\d{2}-\d{2})?$/.test(t);
  return /^[a-z]{2}$/i.test(t);
}
function criterionValue(k: CriterionKey, v: string): string {
  const t = v.trim();
  if (k === "email" || k === "country") return t.toLowerCase();
  if (k === "phone") {
    const d = t.replace(/[\s().-]/g, "");
    return d.startsWith("+") ? d : `+${d}`;
  }
  if (k === "username") return t.replace(/^@/, "");
  if (k === "name") return t.replace(/\s+/g, " ");
  return t;
}

/** Every ISO country the browser can name, for the country criterion. */
function countryOptions(): { code: string; name: string }[] {
  if (typeof Intl === "undefined" || !("DisplayNames" in Intl)) return [];
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const out: { code: string; name: string }[] = [];
  for (let a = 65; a < 91; a++)
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      try {
        const n = names.of(code);
        if (n && n !== code && !/unknown|pseudo/i.test(n)) out.push({ code: code.toLowerCase(), name: n });
      } catch {
        /* not a region */
      }
    }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

type Load = { s: "skip" } | { s: "loading" } | { s: "error"; message: string } | { s: "ready"; data: AnyRec };

/** One source's answer, fetched once per subject; each section waits only for its own source. */
function useLoad(path: string | null): Load {
  const [state, setState] = useState<{ path: string | null; load: Load }>({ path: null, load: { s: "loading" } });
  useEffect(() => {
    if (!path) return;
    let live = true;
    void getJson(path).then((r) => {
      if (!live) return;
      setState({ path, load: r.ok ? { s: "ready", data: r.data } : { s: "error", message: r.message === "signin" ? "Sign in to run this check." : r.message } });
    });
    return () => {
      live = false;
    };
  }, [path]);
  if (!path) return { s: "skip" };
  return state.path === path ? state.load : { s: "loading" };
}
/** Sources answer as {ok, source, data}; the payload is what the sections read. */
const payload = (l: Load): AnyRec | null => (l.s === "ready" ? ((l.data?.data ?? l.data) as AnyRec) : null);

/** A section of the investigation: its own placeholder while its source works, then its answer. */
function Section({ title, load, wait, count, note, children }: { title: string; load: Load; wait: string; count?: number; note?: string; children: (d: AnyRec) => React.ReactNode }) {
  if (load.s === "skip") return null;
  return (
    <Tile className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle count={load.s === "ready" ? count : undefined}>{title}</SectionTitle>
        {load.s === "loading" && (
          <span className="inline-flex items-center gap-1.5 text-micro text-slate">
            <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
            {wait}
          </span>
        )}
      </div>
      {note && load.s === "ready" && <p className="m-0 text-micro text-slate">{note}</p>}
      {load.s === "loading" && (
        <div className="flex animate-pulse flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="h-7 rounded-well bg-well" />
          ))}
        </div>
      )}
      {load.s === "error" && <p className="m-0 rounded-box bg-inert-tint px-3 py-2 text-micro text-inert">{load.message}</p>}
      {load.s === "ready" && children(load.data)}
    </Tile>
  );
}

const TWILIO_ERROR: Record<number, string> = {
  60600: "Not available for this number",
  60601: "Not available",
  60606: "Not enabled for this account",
  60607: "Not supported in this country",
  60617: "Needs the person's name or date of birth",
};
const LINE_TYPE: Record<string, string> = {
  mobile: "Mobile", landline: "Landline", fixedVoip: "Fixed VoIP", nonFixedVoip: "Non-fixed VoIP (virtual number)", tollFree: "Toll-free",
  voicemail: "Voicemail", personal: "Personal", pager: "Pager", sharedCost: "Shared cost", uan: "Universal access number", unknown: "Unknown",
  special_services: "Special services", toll_free: "Toll-free", premium_rate: "Premium rate", satellite: "Satellite",
};
const lineType = (t: unknown) => (t ? LINE_TYPE[String(t)] ?? sentence(t) : "");
const virtualLine = (t: unknown) => /voip/i.test(String(t ?? ""));

/** Each carrier package as one row: its answer, or why it has none. */
function lineRows(t: AnyRec) {
  const pkg = (k: string, label: string, summary: (v: AnyRec) => React.ReactNode) => {
    const v = t?.[k];
    if (!v || typeof v !== "object") return null;
    if (v.error_code) return { label, value: <span className="text-slate">{TWILIO_ERROR[Number(v.error_code)] ?? `Not available (code ${v.error_code})`}</span> };
    return { label, value: summary(v) };
  };
  return [
    pkg("line_status", "Line status", (v) =>
      v.status ? (
        <Tag tone={v.status === "active" ? "approve" : v.status === "inactive" ? "danger" : "inert"} check={v.status === "active"}>
          {sentence(v.status)}
        </Tag>
      ) : "Not stated"),
    pkg("line_type_intelligence", "Line type and carrier", (v) =>
      [lineType(v.type), v.carrier_name, v.mobile_country_code ? `network ${v.mobile_country_code}-${v.mobile_network_code}` : ""].filter(Boolean).join(", ") || "Not stated"),
    pkg("sms_pumping_risk", "SMS pumping risk", (v) => {
      const score = Number(v.sms_pumping_risk_score);
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          {Number.isFinite(score) && <Tag tone={score >= 75 ? "danger" : score >= 40 ? "caution" : "approve"}>Score {score} of 100</Tag>}
          {v.carrier_risk_category && <span className="text-slate">carrier risk {String(v.carrier_risk_category)}</span>}
          {v.number_blocked && <Tag tone="danger">Blocked for SMS pumping</Tag>}
        </span>
      );
    }),
    pkg("sim_swap", "SIM swap", (v) => {
      const s = (v.last_sim_swap ?? {}) as AnyRec;
      if (s.swapped_in_period === true) return <Tag tone="danger">SIM changed in the last {String(s.swapped_period ?? "period").toLowerCase()}</Tag>;
      if (s.swapped_in_period === false) return `No SIM change in the last ${String(s.swapped_period ?? "period").toLowerCase()}`;
      return "Not stated";
    }),
    pkg("call_forwarding", "Call forwarding", (v) => (v.call_forwarding_enabled === true ? <Tag tone="caution">Forwarding is on</Tag> : v.call_forwarding_enabled === false ? "Off" : "Not stated")),
    pkg("caller_name", "Registered caller name", (v) => (v.caller_name ? `${v.caller_name}${v.caller_type ? ` (${String(v.caller_type).toLowerCase()})` : ""}` : "Not listed")),
    pkg("identity_match", "Identity match", (v) => {
      const parts = Object.entries(v).filter(([k, x]) => /_match$/.test(k) && x).map(([k, x]) => `${registerWords(k.replace(/_match$/, ""))}: ${registerWords(String(x))}`);
      return parts.length ? parts.join(", ") : "Not stated";
    }),
    pkg("reassigned_number", "Reassigned number", (v) => (v.is_number_reassigned === "yes" ? <Tag tone="caution">Reassigned to someone else</Tag> : v.is_number_reassigned === "no" ? "Not reassigned" : "Not stated")),
  ].filter(Boolean) as { label: string; value: React.ReactNode }[];
}

function PhoneSections({ phone }: { phone: Load }) {
  const d = payload(phone) ?? {};
  const pi = ((d.validity?.data ?? {}) as AnyRec);
  const nv = ((d.confirm?.data ?? {}) as AnyRec);
  const tw = ((d.line_intelligence?.data ?? {}) as AnyRec);
  return (
    <>
      <Section title="The number" load={phone} wait="Checking the number">
        {() => (
          <Facts
            facts={[
              { term: "International format", detail: pi.e164 ?? nv.international_format ?? null },
              { term: "National format", detail: tw.national_format ?? pi.local ?? nv.local_format ?? null },
              { term: "Country", detail: pi.country || nv.country_code || tw.country_code ? countryName(String(pi.country ?? nv.country_code ?? tw.country_code), {}, true) : null },
              { term: "Valid", detail: tw.valid === true || nv.valid === true ? "Yes" : tw.valid === false && nv.valid === false ? "No" : null },
              { term: "Line type", detail: lineType(tw.line_type_intelligence?.type) || lineType(nv.line_type) || null },
              { term: "Carrier", detail: tw.line_type_intelligence?.carrier_name || nv.carrier || null },
              { term: "Location", detail: nv.location || null },
            ]}
          />
        )}
      </Section>
      <Section title="Line intelligence" load={phone} wait="Asking the carrier" note="From the carrier's records. A package without an answer says why.">
        {() => (
          <Rows
            cols={[
              { key: "label", header: "Check", width: 3 },
              { key: "value", header: "Result", width: 7 },
            ]}
            minWidth={460}
            empty="The carrier gave no details for this number."
            rows={lineRows(tw)}
          />
        )}
      </Section>
    </>
  );
}

function EmailSections({ mailbox, accounts, profileSites }: { mailbox: Load; accounts: Load; profileSites: Set<string> }) {
  return (
    <>
      <Section title="Mailbox" load={mailbox} wait="Asking the mail server">
        {(raw) => {
          const d = (raw.mailbox ?? {}) as AnyRec;
          return (
            <div className="flex flex-col gap-3">
              {(d.mailbox === "catch_all" || d.mailbox === "unverified") && d.has_mail_server && (
                <p className="m-0 rounded-box bg-caution-tint px-3 py-2 text-micro text-caution">
                  {d.mailbox === "catch_all"
                    ? "This domain's mail server accepts any address (Microsoft 365 and Google Workspace domains often do), so whether this mailbox exists cannot be proven without sending mail."
                    : "The mail server did not say whether this mailbox exists."}
                </p>
              )}
              <Facts
                columns={2}
                facts={[
                  { term: "Mailbox", detail: d.mailbox ? MAILBOX_WORDS[String(d.mailbox)] ?? String(d.mailbox) : null },
                  { term: "Domain", detail: d.domain },
                  { term: "Mail servers", detail: (d.mail_servers ?? []).length ? (d.mail_servers as string[]).join(", ") : d.has_mail_server === false ? "None: the domain accepts no mail" : null },
                  { term: "Address format valid", detail: d.syntax_ok === false ? "No" : "Yes" },
                  { term: "Temporary (disposable) address", detail: d.disposable ? "Yes" : "No" },
                  { term: "Free email provider", detail: d.free_provider ? "Yes" : "No" },
                  { term: "Did you mean", detail: d.suggestion },
                ]}
              />
            </div>
          );
        }}
      </Section>
      <Section
        title="Accounts registered with this email"
        load={accounts}
        wait="Checking more than 120 sites, this takes up to a minute"
        count={((payload(accounts)?.accounts ?? []) as AnyRec[]).length}
        note="Found through each site's sign-up and password-reset forms. Nothing is sent to the person."
      >
        {() => {
          const list = ((payload(accounts)?.accounts ?? []) as AnyRec[]);
          return (
            <Rows
              cols={[
                { key: "site", header: "Site", width: 4 },
                { key: "recovery", header: "Recovery email shown", width: 4 },
                { key: "phone", header: "Phone shown", width: 3 },
                { key: "linked", header: "", width: 3, align: "right" },
              ]}
              minWidth={560}
              empty="No accounts found on the sites checked."
              rows={list.map((a) => ({
                site: (
                  <span className="flex flex-col">
                    <span className="font-medium">{sentence(a.site)}</span>
                    {a.domain && (
                      <a href={`https://${a.domain}`} target="_blank" rel="noopener noreferrer nofollow" className="text-micro text-slate underline-offset-2 hover:underline">
                        {a.domain}
                      </a>
                    )}
                  </span>
                ),
                recovery: a.email_recovery ? <span className="font-mono text-[12px]">{a.email_recovery}</span> : null,
                phone: a.phone_hint ? <span className="font-mono text-[12px]">{a.phone_hint}</span> : null,
                linked: profileSites.has(siteKey(a.site)) ? <LinkChip strength="medium">Profile found too</LinkChip> : null,
              }))}
            />
          );
        }}
      </Section>
    </>
  );
}

/** One check as the verification record shows it: the label, pass or fail, and what was seen. */
function CheckRow({ label, fail, note, unknown, caution, pending }: { label: string; fail: boolean; note?: React.ReactNode; unknown?: boolean; caution?: boolean; pending?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-box border border-hairline bg-page px-3 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body text-pine">{label}</span>
        {note && <span className="text-micro break-words text-slate">{note}</span>}
      </span>
      {pending ? (
        <span className="inline-flex items-center gap-1 text-micro text-slate">
          <Loader2 aria-hidden className="size-3 animate-spin" strokeWidth={2} />
          Checking
        </span>
      ) : unknown ? <Tag>Not checked</Tag> : fail ? <Tag tone={caution ? "caution" : "danger"}>{caution ? "Review" : "Fail"}</Tag> : <Tag tone="approve" check>Pass</Tag>}
    </div>
  );
}

/** Device & IP for one address. The platform's own lists answer at once (checks, location, network); location and
 *  abuse reports from outside providers fill in their rows when they arrive. */
function IpSections({ analysis, ip }: { analysis: Load; ip: Load }) {
  const d = ip.s === "ready" ? ip.data : {};
  const geo = (d.geo?.data ?? {}) as AnyRec;
  const abuse = (d.abuse?.data ?? {}) as AnyRec;
  const an = (analysis.s === "ready" ? analysis.data : {}) as AnyRec;
  const flags = (an.flags ?? {}) as AnyRec;
  const score = Number(abuse.abuseConfidenceScore ?? NaN);
  const noAbuse = d.abuse?.ok === false || !Number.isFinite(score);
  const outside = ip.s === "loading";
  return (
    <>
      <Section title="Checks" load={analysis} wait="Checking the address">
        {() => (
          <div className="grid gap-2 lg:grid-cols-2">
            <CheckRow label="Tor exit node" fail={!!(flags.tor || abuse.isTor)} />
            <CheckRow label="VPN" fail={!!flags.vpn} />
            <CheckRow label="Proxy" fail={!!geo.proxy} caution pending={outside} unknown={ip.s === "error"} />
            <CheckRow label="Data centre / hosting network" fail={!!(flags.datacenter || geo.hosting)} caution note={flags.cloudProvider ? String(flags.cloudProvider) : undefined} />
            <CheckRow label="Hijacked-network blocklist" fail={!!flags.spamhausDrop} note="Spamhaus DROP" />
            <CheckRow label="Abuse reports" fail={score >= 25} caution={score < 75} pending={outside} unknown={!outside && noAbuse} note={outside ? undefined : noAbuse ? "Not available right now" : `Abuse confidence ${score}%, ${Number(abuse.totalReports ?? 0).toLocaleString()} reports`} />
            <div className="flex items-center justify-between gap-3 rounded-box border border-hairline bg-page px-3 py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body text-pine">iCloud Private Relay</span>
                <span className="text-micro text-slate">{flags.privateRelay ? `In use${flags.relayRegion ? ` (${flags.relayRegion})` : ""}, a privacy feature, not a risk` : "Not in use"}</span>
              </span>
              <Tag tone="approve" check>
                Pass
              </Tag>
            </div>
          </div>
        )}
      </Section>
      <Section title="IP intelligence" load={analysis} wait="Locating the address" note={an.sources?.updated ? `IP lists updated ${String(an.sources.updated).slice(0, 10)}.` : undefined}>
        {() =>
          geo.status === "fail" && !an.geo ? (
            <p className="m-0 text-body text-inert">No location for this address. It may be private, reserved or not a valid address.</p>
          ) : (
            <Facts
              facts={[
                { term: "IP address", detail: an.ip ?? geo.query ? <Ident>{String(an.ip ?? geo.query)}</Ident> : null },
                { term: "Country", detail: geo.countryCode || an.geo?.countryCode ? countryName(String(geo.countryCode ?? an.geo?.countryCode), {}, true) : null },
                { term: "Region", detail: geo.regionName ?? an.geo?.region ?? null },
                { term: "City", detail: geo.city ?? an.geo?.city ?? null },
                { term: "Coordinates", detail: an.geo?.latitude != null ? <Position lat={an.geo.latitude} lon={an.geo.longitude} /> : null },
                { term: "ASN", detail: an.network?.asn ? `AS${an.network.asn}` : null },
                { term: "Network owner", detail: an.network?.organization ?? geo.org ?? null },
                { term: "Internet provider", detail: geo.isp ?? null },
                { term: "Connection type", detail: an.network?.connectionType ? sentence(an.network.connectionType) : null },
                { term: "Cloud provider", detail: flags.cloudProvider ?? null },
                // the platform's own connection type is the better answer; the outside flag only fills in when it is missing
                { term: "Mobile network", detail: an.network?.connectionType ? null : geo.mobile === true ? "Yes" : geo.mobile === false ? "No" : null },
                { term: "Time zones", detail: (an.geo?.countryTimezones ?? []).length ? (an.geo.countryTimezones as string[]).join(", ") : null },
              ]}
            />
          )
        }
      </Section>
      <Section title="Abuse reports" load={ip} wait="Reading abuse reports">
        {() =>
          noAbuse ? (
            <p className="m-0 text-body text-inert">Abuse reports are not available right now.</p>
          ) : (
            <Facts
              facts={[
                { term: "Abuse confidence", detail: <Tag tone={score >= 75 ? "danger" : score >= 25 ? "caution" : "approve"}>{`${score}%`}</Tag> },
                { term: "Reports", detail: abuse.totalReports != null ? Number(abuse.totalReports).toLocaleString() : null },
                { term: "Distinct reporters", detail: abuse.numDistinctUsers != null ? Number(abuse.numDistinctUsers).toLocaleString() : null },
                { term: "Last reported", detail: abuse.lastReportedAt ? String(abuse.lastReportedAt).slice(0, 10) : null },
                { term: "Usage type", detail: abuse.usageType ?? null },
                { term: "Domain", detail: abuse.domain ?? null },
                { term: "Host names", detail: (abuse.hostnames ?? []).length ? (abuse.hostnames as string[]).join(", ") : null },
                { term: "On an allow list", detail: abuse.isWhitelisted === true ? "Yes" : abuse.isWhitelisted === false ? "No" : null },
              ]}
            />
          )
        }
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- cross-checking the clues -- */

type Strength = "strong" | "medium" | "weak" | "conflict" | "unchecked";
const STRENGTH: Record<Strength, { word: string; chip: string }> = {
  strong: { word: "Strong link", chip: "bg-pine text-lime" },
  medium: { word: "Supporting", chip: "bg-lime-tint text-pine" },
  weak: { word: "Weak", chip: "bg-well text-slate" },
  conflict: { word: "Conflict", chip: "bg-caution-tint text-caution" },
  unchecked: { word: "Not checked", chip: "bg-well text-inert" },
};
/** "a", "a and b", "a, b and c". */
const listWords = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A username taken on this many of the 150 sites checked is a common word, so finding it says little about anyone. */
const COMMON_USERNAME = 60;

/** The trailing digits a site shows of a masked recovery phone (for example +25*******56), and whether they end the
 *  phone given. Leading digits are not compared: sites show them in national or international form. */
function hintTail(hint: unknown, phone: string): { tail: string; fits: boolean } | null {
  const h = String(hint ?? "").replace(/[\s().+-]/g, "");
  const tail = (/\d*$/.exec(h)?.[0] ?? "").slice(-9);
  return tail.length < 2 ? null : { tail, fits: digitsOf(phone).endsWith(tail) };
}
function LinkChip({ strength, children }: { strength: Strength; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-pill px-2 py-0.5 text-micro font-medium whitespace-nowrap", STRENGTH[strength].chip)}>{children}</span>;
}

const siteKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const digitsOf = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const VIA_WORD: Record<string, string> = { name: "from the name", email: "from the email", username: "the username" };

/** The usernames to search: the one given, the email's local part and those made from the name (at most four). */
function profileQueries(c: Criteria): { username: string; via: CriterionKey[] }[] {
  const out = new Map<string, Set<CriterionKey>>();
  const add = (u: string, via: CriterionKey) => {
    const k = u.toLowerCase();
    if (!/^[a-z0-9._-]{2,40}$/.test(k)) return;
    if (!out.has(k)) out.set(k, new Set());
    out.get(k)!.add(via);
  };
  if (c.username) add(c.username, "username");
  if (c.email) add(c.email.split("@")[0] ?? "", "email");
  if (c.name) nameUsernames(c.name).forEach((u) => add(u, "name"));
  return [...out.entries()].slice(0, 4).map(([username, via]) => ({ username, via: [...via] }));
}

/** The web searches to run, one per clue that can be searched as text (at most four). */
function webQueries(c: Criteria): { key: CriterionKey; value: string }[] {
  const out: { key: CriterionKey; value: string }[] = [];
  if (c.name) out.push({ key: "name", value: c.name });
  else if (c.username) out.push({ key: "username", value: c.username });
  if (c.email) out.push({ key: "email", value: c.email });
  if (c.phone) out.push({ key: "phone", value: c.phone });
  if (c.ip) out.push({ key: "ip", value: c.ip });
  return out.slice(0, 4);
}

type Prof = { site: string; url: string; usernames: string[]; via: Set<CriterionKey>; emailAccount: boolean };
/** Whether a profile address holds the username searched. Some sites cut a username at a dot or dash, so the
 *  address they answer with belongs to someone else ("moses.mucyo" answered as twitter.com/moses). */
function urlHolds(url: string, username: string): boolean {
  let u = url.toLowerCase();
  try {
    u = decodeURIComponent(u);
  } catch {
    /* keep it encoded */
  }
  return u.includes(username.toLowerCase());
}

/** Profiles from every username search in one list, a page found twice listed once, ranked by how many clues agree. */
function mergeProfiles(queries: { username: string; via: CriterionKey[] }[], loads: Load[], accountSites: Set<string>): Prof[] {
  const byUrl = new Map<string, Prof>();
  queries.forEach((q, i) => {
    for (const x of ((payload(loads[i] ?? { s: "skip" })?.profiles ?? []) as AnyRec[])) {
      const k = String(x.url ?? "").toLowerCase().replace(/\/+$/, "");
      if (!k || !urlHolds(String(x.url), q.username)) continue;
      const p = byUrl.get(k) ?? { site: String(x.site ?? host(String(x.url))), url: String(x.url), usernames: [], via: new Set<CriterionKey>(), emailAccount: false };
      if (!p.usernames.includes(q.username)) p.usernames.push(q.username);
      q.via.forEach((v) => p.via.add(v));
      p.emailAccount = accountSites.has(siteKey(p.site));
      byUrl.set(k, p);
    }
  });
  return [...byUrl.values()].sort((a, b) => Number(b.emailAccount) - Number(a.emailAccount) || b.via.size - a.via.size || a.site.localeCompare(b.site));
}

/** Usernames taken on so many sites that they are common words rather than anyone's handle. */
function commonUsernames(profiles: Prof[]): Set<string> {
  const n = new Map<string, number>();
  for (const p of profiles) for (const u of p.usernames) n.set(u, (n.get(u) ?? 0) + 1);
  return new Set([...n].filter(([, k]) => k >= COMMON_USERNAME).map(([u]) => u));
}

type Mention = { url: string; title: string; content: string; date?: string; clues: CriterionKey[] };
/** Which clues a page names: every word of the name, the email, the phone's last nine digits, the IP, the username. */
function cluesIn(text: string, c: Criteria): CriterionKey[] {
  const t = text.toLowerCase();
  const out: CriterionKey[] = [];
  if (c.name) {
    const words = c.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    const plain = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    const flat = ` ${plain.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
    const ws = words.join(" ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
    const ends = [ws[0] ?? "", ws[ws.length - 1] ?? ""];
    const named = (x: string[]) => x.length > 1 && flat.includes(` ${x.join(" ")} `);
    // the name as people write it: in order, surname first, or first and last name without the middle ones
    if (named(ws) || named([...ws].reverse()) || named(ends) || named([...ends].reverse())) out.push("name");
  }
  if (c.email && t.includes(c.email)) out.push("email");
  // the last nine digits in a row, as pages write them: with or without spaces, dots, dashes or brackets between
  if (c.phone && new RegExp(digitsOf(c.phone).slice(-9).split("").join("[ ().-]?")).test(t)) out.push("phone");
  if (c.ip && t.includes(c.ip.toLowerCase())) out.push("ip");
  if (c.username && t.includes(c.username.toLowerCase())) out.push("username");
  return out;
}
function mergeWeb(queries: { key: CriterionKey; value: string }[], loads: Load[], c: Criteria): Mention[] {
  const byUrl = new Map<string, Mention>();
  queries.forEach((_, i) => {
    const l = loads[i];
    if (!l || l.s !== "ready") return;
    for (const r of ((l.data?.results ?? []) as AnyRec[])) {
      const k = String(r.url ?? "").toLowerCase().replace(/\/+$/, "");
      if (!k) continue;
      const m = byUrl.get(k) ?? { url: String(r.url), title: String(r.title ?? r.url), content: String(r.content ?? ""), date: r.date ? String(r.date) : undefined, clues: [] };
      // only clues the page itself shows count; a search engine also answers with near matches
      const found = new Set<CriterionKey>([...m.clues, ...cluesIn(`${r.title ?? ""} ${r.content ?? ""} ${r.url ?? ""}`, c)]);
      m.clues = CRITERION_ORDER.filter((x) => found.has(x));
      byUrl.set(k, m);
    }
  });
  return [...byUrl.values()].sort((a, b) => b.clues.length - a.clues.length);
}

/** Country codes in email domains that are used worldwide as brands, so they say nothing about where a person is. */
const BRAND_TLDS = new Set(["io", "ai", "me", "tv", "co", "ly", "gg", "fm", "am", "to", "cc", "ws", "sh", "so", "app", "dev"]);

type Evidence = { strength: Strength; text: string; detail?: string };
/** What the clues say about each other: links that tie them to one person, and the places they disagree. */
function buildEvidence(c: Criteria, l: Record<string, Load>, profiles: Prof[], mentions: Mention[], queries: { username: string; via: CriterionKey[] }[], common: Set<string>): Evidence[] {
  const out: Evidence[] = [];
  // the carrier's own records for the name on the number
  const tw = (payload(l.phone ?? { s: "skip" })?.line_intelligence?.data ?? {}) as AnyRec;
  const im = tw.identity_match as AnyRec | undefined;
  if (c.name && im) {
    if (im.error_code) out.push({ strength: "unchecked", text: "The carrier could not compare the name with the number", detail: TWILIO_ERROR[Number(im.error_code)] ?? `Code ${im.error_code}` });
    else {
      const ok = (v: unknown) => v === "exact_match" || v === "high_partial_match";
      const fields = Object.entries(im).filter(([k]) => /_match$/.test(k));
      const good = fields.filter(([, v]) => ok(v)).map(([k]) => registerWords(k.replace(/_match$/, "")).toLowerCase());
      const bad = fields.filter(([, v]) => v === "no_match").map(([k]) => registerWords(k.replace(/_match$/, "")).toLowerCase());
      if (good.length) out.push({ strength: "strong", text: `The carrier's record for ${c.phone} matches the ${listWords(good)}`, detail: `Identity match for ${c.name}` });
      if (bad.length) out.push({ strength: "conflict", text: `The carrier's record for ${c.phone} does not match the ${listWords(bad)}`, detail: `Identity match for ${c.name}` });
    }
  }
  // a site where the email has an account and a profile under one of the usernames exists: the same site, which
  // supports the link but does not show it is the same account (a common username proves nothing, so it is left out)
  const bySite = new Map<string, Prof[]>();
  for (const p of profiles.filter((x) => x.emailAccount && x.usernames.some((u) => !common.has(u)))) bySite.set(siteKey(p.site), [...(bySite.get(siteKey(p.site)) ?? []), p]);
  for (const ps of [...bySite.values()].slice(0, 6)) {
    const names = [...new Set(ps.flatMap((p) => p.usernames.filter((u) => !common.has(u))))].map((u) => `“${u}”`);
    out.push({ strength: "medium", text: `${ps[0]!.site}: the email has an account there, and ${names.length > 1 ? `profiles named ${listWords(names)} exist` : `a profile named ${names[0]} exists`}`, detail: ps.map((p) => p.url).join("   ") });
  }
  // the recovery phone a site shows, against the phone given: four digits or more is a strong match, fewer only supports it
  const accounts = (payload(l.accounts ?? { s: "skip" })?.accounts ?? []) as AnyRec[];
  if (c.phone)
    for (const a of accounts) {
      const h = hintTail(a.phone_hint, c.phone);
      if (!h) continue;
      if (h.fits) out.push({ strength: h.tail.length >= 4 ? "strong" : "medium", text: `${sentence(a.site)} shows a recovery phone ending in ${h.tail}, the same as the phone given`, detail: String(a.phone_hint) });
      else out.push({ strength: "conflict", text: `${sentence(a.site)} shows a recovery phone ending in ${h.tail}, not the phone given`, detail: String(a.phone_hint) });
    }
  // one username that two clues lead to
  for (const q of queries.filter((x) => x.via.length > 1 && !common.has(x.username)))
    out.push({ strength: "medium", text: `The username “${q.username}” follows from both ${q.via.map((v) => (v === "name" ? "the name" : v === "email" ? "the email" : "the username given")).join(" and ")}` });
  // the email address built from the name
  if (c.email && c.name) {
    const local = (c.email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const words = c.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z]/g, "")).filter((w) => w.length > 2);
    const hits = words.filter((w) => local.includes(w));
    if (hits.length) out.push({ strength: hits.length > 1 ? "medium" : "weak", text: `The email address contains ${hits.length > 1 ? "the name" : `“${hits[0]}” from the name`}` });
  }
  // pages that name two clues together
  for (const m of mentions.filter((x) => x.clues.length > 1).slice(0, 5))
    out.push({ strength: "strong", text: `${host(m.url)} names the ${listWords(m.clues.map((k) => CRITERION_WORD[k].toLowerCase()))} together`, detail: m.title });
  // where each clue points
  const places: { from: string; code: string }[] = [];
  if (c.country) places.push({ from: "the country given", code: c.country.toLowerCase() });
  const ph = payload(l.phone ?? { s: "skip" }) ?? {};
  const phoneCountry = ph.validity?.data?.country ?? ph.confirm?.data?.country_code;
  if (phoneCountry) places.push({ from: "the phone", code: String(phoneCountry).toLowerCase() });
  const an = (l.analysis?.s === "ready" ? l.analysis.data : {}) as AnyRec;
  const hidden = an.flags?.tor || an.flags?.vpn;
  if (an.geo?.countryCode && !hidden) places.push({ from: "the IP address", code: String(an.geo.countryCode).toLowerCase() });
  if (hidden) out.push({ strength: "unchecked", text: "The IP address hides where it is (VPN or Tor), so its country is not compared" });
  const tld = c.email?.split(".").pop()?.toLowerCase();
  if (tld && tld.length === 2 && !BRAND_TLDS.has(tld)) places.push({ from: "the email domain", code: tld === "uk" ? "gb" : tld });
  const codes = [...new Set(places.map((x) => x.code))];
  if (places.length > 1 && codes.length === 1)
    out.push({ strength: "medium", text: `${capital(listWords(places.map((x) => x.from)))} ${places.length === 2 ? "both" : "all"} point to ${countryName(codes[0], {}, true)}` });
  if (codes.length > 1) out.push({ strength: "conflict", text: "The clues point to different countries", detail: places.map((x) => `${capital(x.from)}: ${countryName(x.code, {}, true)}`).join("; ") });
  const order: Strength[] = ["strong", "conflict", "medium", "weak", "unchecked"];
  return out.sort((a, b) => order.indexOf(a.strength) - order.indexOf(b.strength));
}

/** The risks the sources raised, for the headline. */
function contactRisks(c: Criteria, l: Record<string, Load>): { tone: KitTone; text: string }[] {
  const out: { tone: KitTone; text: string }[] = [];
  if (c.email && l.mailbox?.s === "ready") out.push(...checkVerdict("mailbox", (l.mailbox.data.mailbox ?? {}) as AnyRec).filter((x) => x.tone !== "inert"));
  const tw = (payload(l.phone ?? { s: "skip" })?.line_intelligence?.data ?? {}) as AnyRec;
  if (c.phone && l.phone?.s === "ready") {
    if (tw.valid === false) out.push({ tone: "danger", text: "Phone not valid" });
    if (tw.line_status?.status === "inactive") out.push({ tone: "danger", text: "Line inactive" });
    if (virtualLine(tw.line_type_intelligence?.type)) out.push({ tone: "caution", text: "Virtual (VoIP) number" });
    if (Number(tw.sms_pumping_risk?.sms_pumping_risk_score) >= 75) out.push({ tone: "danger", text: "High SMS pumping risk" });
  }
  const f = ((l.analysis?.s === "ready" ? l.analysis.data.flags : null) ?? {}) as AnyRec;
  const d = (l.ip?.s === "ready" ? l.ip.data : {}) as AnyRec;
  if (f.tor || d.abuse?.data?.isTor) out.push({ tone: "danger", text: "Tor exit node" });
  if (f.spamhausDrop) out.push({ tone: "danger", text: "Spamhaus DROP" });
  if (f.vpn) out.push({ tone: "caution", text: "VPN" });
  if (f.datacenter || d.geo?.data?.hosting) out.push({ tone: "caution", text: "Hosting or data centre" });
  const s = Number(d.abuse?.data?.abuseConfidenceScore ?? 0);
  if (s >= 25) out.push({ tone: s >= 75 ? "danger" : "caution", text: `Abuse confidence ${s}%` });
  return out;
}

function EvidenceSection({ items, pending }: { items: Evidence[]; pending: number }) {
  return (
    <Tile className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle count={items.length}>Linked evidence</SectionTitle>
        {pending > 0 && (
          <span className="inline-flex items-center gap-1.5 text-micro text-slate">
            <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
            Updates as the {pending} remaining source{pending === 1 ? "" : "s"} answer
          </span>
        )}
      </div>
      <p className="m-0 text-micro text-slate">What the clues say about each other. A strong link ties two clues to one person; a conflict is worth asking about.</p>
      {items.length ? (
        <div className="flex flex-col">
          {items.map((e, i) => (
            <div key={i} className="grid grid-cols-[110px_1fr] items-start gap-3 border-t border-rule py-2.5 first:border-t-0 first:pt-0">
              <span>
                <LinkChip strength={e.strength}>{STRENGTH[e.strength].word}</LinkChip>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body text-pine">{e.text}</span>
                {e.detail && <span className="truncate text-micro text-slate">{e.detail}</span>}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 text-body text-inert">{pending ? "Nothing yet." : "The sources found nothing that ties these clues together."}</p>
      )}
    </Tile>
  );
}

function ProfilesMerged({ queries, loads, profiles, common }: { queries: { username: string; via: CriterionKey[] }[]; loads: Load[]; profiles: Prof[]; common: Set<string> }) {
  const [showCommon, setShowCommon] = useState(false);
  if (!queries.length) return null;
  const taken = (u: string) => profiles.filter((p) => p.usernames.includes(u)).length;
  const onlyCommon = (p: Prof) => p.usernames.every((u) => common.has(u));
  const folded = profiles.filter(onlyCommon).length;
  const shown = showCommon ? profiles : profiles.filter((p) => !onlyCommon(p));
  const pending = loads.filter((l) => l.s === "loading").length;
  const failed = loads.filter((l) => l.s === "error").length;
  const any = loads.some((l) => l.s === "ready");
  return (
    <Tile className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle count={any ? profiles.length : undefined}>Profiles</SectionTitle>
        {pending > 0 && (
          <span className="inline-flex items-center gap-1.5 text-micro text-slate">
            <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
            {pending} of {queries.length} usernames still being searched, this takes up to two minutes
          </span>
        )}
      </div>
      <p className="m-0 flex flex-wrap items-center gap-1.5 text-micro text-slate">
        Usernames searched
        {queries.map((q) => (
          <Chip key={q.username} title={q.via.map((v) => VIA_WORD[v]).join(", ")}>
            {q.username}
          </Chip>
        ))}
        Profiles the email also has an account on come first. A matching username alone is a lead, not proof.
      </p>
      {common.size > 0 && (
        <p className="m-0 flex flex-wrap items-center justify-between gap-2 rounded-box bg-inert-tint px-3 py-2 text-micro text-inert">
          <span>
            {listWords([...common].map((u) => `“${u}” is taken on ${taken(u)} of the sites checked`))}, so {common.size > 1 ? "they are common usernames and say" : "it is a common username and says"} little about this person.
          </span>
          {folded > 0 && (
            <button type="button" onClick={() => setShowCommon((v) => !v)} className="font-medium text-pine underline-offset-2 hover:underline">
              {showCommon ? "Hide those profiles" : `Show those ${folded} profiles`}
            </button>
          )}
        </p>
      )}
      {failed > 0 && <p className="m-0 rounded-box bg-inert-tint px-3 py-2 text-micro text-inert">{failed} of the searches could not be completed. Search again to retry them.</p>}
      {!any && pending > 0 && (
        <div className="flex animate-pulse flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="h-7 rounded-well bg-well" />
          ))}
        </div>
      )}
      {any &&
        (shown.length ? (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((x) => (
              <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer nofollow" className={cn("flex min-w-0 items-center gap-3 rounded-well border px-3 py-2 text-body text-pine hover:bg-hover-light", x.emailAccount ? "border-pine/30 bg-lime-tint/40" : "border-hairline bg-page")}>
                <SiteLogo site={x.site} url={x.url} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{x.site}</span>
                    <span className="truncate text-micro text-slate">{host(x.url)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="font-mono text-[11.5px] text-slate">{x.usernames.join(", ")}</span>
                    {x.emailAccount && <LinkChip strength="medium">Email account here</LinkChip>}
                    {x.via.size > 1 && <LinkChip strength="medium">{x.via.size} clues</LinkChip>}
                  </span>
                </span>
              </a>
            ))}
          </div>
        ) : pending || folded ? null : (
          <p className="m-0 text-body text-inert">No public profile uses these usernames on the sites checked.</p>
        ))}
    </Tile>
  );
}

/** The platform's own logo on a white tile; its initial when there is no logo on file for it. */
function SiteLogo({ site, url }: { site: string; url: string }) {
  const src = siteIcon(site, url);
  const [broken, setBroken] = useState(false);
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-hairline bg-white">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={22} height={22} loading="lazy" decoding="async" onError={() => setBroken(true)} className="size-[22px] object-contain" />
      ) : (
        <span className="text-[14px] font-medium text-pine">{(site.trim()[0] ?? "?").toUpperCase()}</span>
      )}
    </span>
  );
}

type WebGate = "deciding" | "skipped" | "auto" | "asked";

function WebMerged({ queries, loads, mentions: all, gate, onRun }: { queries: { key: CriterionKey; value: string }[]; loads: Load[]; mentions: Mention[]; gate: WebGate; onRun: () => void }) {
  const [showLoose, setShowLoose] = useState(false);
  if (!queries.length) return null;
  if (gate === "deciding" || gate === "skipped")
    return (
      <Tile className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1">
          <SectionTitle>Mentions on the web</SectionTitle>
          <span className="text-micro text-slate">
            {gate === "deciding"
              ? "Checking our news and document archives first. The web is searched on its own only when they hold nothing on these clues."
              : "Not searched: our news and document archives already name these clues (see them in the Screening tab). The web is searched on its own only when they hold nothing."}
          </span>
        </span>
        {gate === "skipped" && (
          <button type="button" onClick={onRun} className={WEB_BUTTON}>
            <Globe aria-hidden className="size-3.5" strokeWidth={1.8} />
            Search the web too
          </button>
        )}
      </Tile>
    );
  const pending = loads.filter((l) => l.s === "loading").length;
  const any = loads.some((l) => l.s === "ready");
  // a page the search engine returned that names none of the clues word for word is a near match, folded away
  const loose = all.filter((m) => !m.clues.length).length;
  const mentions = showLoose ? all : all.filter((m) => m.clues.length);
  return (
    <Tile className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle count={any ? all.length - loose : undefined}>Mentions on the web</SectionTitle>
        {pending > 0 && (
          <span className="inline-flex items-center gap-1.5 text-micro text-slate">
            <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
            Searching the web
          </span>
        )}
      </div>
      <p className="m-0 flex flex-wrap items-center gap-x-2 text-micro text-slate">
        {gate === "auto" && "Searched because our news and document archives hold nothing on these clues. "}
        Pages that name more than one clue come first.
        {any && loose > 0 && (
          <button type="button" onClick={() => setShowLoose((v) => !v)} className="font-medium text-pine underline-offset-2 hover:underline">
            {showLoose ? "Hide near matches" : `Show ${loose} near match${loose === 1 ? "" : "es"} that name none of the clues word for word`}
          </button>
        )}
      </p>
      {!any && pending > 0 && (
        <div className="flex animate-pulse flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="h-7 rounded-well bg-well" />
          ))}
        </div>
      )}
      {any &&
        (mentions.length ? (
          <div className="flex flex-col">
            {mentions.slice(0, 20).map((m) => (
              <div key={m.url} className="flex flex-col gap-0.5 border-t border-rule py-2.5 first:border-t-0 first:pt-0">
                <span className="flex flex-wrap items-center gap-1.5 text-micro text-slate">
                  <Globe aria-hidden className="size-3" strokeWidth={2} />
                  {host(m.url)}
                  {m.date ? `, ${m.date.slice(0, 10)}` : ""}
                  {m.clues.map((k) => (
                    <LinkChip key={k} strength={m.clues.length > 1 ? "strong" : "weak"}>
                      {CRITERION_WORD[k]}
                    </LinkChip>
                  ))}
                </span>
                <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="text-body font-medium text-pine underline-offset-2 hover:underline">
                  {m.title}
                </a>
                {m.content && <span className="line-clamp-2 max-w-[90ch] text-micro text-slate">{m.content}</span>}
              </div>
            ))}
          </div>
        ) : pending ? null : (
          <p className="m-0 text-body text-inert">No page on the web names any of these clues word for word.</p>
        ))}
    </Tile>
  );
}

const CONTACT_SPECS: ChipSpec[] = CRITERION_ORDER.map((k) => ({
  key: k,
  word: CRITERION_WORD[k],
  ok: (v: string) => criterionOk(k, v),
  clean: (v: string) => criterionValue(k, v),
  show: k === "country" ? (v: string) => countryName(v, {}, true) : undefined,
  choose: k === "country" ? "country" : undefined,
  placeholder: k === "dob" ? "YYYY or YYYY-MM-DD" : k === "phone" ? "+250788123456" : k === "email" ? "name@example.com" : k === "ip" ? "IPv4 or IPv6 address" : undefined,
  mono: k === "email" || k === "phone" || k === "ip" || k === "username" || k === "dob",
}));

/** Everything the sources know about the clues given (any mix of name, email, phone, username, IP, country, date of
 *  birth), run together and cross-checked. Each source fills its own section; sanctions stay in the Screening tab. */
function InvestigationView({ data }: { data: AnyRec }) {
  const [c, setC] = useState<Criteria>(data.criteria as Criteria);
  const enc = encodeURIComponent;
  const nameParts = c.name ? c.name.split(" ") : [];
  const phoneQuery = c.phone
    ? new URLSearchParams({
        phone: c.phone,
        ...(nameParts.length > 1 ? { first_name: nameParts[0]!, last_name: nameParts[nameParts.length - 1]! } : {}),
        ...(c.dob && /^\d{4}-\d{2}-\d{2}$/.test(c.dob) ? { dob: c.dob } : {}),
        ...(c.country ? { country: c.country } : {}),
      })
    : null;
  const queries = profileQueries(c);
  const webs = webQueries(c);
  const l: Record<string, Load> = {
    mailbox: useLoad(c.email ? `/api/explorer/check/email?email=${enc(c.email)}` : null),
    accounts: useLoad(c.email ? `/api/explorer/intel/email/accounts?email=${enc(c.email)}` : null),
    phone: useLoad(phoneQuery ? `/api/explorer/intel/phone?${phoneQuery}` : null),
    ip: useLoad(c.ip ? `/api/explorer/check/ip?ip=${enc(c.ip)}` : null),
    analysis: useLoad(c.ip ? `/api/explorer/intel/ip/analysis?ip=${enc(c.ip)}` : null),
  };
  const usernameUrl = (i: number) => (queries[i] ? `/api/explorer/intel/username?username=${enc(queries[i]!.username)}` : null);
  // our own news and documents for the name (or username), the email and the phone: not shown here (they belong to
  // Screening), only asked to decide whether the web is needed
  const newsQ: DocQuery | undefined = c.name ? { query: c.name, clue: "name" } : c.username ? { query: c.username, clue: "username" } : undefined;
  const docQs: DocQuery[] = [newsQ, c.email ? { query: c.email, clue: "email" as const } : undefined, c.phone ? { query: c.phone, clue: "phone" as const } : undefined].filter((x): x is DocQuery => !!x);
  const news = useLoad(newsQ ? `/api/explorer/media?${new URLSearchParams({ q: newsQ.query })}` : null);
  const docUrl = (i: number) => (docQs[i] ? `/api/explorer/documents?${new URLSearchParams({ q: docQs[i]!.query })}` : null);
  const dl = [useLoad(docUrl(0)), useLoad(docUrl(1)), useLoad(docUrl(2))];
  const ownLoads = [news, ...dl.slice(0, docQs.length)];
  const ownHits =
    (newsQ ? strictCount(news, clueMatcher(newsQ.clue, newsQ.query), newsText).n : 0) +
    docQs.reduce((sum, q, i) => sum + strictCount(dl[i]!, clueMatcher(q.clue, q.query), docText).n, 0);
  // the web is searched on its own only when our news and documents hold nothing on these clues
  const [webAsked, setWebAsked] = useState(false);
  const webGate: WebGate = webAsked ? "asked" : ownLoads.some((x) => x.s === "loading") ? "deciding" : ownHits === 0 ? "auto" : "skipped";
  const webOn = webGate === "asked" || webGate === "auto";
  const webUrl = (i: number) => (webOn && webs[i] ? `/api/explorer/web?${new URLSearchParams({ q: webs[i]!.value, mode: "all" })}` : null);
  const pl = [useLoad(usernameUrl(0)), useLoad(usernameUrl(1)), useLoad(usernameUrl(2)), useLoad(usernameUrl(3))];
  const wl = [useLoad(webUrl(0)), useLoad(webUrl(1)), useLoad(webUrl(2)), useLoad(webUrl(3))];
  const accountSites = new Set(((payload(l.accounts!)?.accounts ?? []) as AnyRec[]).map((a) => siteKey(a.site)));
  const merged = mergeProfiles(queries, pl, accountSites);
  const common = commonUsernames(merged);
  const rare = (p: Prof) => p.usernames.some((u) => !common.has(u));
  const profiles = [...merged].sort((a, b) => Number(rare(b)) - Number(rare(a)));
  const mentions = mergeWeb(webs, wl, c);
  const evidence = buildEvidence(c, l, profiles, mentions, queries, common);
  const risks = contactRisks(c, l);
  const pending = [...Object.values(l), ...pl, ...wl, ...ownLoads].filter((x) => x.s === "loading").length;
  const count = (st: Strength) => evidence.filter((e) => e.strength === st).length;
  const many = CRITERION_ORDER.filter((k) => c[k]).length > 1;
  return (
    <Panel>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-micro text-slate">Investigation</span>
            <ChipFilters specs={CONTACT_SPECS} value={c} onChange={(v) => setC(v as Criteria)} keepOne addWord="+ Add a clue" />
          </div>
          <span className="flex flex-wrap items-center gap-1.5">
            {many && count("strong") > 0 && <LinkChip strength="strong">{count("strong")} strong link{count("strong") === 1 ? "" : "s"}</LinkChip>}
            {many && count("conflict") > 0 && <LinkChip strength="conflict">{count("conflict")} conflict{count("conflict") === 1 ? "" : "s"}</LinkChip>}
            {risks.map((x) => (
              <Tag key={x.text} tone={x.tone} check={x.tone === "approve"}>
                {x.text}
              </Tag>
            ))}
            {pending > 0 && (
              <span className="inline-flex items-center gap-1.5 text-micro text-slate">
                <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
                {pending} source{pending === 1 ? "" : "s"} still working
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {many && <EvidenceSection items={evidence} pending={pending} />}
        {c.email && <EmailSections mailbox={l.mailbox!} accounts={l.accounts!} profileSites={new Set(profiles.filter(rare).map((p) => siteKey(p.site)))} />}
        {c.phone && <PhoneSections phone={l.phone!} />}
        {c.ip && <IpSections analysis={l.analysis!} ip={l.ip!} />}
        <ProfilesMerged queries={queries} loads={pl.slice(0, queries.length)} profiles={profiles} common={common} />
        <WebMerged queries={webs} loads={wl.slice(0, webs.length)} mentions={mentions} gate={webGate} onRun={() => setWebAsked(true)} />
        {(c.name || c.dob) && <p className="m-0 text-micro text-slate">To check the name against sanctions, PEP and crime lists, search it in the Screening tab.</p>}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- wallets (crypto address screening) -- */

const VERDICT: Record<string, { tone: KitTone; label: string }> = {
  sanctioned: { tone: "danger", label: "Sanctioned" },
  illicit: { tone: "danger", label: "Illicit activity" },
  formerly_sanctioned: { tone: "caution", label: "Formerly sanctioned" },
  scheme_participant: { tone: "caution", label: "Scheme participant" },
  named_in_risk_list: { tone: "caution", label: "Named in a risk list" },
  risk_attribution: { tone: "caution", label: "Risk attribution" },
  service: { tone: "inert", label: "Known service" },
  mentioned: { tone: "inert", label: "Mentioned" },
  no_record: { tone: "inert", label: "No record" },
  unreadable: { tone: "inert", label: "Unreadable" },
  invalid_address: { tone: "caution", label: "Not a valid address" },
  // a listing that a curated source contradicts (for example a stablecoin's own token contract)
  disputed_listing: { tone: "caution", label: "Disputed listing" },
  unrecognised: { tone: "caution", label: "Not a recognised address" },
};

/** Networks under one name each (sources spell them eth / ethereum, btc / bitcoin / xbt...). */
const NETWORK: Record<string, string> = {
  eth: "Ethereum", ethereum: "Ethereum", btc: "Bitcoin", bitcoin: "Bitcoin", xbt: "Bitcoin", trx: "Tron", tron: "Tron",
  bsc: "BNB Smart Chain", bnb: "BNB Smart Chain", ltc: "Litecoin", litecoin: "Litecoin", arbitrum: "Arbitrum", polygon: "Polygon",
  matic: "Polygon", avalanche: "Avalanche", avax: "Avalanche", optimism: "Optimism", base: "Base", solana: "Solana", sol: "Solana",
  fantom: "Fantom", gnosis: "Gnosis", celo: "Celo", ton: "TON", sui: "Sui", doge: "Dogecoin", bch: "Bitcoin Cash", dash: "Dash",
  cardano: "Cardano", algorand: "Algorand", mantle: "Mantle", scroll: "Scroll", blast: "Blast", arb: "Arbitrum", xrp: "XRP",
  "hedera-hashgraph": "Hedera", evm: "EVM chain",
};
const network = (n?: string) => (n ? NETWORK[n.toLowerCase()] ?? n : "");

/** Source ids ("GraphSense:ofac", "chainalysis_oracle_event:arbitrum:Chainalysis_Sanctions_Oracle") in readable form. */
const SOURCE_NAME: Record<string, string> = {
  graphsense: "GraphSense", chainalysis_oracle_event: "Chainalysis sanctions oracle", sanctions_oracle: "Sanctions oracle",
  stablecoin_multichain: "Stablecoin issuer blacklist", ofac: "OFAC", ofac_sdn: "OFAC SDN list", opensanctions: "OpenSanctions",
};
function sourceName(s: string) {
  const [head = "", ...rest] = s.split(":");
  const base = SOURCE_NAME[head.toLowerCase()] ?? registerWords(head);
  if (head.toLowerCase() === "graphsense" && rest.length) return `${SOURCE_NAME[rest[0]!.toLowerCase()] ?? rest[0]!.toUpperCase()} (via GraphSense)`;
  if (head.toLowerCase() === "chainalysis_oracle_event" && rest.length) return `${base} (${network(rest[0])})`;
  const detail = rest.filter((x) => x && !/sanctions_oracle$/i.test(x)).map((x) => registerWords(x).toLowerCase()).join(", ");
  return detail ? `${base} (${detail})` : base;
}
/** A source as an operator should read it: batch and build markers ("round1", "r1", "hf") are not part of its name. */
function cleanSource(s: string) {
  if (/^usdc$/i.test(s.trim())) return "USDC issuer blacklist (Circle)";
  if (/^usdt$/i.test(s.trim())) return "USDT issuer blacklist (Tether)";
  const n = sourceName(s)
    .replace(/\s*\(blacklisted\)/i, "")
    .replace(/\b(round ?\d+|r\d+|hf|v\d+)\b/gi, "")
    .replace(/\s*\+\s*/g, " and ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}
/** Lists an authority or the asset's issuer keeps; everything else is research or community data. */
const official = (s: string) => /ofac|sanction|blacklist|usdc|usdt|tether|circle|fbi|treasury/i.test(s);

function Sources({ values }: { values: unknown }) {
  const names = uniqueCI(strings(values).map(cleanSource)).filter(Boolean);
  if (!names.length) return <span className="text-muted">Not stated</span>;
  const named = names.filter(official);
  const rest = names.filter((n) => !official(n));
  return (
    <span className="flex flex-wrap items-center gap-1">
      {named.slice(0, 3).map((n) => (
        <Chip key={n}>{n}</Chip>
      ))}
      {(named.length > 3 || rest.length > 0) && (
        <span title={[...named.slice(3), ...rest].join(", ")} className="text-micro text-slate">
          {named.length > 3 ? `${named.length - 3 + rest.length} more` : `${rest.length} research list${rest.length === 1 ? "" : "s"}`}
        </span>
      )}
    </span>
  );
}

/** Wallet listing categories in the same keywords as the screening results. */
const WALLET_CATEGORY: Record<string, string> = {
  sanctions: "Sanction", sanctions_removed: "Formerly listed", scam: "Scam", phishing: "Phishing", ransomware: "Ransomware", mixer: "Mixer",
  heist: "Hack or theft", hack: "Hack or theft", darknet: "Darknet market", fraud: "Fraud", terrorism: "Terrorism", terrorist_financing: "Terrorism",
  gambling: "Gambling", ponzi: "Ponzi scheme", extortion: "Extortion", laundering: "Financial crime", money_laundering: "Financial crime",
};
const walletCategory = (c: string) => WALLET_CATEGORY[c.toLowerCase()] ?? sentence(c);

const RISK_LEVEL: Record<string, { tone: KitTone; label: string }> = {
  high: { tone: "danger", label: "High risk" },
  medium: { tone: "caution", label: "Medium risk" },
  low: { tone: "inert", label: "Low risk" },
  unknown: { tone: "inert", label: "Not rated" },
};
const words = (v: unknown) => String(v ?? "").replaceAll("_", " ");
const sentence = (v: unknown) => {
  const w = words(v).trim();
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : "";
};
const strings = (v: unknown) => uniqueCI(Array.isArray(v) ? v : []);

function VerdictPill({ verdict }: { verdict?: string }) {
  const v = VERDICT[verdict ?? "no_record"] ?? VERDICT.no_record!;
  return (
    <Tag tone={v.tone}>{v.label}</Tag>
  );
}

function RiskLevel({ risk }: { risk?: string }) {
  const r = RISK_LEVEL[risk ?? "unknown"] ?? RISK_LEVEL.unknown!;
  return <Tag tone={r.tone}>{r.label}</Tag>;
}

function checksumWords(format?: AnyRec) {
  if (!format) return "";
  return format.valid === false ? "Invalid address" : format.checksum === true ? "Checksum correct" : format.valid === true ? "Format correct, no checksum" : "Format not checked for this network";
}

function WalletSection({ title, count, note, children }: { title: string; count: number; note?: string; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle count={count}>{title}</SectionTitle>
      {note && <p className="m-0 text-micro text-slate">{note}</p>}
      {children}
    </div>
  );
}

function WalletDetail({ d, bare }: { d: AnyRec; bare?: boolean }) {
  const listings = (d.listings ?? []) as AnyRec[];
  const disputed = (d.disputed_by ?? []) as AnyRec[];
  const schemes = (d.schemes ?? []) as AnyRec[];
  const attributions = (d.attributions ?? []) as AnyRec[];
  const mentions = (d.mentions ?? []) as AnyRec[];
  const v = VERDICT[d.verdict ?? "no_record"] ?? VERDICT.no_record!;
  const body = (
    <>
      <Tile className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-box", v.tone === "danger" ? "bg-danger-tint text-danger" : v.tone === "caution" ? "bg-caution-tint text-caution" : v.tone === "approve" ? "bg-approve-tint text-approve" : "bg-well text-pine")}>
            <Wallet className="size-[18px]" strokeWidth={1.8} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-mono text-[13px] leading-5 break-all text-pine">{d.address}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-slate">
              {d.format?.network && <span>{network(d.format.network)}</span>}
              {d.format && <span className={d.format.valid === false ? "text-danger" : undefined}>{checksumWords(d.format)}</span>}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <VerdictPill verdict={d.verdict} />
            {d.risk && d.risk !== "unknown" && <RiskLevel risk={d.risk} />}
          </div>
        </div>
        {walletSummary(d) && <p className="m-0 max-w-[80ch] text-body text-pine">{walletSummary(d)}</p>}
        {d.format?.note && !String(d.summary ?? "").toLowerCase().includes(String(d.format.note).toLowerCase().slice(0, 30)) && (
          <p className="m-0 text-micro text-slate">{d.format.note}</p>
        )}
      </Tile>
      <WalletSection title="Where it is listed" count={listings.length}>
        <Rows
          cols={[
            { key: "net", header: "Network", width: 3 },
            { key: "cat", header: "Listed as", width: 4 },
            { key: "risk", header: "Risk class", width: 2 },
            { key: "victim", header: "Victim contract", width: 2 },
            { key: "src", header: "Sources", width: 6 },
          ]}
          minWidth={720}
          rows={listings.map((x) => ({
            net: network(x.network) || null,
            cat: (
              <span className="flex flex-wrap gap-1">
                {strings(x.categories).map((c) => (
                  <Tag key={c} tone={c === "sanctions_removed" || (c === "sanctions" && d.verdict === "formerly_sanctioned") ? "caution" : c === "sanctions" || x.risk_class === "illicit" ? "danger" : "inert"}>
                    {c === "sanctions" && d.verdict === "formerly_sanctioned" ? "Formerly listed" : walletCategory(c)}
                  </Tag>
                ))}
                {x.subcategory && <Tag tone="danger">{sentence(x.subcategory)}</Tag>}
              </span>
            ),
            risk: x.risk_class ? registerWords(x.risk_class) : null,
            victim: x.victim_contract === true ? "Yes" : x.victim_contract === false ? "No" : null,
            src: <Sources values={x.sources} />,
          }))}
        />
      </WalletSection>
      <WalletSection title="Listing disputed by" count={disputed.length}>
        <Rows
          cols={[
            { key: "as", header: "Legitimate as", width: 4 },
            { key: "src", header: "Source", width: 4 },
            { key: "listed", header: "Listed as", width: 3 },
            { key: "net", header: "Network", width: 2 },
          ]}
          rows={disputed.map((x) => ({ as: x.legitimate_as, src: x.source ? cleanSource(String(x.source)) : null, listed: sentence(x.listed_as) || null, net: network(x.network) || null }))}
        />
      </WalletSection>
      <WalletSection title="Schemes" count={schemes.length} note="People in these schemes are often victims. This shows involvement, not intent.">
        <Rows
          cols={[
            { key: "scheme", header: "Scheme", width: 3 },
            { key: "role", header: "Role", width: 3 },
            { key: "first", header: "First seen", width: 2 },
            { key: "last", header: "Last seen", width: 2 },
            { key: "net", header: "Network", width: 2 },
          ]}
          rows={schemes.map((x) => ({
            scheme: sentence(x.scheme),
            role: x.role === "referrer" ? `Recruited others (${x.times})` : `Registered (${x.times} time${x.times === 1 ? "" : "s"})`,
            first: x.first_seen,
            last: x.last_seen,
            net: network(x.network) || null,
          }))}
        />
      </WalletSection>
      <WalletSection title="Attributions" count={attributions.length}>
        <Rows
          cols={[
            { key: "label", header: "Belongs to", width: 5 },
            { key: "kind", header: "Kind", width: 3 },
            { key: "net", header: "Network", width: 2 },
          ]}
          rows={attributions.map((x) => ({ label: x.label, kind: x.kind ? registerWords(x.kind) : null, net: network(x.network) || null }))}
        />
      </WalletSection>
      <WalletSection title="Mentioned in other data" count={mentions.length}>
        <Rows
          cols={[
            { key: "kinds", header: "Kinds of data", width: 5 },
            { key: "net", header: "Network (guessed)", width: 3 },
            { key: "files", header: "Files", width: 2, align: "right" },
          ]}
          rows={mentions.map((x) => ({
            kinds: strings(x.source_folders).map((f) => registerWords(f)).join(", ") || null,
            net: network(x.network) || null,
            files: strings(x.source_files).length || null,
          }))}
        />
      </WalletSection>
    </>
  );
  return bare ? <div className="flex flex-col gap-5">{body}</div> : <Panel className="gap-5">{body}</Panel>;
}

/** One sentence from the listings: what it is listed as, on which networks, and by whom (named lists first). */
function walletSummary(d: AnyRec): string {
  const listings = (d.listings ?? []) as AnyRec[];
  if (!listings.length) return String(d.summary ?? "");
  const nets = uniqueCI(listings.map((x) => network(x.network)).filter(Boolean));
  const cats = uniqueCI(listings.flatMap((x) => strings(x.categories)).map((c) => walletCategory(c)));
  const srcs = uniqueCI(listings.flatMap((x) => strings(x.sources)).map(cleanSource)).filter(Boolean);
  const named = srcs.filter(official);
  const rest = srcs.length - named.length;
  const by = [named.slice(0, 4).join(", "), named.length > 4 ? `${named.length - 4} more official lists` : "", rest ? `${rest} research list${rest === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
  return `Listed as ${cats.join(", ") || "a risk"} on ${nets.length} network${nets.length === 1 ? "" : "s"} (${nets.join(", ")})${by ? `, reported by ${by}` : ""}.`;
}

const RISK_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, unknown: 3 };

function WalletBatch({ data }: { data: AnyRec }) {
  const rows = [...((data.results ?? []) as AnyRec[])].sort((a, b) => (RISK_ORDER[a.risk] ?? 4) - (RISK_ORDER[b.risk] ?? 4));
  const [detail, setDetail] = useState<{ address: string; d: AnyRec | "loading" | "error" } | null>(null);
  const open = async (a: string) => {
    setDetail({ address: a, d: "loading" });
    const r = await getJson(`/api/explorer/crypto?${new URLSearchParams({ address: a })}`);
    setDetail((x) => (x && x.address === a ? { address: a, d: r.ok ? r.data : "error" } : x));
  };
  const c = (data.counts ?? {}) as AnyRec;
  const tiles: [string, number, KitTone][] = [
    ["High risk", Number(c.high ?? 0), "danger"],
    ["Medium risk", Number(c.medium ?? 0), "caution"],
    ["Low risk", Number(c.low ?? 0), "inert"],
    ["No record", Number(c.no_record ?? 0), "inert"],
    ["Invalid or unrecognised", Number(c.invalid_address ?? 0) + Number(c.unrecognised ?? 0) + Number(c.unreadable ?? 0), "inert"],
  ];
  return (
    <Panel>
      <h2 className="m-0 text-section font-medium text-pine">
        {Number(data.checked ?? rows.length).toLocaleString()} addresses checked
        <span className="ml-1.5 font-normal text-slate">highest risk first</span>
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map(([t, n, tone]) => (
          <span key={t} className="flex flex-col rounded-box border border-hairline bg-page px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-micro text-slate">
              <span aria-hidden className={cn("size-1.5 rounded-full", tone === "danger" ? "bg-danger" : tone === "caution" ? "bg-caution" : tone === "approve" ? "bg-approve" : "bg-muted")} />
              {t}
            </span>
            <span className="tnum text-section font-medium text-pine">{n.toLocaleString()}</span>
          </span>
        ))}
      </div>
      {Number(c.disputed_listing ?? 0) > 0 && <p className="m-0 text-micro text-caution">{c.disputed_listing} with a listing another source disputes.</p>}
      <Tile className="py-2">
        <Rows
          cols={[
            { key: "addr", header: "Address", width: 7 },
            { key: "verdict", header: "Verdict", width: 4 },
            { key: "net", header: "Network", width: 2 },
            { key: "open", header: "", width: 1, align: "right" },
          ]}
          minWidth={680}
          rows={rows.map((r) => ({
            addr: (
              <span className="flex flex-col">
                <span className="font-mono text-[12.5px] break-all">{r.address}</span>
                {r.format && <span className={cn("text-micro", r.format.valid === false ? "text-danger" : "text-slate")}>{checksumWords(r.format)}</span>}
              </span>
            ),
            verdict: (
              <span className="flex flex-wrap gap-1">
                <VerdictPill verdict={r.verdict} />
                {r.risk && r.risk !== "unknown" && <RiskLevel risk={r.risk} />}
              </span>
            ),
            net: network(r.format?.network) || null,
            open:
              r.verdict !== "unreadable" ? (
                <button type="button" onClick={() => void open(r.address)} aria-label="Open the details" className="inline-grid size-8 place-items-center rounded-full text-slate hover:bg-hover-light hover:text-pine">
                  <ChevronRight aria-hidden className="size-4" strokeWidth={2} />
                </button>
              ) : null,
          }))}
        />
      </Tile>
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        label="Wallet details"
        header={
          detail && (
            <div className="flex flex-col gap-1">
              <span className="text-micro text-slate">Wallet</span>
              <span className="font-mono text-[14px] break-all text-pine">{detail.address}</span>
            </div>
          )
        }
      >
        {detail?.d === "loading" && (
          <div className="flex animate-pulse flex-col gap-3">
            <span className="h-24 rounded-box bg-well" />
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="h-9 rounded-well bg-well" />
            ))}
          </div>
        )}
        {detail?.d === "error" && <p className="m-0 rounded-box bg-danger-tint px-4 py-3 text-body text-danger">The details could not be loaded. Close and try again.</p>}
        {detail && typeof detail.d === "object" && <WalletDetail d={detail.d} bare />}
      </Drawer>
    </Panel>
  );
}

function WalletResults({ data }: { data: AnyRec }) {
  return Array.isArray(data.results) ? <WalletBatch data={data} /> : <WalletDetail d={data} />;
}

function RiskPill({ risk }: { risk?: string }) {
  const r = RISK[risk ?? "info"] ?? RISK.info!;
  return <Tag tone={r.tone as KitTone}>{r.label}</Tag>;
}
const riskTone = (risk?: string): KitTone => (RISK[risk ?? "info"]?.tone as KitTone | undefined) ?? "inert";

/** AIS ship-type codes (ITU-R M.1371) in words; text types pass through. */
function shipType(t: string) {
  const n = Number(t);
  if (!/^\d{1,2}$/.test(String(t).trim()) || !Number.isFinite(n)) return t;
  if (n >= 20 && n <= 29) return "Wing in ground craft";
  const one: Record<number, string> = { 30: "Fishing", 31: "Towing", 32: "Towing (large)", 33: "Dredging or underwater work", 34: "Diving operations",
    35: "Military operations", 36: "Sailing", 37: "Pleasure craft", 50: "Pilot vessel", 51: "Search and rescue", 52: "Tug", 53: "Port tender",
    54: "Anti-pollution", 55: "Law enforcement", 58: "Medical transport", 59: "Non-combatant ship" };
  if (one[n]) return one[n]!;
  if (n >= 40 && n <= 49) return "High-speed craft";
  if (n >= 60 && n <= 69) return "Passenger ship";
  if (n >= 70 && n <= 79) return "Cargo ship";
  if (n >= 80 && n <= 89) return "Tanker";
  return "Other type";
}
/** Where a vessel or aircraft record came from, in words. */
const ASSET_SOURCE: Record<string, string> = {
  screening: "Sanctions and PEP lists", fleetleaks: "FleetLeaks", os_export: "OpenSanctions", os_africa_slice: "OpenSanctions (Africa)",
  wikidata: "Wikidata", ais: "AIS position data", opensky_db: "OpenSky aircraft database", flight_data_only: "Flight data only",
  ofac_sdn: "OFAC SDN list", un_sc: "UN Security Council list",
};
const assetSources = (v: unknown) => uniqueCI((Array.isArray(v) ? v : []).map((s) => ASSET_SOURCE[String(s)] ?? registerWords(String(s)))).join(", ") || null;
const TOPIC_WORDS: Record<string, string> = {
  sanction: "Sanctioned", "sanction.linked": "Linked to a sanctioned party", poi: "Person or asset of interest", "mare.detained": "Detained in port",
  "mare.shadow": "Shadow fleet", "mare.illegal": "Illegal fishing", debarment: "Debarred", "crime.war": "War crimes", "export.control": "Export control",
};
const topicWords = (t: string) => TOPIC_WORDS[t] ?? registerWords(t.replaceAll(".", " "));
const builtYear = (v: unknown) => {
  const s = String(v ?? "");
  if (!s || s.startsWith("0001")) return null;
  return s.match(/\b(1[89]|20)\d{2}\b/)?.[0] ?? s;
};
/** A timestamp with its zone stated: AIS and flight data are UTC, so a bare time is marked UTC. */
function utc(v: unknown) {
  if (!v) return "";
  const s = String(v).replace("T", " ");
  if (/(\+00:00|Z)$/.test(s)) return `${s.replace(/(\+00:00|Z)$/, "")} UTC`;
  if (/[+-]\d{2}:\d{2}$/.test(s)) return s;
  return `${s} UTC`;
}
/** A recorded position, with a map link so the operator can see where it is. */
function Position({ lat, lon, at }: { lat: unknown; lon: unknown; at?: unknown }) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return (
    <span className="flex flex-col">
      <a href={`https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=6/${la}/${lo}`} target="_blank" rel="noopener noreferrer nofollow" className="tnum inline-flex w-fit items-center gap-1 text-pine underline-offset-2 hover:underline">
        {la.toFixed(4)}, {lo.toFixed(4)}
        <ExternalLink aria-hidden className="size-3 text-slate" strokeWidth={2} />
      </a>
      {at ? <span className="text-micro text-slate">{utc(at)}</span> : null}
    </span>
  );
}
const TRACK_LIMIT = 2000;
const TRACK_MMSIS = 10;

/** The asset's own screening records, each opening the full profile. */
function ScreeningLinks({ ids, onOpen }: { ids: unknown; onOpen: (id: string) => void }) {
  const list = strings(ids);
  if (!list.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {list.slice(0, 6).map((id) => (
        <button key={id} type="button" onClick={() => onOpen(id)} className="inline-flex h-7 items-center gap-1 rounded-pill border border-edge bg-page px-2.5 text-micro text-pine hover:bg-hover-light">
          Open profile
          <span className="font-mono text-[11px] text-slate">{id.length > 18 ? `${id.slice(0, 16)}…` : id}</span>
        </button>
      ))}
      {list.length > 6 && <span className="text-micro text-slate">{list.length - 6} more</span>}
    </span>
  );
}

function AssetHead({ icon, name, ident, sub, risk, sanctioners, match }: { icon: "Vessel" | "Airplane"; name: string; ident: React.ReactNode; sub?: React.ReactNode; risk?: string; sanctioners?: string[]; match: AnyRec }) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <EntityGlyph schema={icon} tone={riskTone(risk)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] leading-5 font-medium text-pine">{name}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-slate">
          {ident}
          {sub}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <RiskPill risk={risk} />
        {(sanctioners ?? []).length > 0 && <span className="text-micro text-danger">by {(sanctioners ?? []).map((s) => s.toUpperCase()).join(", ")}</span>}
        {match.match === "exact" && (
          <Tag tone="approve" check>
            Exact match
          </Tag>
        )}
        {match.match === "similar" && <Tag tone="caution">Closest match, {Math.round(Number(match.score ?? 0) * 100)}%</Tag>}
      </div>
    </div>
  );
}

function AssetPanel({ noun, count, query, rows, children, trail, setTrail, bare }: { noun: string; count: number; query?: string; rows: AnyRec[]; children: React.ReactNode; trail: AnyRec[]; setTrail: (t: AnyRec[]) => void; bare?: boolean }) {
  if (bare)
    return (
      <div className="flex flex-col gap-3">
        {children}
        <ProfileDrawer trail={trail} setTrail={setTrail} labels={{}} />
      </div>
    );
  return (
    <Panel>
      <h2 className="m-0 text-section font-medium text-pine">
        {count.toLocaleString()} {noun}
        {count === 1 ? "" : "s"}
        {query && <span className="ml-1.5 font-normal text-slate">for “{query}”</span>}
      </h2>
      {rows.length > 0 && rows.every((r) => r.match === "similar") && (
        <p className="m-0 rounded-box bg-caution-tint px-4 py-2.5 text-micro text-caution">
          No exact match. These are the closest records. Check the details before relying on them.
        </p>
      )}
      <div className="flex flex-col gap-3">{children}</div>
      <ProfileDrawer trail={trail} setTrail={setTrail} labels={{}} />
    </Panel>
  );
}

function VesselResults({ data, query, bare }: { data: AnyRec; query?: string; bare?: boolean }) {
  // one track per ship: every MMSI it has used (ships change MMSI when they change flag), merged in time order. Each
  // MMSI's most recent positions are fetched, so a long history never hides the latest movements.
  const [track, setTrack] = useState<Record<string, AnyRec[] | "loading" | "error">>({});
  const [trail, setTrail] = useState<AnyRec[]>([]);
  const loadTrack = async (key: string, mmsis: string[]) => {
    setTrack((t) => ({ ...t, [key]: "loading" }));
    const use = mmsis.slice(0, TRACK_MMSIS);
    const parts = await Promise.all(use.map((m) => getJson(`/api/explorer/vessel/track?${new URLSearchParams({ mmsi: m, limit: String(TRACK_LIMIT), latest: "1" })}`)));
    if (parts.some((r) => !r.ok)) return setTrack((t) => ({ ...t, [key]: "error" }));
    const rows = parts
      .flatMap((r, i) => ((r.ok ? r.data.positions : []) as AnyRec[]).map((x): AnyRec => ({ ...x, mmsi: use[i] })))
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    setTrack((t) => ({ ...t, [key]: rows }));
  };
  const rows = (data.results ?? []) as AnyRec[];
  if (!rows.length) return <Empty icon={Ship} title="No vessel matches. Try the IMO number, an MMSI or another spelling of the name." />;
  const open = (id: string) => setTrail([{ id, caption: "Screening record", schema: "Vessel" }]);
  return (
    <AssetPanel noun="vessel" count={rows.length} query={query} rows={rows} trail={trail} setTrail={setTrail} bare={bare}>
      {rows.map((v) => {
        const t = track[v.vkey];
        const name = v.names?.[0] ?? "Unnamed vessel";
        return (
          <Tile key={v.vkey} className="flex flex-col gap-4">
            <AssetHead
              icon="Vessel"
              name={name}
              ident={v.imo ? <span className="inline-flex items-center gap-1.5">IMO number <Ident>{v.imo}</Ident></span> : <span>No IMO number recorded</span>}
              sub={(v.flags ?? []).length ? <span>Flag {uniqueCI((v.flags as string[]).map((f) => countryName(f, {}, true))).join(", ")}</span> : undefined}
              risk={v.risk_class}
              sanctioners={v.sanctioners}
              match={v}
            />
            <Facts
              facts={[
                { term: "Other names", detail: (() => { const o = uniqueCI((v.names ?? []).concat(v.aliases ?? [])).filter((n) => n.toLowerCase() !== String(name).toLowerCase()); return o.length ? <Many values={o} limit={3} /> : null; })() },
                { term: "Type", detail: list(uniqueCI((v.types ?? []).flatMap((x: string) => String(x).split(/\s*[,|]\s*/)).map(shipType))) },
                { term: "Built", detail: v.build_year },
                { term: "MMSI", detail: (v.mmsis ?? []).length ? <span className="flex flex-wrap gap-1">{(v.mmsis as string[]).slice(0, 6).map((m) => <Ident key={m}>{m}</Ident>)}</span> : null },
                { term: "Owner or operator", detail: list(v.owners) },
                { term: "Programmes", detail: programs(v.programs) },
                { term: "Risk categories", detail: (v.topics ?? []).length ? <span className="flex flex-wrap gap-1">{riskTags(v.topics, {}).map((t) => <Tag key={t.code} tone={t.tone} title={`${t.define} Topic code: ${t.code}`}>{categoryOf(t.code) ? t.label : topicWords(t.code)}</Tag>)}</span> : null },
                { term: "Detentions", detail: v.detentions ? `${v.detentions} (Abuja MoU records)` : (v.topics ?? []).includes("mare.detained") ? "Recorded as detained in port, count not available" : null },
                { term: "Sources", detail: assetSources(v.sources) },
              ]}
            />
            {(v.detention_records ?? []).length > 0 && (
              <div className="flex flex-col gap-1 rounded-box bg-caution-tint px-4 py-3 text-micro text-caution">
                {(v.detention_records as AnyRec[]).map((d, i) => (
                  <span key={i}>
                    Detained at {d.place} on {d.detained_on}
                    {d.released_on ? `, released ${d.released_on}` : ""} ({(d.deficiencies ?? []).length} deficiencies)
                  </span>
                ))}
              </div>
            )}
            {(v.ais_positions > 0 || v.reported_lat != null) && (
              <div className="flex flex-col gap-3 border-t border-rule pt-4">
                <SectionTitle>Positions</SectionTitle>
                <Facts
                  facts={[
                    { term: "AIS positions recorded", detail: v.ais_positions ? `${Number(v.ais_positions).toLocaleString()}, ${String(v.ais_first).slice(0, 10)} to ${String(v.ais_last).slice(0, 10)}` : null },
                    { term: "Latest AIS position", detail: v.ais_last_lat != null ? <Position lat={v.ais_last_lat} lon={v.ais_last_lon} at={v.ais_last} /> : null },
                    { term: "Reported position", detail: v.reported_lat != null ? <Position lat={v.reported_lat} lon={v.reported_lon} at={v.reported_at} /> : null },
                  ]}
                />
                {!t && v.ais_positions > 0 && (v.mmsis ?? []).length > 0 && (
                  <button type="button" onClick={() => loadTrack(v.vkey, v.mmsis)} className="inline-flex h-9 items-center gap-1.5 self-start rounded-pill border border-edge bg-page px-3.5 text-micro text-pine hover:bg-hover-light">
                    <Route aria-hidden className="size-3.5" strokeWidth={1.8} />
                    Show the AIS track
                  </button>
                )}
                {t === "loading" && (
                  <div className="flex animate-pulse flex-col gap-2">
                    {Array.from({ length: 4 }, (_, i) => (
                      <span key={i} className="h-8 rounded-well bg-well" />
                    ))}
                  </div>
                )}
                {t === "error" && <p className="m-0 text-micro text-danger">The track could not be loaded. Try again.</p>}
                {Array.isArray(t) && (
                  <>
                    {(t.length < Number(v.ais_positions ?? 0) || (v.mmsis ?? []).length > TRACK_MMSIS) && (
                      <p className="m-0 text-micro text-slate">
                        The most recent {t.length.toLocaleString()} of {Number(v.ais_positions ?? t.length).toLocaleString()} recorded positions
                        {(v.mmsis ?? []).length > TRACK_MMSIS ? `, from the first ${TRACK_MMSIS} of ${v.mmsis.length} MMSIs` : ""}, newest first.
                      </p>
                    )}
                    <TrackTable rows={t} multi={(v.mmsis ?? []).length > 1} />
                  </>
                )}
              </div>
            )}
            {(v.screening_ids ?? []).length > 0 && (
              <div className="flex flex-col gap-2 border-t border-rule pt-4">
                <span className="text-micro text-muted">Screening records</span>
                <ScreeningLinks ids={v.screening_ids} onOpen={open} />
              </div>
            )}
          </Tile>
        );
      })}
    </AssetPanel>
  );
}

function TrackTable({ rows, multi = false }: { rows: AnyRec[]; multi?: boolean }) {
  if (!rows.length) return <p className="m-0 text-micro text-muted">No positions recorded.</p>;
  return (
    <div className="max-h-[360px] overflow-auto rounded-box border border-hairline px-3">
      <Rows
        cols={[
          { key: "ts", header: "Time (UTC)", width: 4 },
          ...(multi ? [{ key: "mmsi", header: "MMSI", width: 3 }] : []),
          { key: "pos", header: "Position", width: 4 },
          { key: "sog", header: "Speed (knots)", width: 2, align: "right" as const },
          { key: "cog", header: "Course", width: 2, align: "right" as const },
        ]}
        minWidth={520}
        rows={rows.map((r) => ({
          ts: <span className="whitespace-nowrap">{String(r.ts).replace("T", " ").replace(/(\+00:00|Z)$/, "")}</span>,
          mmsi: r.mmsi,
          pos: `${Number(r.lat).toFixed(4)}, ${Number(r.lon).toFixed(4)}`,
          sog: r.sog ?? null,
          cog: r.cog ?? null,
        }))}
      />
    </div>
  );
}

function AircraftResults({ data, query, bare }: { data: AnyRec; query?: string; bare?: boolean }) {
  const [trail, setTrail] = useState<AnyRec[]>([]);
  const rows = (data.results ?? []) as AnyRec[];
  if (!rows.length) return <Empty icon={Plane} title="No aircraft matches. Try the registration, the transponder code, the owner or the operator." />;
  const open = (id: string) => setTrail([{ id, caption: "Screening record", schema: "Airplane" }]);
  return (
    <AssetPanel noun="aircraft" count={rows.length} query={query} rows={rows} trail={trail} setTrail={setTrail} bare={bare}>
      {rows.map((a) => (
        <Tile key={a.akey} className="flex flex-col gap-4">
          <AssetHead
            icon="Airplane"
            name={a.registrations?.[0] ?? a.icao24 ?? "Aircraft"}
            ident={a.icao24 ? <span className="inline-flex items-center gap-1.5">ICAO 24-bit address <Ident>{a.icao24}</Ident></span> : <span>No transponder code recorded</span>}
            sub={(a.countries ?? []).length ? <span>{uniqueCI((a.countries as string[]).map((c) => countryName(c, {}, true))).join(", ")}</span> : undefined}
            risk={a.risk_class}
            match={a}
          />
          <Facts
            facts={[
              { term: "Model", detail: list(a.models) },
              { term: "Manufacturer", detail: list(a.manufacturers) },
              { term: "Type code", detail: list(a.typecodes) },
              { term: "Serial number", detail: list(a.serials) },
              { term: "Operator", detail: list(a.operators) },
              { term: "Owner", detail: list(a.owners) },
              { term: "Other registrations", detail: list((a.registrations ?? []).slice(1)) },
              { term: "Built", detail: builtYear(a.built) },
              { term: "Programmes", detail: programs(a.programs) },
              {
                term: "Flight positions",
                detail: a.states
                  ? `${Number(a.states).toLocaleString()}${a.state_first ? `, ${utc(a.state_first)} to ${utc(a.state_last)}` : ""}`
                  : null,
              },
              { term: "Call signs", detail: uniqueCI(a.state_callsigns ?? []).length ? <span className="flex flex-wrap gap-1">{uniqueCI(a.state_callsigns).slice(0, 8).map((c) => <Ident key={c}>{c}</Ident>)}</span> : null },
              { term: "Sources", detail: assetSources(a.sources) },
            ]}
          />
          {(a.screening_ids ?? []).length > 0 && (
            <div className="flex flex-col gap-2 border-t border-rule pt-4">
              <span className="text-micro text-muted">Screening records</span>
              <ScreeningLinks ids={a.screening_ids} onOpen={open} />
            </div>
          )}
        </Tile>
      ))}
    </AssetPanel>
  );
}

/** Ownership-register codes (BODS / PSC) as plain words for the operator: "votingRights" -> "Voting rights". */
const REGISTER_WORDS: Record<string, string> = {
  noBeneficialOwners: "No beneficial owners declared",
  subjectUnableToConfirmOrIdentifyBeneficialOwner: "The company could not identify a beneficial owner",
  interestedPartyHasNotProvidedInformation: "The owner has not given the information",
  subjectExemptFromDisclosure: "The company is exempt from disclosure",
  interestedPartyExemptFromDisclosure: "The owner is exempt from disclosure",
  informationUnknownToPublisher: "Owner not known to the register",
  unknown: "Owner not known to the register",
};
function registerWords(code?: string) {
  if (!code) return "";
  if (REGISTER_WORDS[code]) return REGISTER_WORDS[code];
  const s = code.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function share(i: AnyRec) {
  if (i.share_exact != null) return `${i.share_exact}%`;
  if (i.share_min != null || i.share_max != null) return `${i.share_min ?? 0} to ${i.share_max ?? 100}%`;
  return "";
}

/** Where a relationship was asserted, in words an operator recognises. */
const GRAPH_SOURCE: Record<string, string> = {
  gleif: "GLEIF",
  bods_gleif: "GLEIF (beneficial ownership format)",
  bods_uk: "UK PSC register",
  psc: "UK PSC register",
  screening: "Sanctions and PEP lists",
  icij: "ICIJ Offshore Leaks",
  estonia: "Estonia beneficial ownership register",
  latvia: "Latvia beneficial ownership register",
  rpvs: "Slovakia public sector partners register",
  ukraine: "Ukraine beneficial ownership register",
};
const sourceWords = (s?: string) => (s ? GRAPH_SOURCE[s] ?? s : "");

/** What the listed party is to the record being viewed. "up" lists owners and parties above the record, "down" what the
 *  record owns or controls. Sources state each kind from the child's side, so the raw code alone reads backwards. */
const GRAPH_KIND: Record<string, { up: string; down: string }> = {
  IS_DIRECTLY_CONSOLIDATED_BY: { up: "Direct parent", down: "Subsidiary (directly consolidated)" },
  IS_ULTIMATELY_CONSOLIDATED_BY: { up: "Ultimate parent", down: "Subsidiary (ultimately consolidated)" },
  "IS_FUND-MANAGED_BY": { up: "Fund manager", down: "Fund it manages" },
  IS_SUBFUND_OF: { up: "Umbrella fund", down: "Sub-fund" },
  IS_FEEDER_TO: { up: "Master fund", down: "Feeder fund" },
  IS_INTERNATIONAL_BRANCH_OF: { up: "Head office", down: "International branch" },
  register_relationship: { up: "Owner or controller", down: "Owned or controlled entity" },
  Ownership: { up: "Owner", down: "Owned entity" },
  Directorship: { up: "Director or officer", down: "Directorship held" },
  Family: { up: "Family member", down: "Family member" },
  Associate: { up: "Associate", down: "Associate" },
  Membership: { up: "Organisation it belongs to", down: "Member" },
  Employment: { up: "Employer", down: "Employee" },
  Representation: { up: "Represented party", down: "Representative" },
  UnknownLink: { up: "Linked party", down: "Linked party" },
  Succession: { up: "Predecessor", down: "Successor" },
};
const kindWords = (k: unknown, way: string) => {
  const m = GRAPH_KIND[String(k ?? "")];
  return m ? (way === "down" ? m.down : m.up) : words(k);
};
const directWords = (d?: string) => (d === "direct" ? "(direct)" : d === "indirect" ? "(indirect)" : "");

const GRAPH_PAGE = 30;
/** Percentages as an operator reads them: at most two decimals, and nothing just under 100 rounded up to "100%". */
function pct(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  if (n > 99.99 && n < 100) return "over 99.99%";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : "");
/** Start and end of a link, from register fields or the source's own properties. */
function linkDates(rel?: AnyRec) {
  if (!rel) return "";
  const p = (rel.properties ?? {}) as AnyRec;
  const from = day(rel.start_date ?? p.startDate?.[0]);
  const to = day(rel.end_date ?? p.endDate?.[0]);
  if (from && to) return `${from} to ${to}`;
  if (from) return `since ${from}`;
  if (to) return `until ${to}`;
  return "";
}
/** The chain of link types an exposure was reached through, for example "Ownership, then Directorship". */
function pathWords(path: AnyRec[]) {
  return path.map((p) => `${words(p.kind).toLowerCase()} (${sourceWords(p.source)})`).join(", then ");
}

/** Parties a register declares but never names (for example a PSC statement with no registrable person) exist in the
 *  graph as placeholders whose id is an internal locator; describe them instead of showing that locator. */
const unnamedNode = (n?: AnyRec) => !n || n.unresolved === true || String(n.id ?? "").startsWith("unknown:");
const nodeLabel = (n?: AnyRec) => (unnamedNode(n) ? "Owner not named in the register" : n?.name || "Name not on record");

/** One row per related party; each source's assertion about that party is listed under it. */
type NodeGroup = { node: AnyRec; edges: AnyRec[] };
function byNode(results: AnyRec[]) {
  const out = new Map<string, NodeGroup>();
  results.forEach((r, i) => {
    const key = unnamedNode(r.node) ? `unnamed:${r.edge_id ?? i}` : String(r.node?.id ?? `row:${i}`);
    const g: NodeGroup = out.get(key) ?? { node: r.node ?? {}, edges: [] };
    g.edges.push(r);
    out.set(key, g);
  });
  return [...out.values()];
}

/** Ownership and links from the registers and lists, loaded when the panel opens. */
function GraphPanel({ id }: { id: string }) {
  const [current, setCurrent] = useState(id);
  const [direction, setDirection] = useState("up");
  const [depth, setDepth] = useState("3");
  // ofac: the OFAC 50% status of the record itself. It can only be worked out from a walk UP the ownership chain, so it
  // is always taken from an upward walk, whichever direction the operator is browsing.
  const [data, setData] = useState<{ neighbors: AnyRec; exposure: AnyRec; ofac?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const load = async (target = current, way = direction, steps = depth) => {
    const seq = ++sequence.current;
    setCurrent(target); setDirection(way); setDepth(steps); setBusy(true); setError(null);
    const query = new URLSearchParams({ id: target, direction: way, depth: steps, limit: String(GRAPH_PAGE) });
    const upQuery = new URLSearchParams({ id: target, direction: "up", depth: steps, limit: String(GRAPH_PAGE) });
    const [neighbors, exposure, upward] = await Promise.all([
      getJson(`/api/explorer/graph/neighbors?${query}`), getJson(`/api/explorer/graph/exposure?${query}`),
      way === "up" ? Promise.resolve(null) : getJson(`/api/explorer/graph/exposure?${upQuery}`),
    ]);
    if (seq !== sequence.current) return;
    setBusy(false);
    if (neighbors.ok && exposure.ok) {
      const ofac = way === "up" ? exposure.data.ofac_50_percent : upward?.ok ? upward.data.ofac_50_percent : undefined;
      setData({ neighbors: neighbors.data, exposure: exposure.data, ofac });
    } else {
      setData(null);
      const m = !neighbors.ok ? neighbors.message : !exposure.ok ? exposure.message : "";
      setError(m === "signin" ? "Sign in to view these links." : m === "Nothing found." ? "No ownership or links are recorded for this record." : m || "The links could not be loaded.");
    }
  };
  useEffect(() => () => { sequence.current++; }, []);
  useEffect(() => {
    // loads once per record, after the first paint; later loads come from the controls
    const t = setTimeout(() => void load(id, "up", "3"), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  /** The neighbour list is paged by the engine; the next page is appended to what is shown. */
  const loadMore = async () => {
    if (!data?.neighbors.next_offset) return;
    const seq = sequence.current;
    setMore(true);
    const query = new URLSearchParams({ id: current, direction, limit: String(GRAPH_PAGE), offset: String(data.neighbors.next_offset) });
    const page = await getJson(`/api/explorer/graph/neighbors?${query}`);
    if (seq !== sequence.current) return;
    setMore(false);
    if (!page.ok) { setError(page.message); return; }
    setData((d) => d && ({ ...d, neighbors: { ...page.data, results: [...(d.neighbors.results ?? []), ...(page.data.results ?? [])] } }));
  };
  const party = (n: AnyRec) =>
    unnamedNode(n) ? (
      <span className="text-slate">{nodeLabel(n)}</span>
    ) : (
      <button type="button" disabled={busy} onClick={() => void load(String(n.id))} className="text-left font-medium text-pine underline-offset-2 hover:underline">
        {nodeLabel(n)}
      </button>
    );
  const flags = (n?: AnyRec) => (
    <>
      {n?.sanctioned && <Tag tone="danger">Sanction</Tag>}
      {n?.ofac_sdn && <Tag tone="danger">OFAC SDN</Tag>}
      {n?.pep && <Tag tone="caution">PEP</Tag>}
    </>
  );
  const ofacTone = data?.ofac === "directly_listed" || data?.ofac === "threshold_met_in_observed_data";
  const groups = data ? byNode((data.neighbors.results ?? []) as AnyRec[]) : [];
  const exposures = ((data?.exposure.exposures ?? []) as AnyRec[]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Direction" className="inline-flex rounded-pill border border-edge bg-page p-0.5">
          {[["up", "Owners and controllers"], ["down", "Owned and controlled"]].map(([v, t]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={direction === v}
              disabled={busy}
              onClick={() => void load(current, v)}
              className={cn("h-8 rounded-pill px-3.5 text-micro transition-colors", direction === v ? "bg-pine text-lime" : "text-slate hover:text-pine")}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="inline-flex h-9 items-center gap-2 rounded-pill border border-edge bg-page pr-2 pl-3.5 text-micro text-slate">
          Depth
          <select aria-label="Depth" value={depth} disabled={busy} onChange={(e) => void load(current, direction, e.target.value)} className="bg-transparent text-pine outline-none">
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} step{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        {current !== id && (
          <button type="button" disabled={busy} onClick={() => void load(id)} className="inline-flex items-center gap-1 text-micro text-slate hover:text-pine">
            <ChevronLeft aria-hidden className="size-3.5" strokeWidth={2} />
            Back to this record
          </button>
        )}
        {busy && <Loader2 aria-hidden className="size-4 animate-spin text-muted" strokeWidth={2} />}
      </div>

      {error && !busy && <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-6 text-center text-body text-inert">{error}</p>}
      {!data && busy && (
        <div className="flex animate-pulse flex-col gap-2">
          <span className="h-14 rounded-box bg-well" />
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="h-9 rounded-well bg-well" />
          ))}
        </div>
      )}

      {data && (
        <div className={cn("flex flex-col gap-5 transition-opacity", busy && "opacity-60")}>
          <div className={cn("flex items-start gap-3 rounded-box px-4 py-3", ofacTone ? "bg-danger-tint" : "border border-hairline bg-page")}>
            <ShieldAlert aria-hidden className={cn("mt-0.5 size-4 shrink-0", ofacTone ? "text-danger" : "text-slate")} strokeWidth={1.9} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className={cn("text-body font-medium", ofacTone ? "text-danger" : "text-pine")}>
                {data.ofac === "directly_listed"
                  ? `${nodeLabel(data.neighbors.node)} is on the OFAC SDN list`
                  : data.ofac === "threshold_met_in_observed_data"
                    ? `${nodeLabel(data.neighbors.node)} is blocked under the OFAC 50% rule`
                    : "No OFAC 50% exposure in the recorded ownership"}
              </span>
              <span className={cn("text-micro", ofacTone ? "text-danger/80" : "text-slate")}>
                {data.ofac === "threshold_met_in_observed_data"
                  ? "Listed owners hold 50% or more, directly or through blocked companies, in the recorded data."
                  : data.ofac === "directly_listed"
                    ? "Listed directly, from the recorded data."
                    : "Based on the ownership recorded within the chosen depth. Missing shares and unnamed owners limit what can be concluded."}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <SectionTitle count={groups.length}>{direction === "up" ? "Owners and related parties" : "Owned entities and links"}</SectionTitle>
            <Rows
              cols={[
                { key: "who", header: "Party", width: 5 },
                { key: "how", header: "Relationship", width: 5 },
                { key: "share", header: "Share", width: 2, align: "right" },
              ]}
              minWidth={560}
              empty="No relationships recorded in this direction."
              rows={groups.map(({ node, edges }) => ({
                who: (
                  <span className="flex flex-col items-start gap-1">
                    {party(node)}
                    <span className="flex flex-wrap gap-1">{flags(node)}</span>
                  </span>
                ),
                how: (
                  <span className="flex flex-col gap-1">
                    {edges.map((r) => (
                      <span key={r.edge_id} className="flex flex-col">
                        <span>
                          {kindWords(r.relationship?.kind, direction)}
                          {r.historical && <span className="ml-1.5 text-micro text-slate">(ended)</span>}
                        </span>
                        <span className="text-micro text-slate">
                          {[sourceWords(r.relationship?.source), linkDates(r.relationship)].filter(Boolean).join(", ")}
                        </span>
                        {r.possible_match && <span className="text-micro text-caution">Possible name match only, identity not confirmed</span>}
                        {(r.relationship?.interests ?? []).map((i: AnyRec, n: number) => (
                          <span key={n} className="text-micro text-slate">
                            {[registerWords(i.type), share(i), directWords(i.direct)].filter(Boolean).join(" ")}
                          </span>
                        ))}
                      </span>
                    ))}
                  </span>
                ),
                share: edges.find((r) => r.percentage != null) ? pct(edges.find((r) => r.percentage != null)?.percentage) : null,
              }))}
            />
            {data.neighbors.truncated && data.neighbors.next_offset != null && (
              <button type="button" disabled={more || busy} onClick={() => void loadMore()} className="inline-flex h-9 items-center gap-2 self-start rounded-pill border border-edge bg-page px-4 text-micro text-pine hover:bg-hover-light disabled:opacity-60">
                {more && <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />}
                Show more links
              </button>
            )}
          </div>

          {exposures.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionTitle count={exposures.length}>{direction === "up" ? "Listed parties above this record" : "Entities reached through these links"}</SectionTitle>
              <Rows
                cols={[
                  { key: "who", header: "Party", width: 5 },
                  { key: "via", header: "Reached through", width: 5 },
                  { key: "eff", header: "Effective share", width: 2, align: "right" },
                ]}
                minWidth={560}
                rows={exposures.map((x) => ({
                  who: (
                    <span className="flex flex-col items-start gap-1">
                      {party(x.node)}
                      <span className="flex flex-wrap gap-1">
                        {x.node?.sanctioned && <Tag tone="danger">Sanction</Tag>}
                        {x.ofac_status === "directly_listed" && <Tag tone="danger">OFAC SDN</Tag>}
                        {x.ofac_threshold_met && <Tag tone="danger">Blocked, OFAC 50% rule</Tag>}
                        {x.node?.pep && <Tag tone="caution">PEP</Tag>}
                      </span>
                    </span>
                  ),
                  via: (
                    <span className="flex flex-col">
                      <span>
                        {x.steps} step{x.steps === 1 ? "" : "s"}
                      </span>
                      {Array.isArray(x.path) && x.path.length > 0 && <span className="text-micro text-slate">{pathWords(x.path)}</span>}
                    </span>
                  ),
                  eff: x.effective_percentage_on_path != null ? pct(x.effective_percentage_on_path) : null,
                }))}
              />
            </div>
          )}

          {(data.exposure.possible_matches ?? []).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-micro text-muted">Possible person-name matches (identity not confirmed, not counted toward exposure)</span>
              <span className="flex flex-wrap gap-1.5">
                {(data.exposure.possible_matches as AnyRec[]).map((m, i) => (
                  <Chip key={i}>
                    {m.node ? nodeLabel(m.node) : m.name ?? "Unnamed"}
                    {m.score != null ? `, ${Math.round(Number(m.score) * 100)}%` : ""}
                  </Chip>
                ))}
              </span>
            </div>
          )}
          {(data.neighbors.truncated || data.exposure.truncated || data.exposure.depth_limited) && (
            <p className="m-0 text-micro text-caution">This is a bounded view. Open a related party to continue past what is shown.</p>
          )}
          {data.exposure.note && <p className="m-0 text-micro text-muted">{data.exposure.note}</p>}
        </div>
      )}
    </div>
  );
}

/** Sanctions and PEP flags of a company in the ownership graph, fetched per card so they show as soon as it lands. */
function useGraphFlags(id: string | null) {
  const [flags, setFlags] = useState<AnyRec | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    void getJson(`/api/explorer/graph/node?${new URLSearchParams({ id })}`).then((r) => live && r.ok && setFlags(r.data));
    return () => {
      live = false;
    };
  }, [id]);
  return flags;
}
const flagTone = (f: AnyRec | null): KitTone => (f?.sanctioned || f?.ofac_sdn ? "danger" : f?.pep ? "caution" : "inert");
function GraphFlags({ f }: { f: AnyRec | null }) {
  if (!f) return null;
  return (
    <>
      {f.sanctioned && <Tag tone="danger" title={`${categoryOf("sanction")?.define} Topic code: sanction`}>Sanction</Tag>}
      {f.ofac_sdn && <Tag tone="danger" title="On the US Treasury OFAC Specially Designated Nationals list (us_ofac_sdn).">OFAC SDN</Tag>}
      {f.pep && <Tag tone="caution" title={`${categoryOf("role.pep")?.define} Topic code: role.pep`}>PEP</Tag>}
    </>
  );
}

function OwnershipButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-1.5 self-start rounded-pill border border-edge bg-page px-3.5 text-micro text-pine hover:bg-hover-light">
      <Network aria-hidden className="size-3.5" strokeWidth={1.8} />
      Ownership and links
    </button>
  );
}

/** A company's heading: what it is, its identifier, where, and its standing. */
function CompanyHead({ name, ident, country, status, active, flags, match }: { name: string; ident?: React.ReactNode; country?: string; status?: string; active?: boolean; flags: AnyRec | null; match?: AnyRec }) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <EntityGlyph schema="Company" tone={flagTone(flags)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] leading-5 font-medium text-pine">{name}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-slate">
          {ident}
          {country && (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-3" strokeWidth={2} />
              {country}
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <GraphFlags f={flags} />
        {status && (
          <Tag tone={active ? "approve" : "inert"} check={active}>
            {status}
          </Tag>
        )}
        {match?.match === "exact" && (
          <Tag tone="approve" check>
            Exact match
          </Tag>
        )}
        {match?.match === "similar" && <Tag tone="caution">Closest match, {Math.round(Number(match.score ?? 0) * 100)}%</Tag>}
      </div>
    </div>
  );
}

function LeiCard({ e, rels, r, onGraph }: { e: AnyRec; rels: AnyRec[]; r?: AnyRec; onGraph: (g: { id: string; name: string }) => void }) {
  const flags = useGraphFlags(e.lei ? `lei:${e.lei}` : null);
  const active = e.entity_status === "ACTIVE";
  return (
    <Tile className="flex flex-col gap-4">
      <CompanyHead
        name={e.legal_name}
        ident={
          <span className="inline-flex items-center gap-1.5">
            LEI (ISO 17442) <Ident>{e.lei}</Ident>
          </span>
        }
        country={e.jurisdiction ? countryName(e.jurisdiction, {}, true) : undefined}
        status={e.entity_status ? registerWords(String(e.entity_status)) : undefined}
        active={active}
        flags={flags}
        match={r}
      />
      <Facts
        facts={[
          { term: "Other names", detail: (e.other_names ?? []).length ? <Many values={uniqueCI(e.other_names)} limit={3} /> : null },
          { term: "Category", detail: e.category ? registerWords(String(e.category)) : null },
          { term: "Created", detail: e.created ? String(e.created).slice(0, 10) : null },
          { term: "Register number", detail: e.ra_entity_id ? <span className="inline-flex flex-wrap items-center gap-1.5"><Ident>{e.ra_entity_id}</Ident>{e.ra_id && <span className="text-micro text-slate">authority {e.ra_id}</span>}</span> : null },
          { term: "Registration", detail: e.registration_status ? registerWords(String(e.registration_status)) : null },
          { term: "Address", detail: list([e.legal_address, e.legal_city, e.legal_postcode, e.legal_country]), wide: true },
        ]}
      />
      {rels.length > 0 && e.lei && <LeiRelationships lei={e.lei} rels={rels} />}
      {e.lei && <OwnershipButton onClick={() => onGraph({ id: `lei:${e.lei}`, name: e.legal_name })} />}
    </Tile>
  );
}

/** GLEIF states every link from the child's side ("A is directly consolidated by B"), so one row means "parent" on A's
 *  card and "subsidiary" on B's. Each type is worded here from the side of the company on the card. */
const LEI_LINK: Record<string, { up: string; down: string; order: number }> = {
  IS_DIRECTLY_CONSOLIDATED_BY: { up: "Direct parent", down: "Direct subsidiaries", order: 0 },
  IS_ULTIMATELY_CONSOLIDATED_BY: { up: "Ultimate parent", down: "Ultimate subsidiaries", order: 1 },
  "IS_FUND-MANAGED_BY": { up: "Fund manager", down: "Funds it manages", order: 2 },
  IS_SUBFUND_OF: { up: "Umbrella fund", down: "Sub-funds", order: 3 },
  IS_FEEDER_TO: { up: "Master fund", down: "Feeder funds", order: 4 },
  IS_INTERNATIONAL_BRANCH_OF: { up: "Head office", down: "International branches", order: 5 },
};

type LeiLinkItem = { lei: string; name?: string; active: boolean };

/** Corporate structure reported to GLEIF, one tab per kind of link. */
function LeiRelationships({ lei, rels }: { lei: string; rels: AnyRec[] }) {
  const groups = new Map<string, { rank: number; items: Map<string, LeiLinkItem> }>();
  for (const r of rels) {
    const up = r.child_lei === lei; // the card's company is the child, so the other side sits above it
    const other = up ? { lei: r.parent_lei, name: r.parent_name } : { lei: r.child_lei, name: r.child_name };
    if (!other.lei || other.lei === lei) continue;
    const kind = LEI_LINK[r.relationship_type];
    const name = kind ? (up ? kind.up : kind.down) : `Other link (${String(r.relationship_type ?? "unspecified").replaceAll("_", " ").toLowerCase()})`;
    const g = groups.get(name) ?? { rank: (kind?.order ?? 9) + (up ? 0 : 10), items: new Map() };
    if (!g.items.has(other.lei)) g.items.set(other.lei, { lei: other.lei, name: other.name, active: !r.relationship_status || r.relationship_status === "ACTIVE" });
    groups.set(name, g);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[1].rank - b[1].rank);
  const [tab, setTab] = useState(sorted[0]?.[0] ?? "");
  if (!sorted.length) return null;
  const items = [...(groups.get(tab)?.items.values() ?? [])];
  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-4">
      <SectionTitle>Corporate structure</SectionTitle>
      <TabStrip label="Corporate structure" tabs={sorted.map(([n, g]) => ({ id: n, label: n, count: g.items.size }))} current={tab} onSelect={setTab} />
      <Rows
        cols={[
          { key: "name", header: "Company", width: 6 },
          { key: "lei", header: "LEI", width: 4 },
          { key: "status", header: "Link", width: 2, align: "right" },
        ]}
        minWidth={520}
        rows={items.map((it) => ({
          name: it.name || <span className="text-slate">Name not on record</span>,
          lei: <Ident>{it.lei}</Ident>,
          status: it.active ? <span className="text-slate">Active</span> : <Tag>Ended</Tag>,
        }))}
      />
    </div>
  );
}

const ownerName = (w: AnyRec) => w.person_name ?? w.entity_name ?? (w.party_unspecified ? registerWords(w.party_unspecified) : "Party not named");

/** Owners and controllers as a register records them: who, what interest, and whether it has ended. */
function OwnerRows({ owners }: { owners: AnyRec[] }) {
  return (
    <Rows
      cols={[
        { key: "who", header: "Owner or controller", width: 5 },
        { key: "interest", header: "Interest", width: 6 },
        { key: "status", header: "Status", width: 2, align: "right" },
      ]}
      minWidth={520}
      empty="None recorded."
      rows={owners.map((w) => ({
        who: <span className={w.person_name || w.entity_name ? "font-medium" : "text-slate"}>{ownerName(w)}</span>,
        interest: (
          <span className="flex flex-wrap gap-1">
            {((w.interests ?? []) as AnyRec[]).map((it, j) => (
              <span key={j} className={cn("inline-flex items-center rounded-pill px-2 py-0.5 text-micro", it.beneficial ? "bg-lime-tint text-pine" : "bg-well text-pine")}>
                {registerWords(it.type)}
                {share(it) ? ` ${share(it)}` : ""}
              </span>
            ))}
          </span>
        ),
        status: w.end_date ? <Tag>Ended {w.end_date}</Tag> : <span className="text-slate">Current</span>,
      }))}
    />
  );
}

/** A company from an ownership register (UK, Estonia, Latvia, Slovakia, Ukraine...), owners loaded on demand. */
function RegisterCard({ e, onGraph }: { e: AnyRec; onGraph: (g: { id: string; name: string }) => void }) {
  const gleif = e.source === "gleif";
  const graphId = e.source && e.record_id ? (gleif ? `lei:${e.record_id}` : `ubo:${e.source}:${e.record_id}`) : null;
  const flags = useGraphFlags(graphId);
  const [owners, setOwners] = useState<AnyRec[] | "loading" | "error" | null>(Array.isArray(e.owners) ? (e.owners as AnyRec[]) : null);
  // One register number can hold several filings from different sources (for example beneficial owners, shareholders and
  // the company card in Estonia); each card shows only the owners its own source recorded.
  const load = async () => {
    setOwners("loading");
    const r = await getJson(`/api/explorer/company?record_id=${encodeURIComponent(e.record_id)}`);
    setOwners(r.ok ? ((r.data.results ?? []) as AnyRec[]).filter((x) => !e.source || !x.source || x.source === e.source).flatMap((x) => (x.owners ?? []) as AnyRec[]) : "error");
  };
  return (
    <Tile className="flex flex-col gap-4">
      <CompanyHead
        name={e.name ?? e.record_id}
        ident={e.registration_number ? <span className="inline-flex items-center gap-1.5">Register <Ident>{e.registration_number}</Ident></span> : undefined}
        country={e.jurisdiction ? countryName(e.jurisdiction, {}, true) : undefined}
        status={e.status ? registerWords(String(e.status)) : undefined}
        active={/^(active|registered|issued)$/i.test(String(e.status ?? ""))}
        flags={flags}
      />
      <Facts
        facts={[
          { term: "Other register numbers", detail: list(((e.registration_numbers ?? []) as string[]).filter((n) => n !== e.registration_number)) },
          { term: "Also known as", detail: (e.alt_names ?? []).length ? <Many values={uniqueCI(e.alt_names)} limit={3} /> : null },
          { term: "Legal form", detail: e.legal_form ?? e.entity_subtype },
          { term: "Founded", detail: e.founding_date },
          { term: "Dissolved", detail: e.dissolution_date },
          { term: "Filings", detail: e.copies > 1 ? `${e.copies} filings of this company, merged` : null },
          { term: "Source register", detail: e.asserted_by },
          { term: "Record", detail: e.record_id ? <Ident>{e.record_id}</Ident> : null },
          { term: "Address", detail: e.address, wide: true },
        ]}
      />
      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <SectionTitle count={Array.isArray(owners) ? owners.length : undefined}>Owners and controllers</SectionTitle>
        {gleif && <p className="m-0 text-micro text-slate">GLEIF records parent companies rather than beneficial owners. Open ownership and links to see them.</p>}
        {!gleif && owners === null && (
          <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-1.5 self-start rounded-pill border border-edge bg-page px-3.5 text-micro text-pine hover:bg-hover-light">
            <Users aria-hidden className="size-3.5" strokeWidth={1.8} />
            Show owners and controllers
          </button>
        )}
        {owners === "loading" && (
          <div className="flex animate-pulse flex-col gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className="h-8 rounded-well bg-well" />
            ))}
          </div>
        )}
        {owners === "error" && <p className="m-0 text-micro text-danger">The owners could not be loaded. Try again.</p>}
        {Array.isArray(owners) && <OwnerRows owners={owners} />}
      </div>
      {graphId && <OwnershipButton onClick={() => onGraph({ id: graphId, name: e.name ?? e.record_id })} />}
    </Tile>
  );
}

function CompanyResults({ data, query }: { data: AnyRec; query: string }) {
  const [graph, setGraph] = useState<{ id: string; name: string } | null>(null);
  const lei = data.lei ? ((data.lei as AnyRec[])[0] ?? null) : undefined;
  const all = (data.results ?? []) as AnyRec[];
  const leiRows = all.filter((r) => Array.isArray(r.lei));
  const register = lei === undefined ? ((data.register_results ?? []) as AnyRec[]) : [];
  const plain = lei === undefined && !leiRows.length && !register.length ? all : [];
  const n = lei ? 1 : leiRows.length + register.length + plain.length;
  if (lei === null || !n) return <Empty icon={Building2} title={lei === null ? "No company has this LEI." : "No company matches. Try the registered name or a register number."} />;
  return (
    <Panel>
      <h2 className="m-0 text-section font-medium text-pine">
        {n.toLocaleString()} compan{n === 1 ? "y" : "ies"}
        <span className="ml-1.5 font-normal text-slate">for “{query}”</span>
      </h2>
      {leiRows.length > 0 && leiRows.every((r) => r.match === "similar") && (
        <p className="m-0 rounded-box bg-caution-tint px-4 py-2.5 text-micro text-caution">
          No exact match. These are the closest companies by name. Check the details before relying on them.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {lei && <LeiCard e={lei} rels={(data.relationships ?? []) as AnyRec[]} onGraph={setGraph} />}
        {leiRows.map((r) => (
          <LeiCard key={r.lei[0]?.lei} e={r.lei[0] ?? {}} rels={(r.relationships ?? []) as AnyRec[]} r={r} onGraph={setGraph} />
        ))}
        {register.length > 0 && (leiRows.length > 0 || lei) && <SectionTitle count={register.length}>Company registers</SectionTitle>}
        {[...register, ...plain].map((e) => (
          <RegisterCard key={`${e.source}:${e.record_id}`} e={e} onGraph={setGraph} />
        ))}
      </div>
      <Drawer
        open={!!graph}
        onClose={() => setGraph(null)}
        label="Ownership and links"
        header={
          graph && (
            <div className="flex flex-col gap-1">
              <span className="text-micro text-slate">Ownership and links</span>
              <h2 className="m-0 text-[20px] leading-7 font-medium tracking-[-0.3px] text-pine">{graph.name}</h2>
            </div>
          )
        }
      >
        {graph && <GraphPanel key={graph.id} id={graph.id} />}
      </Drawer>
    </Panel>
  );
}

/** Search counts above 10,000 are a floor, not an exact number. */
const count = (n: unknown, noun: string) => {
  const v = Number(n ?? 0);
  return v >= 10000 ? `More than 10,000 ${noun}s` : `${v.toLocaleString()} ${noun}${v === 1 ? "" : "s"}`;
};

/** Search results paged by offset; a page that brings nothing new ends the list. */
function usePaged(first: AnyRec, url: (offset: number) => string, keyOf: (x: AnyRec) => string = (x) => String(x.id)) {
  const [rows, setRows] = useState<AnyRec[]>((first.results ?? []) as AnyRec[]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const more = async () => {
    setBusy(true);
    setError(null);
    const r = await getJson(url(rows.length));
    setBusy(false);
    if (!r.ok) { setError("More results could not be loaded. Try again."); return; }
    const seen = new Set(rows.map(keyOf));
    const next = ((r.data.results ?? []) as AnyRec[]).filter((x) => !seen.has(keyOf(x)));
    if (!next.length) setDone(true);
    setRows((old) => [...old, ...next]);
  };
  const total = Number(first.total ?? rows.length);
  const button = !done && rows.length < total && (
    <div className="flex flex-col items-center gap-1">
      <button type="button" disabled={busy} onClick={() => void more()} className="inline-flex h-9 items-center gap-2 rounded-pill border border-edge bg-page px-4 text-micro text-pine hover:bg-hover-light disabled:opacity-60">
        {busy && <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />}
        Show more
      </button>
      {error && <span className="text-micro text-danger">{error}</span>}
    </div>
  );
  return { rows, button, total };
}

/** The heading every list panel opens with: how many, for what, and how many are on screen. */
function ListHead({ total, noun, query, shown }: { total: number; noun: string; query?: string; shown: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="m-0 text-section font-medium text-pine">
        {count(total, noun)}
        {query && <span className="ml-1.5 font-normal text-slate">for “{query}”</span>}
      </h2>
      {shown < total && <span className="tnum text-micro text-muted">Showing {shown.toLocaleString()}</span>}
    </div>
  );
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A date as a small calendar block, so a column of stories reads as a timeline. */
function DateBlock({ v }: { v: unknown }) {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return <span className="w-14 shrink-0" />;
  return (
    <span className="flex w-14 shrink-0 flex-col items-center rounded-well border border-hairline bg-panel py-1.5">
      <span className="tnum text-section leading-6 font-medium text-pine">{Number(m[3])}</span>
      <span className="text-[10.5px] leading-3.5 text-slate">
        {MONTH[Number(m[2]) - 1]} {m[1]}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------- standard words for news, web and documents -- */

/** The news and web topic families in the same standard words as the list topics, each with its list topic code. */
const MEDIA_TOPIC: Record<string, { label: string; code: string; define: string }> = {
  corruption: { label: "Corruption and bribery", code: "crime.fin", define: "Reported bribery, kickbacks, embezzlement or abuse of office." },
  money_laundering: { label: "Money laundering", code: "crime.fin", define: "Reported laundering of criminal proceeds." },
  fraud: { label: "Fraud", code: "crime.fraud", define: "Reported fraud, scams, forgery or counterfeiting." },
  tax_crime: { label: "Tax crime", code: "crime.fin", define: "Reported tax evasion or tax fraud." },
  terrorism: { label: "Terrorism", code: "crime.terror", define: "Reported terrorism or terrorist financing." },
  trafficking: { label: "Trafficking", code: "crime.traffick", define: "Reported trafficking or smuggling of drugs, people, weapons or wildlife." },
  organized_crime: { label: "Organised crime", code: "crime.boss", define: "Reported links to cartels, mafias or other organised crime groups." },
  cybercrime: { label: "Cybercrime", code: "crime.cyber", define: "Reported hacking, ransomware or darknet crime." },
  sanctions: { label: "Sanctions", code: "sanction", define: "Reported sanctions, embargoes or asset freezes." },
  legal_action: { label: "Arrest, charge or conviction", code: "crime", define: "Reported arrest, charge, indictment, conviction, sentence or extradition." },
};
/** Press topics: reported, not a listing, so they read as caution and say so on hover. */
function MediaTopics({ topics }: { topics: unknown }) {
  const ts = [...new Set((Array.isArray(topics) ? topics : []) as string[])];
  if (!ts.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {ts.map((t) => {
        const m = MEDIA_TOPIC[t];
        return (
          <Tag key={t} tone="caution" title={m ? `${m.define} Reported in the press, not a listing. Topic code: ${m.code}` : undefined}>
            {m?.label ?? sentence(t)}
          </Tag>
        );
      })}
    </span>
  );
}

const NEWS_SOURCE: Record<string, string> = {
  doj: "US Department of Justice press release",
  ofac_press: "US Treasury (OFAC) press release",
  agency: "Government agency release",
  wikinews: "Wikinews",
  wikidata_cases: "Case record",
};
const newsSource = (v: unknown) => NEWS_SOURCE[String(v)] ?? "News article";

/** Which published list or register a source file belongs to, by its folder. */
const DOC_SOURCE: [RegExp, string][] = [
  [/^sanctions\/uk\//, "UK sanctions list (OFSI)"],
  [/^sanctions\/ofac\//, "US sanctions (OFAC)"],
  [/^sanctions\/us_csl\//, "US Consolidated Screening List"],
  [/^sanctions\/ch\//, "Swiss sanctions (SECO)"],
  [/^sanctions\/au\//, "Australian sanctions (DFAT)"],
  [/^sanctions\/eu/, "EU sanctions"],
  [/^sanctions\/un\//, "UN Security Council sanctions"],
  [/^sanctions\/ca\//, "Canadian sanctions"],
  [/^sanctions\//, "Sanctions list"],
  [/^africa\/sanctions\//, "African sanctions lists"],
  [/^(africa\/)?ubo\//, "Beneficial ownership registers"],
  [/^(africa\/)?peps\//, "PEP lists"],
  [/^(africa\/)?criminal\//, "Criminal and debarment records"],
  [/^africa\/vessels\//, "Ship detentions (port state control)"],
  [/^vessels_aircraft\//, "Vessel and aircraft lists"],
  [/adverse_media\//, "News archive"],
];
const docSource = (path: unknown) => DOC_SOURCE.find(([re]) => re.test(String(path ?? "")))?.[1] ?? "Source file";
const DOC_TYPE: Record<string, string> = { pdf: "PDF", xls: "Spreadsheet", xlsx: "Spreadsheet", csv: "Data table (CSV)", xml: "Data file (XML)", json: "Data file (JSON)", jsonl: "Data file (JSON)", txt: "Text file", html: "Web page" };
const docType = (t: unknown) => DOC_TYPE[String(t ?? "").toLowerCase()] ?? String(t ?? "").toUpperCase();
/** Our own notes about the data (manifests and source lists) are not documents about anyone. */
const isNote = (d: AnyRec) => String(d.doc_type).toLowerCase() === "md";

const LEGAL_FORMS = new Set(["ltd", "llc", "inc", "plc", "pjsc", "ojsc", "cjsc", "jsc", "oao", "ooo", "zao", "pao", "co", "corp", "company", "corporation", "limited", "sa", "ag", "gmbh", "bv", "nv", "srl", "spa", "sarl", "pty", "lp", "llp", "fze", "fzco"]);
const foldWords = (v: string) => v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Whether a text names a person or organisation as a name: its words in order, surname first, or first and last name
 *  without the middle ones (legal forms such as Ltd left out). The same words scattered over a page are someone else. */
function namedIn(text: string, name: string): boolean {
  const flat = ` ${foldWords(text)} `;
  const ws = foldWords(name).split(" ").filter((w) => w.length > 1 && !LEGAL_FORMS.has(w));
  if (!ws.length) return true;
  const has = (x: string[]) => flat.includes(` ${x.join(" ")} `);
  if (ws.length === 1) return has(ws);
  const ends = [ws[0]!, ws[ws.length - 1]!];
  return has(ws) || has([...ws].reverse()) || has(ends) || has([...ends].reverse());
}
/** How a passage must show a clue to count: a name as a name, an email as written, a phone by its last nine digits. */
function clueMatcher(kind: CriterionKey, value: string): (text: string) => boolean {
  if (kind === "email") return (t) => t.toLowerCase().includes(value.toLowerCase());
  if (kind === "phone") {
    const re = new RegExp(digitsOf(value).slice(-9).split("").join("[ ().-]?"));
    return (t) => re.test(t);
  }
  return (t) => namedIn(t, value);
}
const plainText = (...parts: unknown[]) => parts.flat().map((t) => String(t ?? "").replace(/<[^>]+>/g, "")).join(" | ");
const newsText = (a: AnyRec) => plainText(a.title, a.persons ?? [], a.orgs ?? [], a.highlight?.text ?? []);
const docText = (d: AnyRec) => plainText(d.title, d.highlight?.text ?? []);

/** Near matches folded away: rows the search engine returned that do not show the clue the way the matcher asks. */
function LooseToggle({ count, shown, onToggle }: { count: number; shown: boolean; onToggle: () => void }) {
  if (!count) return null;
  return (
    <button type="button" onClick={onToggle} className="self-start text-micro font-medium text-pine underline-offset-2 hover:underline">
      {shown ? "Hide near matches" : `Show ${count} near match${count === 1 ? "" : "es"} that do not name it as written`}
    </button>
  );
}

function NewsList({ data, query, match, filters = {} }: { data: AnyRec; query: string; match: (text: string) => boolean; filters?: Record<string, string> }) {
  const [loose, setLoose] = useState(false);
  const { rows, button } = usePaged(data, (offset) => `/api/explorer/media?${new URLSearchParams({ ...(query ? { q: query } : {}), ...filters, offset: String(offset) })}`);
  const strict = rows.filter((a) => match(newsText(a)));
  // the same story often arrives from several feeds: one row per headline and day, with the repeats counted
  const stories = new Map<string, { a: AnyRec; repeats: number }>();
  for (const a of loose ? rows : strict) {
    const key = `${String(a.title ?? a.url ?? a.id).trim().toLowerCase()}|${String(a.date ?? "").slice(0, 10)}`;
    const s = stories.get(key);
    if (s) s.repeats++;
    else stories.set(key, { a, repeats: 0 });
  }
  return (
    <div className="flex flex-col gap-2">
      {!stories.size && <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-6 text-center text-body text-inert">No news article names it as written.</p>}
      {[...stories.values()].map(({ a, repeats }) => (
        <Tile key={a.id} className="flex gap-4">
          <DateBlock v={a.date} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {a.url ? (
              <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[15px] leading-5 font-medium text-pine underline-offset-2 hover:underline">
                {a.title ?? a.url}
              </a>
            ) : (
              <span className="text-[15px] leading-5 font-medium text-pine">{a.title ?? "Untitled"}</span>
            )}
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-slate">
              <span>{newsSource(a.source)}</span>
              {a.url && (
                <span className="inline-flex items-center gap-1">
                  <Globe aria-hidden className="size-3" strokeWidth={2} />
                  {host(String(a.url))}
                </span>
              )}
              {uniqueCI(a.countries ?? []).length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden className="size-3" strokeWidth={2} />
                  {uniqueCI(a.countries).slice(0, 4).map((c) => countryName(c)).join(", ")}
                  {uniqueCI(a.countries).length > 4 ? ` and ${uniqueCI(a.countries).length - 4} more` : ""}
                </span>
              )}
              {repeats > 0 && <span>Also in {repeats} other feed{repeats === 1 ? "" : "s"}</span>}
            </span>
            <MediaTopics topics={a.topics} />
            <Snippet text={(a.highlight?.text ?? [])[0]} />
            {(a.persons ?? []).length > 0 && (
              <span className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-micro text-muted">People mentioned</span>
                <Few values={uniqueCI(a.persons)} limit={6} render={(p) => <Chip key={p}>{p}</Chip>} />
              </span>
            )}
          </div>
        </Tile>
      ))}
      <LooseToggle count={rows.length - strict.length} shown={loose} onToggle={() => setLoose((v) => !v)} />
      {button}
    </div>
  );
}

/** A list of short values shown up to a limit, with the rest a click away (nothing is silently dropped). */
function Few({ values, limit, render }: { values: string[]; limit: number; render: (v: string) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <>
      {(all ? values : values.slice(0, limit)).map(render)}
      {values.length > limit && (
        <button type="button" onClick={() => setAll((a) => !a)} className="text-micro text-slate underline-offset-2 hover:text-pine hover:underline">
          {all ? "Show fewer" : `${values.length - limit} more`}
        </button>
      )}
    </>
  );
}

/** A source file's name for the reader: no folders, no extension. */
const fileTitle = (path: unknown) => String(path ?? "").split("/").pop()!.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_-]+/g, " ").trim();

function DocList({ data, query, match }: { data: AnyRec; query: string; match: (text: string) => boolean }) {
  const [loose, setLoose] = useState(false);
  const { rows, button } = usePaged(data, (offset) => `/api/explorer/documents?${new URLSearchParams({ q: query, offset: String(offset) })}`);
  const all = rows.filter((d) => !isNote(d));
  const strict = all.filter((d) => match(docText(d)));
  const shown = loose ? all : strict;
  return (
    <div className="flex flex-col gap-2">
      {!shown.length && <p className="m-0 rounded-box border border-dashed border-edge bg-page px-4 py-6 text-center text-body text-inert">No document holds it as written.</p>}
      {shown.map((d) => (
        <Tile key={d.id} className="flex gap-4">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-box bg-well text-pine">
            <FileText className="size-[18px]" strokeWidth={1.8} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] leading-5 font-medium text-pine">{docSource(d.path)}</span>
              <Chip>{docType(d.doc_type)}</Chip>
            </span>
            <span className="text-micro text-slate">
              {d.title || fileTitle(d.path)}
              {d.locator && String(d.locator).toLowerCase() !== String(d.doc_type).toLowerCase() ? `, ${d.locator}` : ""}
            </span>
            <Snippet text={(d.highlight?.text ?? [])[0]} />
          </div>
        </Tile>
      ))}
      <LooseToggle count={all.length - strict.length} shown={loose} onToggle={() => setLoose((v) => !v)} />
      {button}
    </div>
  );
}

type DocQuery = { query: string; clue: CriterionKey };
/** How many rows of a loaded first page show the clue as written, and whether more pages exist. */
function strictCount(l: Load, match: (text: string) => boolean, text: (x: AnyRec) => string): { n: number; more: boolean } {
  if (l.s !== "ready") return { n: 0, more: false };
  const rows = ((l.data.results ?? []) as AnyRec[]).filter((x) => !isNote(x));
  return { n: rows.filter((x) => match(text(x))).length, more: Number(l.data.total ?? 0) > ((l.data.results ?? []) as AnyRec[]).length };
}

const WEB_BUTTON = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border border-edge bg-page px-3.5 text-micro text-pine hover:bg-hover-light";

/** The Web side tab. The web is searched on its own only when our own data holds little (no confident list match and
 *  next to nothing in news and documents): a rare name. Otherwise it waits for a click, so it is not asked every time. */
function WebTab({ load, query, limited, asked, onAsk }: { load: Load; query: string; limited: boolean | null; asked: boolean; onAsk: () => void }) {
  if (load.s === "ready") return <WebResults data={load.data} query={query} why={asked ? undefined : "Searched because our lists, news and documents hold little on this name."} />;
  if (!query)
    return (
      <Panel>
        <span className="text-section font-medium text-pine">Web</span>
        <p className="m-0 text-body text-inert">The web is searched by a name. Type one with the tags to search it.</p>
      </Panel>
    );
  if (load.s === "skip")
    return (
      <Panel className="flex-row flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-section font-medium text-pine">Web</span>
          <span className="text-micro text-slate">
            {limited === null
              ? "Checking our lists, news and documents first. The web is searched on its own only when they hold little."
              : "Not searched: our lists, news and documents already hold this name. The web is searched on its own only when they hold little."}
          </span>
        </span>
        {limited === false && (
          <button type="button" onClick={onAsk} className={WEB_BUTTON}>
            <Globe aria-hidden className="size-3.5" strokeWidth={1.8} />
            Search the web
          </button>
        )}
      </Panel>
    );
  return (
    <Panel>
      <span className="text-section font-medium text-pine">Web</span>
      {load.s === "error" ? (
        <p className="m-0 rounded-box bg-danger-tint px-4 py-2.5 text-micro text-danger">{load.message}</p>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-micro text-slate">
          <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
          {asked ? "Searching the web" : "Searching the web, because our lists, news and documents hold little on this name"}
        </span>
      )}
    </Panel>
  );
}

/** One side tab of our own archive (news or documents): what it holds, then the rows that name it as written. */
function ArchiveTab({ title, about, load, children, idle }: { title: string; about: string; load: Load; children: (data: AnyRec) => React.ReactNode; idle?: string }) {
  return (
    <Panel>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-section font-medium text-pine">{title}</h2>
        <p className="m-0 text-micro text-slate">{about}</p>
      </div>
      {load.s === "loading" && (
        <div className="flex animate-pulse flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="h-[72px] rounded-box bg-well" />
          ))}
        </div>
      )}
      {load.s === "error" && <p className="m-0 rounded-box bg-danger-tint px-4 py-2.5 text-micro text-danger">{load.message}</p>}
      {load.s === "skip" && idle && <p className="m-0 text-body text-inert">{idle}</p>}
      {load.s === "ready" && children(load.data)}
    </Panel>
  );
}

type ScreenTab = "lists" | "news" | "docs" | "web";
/** Screening: the list matches exactly as they are, with the news, documents and web that name it in side tabs beside
 *  them, so press and web results never mix with list records. */
function ScreeningView({ data, query }: { data: AnyRec; query: string }) {
  const [tab, setTab] = useState<ScreenTab>("lists");
  const [webAsked, setWebAsked] = useState(false);
  const name = splitScreeningQuery(query).name;
  // tags may ask the news for a topic or a country; a search made of tags alone browses the news by them
  const nf = Object.fromEntries(Object.entries((data.newsFilters ?? {}) as Record<string, string | undefined>).filter(([, v]) => !!v)) as Record<string, string>;
  const match = name ? clueMatcher("name", name) : () => true;
  const news = useLoad(name || Object.keys(nf).length ? `/api/explorer/media?${new URLSearchParams({ ...(name ? { q: name } : {}), ...nf })}` : null);
  const docs = useLoad(name ? `/api/explorer/documents?${new URLSearchParams({ q: name })}` : null);
  const nc = strictCount(news, match, newsText);
  const dc = strictCount(docs, match, docText);
  const settled = news.s !== "loading" && docs.s !== "loading";
  const limited = name && settled ? !found("screening", data, name) && nc.n + dc.n < 3 : name ? null : false;
  const web = useLoad(name && (limited === true || webAsked) ? `/api/explorer/web?${new URLSearchParams({ q: name, mode: "aml" })}` : null);
  const webRows = web.s === "ready" ? ((web.data.results ?? []) as AnyRec[]).length : 0;
  const word = (l: Load, x: { n: number; more: boolean }) => (l.s === "ready" ? `${x.n}${x.more ? "+" : ""}` : undefined);
  const tabs: { id: ScreenTab; label: string; count?: string }[] = [
    { id: "lists", label: "Lists" },
    { id: "news", label: "News", count: word(news, nc) },
    { id: "docs", label: "Documents", count: word(docs, dc) },
    { id: "web", label: "Web", count: web.s === "ready" ? String(webRows) : undefined },
  ];
  return (
    <div className="flex flex-col gap-3">
      <TabStrip label="Screening results" tabs={tabs} current={tab} onSelect={setTab} />
      {/* every side tab stays mounted, so filters, details and pages are kept when switching */}
      <div className={cn("flex flex-col gap-3", tab !== "lists" && "hidden")}>
        {limited && webRows > 0 && (
          <p className="m-0 flex flex-wrap items-center justify-between gap-2 rounded-box bg-lime-tint px-4 py-2.5 text-micro text-pine">
            <span>Our lists, news and documents hold little on this name, so the web was searched: {webRows} page{webRows === 1 ? "" : "s"} name it.</span>
            <button type="button" onClick={() => setTab("web")} className="font-medium underline-offset-2 hover:underline">
              Open the Web tab
            </button>
          </p>
        )}
        <ScreeningPanel data={data} query={query} />
      </div>
      <div className={cn(tab !== "news" && "hidden")}>
        <ArchiveTab title="News" about="Press coverage of financial crime that names it: news articles, US Justice Department and Treasury releases and agency notices. Reported in the press, not a listing." load={news}>
          {(d) => <NewsList data={d} query={name} match={match} filters={nf} />}
        </ArchiveTab>
      </div>
      <div className={cn(tab !== "docs" && "hidden")}>
        <ArchiveTab title="Documents" about="Passages of the published sanctions lists, registers and reports that hold it word for word." load={docs} idle="Documents are searched by a name. Type one with the tags to search them.">
          {(d) => <DocList data={d} query={name} match={match} />}
        </ArchiveTab>
      </div>
      <div className={cn(tab !== "web" && "hidden")}>
        <WebTab load={web} query={name} limited={limited} asked={webAsked} onAsk={() => setWebAsked(true)} />
      </div>
    </div>
  );
}

/** News and documents that name one record, shown among its sources: searched by the record's own name and kept below
 *  the source lists, apart from the list data. */
function RecordMentions({ name }: { name: string }) {
  const match = clueMatcher("name", name);
  const news = useLoad(`/api/explorer/media?${new URLSearchParams({ q: name })}`);
  const docs = useLoad(`/api/explorer/documents?${new URLSearchParams({ q: name })}`);
  const part = (title: string, l: Load, body: (d: AnyRec) => React.ReactNode) => (
    <div className="flex flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
      {l.s === "loading" && <span className="h-[72px] animate-pulse rounded-box bg-well" />}
      {l.s === "error" && <p className="m-0 rounded-box bg-danger-tint px-4 py-2.5 text-micro text-danger">{l.message}</p>}
      {l.s === "ready" && body(l.data)}
    </div>
  );
  return (
    <>
      {part("Named in the news", news, (d) => <NewsList data={d} query={name} match={match} />)}
      {part("Named in documents", docs, (d) => <DocList data={d} query={name} match={match} />)}
    </>
  );
}

/** Vessels & aircraft: one search over both registers; the one that found it exactly comes first. */
function AssetsView({ data, query }: { data: AnyRec; query: string }) {
  const ships = (data.vessels?.results ?? []) as AnyRec[];
  const planes = (data.aircraft?.results ?? []) as AnyRec[];
  if (!ships.length && !planes.length) return <Empty icon={Ship} title="No vessel or aircraft matches. Try an IMO number, an MMSI, a registration, a transponder code or another spelling." />;
  const exact = (rows: AnyRec[]) => rows.some((r) => r.match !== "similar");
  const planesFirst = exact(planes) && !exact(ships);
  const parts = [
    ships.length > 0 && <VesselResults key="v" data={data.vessels} query={query} />,
    planes.length > 0 && <AircraftResults key="a" data={data.aircraft} query={query} />,
  ];
  return <div className="flex flex-col gap-4">{planesFirst ? parts.reverse() : parts}</div>;
}

const CATALOG_STATUS: Record<string, { tone: KitTone; text: string }> = {
  ok: { tone: "approve", text: "Readable" },
  ok_lines: { tone: "caution", text: "Read line by line" },
  ok_csv_lenient: { tone: "caution", text: "Read with bad rows skipped" },
  unreadable: { tone: "inert", text: "Could not be read" },
  no_reader: { tone: "inert", text: "Not a data table" },
};
function bytes(n: unknown) {
  const v = Number(n ?? 0);
  if (v < 1024) return `${v} bytes`;
  const units = ["KB", "MB", "GB", "TB"];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x.toLocaleString(undefined, { maximumFractionDigits: x < 10 ? 1 : 0 })} ${units[i]}`;
}
const CATALOG_PAGE = 100;
const PREVIEW_PAGE = 25;

function CatalogResults({ data, query }: { data: AnyRec; query: string }) {
  const { rows, button } = usePaged(
    data,
    (offset) => `/api/explorer/catalog?${new URLSearchParams({ ...(query ? { q: query } : {}), limit: String(CATALOG_PAGE), offset: String(offset) })}`,
    (x) => String(x.path),
  );
  if (!rows.length) return <Empty icon={Database} title="No table matches this path. Try a shorter part of the file name." />;
  return (
    <Panel>
      <ListHead total={Number(data.total ?? rows.length)} noun="table" query={query || undefined} shown={rows.length} />
      <div className="flex flex-col gap-2">
        {rows.map((t) => (
          <CatalogTable key={t.path} t={t} />
        ))}
      </div>
      {button}
    </Panel>
  );
}

function CatalogTable({ t }: { t: AnyRec }) {
  const [page, setPage] = useState<{ offset: number; rows: AnyRec[] } | "loading" | "error" | null>(null);
  const load = async (offset: number) => {
    setPage("loading");
    const r = await getJson(`/api/explorer/catalog/${encodeURIComponent(t.view)}?${new URLSearchParams({ limit: String(PREVIEW_PAGE), offset: String(offset) })}`);
    setPage(r.ok ? { offset, rows: (r.data.rows ?? []) as AnyRec[] } : "error");
  };
  const status = CATALOG_STATUS[String(t.status)] ?? { tone: "inert" as KitTone, text: registerWords(String(t.status)) };
  const whole = t.reader === "json_objects" && Number(t.rows) === 1;
  const total = t.rows != null ? Number(t.rows) : null;
  return (
    <Tile className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-box bg-well text-pine">
          <Database className="size-[18px]" strokeWidth={1.8} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-mono text-[12.5px] leading-5 break-all text-pine">{t.path}</span>
          <span className="flex flex-wrap gap-x-3 text-micro text-slate">
            <span>{total == null ? "Not a table" : whole ? "1 document" : `${total.toLocaleString()} row${total === 1 ? "" : "s"}`}</span>
            <span>{bytes(t.bytes)}</span>
          </span>
        </div>
        <Tag tone={status.tone} check={status.tone === "approve"}>
          {status.text}
        </Tag>
      </div>
      {t.view && !page && (
        <button type="button" onClick={() => void load(0)} className="inline-flex h-9 items-center gap-1.5 self-start rounded-pill border border-edge bg-page px-3.5 text-micro text-pine hover:bg-hover-light">
          <Table2 aria-hidden className="size-3.5" strokeWidth={1.8} />
          Preview rows
        </button>
      )}
      {page === "loading" && (
        <div className="flex animate-pulse flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="h-7 rounded-well bg-well" />
          ))}
        </div>
      )}
      {page === "error" && <p className="m-0 text-micro text-danger">The preview could not be loaded. Try again.</p>}
      {page && typeof page === "object" && (
        <>
          <RowsTable rows={page.rows} />
          <div className="flex flex-wrap items-center gap-3 text-micro text-slate">
            <span className="tnum">
              Rows {page.rows.length ? `${(page.offset + 1).toLocaleString()} to ${(page.offset + page.rows.length).toLocaleString()}` : "none"}
              {total != null ? ` of ${total.toLocaleString()}` : ""}
            </span>
            {page.offset > 0 && (
              <button type="button" onClick={() => void load(Math.max(0, page.offset - PREVIEW_PAGE))} className="inline-flex items-center gap-0.5 text-pine hover:underline">
                <ChevronLeft aria-hidden className="size-3.5" strokeWidth={2} />
                Previous
              </button>
            )}
            {page.rows.length === PREVIEW_PAGE && (total == null || page.offset + PREVIEW_PAGE < total) && (
              <button type="button" onClick={() => void load(page.offset + PREVIEW_PAGE)} className="inline-flex items-center gap-0.5 text-pine hover:underline">
                Next
                <ChevronRight aria-hidden className="size-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
        </>
      )}
    </Tile>
  );
}

/** A value from a raw table: Wikidata item links shortened to their id, everything else as text. */
function rawValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  const item = s.match(/^<?https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)>?$/);
  if (item) return <a href={`https://www.wikidata.org/wiki/${item[1]}`} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-2 hover:underline">{item[1]}</a>;
  if (/^<?https?:\/\/www\.wikidata\.org\/\.well-known\/genid\//.test(s)) return <span className="text-muted">no Wikidata item</span>;
  return s;
}

function Cell({ v }: { v: unknown }) {
  const [open, setOpen] = useState(false);
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (s.length <= 120) return <>{rawValue(v)}</>;
  return (
    <button type="button" onClick={() => setOpen((o) => !o)} className="text-left" title={open ? "Show less" : "Show the whole value"}>
      {open ? s : `${s.slice(0, 120)}…`}
    </button>
  );
}

function RowsTable({ rows }: { rows: AnyRec[] }) {
  if (!rows.length) return <p className="m-0 text-micro text-muted">No rows on this page.</p>;
  // every column is shown; wide tables scroll sideways
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    <div className="max-h-[380px] overflow-auto rounded-box border border-hairline">
      <table className="w-full border-collapse text-left text-micro">
        <thead className="sticky top-0 bg-panel text-muted">
          <tr>
            {cols.map((c) => (
              <th key={c} className="border-b border-rule px-3 py-2 font-normal whitespace-nowrap">
                {c.replace(/^\?/, "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-rule text-pine first:border-t-0 hover:bg-hover-light/60">
              {cols.map((c) => (
                <td key={c} className="tnum max-w-[320px] px-3 py-2 align-top break-words">
                  <Cell v={r[c]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Rendered as a component (never called as a function): the views keep their own state, and the key gives every
 * search a fresh one. */
function ResultView({ kind, data, query }: { kind: Kind; data: AnyRec; query: string }) {
  const View = VIEWS[kind];
  return <View data={data} query={query} />;
}

const VIEWS: Record<Kind, (p: { data: AnyRec; query: string }) => React.ReactNode> = {
  screening: ScreeningView,
  contact: InvestigationView,
  companies: CompanyResults,
  assets: (p) => (p.data.browse ? <AssetsBrowse data={p.data} /> : <AssetsView data={p.data} query={p.query} />),
  wallets: (p) => (p.data.names ? <WalletNames data={p.data} /> : <WalletResults data={p.data} />),
  catalog: CatalogResults,
};

/* ---------------------------------------------------------------- reading key -- */

const IDENT_STANDARDS: { name: string; standard: string; looks: string }[] = [
  { name: "LEI", standard: "ISO 17442 Legal Entity Identifier (GLEIF)", looks: "20 letters and digits" },
  { name: "SWIFT/BIC", standard: "ISO 9362 Business Identifier Code", looks: "8 or 11 characters" },
  { name: "IMO number", standard: "IMO ship identification number", looks: "7 digits, stays with the ship" },
  { name: "MMSI", standard: "ITU Maritime Mobile Service Identity", looks: "9 digits, changes with the flag" },
  { name: "ICAO 24-bit address", standard: "ICAO aircraft transponder address", looks: "6 hexadecimal characters" },
  { name: "Country", standard: "ISO 3166-1 alpha-2 (subdivisions ISO 3166-2)", looks: "Russia (RU), United States (US-DE)" },
  { name: "Date", standard: "ISO 8601", looks: "YYYY-MM-DD; vessel and flight positions in UTC" },
  { name: "Wallet address", standard: "The network's own format, with its checksum where it has one", looks: "0x… (Ethereum), bc1… (Bitcoin), T… (Tron)" },
  { name: "Record and list codes", standard: "Stable identifiers of a screening record and of a source list", looks: "Q7747, NK-…, us_ofac_sdn" },
];

/** How to read the results: the standard keywords with their meaning and topic codes, the identifiers and their
 *  standards, and the rules behind match quality and ownership. */
function ReadingKey() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border border-edge bg-page px-3.5 text-micro text-pine hover:bg-hover-light">
        <BookOpen aria-hidden className="size-3.5" strokeWidth={1.8} />
        How to read results
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        label="How to read results"
        header={
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-[20px] leading-7 font-medium tracking-[-0.3px] text-pine">How to read results</h2>
            <span className="text-micro text-slate">The keywords, identifiers and rules used on every data set.</span>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <SectionTitle count={STANDARD.length}>Risk keywords</SectionTitle>
            <p className="m-0 text-micro text-slate">Listed from the gravest. A record shows its three gravest keywords; hover any keyword for its meaning and topic code.</p>
            <Rows
              cols={[
                { key: "tag", header: "Keyword", width: 3 },
                { key: "means", header: "Meaning", width: 7 },
                { key: "codes", header: "Topic codes", width: 3 },
              ]}
              minWidth={600}
              rows={STANDARD.map((c) => ({
                tag: <Tag tone={c.tone}>{c.label}</Tag>,
                means: <span className="text-slate">{c.define}</span>,
                codes: <span className="font-mono text-[11.5px] text-pine">{c.codes}</span>,
              }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <SectionTitle>Match quality</SectionTitle>
            <Rows
              cols={[
                { key: "tag", header: "Label", width: 3 },
                { key: "means", header: "Meaning", width: 9 },
              ]}
              minWidth={520}
              rows={[
                { tag: <Tag tone="approve" check>Exact match</Tag>, means: <span className="text-slate">The name or identifier searched is on the record exactly.</span> },
                { tag: <Tag tone="caution">Closest match, 94%</Tag>, means: <span className="text-slate">No exact hit; the most similar names, with their similarity. Confirm with a date of birth, nationality or identifier.</span> },
                { tag: <Tag>Formerly listed</Tag>, means: <span className="text-slate">No longer on any current list. Kept for history; the notes say where it was listed.</span> },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <SectionTitle>Identifiers</SectionTitle>
            <p className="m-0 text-micro text-slate">Every identifier can be copied with the button beside it, to cite or search it elsewhere exactly.</p>
            <Rows
              cols={[
                { key: "name", header: "Identifier", width: 3 },
                { key: "standard", header: "Standard", width: 5 },
                { key: "looks", header: "Looks like", width: 4 },
              ]}
              minWidth={600}
              rows={IDENT_STANDARDS.map((x) => ({ name: <span className="font-medium">{x.name}</span>, standard: <span className="text-slate">{x.standard}</span>, looks: <span className="text-slate">{x.looks}</span> }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <SectionTitle>Ownership</SectionTitle>
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-body text-pine">
              <li>A company owned 50% or more, directly or through other blocked companies, by parties on the OFAC SDN list is blocked under the OFAC 50% rule, even when it is not listed itself.</li>
              <li>Owners and shares come from company registers and GLEIF as recorded. Missing shares and owners a register does not name limit what can be concluded.</li>
              <li>Name-only matches and PEP status never count toward the 50% rule.</li>
            </ul>
          </div>
          <p className="m-0 rounded-box bg-caution-tint px-4 py-3 text-body text-caution">No match is not a clearance. Results show what the recorded data says; a reviewer makes the decision.</p>
        </div>
      </Drawer>
    </>
  );
}

/* ---------------------------------------------------------------- wallet names (who is behind addresses) -- */

/** A name's risk is the gravest any source gave one of its addresses; each address's own current verdict (a listing
 *  can be lifted) is in the name's address list. */
const ENTITY_RISK: Record<string, { tone: KitTone; label: string; title: string }> = {
  sanctioned: { tone: "danger", label: "Sanctions-listed", title: "At least one address is or was on a sanctions list. Open the name to see each address's current verdict." },
  illicit: { tone: "danger", label: "Illicit activity", title: "Sources link its addresses to illicit activity." },
  risk: { tone: "caution", label: "Risk label", title: "Labelled with a risk such as a mixer or a hack." },
  service: { tone: "inert", label: "Known service", title: "A known crypto service, exchange, pool or contract." },
  info: { tone: "inert", label: "Information", title: "Recorded for information." },
};
const NAME_PAGE = 50;
type NamePage = { entity: AnyRec; page: number; state: "loading" | "error" | { list: AnyRec[]; batch: AnyRec | null } };

/** Names behind wallet addresses, as the industry knows them; opening one lists its addresses with the risk of each,
 *  checked by the wallet engine itself. */
function WalletNames({ data }: { data: AnyRec }) {
  const nq = (data.nameQuery ?? {}) as Record<string, string>;
  const { rows, button, total } = usePaged(data.names ?? {}, (offset) => `/api/explorer/wallet/search?${new URLSearchParams({ ...nq, limit: "25", offset: String(offset) })}`);
  const [np, setNp] = useState<NamePage | null>(null);
  const openName = async (e: AnyRec, page: number) => {
    setNp({ entity: e, page, state: "loading" });
    const r = await getJson(`/api/explorer/wallet/entity?${new URLSearchParams({ id: String(e.id), limit: String(NAME_PAGE), offset: String(page * NAME_PAGE) })}`);
    if (!r.ok) return setNp({ entity: e, page, state: "error" });
    const list = (r.data.addresses ?? []) as AnyRec[];
    const b = list.length ? await getJson("/api/explorer/crypto/screen", { addresses: list.slice(0, 100).map((a) => String(a.address)) }) : null;
    setNp({ entity: e, page, state: { list, batch: b && b.ok ? b.data : null } });
  };
  const words = [nq.q ? `“${nq.q}”` : "", nq.category ? CRYPTO_CATEGORY[nq.category]?.label ?? nq.category : "", nq.chain ? network(nq.chain) : ""].filter(Boolean).join(", ");
  if (!rows.length) return <Empty icon={Wallet} title="No wallet name matches. Try another spelling, a category such as Mixer, or paste an address." />;
  const e = np?.entity;
  const listed = e ? Math.min(500, Number(e.addresses ?? 0)) : 0;
  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-section font-medium text-pine">
          {count(total, "wallet name")}
          {words && <span className="ml-1.5 font-normal text-slate">for {words}</span>}
        </h2>
        {rows.length < total && <span className="tnum text-micro text-muted">Showing {rows.length.toLocaleString()}</span>}
      </div>
      <p className="m-0 text-micro text-slate">Who is behind wallet addresses, by the names used in the industry. Open a name to see its addresses and the risk of each.</p>
      <div className="flex flex-col gap-2">
        {rows.map((x) => {
          const risk = ENTITY_RISK[String(x.risk)] ?? ENTITY_RISK.info!;
          const chains = (x.chains ?? []) as string[];
          const ofac = ((x.sources ?? []) as string[]).some((src) => /^OFAC_SDN/i.test(src));
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => void openName(x, 0)}
              className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 rounded-box border border-hairline bg-page px-4 py-3.5 text-left transition-colors hover:border-edge hover:bg-hover-light/50"
            >
              <EntityGlyph schema="CryptoWallet" tone={risk.tone} />
              <span className="min-w-0">
                <span className="line-clamp-2 text-[15px] leading-5 font-medium text-pine">{x.name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-micro text-slate">
                  <span className="tnum">
                    {Number(x.addresses ?? 0).toLocaleString()} address{Number(x.addresses) === 1 ? "" : "es"}
                  </span>
                  {chains.length > 0 && (
                    <span>
                      {chains.slice(0, 5).map(network).join(", ")}
                      {chains.length > 5 ? ` and ${chains.length - 5} more` : ""}
                    </span>
                  )}
                  {ofac && <span>On the OFAC SDN list</span>}
                </span>
              </span>
              <span className="col-span-3 flex flex-wrap items-center gap-1.5 md:col-span-1 md:justify-end">
                <Tag tone={risk.tone} title={risk.title}>
                  {risk.label}
                </Tag>
                {((x.categories ?? []) as string[])
                  .filter((c) => c !== "sanctioned" && CRYPTO_CATEGORY[c])
                  .slice(0, 3)
                  .map((c) => (
                    <Tag key={c} tone={CRYPTO_CATEGORY[c]!.tone} title={CRYPTO_CATEGORY[c]!.define}>
                      {CRYPTO_CATEGORY[c]!.label}
                    </Tag>
                  ))}
              </span>
            </button>
          );
        })}
      </div>
      {button}
      <Drawer
        open={!!np}
        onClose={() => setNp(null)}
        label="Wallet name"
        header={
          e && (
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-section font-medium text-pine">{e.name}</span>
              <span className="text-micro text-slate">
                {Number(e.addresses ?? 0).toLocaleString()} address{Number(e.addresses) === 1 ? "" : "es"}
                {Number(e.addresses) > 500 ? ", the first 500 are listed" : ""}
              </span>
            </span>
          )
        }
      >
        {np?.state === "loading" && <RecordSkeleton />}
        {np?.state === "error" && <p className="m-0 rounded-box bg-danger-tint px-4 py-3 text-body text-danger">The addresses could not be loaded. Try again.</p>}
        {np && typeof np.state === "object" && (
          <div className="flex flex-col gap-3">
            {np.state.batch ? <WalletBatch data={np.state.batch} /> : <Rows cols={[{ key: "a", header: "Address", width: 8 }, { key: "n", header: "Network", width: 3 }]} rows={np.state.list.map((a) => ({ a: <span className="font-mono text-[12.5px] break-all">{a.address}</span>, n: network(a.chain) }))} />}
            {listed > NAME_PAGE && (
              <span className="flex items-center justify-between gap-2 text-micro text-slate">
                <span className="tnum">
                  Addresses {np.page * NAME_PAGE + 1} to {Math.min(listed, (np.page + 1) * NAME_PAGE)} of {listed.toLocaleString()}
                </span>
                <span className="flex gap-2">
                  <button type="button" disabled={np.page === 0} onClick={() => void openName(np.entity, np.page - 1)} className="inline-flex h-8 items-center rounded-pill border border-edge bg-page px-3 text-micro text-pine hover:bg-hover-light disabled:opacity-40">
                    Previous
                  </button>
                  <button type="button" disabled={(np.page + 1) * NAME_PAGE >= listed} onClick={() => void openName(np.entity, np.page + 1)} className="inline-flex h-8 items-center rounded-pill border border-edge bg-page px-3 text-micro text-pine hover:bg-hover-light disabled:opacity-40">
                    Next
                  </button>
                </span>
              </span>
            )}
          </div>
        )}
      </Drawer>
    </Panel>
  );
}

/** Vessels & aircraft opened by tags: each register the tags ask for, with their filters already set. */
function AssetsBrowse({ data }: { data: AnyRec }) {
  const types = (Array.isArray(data.browse) ? data.browse : [data.browse]).map((t: unknown) => (t === "aircraft" ? "aircraft" : "vessel")) as ("vessel" | "aircraft")[];
  return (
    <div className="flex flex-col gap-4">
      {types.map((t) => (
        <BrowsePanel key={t} type={t} initial={(data.facets ?? {})[t]} initialText={typeof data.text === "string" ? data.text : undefined} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- tags -- */

const TAG_TAB_WORD: Record<TagTab, string> = { screening: "Screening", wallets: "Wallets", assets: "Vessels & aircraft", companies: "Companies" };
const TAG_SHORT: Record<TagGroupId, string> = {
  risk: "Risk", list: "List", type: "Type", country: "Country", press: "Press", crypto_activity: "Crypto", crypto_service: "Crypto",
  chain: "Chain", crypto_name: "Name", maritime: "Maritime", aviation: "Aviation", programme: "Programme", custom: "Team",
};
const tagWorksIn = (t: TagDef, k: Kind) => (tagTabs(t) as string[]).includes(k);
const compactCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString());

/** The tag bank: search every tag, or browse it group by group; team tags can be created and removed here. */
function TagPicker({ bank, selected, onToggle, onCreate, onRemoveCustom, onClose, loading }: {
  bank: TagDef[];
  selected: TagDef[];
  onToggle: (t: TagDef) => void;
  onCreate: (label: string) => Promise<string | null>;
  onRemoveCustom: (t: TagDef) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState<Set<TagGroupId>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const chosen = new Set(selected.map((t) => t.id));
  const fq = foldWords(q);
  const hits = fq ? bank.filter((t) => foldWords(t.label).includes(fq) || t.id.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const exists = bank.some((t) => t.label.toLowerCase() === q.trim().toLowerCase());
  const canCreate = /^[\p{L}\p{N}][\p{L}\p{N} .&'’/-]{1,59}$/u.test(q.trim()) && !exists;
  const chip = (t: TagDef) => (
    <span key={t.id} className="inline-flex">
      <button
        type="button"
        onClick={() => onToggle(t)}
        title={`${t.hint ?? ""} Works in ${listWords(tagTabs(t).map((w) => TAG_TAB_WORD[w]))}.`.trim()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-micro transition-colors",
          chosen.has(t.id) ? "border-pine bg-pine text-lime" : "border-edge bg-page text-pine hover:border-pine/40 hover:bg-hover-light",
        )}
      >
        {t.label}
        {t.count !== undefined && <span className={cn("tnum", chosen.has(t.id) ? "text-lime/70" : "text-muted")}>{compactCount(t.count)}</span>}
      </button>
      {t.group === "custom" && (
        <button type="button" onClick={() => onRemoveCustom(t)} aria-label={`Remove the team tag ${t.label}`} title="Remove this team tag for everyone" className="-ml-1 grid size-6 place-items-center rounded-full text-muted hover:text-danger">
          <X aria-hidden className="size-3" strokeWidth={2.4} />
        </button>
      )}
    </span>
  );
  const create = async () => {
    const message = await onCreate(q.trim());
    if (message) setError(message);
    else {
      setError(null);
      setQ("");
    }
  };
  return (
    <>
      <span aria-hidden className="fixed inset-0 z-30" onClick={onClose} />
      <div role="dialog" aria-label="Tags" className="absolute top-[calc(100%+6px)] left-0 z-40 flex w-[min(720px,calc(100vw-40px))] flex-col gap-3 rounded-box border border-hairline bg-page p-3 shadow-[0_16px_40px_-12px_rgba(14,50,40,0.28)]">
        <input
          ref={(el) => el?.focus()}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && canCreate && !hits.length) void create();
          }}
          placeholder={`Search ${bank.length.toLocaleString()} tags: a risk, a list, a country, a crypto name, a programme`}
          aria-label="Search tags"
          className="h-10 w-full rounded-pill border border-edge bg-page px-4 text-body text-pine outline-none placeholder:text-placeholder focus:border-pine/40"
        />
        {loading && <span className="text-micro text-slate">Loading the lists, topics and countries</span>}
        {error && <span className="text-micro text-danger">{error}</span>}
        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
          {q ? (
            <>
              {hits.length > 0 ? (
                TAG_GROUPS.map((g) => {
                  const items = hits.filter((t) => t.group === g.id).slice(0, 40);
                  if (!items.length) return null;
                  return (
                    <div key={g.id} className="flex flex-col gap-1.5">
                      <span className="text-micro font-medium text-pine">{g.label}</span>
                      <div className="flex flex-wrap gap-1">{items.map(chip)}</div>
                    </div>
                  );
                })
              ) : (
                <span className="text-micro text-slate">No tag matches “{q.trim()}”.</span>
              )}
              {canCreate && (
                <button type="button" onClick={() => void create()} className="inline-flex h-8 items-center gap-1.5 self-start rounded-pill bg-lime px-3 text-micro font-medium text-pine">
                  Create the team tag “{q.trim()}”
                </button>
              )}
            </>
          ) : (
            TAG_GROUPS.map((g) => {
              const items = bank.filter((t) => t.group === g.id);
              const open = all.has(g.id);
              return (
                <div key={g.id} className="flex flex-col gap-1.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-micro font-medium text-pine">
                      {g.label} <span className="tnum font-normal text-muted">{items.length}</span>
                    </span>
                    <span className="text-micro text-slate">{g.about}</span>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(open ? items : items.slice(0, 14)).map(chip)}
                    {items.length > 14 && (
                      <button type="button" onClick={() => setAll((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} className="px-1.5 text-micro font-medium text-pine underline-offset-2 hover:underline">
                        {open ? "Show fewer" : `Show all ${items.length}`}
                      </button>
                    )}
                    {g.id === "custom" && !items.length && <span className="text-micro text-slate">No team tags yet. Type words above to create one.</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

/** The tags chosen for the search and the button that opens the bank. A tag that does not work in this tab is faded
 *  and says where it works; searching with it there opens the tab that understands it. */
function TagBar({ bank, selected, onChange, tab, onCreate, onRemoveCustom, loading }: {
  bank: TagDef[];
  selected: TagDef[];
  onChange: (t: TagDef[]) => void;
  tab: Kind;
  onCreate: (label: string) => Promise<string | null>;
  onRemoveCustom: (t: TagDef) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (t: TagDef) => onChange(selected.some((x) => x.id === t.id) ? selected.filter((x) => x.id !== t.id) : [...selected, t]);
  return (
    <span className="relative inline-flex flex-wrap items-center gap-1.5">
      {selected.map((t) => {
        const here = tagWorksIn(t, tab);
        return (
          <span
            key={t.id}
            title={`${t.hint ?? ""} Works in ${listWords(tagTabs(t).map((w) => TAG_TAB_WORD[w]))}.`.trim()}
            className={cn("inline-flex max-w-full items-center gap-1.5 rounded-pill border py-1 pr-1 pl-2.5 text-micro", here ? "border-pine/30 bg-lime-tint/60 text-pine" : "border-edge bg-page text-slate opacity-70")}
          >
            <span className="text-slate">{TAG_SHORT[t.group]}</span>
            <span className="truncate font-medium">{t.label}</span>
            <button type="button" onClick={() => toggle(t)} aria-label={`Remove the tag ${t.label}`} className="grid size-4 place-items-center rounded-full text-muted hover:bg-hover-light hover:text-pine">
              <X aria-hidden className="size-3" strokeWidth={2.4} />
            </button>
          </span>
        );
      })}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-dashed border-edge px-2.5 text-micro text-slate hover:border-pine/40 hover:text-pine">
        <Tags aria-hidden className="size-3.5" strokeWidth={1.8} />
        {selected.length ? "Add tags" : "Search by tags"}
      </button>
      {selected.length > 1 && (
        <button type="button" onClick={() => onChange([])} className="text-micro text-slate underline-offset-2 hover:text-pine hover:underline">
          Clear tags
        </button>
      )}
      {open && <TagPicker bank={bank} selected={selected} onToggle={toggle} onCreate={onCreate} onRemoveCustom={onRemoveCustom} onClose={() => setOpen(false)} loading={loading} />}
    </span>
  );
}

/* ---------------------------------------------------------------- page -- */

/** What each data set holds, said once under the search box before anything is searched. */
const ABOUT: Record<Kind, string> = {
  screening: "Screen a person or organisation against sanctions, PEP, crime and debarment lists. News, documents and the web that name them sit in side tabs next to the list matches; the web is searched on its own only when our own data holds little.",
  contact: "Investigate a person from any mix of clues: name, email, phone, username, IP address, country and date of birth. Every source runs on its clue and the results are cross-checked. The web is searched when our own archives hold nothing on the clues.",
  companies: "Find a company by name, LEI or register number, with its owners and corporate links.",
  assets: "Find a ship by IMO, MMSI or name, or an aircraft by registration, transponder code, owner or operator, with listings and recorded positions.",
  wallets: "Check one wallet address, or up to 100 at once, against sanctions and illicit-activity lists, or find who is behind addresses by a name such as Tornado Cash, a category such as Mixer, or a chain.",
  catalog: "Find any raw data table by part of its file path.",
};
const LIST_KINDS = new Set<Kind>(["screening", "catalog"]);

export function AmlExplorer() {
  const [kind, setKind] = useState<Kind>("screening");
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>({ s: "idle" });
  const [pending, setPending] = useState<Kind>("screening");
  // filters set before searching, kept for every search on the tab until removed
  const [pre, setPre] = useState<Record<string, string>>({});
  // tags: kept across tabs, each applied where it works
  const [tags, setTags] = useState<TagDef[]>([]);
  const [tagVersion, setTagVersion] = useState(0);
  const catalog = useLoad("/api/explorer/screen/search?all=1&limit=1");
  const customTags = useLoad(`/api/explorer/tags?v=${tagVersion}`);
  const bank = useMemo(() => {
    const f = (catalog.s === "ready" ? catalog.data.facets : null) as AnyRec | null;
    const values = (k: string) => ((f?.[k]?.values ?? []) as AnyRec[]).map((v) => ({ name: String(v.name), label: v.label ? String(v.label) : undefined, count: Number(v.count ?? 0) }));
    return buildTagBank(
      f ? { topics: values("topics"), datasets: values("datasets"), countries: values("countries"), schema: values("schema") } : null,
      // the standard word when it names this one topic; a word shared by several codes ("Maritime risk") gives way to the
      // topic's own name ("Shadow fleet", "Maritime detention")
      (code, fallback) => {
        const c = categoryOf(code);
        return c && !/[,*]/.test(c.codes) ? c.label : (fallback ?? c?.label ?? registerWords(code.replaceAll(".", " ")));
      },
      (c) => countryName(c, {}, true),
      customTags.s === "ready" ? ((customTags.data.tags ?? []) as { id: string; label: string }[]) : [],
    );
  }, [catalog, customTags]);
  const createTag = async (label: string): Promise<string | null> => {
    const r = await getJson("/api/explorer/tags", { label });
    if (!r.ok) return r.message === "signin" ? "Sign in to save team tags." : r.message;
    setTagVersion((v) => v + 1);
    const id = String(r.data.id);
    setTags((ts) => (ts.some((t) => t.id === `custom:${id}`) ? ts : [...ts, { id: `custom:${id}`, group: "custom", label: String(r.data.label), words: String(r.data.label), customId: id }]));
    return null;
  };
  const removeCustom = async (t: TagDef) => {
    if (!t.customId) return;
    await fetch(`${API}/api/explorer/tags/${encodeURIComponent(t.customId)}`, { method: "DELETE", credentials: "include" }).catch(() => null);
    setTagVersion((v) => v + 1);
    setTags((ts) => ts.filter((x) => x.id !== t.id));
  };
  const meta = KINDS.find((k) => k.id === kind)!;
  const preSpecs = kind === "screening" ? SCREEN_SPECS : kind === "contact" ? CONTACT_SPECS : null;

  const run = async (k: Kind, text: string) => {
    // only the filters that belong to this tab go in (a search can move from one tab to the other)
    const own = (specs: ChipSpec[]) => Object.fromEntries(Object.entries(pre).filter(([key]) => specs.some((x) => x.key === key)));
    if (k === "contact") {
      // the investigation runs its sources itself, each filling its own section as it answers; filters set before
      // searching join the clues typed in the box
      const criteria = { ...parseCriteria(text), ...own(CONTACT_SPECS) } as Criteria;
      if (!Object.keys(criteria).length) return setView({ s: "error", message: "Enter one or more clues: a name, an email address, a phone number with its country code (for example +250788123456), an IP address or a username." });
      return setView({ s: "ready", kind: k, data: { criteria }, seq: Date.now(), query: text.trim() });
    }
    // tags shape the search where they work: list filters and names, wallet names and categories, vessel and aircraft filters
    const here = tags.filter((t) => tagWorksIn(t, k));
    if (k !== "catalog" && text.trim().length < 2 && !here.length) return;
    const words = here.length ? tagText(here, k as TagTab) : "";
    if (here.length && k === "screening") {
      const filters = screeningFilters(here);
      const typed = splitScreeningQuery(text).name;
      const qtext = [typed, words].filter(Boolean).join(" ").trim();
      setPending(k);
      setView({ s: "loading" });
      const r = await getJson(screeningUrl(qtext, filters, 0));
      if (!r.ok) return setView(r.message === "signin" ? { s: "signin" } : { s: "error", message: r.message });
      return setView({
        s: "ready", kind: k, seq: Date.now(), query: [text.trim(), words].filter(Boolean).join(" "),
        data: { ...r.data, details: own(SCREEN_SPECS), tagFilters: filters, newsFilters: newsFilters(here) },
      });
    }
    if (here.length && k === "wallets" && !isAddresses(text)) {
      const wf = walletFilters(here);
      const qtext = [text.trim(), words].filter(Boolean).join(" ");
      setPending(k);
      setView({ s: "loading" });
      const r = await walletNames({ ...(qtext ? { q: qtext } : {}), ...(wf.category ? { category: wf.category } : {}), ...(wf.chain ? { chain: wf.chain } : {}) });
      if (!r.ok) return setView(r.message === "signin" ? { s: "signin" } : { s: "error", message: r.message });
      return setView({ s: "ready", kind: k, data: r.data, seq: Date.now(), query: qtext });
    }
    if (here.length && k === "assets") {
      const facets = assetFacets(here);
      const types = (["vessel", "aircraft"] as const).filter((t) => facets[t]);
      if (types.length) return setView({ s: "ready", kind: k, data: { browse: types, facets, text: [text.trim(), words].filter(Boolean).join(" ") }, seq: Date.now(), query: text.trim() });
    }
    if (words && k !== "screening") text = `${text.trim()} ${words}`.trim();
    const query = text.trim();
    const shape = (kind: Kind, data: AnyRec) => (kind === "screening" ? { ...data, details: own(SCREEN_SPECS) } : data);
    setPending(k);
    setView({ s: "loading" });
    const r = await fetchKind(k, text);
    if (!r.ok && r.message === "signin") return setView({ s: "signin" });
    // a screening narrowed by a date of birth, nationality or ID is about a person: it stays where it was typed
    const narrowed = k === "screening" && (Object.keys(own(SCREEN_SPECS)).length > 0 || !!splitScreeningQuery(text).dob);
    const missed = r.ok ? !found(k, r.data, query) : r.status === 404;
    if (missed && !narrowed && FALLBACK.includes(k)) {
      // nothing here: the other tabs that take a name or a number try the same words, and the first that finds it opens
      const others = FALLBACK.filter((x) => x !== k);
      setView({ s: "loading", note: `Nothing in ${tabWord(k)} for “${query}”. Checking ${listWords(others.map(tabWord))}.` });
      const tries = await Promise.all(others.map((x) => fetchKind(x, text)));
      const hit = tries.findIndex((t, i) => t.ok && found(others[i]!, t.data, query));
      if (hit >= 0) {
        const to = others[hit]!;
        setKind(to);
        setPre({});
        return setView({ s: "ready", kind: to, data: shape(to, (tries[hit] as FetchedOk).data), seq: Date.now(), query, moved: { from: k, data: r.ok ? shape(k, r.data) : null } });
      }
    }
    if (r.ok) setView({ s: "ready", kind: k, data: shape(k, r.data), seq: Date.now(), query });
    else setView({ s: "error", message: r.message });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let k = guess(q, kind);
    // a search made of tags alone opens where its tags belong; tags that do not work in this tab take the search to
    // the tab that understands them
    const homes = tags.map(tagHome).filter((x): x is TagTab => !!x);
    if (!q.trim() && homes.length && !homes.includes(k as TagTab)) k = homes[0]!;
    else if (tags.length && !tags.some((t) => tagWorksIn(t, k))) k = (["screening", "wallets", "assets", "companies"] as Kind[]).find((x) => tags.some((t) => tagWorksIn(t, x))) ?? k;
    setKind(k);
    void run(k, q);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">AML Explorer</h1>
          <p className="m-0 max-w-[72ch] text-body text-slate">
            People, organisations, vessels, aircraft, companies and wallets across sanctions, PEP and crime lists, ownership registers and AML news.
          </p>
        </div>
        <ReadingKey />
      </div>

      <TabStrip
        label="Data set"
        tabs={KINDS.map(({ id, label: text, icon }) => ({ id, label: text, icon }))}
        current={kind}
        onSelect={(id) => {
          setKind(id);
          setView({ s: "idle" });
          setPre({});
        }}
      />

      <form onSubmit={submit} className="flex items-start gap-2">
        <label className="sr-only" htmlFor="aml-q">
          {meta.hint}
        </label>
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-[16px] left-4 size-5 text-search-glyph" strokeWidth={1.8} />
          {kind === "wallets" ? (
            <textarea
              id="aml-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={meta.hint}
              autoComplete="off"
              spellCheck={false}
              maxLength={13000}
              rows={Math.min(6, Math.max(1, q.split("\n").length))}
              className="block min-h-[52px] w-full resize-none rounded-[26px] border border-edge bg-page py-[14px] pr-5 pl-12 font-mono text-[13px] leading-6 text-pine outline-none transition-[border-color,box-shadow] placeholder:font-sans placeholder:text-placeholder focus:border-pine/40 focus:shadow-[0_0_0_4px_rgba(191,235,88,0.35)]"
            />
          ) : (
            <input
              id="aml-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={meta.hint}
              autoComplete="off"
              spellCheck={false}
              // the catalog's path search takes up to 100 characters; the other searches 200
              maxLength={meta.id === "catalog" ? 100 : 200}
              className="block h-[52px] w-full rounded-pill border border-edge bg-page pr-5 pl-12 text-field text-pine outline-none transition-[border-color,box-shadow] placeholder:text-placeholder focus:border-pine/40 focus:shadow-[0_0_0_4px_rgba(191,235,88,0.35)]"
            />
          )}
        </div>
        <button
          type="submit"
          disabled={view.s === "loading"}
          className="inline-flex h-[52px] shrink-0 items-center gap-2 rounded-pill bg-lime px-6 text-body font-medium text-pine transition-opacity hover:opacity-90 disabled:opacity-70"
        >
          {view.s === "loading" && <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />}
          Search
        </button>
      </form>

      {(preSpecs || kind === "wallets" || kind === "assets" || kind === "companies") && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5 pl-1">
          {preSpecs && <ChipFilters specs={preSpecs} value={pre} onChange={setPre} addWord="+ Add a filter" offered={kind === "screening" ? screenOffered(pre) : undefined} />}
          {kind !== "contact" && <TagBar bank={bank} selected={tags} onChange={setTags} tab={kind} onCreate={createTag} onRemoveCustom={(t) => void removeCustom(t)} loading={catalog.s === "loading"} />}
        </div>
      )}

      {kind === "assets" && !(view.s === "ready" && view.data.browse) && (
        <div className="flex flex-wrap gap-2">
          {(["vessel", "aircraft"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={(e) => setView({ s: "ready", kind: "assets", data: { browse: t }, seq: e.timeStamp, query: "" })}
              className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-edge bg-page px-3.5 text-micro text-pine hover:bg-hover-light"
            >
              <SlidersHorizontal aria-hidden className="size-3.5" strokeWidth={1.8} />
              Browse all {t === "vessel" ? "vessels" : "aircraft"} with filters
            </button>
          ))}
        </div>
      )}
      {view.s === "idle" && <Empty icon={meta.icon} title={ABOUT[kind]} />}
      {view.s === "loading" && view.note && (
        <p role="status" className="m-0 inline-flex items-center gap-1.5 text-micro text-slate">
          <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
          {view.note}
        </p>
      )}
      {view.s === "loading" && (LIST_KINDS.has(pending) ? <ListSkeleton summary={pending === "screening"} /> : <RecordSkeleton />)}
      {view.s === "signin" && (
        <Empty icon={LockKeyhole} title="Sign in to use the AML Explorer.">
          <Link href="/login?next=%2Fexplorer" className="inline-flex h-9 items-center rounded-pill bg-lime px-4 text-micro font-medium text-pine">
            Sign in
          </Link>
        </Empty>
      )}
      {view.s === "error" && <Empty icon={ShieldAlert} title={view.message} />}
      {view.s === "ready" && (
        <div key={`${view.kind}:${view.seq}`} className="flex flex-col gap-3 duration-300 animate-in fade-in">
          {view.moved && (
            <p className="m-0 flex flex-wrap items-center justify-between gap-2 rounded-box bg-lime-tint px-4 py-2.5 text-micro text-pine">
              <span>
                Nothing in {tabWord(view.moved.from)} for “{view.query}”, so this shows {tabWord(view.kind)}, where it was found.
              </span>
              {view.moved.data && (
                <button
                  type="button"
                  onClick={() => {
                    const m = view.moved!;
                    setKind(m.from);
                    setView({ s: "ready", kind: m.from, data: m.data!, seq: Date.now(), query: view.query });
                  }}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  Show the {tabWord(view.moved.from)} results
                </button>
              )}
            </p>
          )}
          <ResultView kind={view.kind} data={view.data} query={view.query} />
        </div>
      )}
    </div>
  );
}
