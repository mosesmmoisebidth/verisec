/**
 * The public demo's answer: a few clean fields per check, with their confidence, and the names of the further
 * fields a signed-up account sees (locked here). Built on the server from the engine's
 * own response, so the browser receives only this small object: no raw engine output, no internal codes, no engine
 * names, and a payload small enough to arrive at once.
 *
 * The document reader labels every field it reads with a stable field-type code and its own name, so the document
 * curator keys on those codes and works for any country and document type; anything it does not pick is listed
 * (locked), never dropped silently.
 */

export type Tone = 'ok' | 'warn' | 'bad' | 'idle';

export type Curated = {
  check: string;
  status: { label: string; tone: Tone };
  headline: { label: string; value: string; tone?: Tone }[];
  fields: { label: string; value: string; confidence?: number; verified?: boolean }[];
  /** Further fields this check detected, shown locked until sign-up (names only, never values). */
  locked: string[];
  portrait?: string;
  /** ALPR / ANPR only: every vehicle, nested (its plate and the plate's country; the vehicle and its make, colour, body). */
  alpr?: AlprOut;
};

type Ranked = { name: string; confidence: number };
export type AlprOut = {
  image: { width: number; height: number } | null;
  /** A JPEG of the photo, only when it was sent in a format most browsers cannot show (HEIC / HEIF). */
  preview?: string;
  duration_ms: number | null;
  plates_read: number;
  vehicles_found: number;
  vehicles: {
    id: number;
    plate: {
      text: string;
      confidence: number | null;
      detection_confidence: number | null;
      characters: { char: string; confidence: number }[];
      /** 4 corners [x1,y1, x2,y2, x3,y3, x4,y4] in image pixels. */
      box: number[] | null;
      country: { code: string; name: string; state: string | null; confidence: number; alternatives: { code: string; name: string; state: string | null; confidence: number }[] } | null;
    } | null;
    vehicle: {
      confidence: number | null;
      box: number[] | null;
      make_model: { make: string; model: string; year: string | null; confidence: number }[];
      color: Ranked[];
      body_style: Ranked[];
    } | null;
  }[];
};

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const pct = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n <= 1 ? n * 100 : n);
};
const human = (s: string) =>
  s
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());

