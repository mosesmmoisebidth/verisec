/* The AML Explorer's tag bank: standard words people search records by, grouped by the engine that understands them.
 * A tag can work in several tabs (a country filters list records, news and vessel flags; "Sanctioned" filters list
 * records, wallets and vessels), and each tag knows how it is asked of each engine. Lists, risk topics, countries and
 * record types are read from the screening index itself, so they follow the lists as they change. */

export type TagGroupId =
  | "risk"
  | "list"
  | "type"
  | "country"
  | "press"
  | "crypto_activity"
  | "crypto_service"
  | "chain"
  | "crypto_name"
  | "maritime"
  | "aviation"
  | "programme"
  | "custom";
export type TagTab = "screening" | "wallets" | "assets" | "companies";
type Facets = Record<string, string>;

export type Tag = {
  id: string;
  group: TagGroupId;
  label: string;
  /** what it means, and the engine's own code, for the hover */
  hint?: string;
  count?: number;
  screening?: { topics?: string; datasets?: string; countries?: string; schema?: string; q?: string };
  news?: { topic?: string; country?: string };
  wallets?: { category?: string; chain?: string; q?: string };
  assets?: { vessel?: Facets; aircraft?: Facets };
  /** a team tag: searched as words wherever text is searched */
  words?: string;
  /** a team tag's row id, so it can be removed */
  customId?: string;
};

export const TAG_GROUPS: { id: TagGroupId; label: string; about: string }[] = [
  { id: "risk", label: "Risk on the lists", about: "Sanctions, PEP, crime, regulatory and trade topics on screening records" },
  { id: "list", label: "Lists and sources", about: "One sanctions, PEP, wanted, debarment or enforcement list" },
  { id: "type", label: "Record type", about: "Person, company, vessel, aircraft, wallet and the other record types" },
  { id: "country", label: "Country", about: "Records, news and vessel or aircraft registrations of one country" },
  { id: "press", label: "Press topics", about: "What news coverage of financial crime is about" },
  { id: "crypto_activity", label: "Crypto activity", about: "What a wallet was used for" },
  { id: "crypto_service", label: "Crypto services", about: "Exchanges, mining pools, tokens and smart contracts" },
  { id: "chain", label: "Blockchains", about: "The network an address is on" },
  { id: "crypto_name", label: "Known crypto names", about: "Groups, mixers, markets, schemes and hacks by name" },
  { id: "maritime", label: "Maritime", about: "Shadow fleet, detentions, sanctioning authorities and AIS" },
  { id: "aviation", label: "Aviation", about: "Sanctioned aircraft, export controls and flight data" },
  { id: "programme", label: "Sanctions programmes", about: "OFAC programmes vessels and aircraft are listed under" },
  { id: "custom", label: "Team tags", about: "Words your team saved; searched as words" },
];

/* ---------------------------------------------------------------- how list topics read in other engines -- */

const TOPIC_NEWS: Record<string, string> = {
  "crime.terror": "terrorism", "crime.fraud": "fraud", "crime.cyber": "cybercrime", "crime.traffick": "trafficking",
  "crime.traffick.drug": "trafficking", "crime.traffick.human": "trafficking", "crime.boss": "organized_crime",
  sanction: "sanctions", "crime.fin": "money_laundering",
};
const TOPIC_WALLET: Record<string, string> = { sanction: "sanctioned", "crime.fraud": "fraud", "crime.cyber": "ransomware" };
const TOPIC_ASSET: Record<string, { vessel?: Facets; aircraft?: Facets }> = {
  sanction: { vessel: { topic: "sanction" }, aircraft: { topic: "sanction" } },
  "mare.shadow": { vessel: { topic: "mare.shadow" } },
  "mare.detained": { vessel: { topic: "mare.detained" } },
  debarment: { vessel: { topic: "debarment" } },
  poi: { vessel: { topic: "poi" } },
  "reg.warn": { vessel: { topic: "reg.warn" } },
  "export.control.linked": { aircraft: { topic: "export.control.linked" } },
};

/* ---------------------------------------------------------------- static groups -- */

const PRESS: [string, string, string, string | undefined][] = [
  // news topic, label, list topic, wallet category
  ["corruption", "Corruption and bribery", "crime.fin", undefined],
  ["money_laundering", "Money laundering", "crime.fin", "mixer"],
  ["fraud", "Fraud", "crime.fraud", "fraud"],
  ["tax_crime", "Tax crime", "crime.fin", undefined],
  ["terrorism", "Terrorism", "crime.terror", "extremism"],
  ["trafficking", "Trafficking", "crime.traffick", "darknet_market"],
  ["organized_crime", "Organised crime", "crime.boss", undefined],
  ["cybercrime", "Cybercrime", "crime.cyber", "ransomware"],
  ["sanctions", "Sanctions", "sanction", "sanctioned"],
];

/** Wallet categories in standard words, each with the news topic that covers it. */
export const CRYPTO_CATEGORY: Record<string, { label: string; tone: "danger" | "caution" | "inert"; news?: string; define: string }> = {
  sanctioned: { label: "Sanctioned", tone: "danger", news: "sanctions", define: "Address of a sanctioned party, or frozen by a stablecoin issuer." },
  formerly_sanctioned: { label: "Formerly sanctioned", tone: "caution", news: "sanctions", define: "Was sanctioned or frozen; the listing has been lifted." },
  ransomware: { label: "Ransomware", tone: "danger", news: "cybercrime", define: "Received ransom payments." },
  mixer: { label: "Mixer", tone: "caution", news: "money_laundering", define: "Mixing service that hides where funds came from." },
  darknet_market: { label: "Darknet market", tone: "danger", news: "trafficking", define: "Darknet marketplace wallet." },
  scam: { label: "Scam", tone: "danger", news: "fraud", define: "Used in a scam, for example sextortion or fake giveaways." },
  phishing: { label: "Phishing", tone: "danger", news: "fraud", define: "Collected funds through phishing." },
  hack: { label: "Hack or theft", tone: "danger", news: "cybercrime", define: "Holds or moved stolen funds from a hack or exploit." },
  fraud: { label: "Fraud", tone: "danger", news: "fraud", define: "Linked to fraud." },
  ponzi: { label: "Ponzi or pyramid scheme", tone: "danger", news: "fraud", define: "Part of a Ponzi, pyramid or MLM scheme." },
  gambling: { label: "Gambling", tone: "caution", define: "Gambling service or casino." },
  extremism: { label: "Extremism", tone: "danger", news: "terrorism", define: "Linked to an extremist group." },
  crime: { label: "Crime", tone: "danger", define: "Linked to another crime." },
  exchange: { label: "Exchange", tone: "inert", define: "Wallet of a crypto exchange." },
  service: { label: "Service", tone: "inert", define: "Wallet of a known crypto service." },
  mining_pool: { label: "Mining pool", tone: "inert", define: "Wallet of a mining pool." },
  token: { label: "Token", tone: "inert", define: "Token contract." },
  contract: { label: "Smart contract", tone: "inert", define: "Verified smart contract." },
};
const ACTIVITY = ["sanctioned", "formerly_sanctioned", "ransomware", "mixer", "darknet_market", "scam", "phishing", "hack", "fraud", "ponzi", "gambling", "extremism", "crime"];
const SERVICES = ["exchange", "service", "mining_pool", "token", "contract"];

export const CHAINS: [string, string][] = [
  ["btc", "Bitcoin"], ["eth", "Ethereum"], ["tron", "Tron"], ["bsc", "BNB Smart Chain"], ["polygon", "Polygon"], ["arbitrum", "Arbitrum"],
  ["optimism", "Optimism"], ["base", "Base"], ["solana", "Solana"], ["avalanche", "Avalanche"], ["fantom", "Fantom"], ["gnosis", "Gnosis"],
  ["celo", "Celo"], ["ton", "TON"], ["sui", "Sui"], ["ltc", "Litecoin"], ["doge", "Dogecoin"], ["bch", "Bitcoin Cash"], ["dash", "Dash"],
  ["cardano", "Cardano"], ["algorand", "Algorand"], ["mantle", "Mantle"], ["scroll", "Scroll"], ["blast", "Blast"],
];

/** Names the industry knows, as they are found in our wallet data and on the lists. */
const CRYPTO_NAMES = [
  "Lazarus Group", "Tornado Cash", "Hydra Market", "Garantex", "Grinex", "Blender.io", "Sinbad.io", "Samourai Wallet", "Bitcoin Fog",
  "Helix Mixer", "Alpha Bay Market", "Nucleus Market", "PlusToken", "Forsage", "LockBit", "Ronin Bridge hack", "Upbit Hack",
  "Binance hack", "Chatex", "SUEX OTC", "Cryptex", "Zedcex", "Wasabi Wallet", "Sextortion spam", "Twitter hack scam",
];