function dataUrl(b64: unknown): string | undefined {
  const s = str(b64).replace(/\s/g, '');
  if (s.length < 200) return undefined;
  if (s.startsWith('data:')) return s;
  const mime = s.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${s}`;
}

function empty(check: string, label = 'Nothing could be read'): Curated {
  return { check, status: { label, tone: 'warn' }, headline: [], fields: [], locked: [] };
}

/* ------------------------------------------------------------------ identity document -- */

// Stable field-type codes of the document reader (the same for every country and layout).
const FT = {
  docNumber: 2,
  expiry: 3,
  issue: 4,
  birth: 5,
  surname: 8,
  given: 9,
  nationality: 11,
  sex: 12,
  fullName: 25,
  issuingState: 38,
};
// Read but derived from other fields, or internal codes: not worth listing.
const DERIVED = new Set([364]);
const DERIVED_NAME = /years since|age at issue|^age$|state code|jurisdiction code|number of duplicates|discriminator|remainder/i;

function curateDocument(raw: unknown): Curated {
  const root = isObj(raw) && isObj(raw.data) && raw.data.ContainerList ? raw.data : raw;
  const list: Obj[] = (isObj(root) && isObj(root.ContainerList) && Array.isArray(root.ContainerList.List) ? root.ContainerList.List : []) as Obj[];
  if (!list.length) return empty('document', 'No document found');

  const text: Obj[] = (list.find((c) => isObj(c.Text))?.Text?.fieldList ?? []) as Obj[];
  const byType = new Map<number, Obj>();
  for (const f of text) if (!byType.has(Number(f.fieldType)) && str(f.value)) byType.set(Number(f.fieldType), f);

  const conf = (f?: Obj) => {
    const ps = ((f?.valueList ?? []) as Obj[]).map((v) => Number(v.probability)).filter((n) => Number.isFinite(n) && n > 0);
    return ps.length ? Math.round(Math.max(...ps)) : undefined;
  };

  const candidate = list.find((c) => isObj(c.OneCandidate))?.OneCandidate as Obj | undefined;
  const fds = (candidate?.FDSIDList ?? {}) as Obj;
  const status = list.find((c) => isObj(c.Status))?.Status as Obj | undefined;
  const images: Obj[] = (list.find((c) => isObj(c.Images))?.Images?.fieldList ?? []) as Obj[];

  // the visible fields, in the order a person reads an ID
  const picked: { label: string; f: Obj }[] = [];
  const take = (label: string, type: number) => {
    const f = byType.get(type);
    if (f) picked.push({ label, f });
  };
  if (byType.has(FT.fullName)) take('Full name', FT.fullName);
  else {
    const s = byType.get(FT.surname);
    const g = byType.get(FT.given);
    if (s || g) picked.push({ label: 'Full name', f: { ...(s ?? g), value: [str(g?.value), str(s?.value)].filter(Boolean).join(' ') } });
  }
  take('Date of birth', FT.birth);
  take('Document number', FT.docNumber);
  take('Date of expiry', FT.expiry);
  take('Sex', FT.sex);
  if (byType.has(FT.nationality)) take('Nationality', FT.nationality);
  else take('Issuing state', FT.issuingState);

  const shownTypes = new Set(picked.map((p) => Number(p.f.fieldType)));
  if (shownTypes.has(FT.fullName)) {
    shownTypes.add(FT.surname);
    shownTypes.add(FT.given);
  }

  const fields = picked.map(({ label, f }) => ({
    label,
    value: str(f.value),
    confidence: conf(f),
    verified: Number(f.validityStatus) === 1 ? true : undefined,
  }));

  // every other detail the reader found, by its own name (locked)
  const locked: string[] = [];
  for (const f of text) {
    const t = Number(f.fieldType);
    const name = str(f.fieldName);
    if (!name || shownTypes.has(t) || DERIVED.has(t) || DERIVED_NAME.test(name) || locked.includes(name)) continue;
    locked.push(name);
  }
  for (const g of images) {
    const t = Number(g.fieldType);
    const name = str(g.fieldName);
    if (t === 201 || t === 207 || t === 208 || !name || locked.includes(name)) continue; // portrait shown; page scans not listed
    locked.push(name);
  }
  locked.push('Security features check', 'Face match to a selfie');

  // headline
  const country = [str(fds.dCountryName), str(fds.dStateName)].filter(Boolean).join(', ');
  const docName = str(fds.dDescription) || str(candidate?.DocumentName);
  const expiryFailed = Number(status?.detailsOptical?.expiry) === 0;
  const overall = Number(status?.overallStatus);
  const statusOut: Curated['status'] = expiryFailed
    ? { label: 'Document expired', tone: 'bad' }
    : overall === 1
      ? { label: 'Checks passed', tone: 'ok' }
      : overall === 0
        ? { label: 'Needs review', tone: 'warn' }
        : { label: 'Read', tone: 'idle' };
  const headline: Curated['headline'] = [];
  if (docName) headline.push({ label: 'Document', value: docName + (str(fds.dYear) ? ` (${str(fds.dYear)})` : '') });
  if (country) headline.push({ label: 'Country', value: country });
  headline.push({ label: 'Status', value: statusOut.label, tone: statusOut.tone });

  const portraitField = images.find((g) => Number(g.fieldType) === 201);
  const portrait = dataUrl(portraitField?.valueList?.[0]?.value);

  return { check: 'document', status: statusOut, headline, fields, locked, portrait };
}

/* ------------------------------------------------------------------ payment card -- */

function curateCard(raw: unknown): Curated {
  if (!isObj(raw)) return empty('card');
  const card = (isObj(raw.card) ? raw.card : Array.isArray(raw.cards) ? raw.cards[0] : null) as Obj | null;
  if (!card) return empty('card', 'No card found');
  const bin = (raw.bin ?? {}) as Obj;
  const bank = (raw.bank ?? {}) as Obj;
  const fieldConf = (name: string) => pct(((card.fields ?? []) as Obj[]).find((f) => f.name === name)?.confidence);
  const network = str(bin.network) || str(card.network_from_prefix);
  const last4 = str(card.last4);
  const first6 = str(card.first6);
  const expiry = str(((card.fields ?? []) as Obj[]).find((f) => f.name === 'valid_thru')?.value);
  const expired = card.expired === true;
  const issuer = str(bank?.resolved?.name) || str(bin.issuer);
  const countryName = str(bin.country_name);

  const status: Curated['status'] =
    raw.status === 'read' ? { label: 'Card read', tone: 'ok' } : raw.status === 'partial' ? { label: 'Partly read', tone: 'warn' } : { label: 'Not readable', tone: 'bad' };

  const headline: Curated['headline'] = [];
  if (network) headline.push({ label: 'Network', value: network });
  if (last4) headline.push({ label: 'Card', value: `•••• ${last4}` });
  if (expiry) headline.push({ label: 'Expiry', value: expired ? `${expiry} (expired)` : expiry, tone: expired ? 'bad' : 'ok' });

  const fields: Curated['fields'] = [];
  if (first6 && last4) fields.push({ label: 'Card number', value: `${first6} •••••• ${last4}`, confidence: fieldConf('number'), verified: card.luhn_valid === true || undefined });
  if (expiry) fields.push({ label: 'Expiry date', value: expiry, confidence: fieldConf('valid_thru') });
  const type = [str(bin.type), str(bin.funding)].filter(Boolean).join(', ');
  if (type) fields.push({ label: 'Card type', value: type });
  if (issuer) fields.push({ label: 'Issuer', value: issuer });
  if (countryName) fields.push({ label: 'Country', value: [str(bin.flag), countryName].filter(Boolean).join(' ') });
  if (typeof card.luhn_valid === 'boolean') fields.push({ label: 'Number checksum', value: card.luhn_valid ? 'Valid' : 'Invalid', verified: card.luhn_valid || undefined });

  const locked = ['Card holder name', 'Full card number', 'Card level', 'Card currency', 'Issuer address', 'Card fingerprint'];

  return { check: 'card', status, headline, fields, locked };
}

/* ------------------------------------------------------------------ cheque (MICR line) -- */

/*
 * The MICR line alone does not say which country a cheque is from: its fields are named by the closest known layout,
 * so a foreign cheque can match a US layout. Country, bank region and layout are therefore never shown here; the
 * country and bank come from reading the whole cheque face, which a signed-up account gets (listed as locked).
 */
function curateCheque(raw: unknown): Curated {
  if (!isObj(raw) || !isObj(raw.line)) return empty('cheque', 'No MICR line found');
  const line = raw.line as Obj;
  const routing = (raw.routing ?? {}) as Obj;
  const status: Curated['status'] =
    raw.status === 'read' ? { label: 'MICR line read', tone: 'ok' } : raw.status === 'partial' ? { label: 'Partly read', tone: 'warn' } : { label: 'Not readable', tone: 'bad' };

  const headline: Curated['headline'] = [{ label: 'Status', value: status.label, tone: status.tone }];
  if (str(line.font)) headline.push({ label: 'Font', value: str(line.font) });
  const lc = pct(line.confidence);
  if (lc) headline.push({ label: 'Confidence', value: `${lc}%`, tone: lc >= 80 ? 'ok' : 'warn' });

  const fields: Curated['fields'] = [];
  const micr = str(line.printed) || str(line.text);
  if (micr) fields.push({ label: 'MICR line', value: micr, confidence: lc });
  for (const f of (raw.fields ?? []) as Obj[]) {
    const value = str(f.value);
    if (!value) continue;
    const name = str(f.name);
    fields.push({ label: name, value, verified: /routing/i.test(name) && routing.checksum_pass === true ? true : undefined });
  }

  const locked = ['Country', 'Bank name and logo', 'Payee name', 'Amount in figures', 'Amount in words', 'Date', 'Signature', 'Drawer name and address'];

  return { check: 'cheque', status, headline, fields, locked };
}

/* ------------------------------------------------------------------ faces -- */

function curateLiveness(raw: unknown): Curated {
  if (!isObj(raw)) return empty('liveness');
  const live = typeof raw.live === 'boolean' ? raw.live : undefined;
  const age = Number(raw.age?.[0]?.pred);
  const status: Curated['status'] = live === true ? { label: 'Live person', tone: 'ok' } : live === false ? { label: 'Not live', tone: 'bad' } : { label: 'No face found', tone: 'warn' };
  const headline: Curated['headline'] = [{ label: 'Liveness', value: live === true ? 'Live' : live === false ? 'Not live' : 'Unknown', tone: status.tone }];
  if (Number.isFinite(age)) headline.push({ label: 'Age estimate', value: String(Math.round(age)) });
  const fields: Curated['fields'] = [{ label: 'Verdict', value: status.label }];
  if (Number.isFinite(age)) fields.push({ label: 'Age estimate', value: `${Math.round(age)} years` });
  return {
    check: 'liveness',
    status,
    headline,
    fields,
    locked: ['Spoof type', 'Liveness score', 'Photo quality checks', 'Deepfake check', 'Face match to a document'],
  };
}

function curateAge(raw: unknown): Curated {
  if (!isObj(raw)) return empty('age');
  const faces = (raw.faces ?? []) as Obj[];
  const face = faces[0];
  if (!face) return empty('age', 'No face found');
  // the age range comes as `age` (age call) or as the "Age" attribute (analyze call)
  const attrAge = Array.isArray(face.attributes) ? (face.attributes as Obj[]).find((a) => a.name === 'Age')?.value : undefined;
  const range = Array.isArray(face.age) ? face.age : Array.isArray(attrAge) ? attrAge : [];
  const [lo, hi] = range as number[];
  const mid = Number.isFinite(Number(face.ageMid)) ? Number(face.ageMid) : Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : NaN;
  const headline: Curated['headline'] = [];
  if (Number.isFinite(mid)) headline.push({ label: 'Estimated age', value: String(Math.round(mid)) });
  if (Number.isFinite(lo) && Number.isFinite(hi)) headline.push({ label: 'Age range', value: `${lo} to ${hi}` });
  const fields: Curated['fields'] = [];
  if (Number.isFinite(mid)) fields.push({ label: 'Estimated age', value: `${Math.round(mid)} years` });
  if (Number.isFinite(lo) && Number.isFinite(hi)) fields.push({ label: 'Age range', value: `${lo} to ${hi} years` });
  fields.push({ label: 'Faces found', value: String(faces.length) });
  return {
    check: 'age',
    status: { label: 'Face read', tone: 'ok' },
    headline,
    fields,
    locked: ['Age check (18+ or 21+)', 'Liveness', 'Photo quality checks', 'Duplicate face search'],
    portrait: dataUrl(face.crop),
  };
}

const ATTR_LABEL: Record<string, string> = {
  Age: 'Age range', EyeRight: 'Right eye', EyeLeft: 'Left eye', MedicalMask: 'Medical mask', HeadCovering: 'Head covering',
  ForeheadCovering: 'Forehead covering', StrongMakeup: 'Strong makeup', Occlusion: 'Face covered',
};

function curateAttributes(raw: unknown): Curated {
  if (!isObj(raw)) return empty('attributes');
  const face = ((raw.faces ?? []) as Obj[])[0];
  if (!face) return empty('attributes', 'No face found');
  const rawAttrs = face.attributes;
  const attrs: { name: string; value: unknown; confidence?: unknown }[] = Array.isArray(rawAttrs)
    ? rawAttrs
    : isObj(rawAttrs)
      ? Object.entries(rawAttrs).map(([name, v]) => (isObj(v) ? { name, value: v.value, confidence: v.confidence } : { name, value: v }))
      : [];
  const show = (v: unknown) => (Array.isArray(v) ? v.join(' to ') : human(str(v)));
  const fields: Curated['fields'] = attrs
    .filter((a) => a.value !== undefined && a.value !== null && str(a.value) !== '')
    .map((a) => ({ label: ATTR_LABEL[a.name] ?? human(a.name), value: show(a.value), confidence: pct(a.confidence) }));
  const pick = (n: string) => fields.find((f) => f.label === (ATTR_LABEL[n] ?? n));
  const headline: Curated['headline'] = ['Age', 'Emotion', 'Smile'].map(pick).filter(Boolean).map((f) => ({ label: f!.label, value: f!.value }));
  const shown = new Set(attrs.map((a) => a.name));
  const locked = ['Head pose', 'Occlusion', 'StrongMakeup', 'Headphones', 'ForeheadCovering', 'Photo quality checks']
    .filter((n) => !shown.has(n))
    .map((n) => ATTR_LABEL[n] ?? human(n));
  return {
    check: 'attributes',
    status: { label: 'Face read', tone: 'ok' },
    headline,
    fields,
    locked,
    portrait: dataUrl(face.crop),
  };
}

/* ------------------------------------------------------------------ face compare (1:1) -- */

function curateFaceCompare(raw: unknown): Curated {
  if (!isObj(raw)) return empty('face-match');
  const sim = Number(raw.similarity); // 0..1 cosine similarity between the two faces
  if (!Number.isFinite(sim) || sim <= 0) {
    return {
      check: 'face-match',
      status: { label: 'No face found in one photo', tone: 'warn' },
      headline: [],
      fields: [],
      locked: ['Liveness of each photo', 'Photo quality checks', 'Face match to a document', 'Deepfake check'],
    };
  }
  const simPct = Math.round(sim * 100);
  const match = raw.match === true;
  const status: Curated['status'] = match ? { label: 'Same person', tone: 'ok' } : { label: 'Different people', tone: 'bad' };
  const headline: Curated['headline'] = [
    { label: 'Result', value: match ? 'Match' : 'No match', tone: status.tone },
    { label: 'Similarity', value: `${simPct}%`, tone: match ? 'ok' : 'bad' },
  ];
  const fields: Curated['fields'] = [
    { label: 'Same person', value: match ? 'Yes' : 'No', verified: match || undefined },
    { label: 'Similarity', value: `${simPct}%` },
  ];
  return {
    check: 'face-match',
    status,
    headline,
    fields,
    locked: ['Liveness of each photo', 'Photo quality checks', 'Face match to a document', 'Deepfake check', 'Age and attributes'],
  };
}

/* ------------------------------------------------------------------ ALPR / ANPR (plate + vehicle) -- */

/*
 * The plate reader returns, for each vehicle it finds: the plate text with a per-character confidence, the country
 * and region the plate is registered in, and the vehicle's colour, body style and make/model (each a ranked list).
 * The ALPR / ANPR demo hides nothing: every vehicle in the image is listed with every field and its confidence, and
 * nothing is locked behind sign-up. No engine or model names leave this function; make/model/colour are detection
 * results, not vendor strings.
 */
function curateAlpr(raw: unknown): Curated {
  if (!isObj(raw)) return empty('alpr');
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };
  const box = (v: unknown) => (Array.isArray(v) && v.length === 8 && v.every((x) => Number.isFinite(Number(x))) ? v.map((x) => Number(x)) : null);
  const ranked = (arr: unknown): Ranked[] =>
    ((Array.isArray(arr) ? arr : []) as Obj[]).filter((t) => isObj(t) && str(t.name)).map((t) => ({ name: human(str(t.name)), confidence: num(t.confidence) ?? 0 }));
  const all = (Array.isArray(raw.plates) ? raw.plates : []).filter(isObj) as Obj[];
  if (!all.length) return empty('alpr', 'No vehicle or plate found');
  // vehicles whose plate was read first, then those seen without a readable plate
  const ordered = [...all.filter((p) => str(p.text)), ...all.filter((p) => !str(p.text))];

  const vehicles: AlprOut['vehicles'] = ordered.map((p, i) => {
    const text = str(p.text);
    const chars = (Array.isArray(p.char_confidences) ? p.char_confidences : []) as unknown[];
    const c = isObj(p.country) ? (p.country as Obj) : null;
    const v = isObj(p.vehicle) ? (p.vehicle as Obj) : null;
    const place = (x: Obj) => ({ code: str(x.code), name: str(x.name), state: str(x.state) || null, confidence: num(x.confidence) ?? 0 });
    return {
      id: i + 1,
      plate: text
        ? {
            text,
            confidence: num(p.confidence),
            detection_confidence: num(p.detection_confidence),
            characters: chars.length === text.length ? text.split('').map((ch, k) => ({ char: ch, confidence: num(chars[k]) ?? 0 })) : [],
            box: box(p.box),
            country: c && str(c.name) ? { ...place(c), alternatives: ((Array.isArray(c.alternatives) ? c.alternatives : []) as Obj[]).filter(isObj).map(place) } : null,
          }
        : null,
      vehicle: v
        ? {
            confidence: num(v.confidence),
            box: box(v.box),
            make_model: ((Array.isArray(v.make_model) ? v.make_model : []) as Obj[])
              .filter((m) => isObj(m) && (str(m.make) || str(m.model)))
              .map((m) => ({ make: str(m.make).toUpperCase(), model: str(m.model), year: str(m.year) || null, confidence: num(m.confidence) ?? 0 })),
            color: ranked(v.color),
            body_style: ranked(v.body_style),
          }
        : null,
    };
  });

  const read = vehicles.filter((v) => v.plate);
  const first = read[0]?.plate ?? null;
  const status: Curated['status'] = read.length ? { label: read.length > 1 ? `${read.length} plates read` : 'Plate read', tone: 'ok' } : { label: 'Vehicle detected, no readable plate', tone: 'warn' };
  const headline: Curated['headline'] = [];
  if (read.length) headline.push({ label: read.length > 1 ? 'Plates' : 'Plate', value: read.map((v) => v.plate!.text).join(', ') });
  if (first?.country) headline.push({ label: 'Country', value: [first.country.name, first.country.state].filter(Boolean).join(', ') });
  if (typeof first?.confidence === 'number') headline.push({ label: 'Confidence', value: `${Math.round(first.confidence)}%`, tone: first.confidence >= 80 ? 'ok' : 'warn' });
  headline.push({ label: 'Vehicles', value: String(vehicles.length) });

  const img = isObj(raw.image) && Number(raw.image.width) > 0 && Number(raw.image.height) > 0 ? { width: Number(raw.image.width), height: Number(raw.image.height) } : null;
  return {
    check: 'alpr',
    status,
    headline,
    fields: [],
    locked: [],
    alpr: {
      image: img,
      ...(str(raw.preview_jpeg).startsWith('data:image/jpeg;base64,') ? { preview: str(raw.preview_jpeg) } : {}),
      duration_ms: num(raw.duration_ms),
      plates_read: read.length,
      vehicles_found: vehicles.length,
      vehicles,
    },
  };
}

const CURATORS: Record<string, (raw: unknown) => Curated> = {
  document: curateDocument,
  card: curateCard,
  cheque: curateCheque,
  alpr: curateAlpr,
  liveness: curateLiveness,
  age: curateAge,
  attributes: curateAttributes,
  'face-match': curateFaceCompare,
};

/** The small, clean answer the public demo sends for one check. Never throws: an unexpected shape reads as empty. */
export function curate(check: string, raw: unknown): Curated {
  try {
    return (CURATORS[check] ?? ((r: unknown) => empty(check)))(raw);
  } catch {
    return empty(check);
  }
}