const MARITIME: [string, string, Facets, string][] = [
  ["shadow", "Shadow fleet", { topic: "mare.shadow" }, "Reported as part of a shadow fleet (topic mare.shadow)."],
  ["detained", "Detained in port", { detained: "yes" }, "Detained by a port state control authority."],
  ["sanctioned", "Sanctioned vessel", { risk: "sanctioned" }, "On a sanctions list."],
  ["watch", "Vessel on a watch list", { risk: "watch" }, "Named on a watch or risk list without a sanction."],
  ["no_ais", "No AIS signal recorded", { ais: "no" }, "No AIS position on record."],
  ["ais", "AIS positions recorded", { ais: "yes" }, "Has recorded AIS positions."],
  ["linked", "Vessel linked to a screening record", { screening: "linked" }, "Matches a screening record."],
  ["by_us", "Sanctioned by the United States", { sanctioner: "US" }, "Sanctioning authority: US."],
  ["by_eu", "Sanctioned by the European Union", { sanctioner: "EU" }, "Sanctioning authority: EU."],
  ["by_uk", "Sanctioned by the United Kingdom", { sanctioner: "UK" }, "Sanctioning authority: UK."],
  ["by_ua", "Sanctioned by Ukraine", { sanctioner: "UA" }, "Sanctioning authority: UA."],
  ["by_ca", "Sanctioned by Canada", { sanctioner: "CA" }, "Sanctioning authority: CA."],
  ["by_ch", "Sanctioned by Switzerland", { sanctioner: "CH" }, "Sanctioning authority: CH."],
];
const AVIATION: [string, string, Facets, string][] = [
  ["sanctioned", "Sanctioned aircraft", { risk: "sanctioned" }, "On a sanctions list."],
  ["export", "Aircraft linked to export controls", { topic: "export.control.linked" }, "Linked to an export-controlled party."],
  ["flights", "Flight data recorded", { flight_data: "yes" }, "Has recorded flights."],
  ["linked", "Aircraft linked to a screening record", { screening: "linked" }, "Matches a screening record."],
];
const PROGRAMMES: [string, string][] = [
  ["RUSSIA-EO14024", "Russia (EO 14024)"], ["IRAN", "Iran"], ["IRAN-EO13902", "Iran (EO 13902)"], ["UKRAINE-EO13662", "Ukraine and Russia (EO 13662)"],
  ["GLOMAG", "Global Magnitsky"], ["IFSR", "Iran Freedom and Counter-Proliferation (IFSR)"], ["SDGT", "Global terrorism (SDGT)"],
  ["NPWMD", "Weapons of mass destruction (NPWMD)"], ["DPRK3", "North Korea (DPRK3)"], ["VENEZUELA-EO13884", "Venezuela (EO 13884)"], ["IRGC", "IRGC"],
];

/* ---------------------------------------------------------------- the bank -- */

type FacetValue = { name: string; label?: string; count?: number };

/** Builds the whole bank: the static groups, and the lists, topics, countries and types the screening index holds. */
export function buildTagBank(
  catalog: { topics?: FacetValue[]; datasets?: FacetValue[]; countries?: FacetValue[]; schema?: FacetValue[] } | null,
  topicLabel: (code: string, fallback?: string) => string,
  countryLabel: (code: string) => string,
  custom: { id: string; label: string }[],
): Tag[] {
  const out: Tag[] = [];
  for (const t of catalog?.topics ?? [])
    out.push({
      id: `risk:${t.name}`, group: "risk", label: topicLabel(t.name, t.label), count: t.count, hint: `List topic code: ${t.name}`,
      screening: { topics: t.name },
      ...(TOPIC_NEWS[t.name] ? { news: { topic: TOPIC_NEWS[t.name] } } : {}),
      ...(TOPIC_WALLET[t.name] ? { wallets: { category: TOPIC_WALLET[t.name] } } : {}),
      ...(TOPIC_ASSET[t.name] ? { assets: TOPIC_ASSET[t.name] } : {}),
    });
  for (const d of catalog?.datasets ?? [])
    out.push({ id: `list:${d.name}`, group: "list", label: d.label ?? d.name, count: d.count, hint: `List code: ${d.name}`, screening: { datasets: d.name } });
  for (const s of catalog?.schema ?? [])
    out.push({
      id: `type:${s.name}`, group: "type", label: s.label ?? s.name, count: s.count, hint: `Record type: ${s.name}`,
      screening: { schema: s.name },
      ...(s.name === "Vessel" ? { assets: { vessel: {} } } : s.name === "Airplane" ? { assets: { aircraft: {} } } : {}),
    });
  for (const c of catalog?.countries ?? [])
    out.push({
      id: `country:${c.name}`, group: "country", label: countryLabel(c.name), count: c.count, hint: `Country code: ${c.name.toUpperCase()}`,
      screening: { countries: c.name }, news: { country: c.name },
      assets: { vessel: { flag: c.name.toUpperCase() }, aircraft: { country: c.name.toUpperCase() } },
    });
  for (const [topic, label, listTopic, wallet] of PRESS)
    out.push({
      id: `press:${topic}`, group: "press", label, hint: `News topic: ${topic}`, news: { topic }, screening: { topics: listTopic },
      ...(wallet ? { wallets: { category: wallet } } : {}),
    });
  for (const c of ACTIVITY) {
    const m = CRYPTO_CATEGORY[c]!;
    out.push({ id: `crypto:${c}`, group: "crypto_activity", label: m.label, hint: m.define, wallets: { category: c }, ...(m.news ? { news: { topic: m.news } } : {}) });
  }
  for (const c of SERVICES) out.push({ id: `crypto:${c}`, group: "crypto_service", label: CRYPTO_CATEGORY[c]!.label, hint: CRYPTO_CATEGORY[c]!.define, wallets: { category: c } });
  for (const [code, label] of CHAINS) out.push({ id: `chain:${code}`, group: "chain", label, hint: `Network code: ${code}`, wallets: { chain: code } });
  for (const name of CRYPTO_NAMES) out.push({ id: `cname:${name}`, group: "crypto_name", label: name, wallets: { q: name }, screening: { q: name } });
  for (const [id, label, facets, hint] of MARITIME) out.push({ id: `sea:${id}`, group: "maritime", label, hint, assets: { vessel: facets } });
  for (const [id, label, facets, hint] of AVIATION) out.push({ id: `air:${id}`, group: "aviation", label, hint, assets: { aircraft: facets } });
  for (const [code, label] of PROGRAMMES)
    out.push({ id: `prog:${code}`, group: "programme", label, hint: `Programme code: ${code}`, assets: { vessel: { program: code }, aircraft: { program: code } } });
  for (const c of custom) out.push({ id: `custom:${c.id}`, group: "custom", label: c.label, words: c.label, customId: c.id, hint: "Team tag: searched as words" });
  return out;
}

/* ---------------------------------------------------------------- what tags ask of each engine -- */

/** The tabs a tag works in. */
export function tagTabs(t: Tag): TagTab[] {
  const out: TagTab[] = [];
  if (t.screening || t.news || t.words) out.push("screening");
  if (t.wallets || t.words) out.push("wallets");
  if (t.assets || t.words) out.push("assets");
  if (t.words) out.push("companies");
  return out;
}

/** The tab a tag belongs to: where a search made of that tag alone opens. Team tags belong wherever they are used. */
export function tagHome(t: Tag): TagTab | null {
  if (["risk", "list", "type", "country", "press"].includes(t.group)) return "screening";
  if (["crypto_activity", "crypto_service", "chain", "crypto_name"].includes(t.group)) return "wallets";
  if (["maritime", "aviation", "programme"].includes(t.group)) return "assets";
  return null;
}

export function screeningFilters(tags: Tag[]) {
  const f = { schema: [] as string[], topics: [] as string[], countries: [] as string[], datasets: [] as string[] };
  const add = (k: keyof typeof f, v?: string) => v && !f[k].includes(v) && f[k].push(v);
  for (const t of tags) {
    add("topics", t.screening?.topics);
    add("datasets", t.screening?.datasets);
    add("countries", t.screening?.countries);
    add("schema", t.screening?.schema);
  }
  return f;
}

/** Words the tags add to a text search: known names and team tags. */
export function tagText(tags: Tag[], tab: TagTab): string {
  return tags
    .map((t) => (t.words ? t.words : tab === "screening" ? t.screening?.q : tab === "wallets" ? t.wallets?.q : undefined))
    .filter(Boolean)
    .join(" ");
}

/** The news filters the tags ask for (the news search takes one topic and one country). */
export function newsFilters(tags: Tag[]): { topic?: string; country?: string } {
  return { topic: tags.find((t) => t.news?.topic)?.news?.topic, country: tags.find((t) => t.news?.country)?.news?.country };
}

export function walletFilters(tags: Tag[]): { category?: string; chain?: string } {
  return { category: tags.find((t) => t.wallets?.category)?.wallets?.category, chain: tags.find((t) => t.wallets?.chain)?.wallets?.chain };
}

/** Vessel and aircraft filters from the tags; a register no tag asks for is left out. */
export function assetFacets(tags: Tag[]): { vessel?: Record<string, string[]>; aircraft?: Record<string, string[]> } {
  const out: { vessel?: Record<string, string[]>; aircraft?: Record<string, string[]> } = {};
  for (const t of tags)
    for (const kind of ["vessel", "aircraft"] as const) {
      const f = t.assets?.[kind];
      if (!f) continue;
      const cur = (out[kind] ??= {});
      for (const [k, v] of Object.entries(f)) if (!(cur[k] ??= []).includes(v)) cur[k]!.push(v);
    }
  return out;
}
