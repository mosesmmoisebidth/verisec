/**
 * Container extractors: raw Regula document-read response -> FullResult.
 *
 * Pure and isomorphic (no DOM, no fetch). Containers are keyed by `result_type`
 * (never by position) and split by `page_idx` (0 = front, 1 = back). Every text
 * field carries its per-source values and bounding boxes; every graphic carries
 * its box and image; authenticity and status become an explicit verdict.
 *
 * This module does NOT compute anomalies (see analyze.ts) and does NOT build the
 * client slice (see display.ts). It returns a FullResult with `anomalies: []`.
 */

import { textFieldName, graphicFieldName, documentTypeName, isPiiField, TEXT_FIELD_TYPES } from "./enums";
import type {
  AuthCheck,
  BoundingBox,
  ContainerReport,
  DocClass,
  DocumentPosition,
  FaceInfo,
  FullResult,
  GraphicField,
  LexicalField,
  MrzInfo,
  NormField,
  PageResult,
  ParseOptions,
  QualityCheck,
  Validity,
  Verdict,
} from "./types";

/* ------------------------------- helpers -------------------------------- */

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));
const validity = (v: unknown): Validity =>
  typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : -1;

function box(v: unknown): BoundingBox | undefined {
  const d = asDict(v);
  if (["left", "top", "right", "bottom"].every((k) => k in d)) {
    return { left: num(d.left), top: num(d.top), right: num(d.right), bottom: num(d.bottom) };
  }
  return undefined;
}

function imageSrc(v: unknown, format?: string): string | undefined {
  if (typeof v !== "string" || v.length < 32) return undefined;
  if (v.startsWith("data:")) return v;
  const mime = format && /^[a-z0-9.+-]+$/i.test(format) ? `image/${format.toLowerCase()}` : "image/png";
  return `data:${mime};base64,${v}`;
}

export const CONSISTENT_CONTAINERS = [6, 9, 15, 17, 30, 33, 36, 37, 85, 97];

/** result_type -> the source label its per-source text container represents. */
const TEXT_SOURCE_BY_RT: Record<number, string> = { 17: "VISUAL", 18: "BARCODE", 3: "MRZ", 102: "RFID" };

/**
 * Regula `containerType` code -> source label. A text field's `valueList[]`
 * entries carry a `containerType` and usually an uppercase `source` string;
 * when the string is missing we fall back to this map so no value is dropped.
 */
const SOURCE_BY_CONTAINER_TYPE: Record<number, string> = { 3: "MRZ", 17: "VISUAL", 18: "BARCODE", 102: "RFID", 5: "BARCODE" };
const sourceLabel = (source: unknown, containerType: unknown): string => {
  const s = str(source).toUpperCase();
  if (s) return s;
  const ct = num(containerType);
  return SOURCE_BY_CONTAINER_TYPE[ct] || "";
};

const RESULT_NAME: Record<number, string> = {
  1: "Document image", 3: "MRZ text", 5: "Barcode", 6: "Visual graphics", 7: "MRZ checksums",
  8: "Type candidates", 9: "Document type", 15: "Lexical analysis", 16: "Raw image", 17: "Visual text",
  18: "Barcode text", 19: "Barcode graphics", 20: "Authenticity", 26: "Magnetic stripe", 30: "Image quality",
  32: "Live portrait", 33: "Status", 34: "Portrait comparison", 35: "Ext portrait", 36: "Text",
  37: "Images", 38: "Fingerprints", 39: "Fingerprint comparison", 61: "MRZ position", 62: "Barcode position",
  85: "Document position", 87: "MRZ detector", 97: "Face detection", 101: "RFID raw", 102: "RFID text",
  103: "RFID graphics", 104: "RFID binary", 105: "RFID original graphics", 121: "Mobile DL", 124: "VDS-NC", 125: "VDS",
};
const resultName = (rt: number) => RESULT_NAME[rt] || `Container ${rt}`;

const QUALITY_NAMES: Record<number, string> = {
  0: "Image glare", 1: "Image focus", 2: "Resolution", 3: "Perspective", 4: "Bounds", 5: "Screen capture",
  6: "Portrait present", 7: "Handwritten", 8: "Brightness", 9: "Document colourness",
};
const qualityName = (t: number) => QUALITY_NAMES[t] || `Quality check ${t}`;

// Regula AuthenticityResultType (a bitmask enum, not a small index).
const AUTH_NAMES: Record<number, string> = {
  1: "UV luminescence", 2: "IR-B900", 4: "Image pattern", 8: "Axial protection", 16: "UV fibers",
  32: "IR visibility", 64: "OCR security text", 128: "IPI", 512: "Photo embedding", 1024: "OVI",
  4096: "Holograms", 8192: "Photo area", 32768: "Portrait comparison", 65536: "Barcode format",
  131072: "Kinegram", 262144: "Letter screen", 524288: "Hologram detection", 1048576: "Fingerprint comparison",
  2097152: "Liveness", 4194304: "Extended OCR", 8388608: "Extended MRZ", 16777216: "Encrypted IPI", 33554432: "Document property",
};
const authTypeName = (t: number) => AUTH_NAMES[t] || `Security check ${t}`;

/* ------------------------------ extractors ------------------------------ */

function extractDocClass(c: Dict, page: number): DocClass | undefined {
  const oc = asDict(c.OneCandidate);
  if (!Object.keys(oc).length) return undefined;
  const f = asDict(oc.FDSIDList);
  const dType = num(f.dType);
  return {
    page,
    documentName: str(oc.DocumentName),
    id: num(oc.ID),
    country: str(f.ICAOCode),
    countryName: str(f.dCountryName),
    dType,
    dTypeName: documentTypeName(dType),
    dFormat: num(f.dFormat),
    dMRZ: Boolean(f.dMRZ),
    confidence: num(oc.P),
    rotated180: Boolean(num(oc.Rotated180)),
    rotationAngle: num(oc.RotationAngle) || 0,
  };
}

/**
 * Per-source text boxes. Keyed source -> fieldType -> page -> box, because the
 * merged Text container (36) can live on a different page than the per-source
 * container that owns the box: on a two-sided document the barcode text (18) is
 * read from the back (page 1) while the merged fields report on page 0. Keying
 * by source and field type (with the page recorded) lets a field pick up its
 * box wherever that source produced it.
 */
type BoxIndex = Record<string, Record<number, Record<number, BoundingBox>>>;

function indexSourceBoxes(c: Dict, rt: number, page: number, idx: BoxIndex) {
  const src = TEXT_SOURCE_BY_RT[rt];
  if (!src) return;
  const info = asDict(c.DocVisualExtendedInfo);
  for (const f of asArr(info.pArrayFields)) {
    const fd = asDict(f);
    const ft = num(fd.FieldType);
    const b = box(fd.FieldRect);
    if (!b || !Number.isFinite(ft)) continue;
    ((idx[src] ||= {})[ft] ||= {})[page] = b;
  }
}

/** Look up a source's box for a field type, preferring the value's own page. */
function findBox(idx: BoxIndex, source: string, ft: number, preferPage: number): { box?: BoundingBox; page: number } {
  const byPage = idx[source]?.[ft];
  if (!byPage) return { page: preferPage };
  const onPreferred = byPage[preferPage];
  if (onPreferred) return { box: onPreferred, page: preferPage };
  const firstPage = Object.keys(byPage)[0];
  if (firstPage == null) return { page: preferPage };
  return { box: byPage[Number(firstPage)], page: Number(firstPage) };
}

const SOURCE_BOX_PRIORITY = ["VISUAL", "MRZ", "BARCODE", "RFID"];

function extractTextFields(c: Dict, page: number, boxes: BoxIndex): NormField[] {
  const text = asDict(c.Text);
  const out: NormField[] = [];
  for (const f of asArr(text.fieldList)) {
    const fd = asDict(f);
    const ft = num(fd.fieldType);
    const sources = asArr(fd.valueList).map((s) => {
      const sd = asDict(s);
      const source = sourceLabel(sd.source, sd.containerType);
      const preferPage = Number.isFinite(num(sd.pageIndex)) ? num(sd.pageIndex) : page;
      const located = findBox(boxes, source, ft, preferPage);
      return {
        source,
        value: str(sd.value ?? sd.originalValue),
        validity: validity(sd.validityStatus ?? sd.originalValidity),
        box: located.box,
        page: located.page,
      };
    });
    const comparisons = asArr(fd.comparisonList)
      .map((e) => {
        const ed = asDict(e);
        return { left: str(ed.sourceLeft).toUpperCase(), right: str(ed.sourceRight).toUpperCase(), status: num(ed.status) };
      })
      .filter((x) => x.left && x.right);
    // Best box: prefer the visual source, then MRZ, barcode, RFID, then any.
    let best: BoundingBox | undefined;
    for (const pref of SOURCE_BOX_PRIORITY) {
      const hit = sources.find((s) => s.source === pref && s.box);
      if (hit) {
        best = hit.box;
        break;
      }
    }
    if (!best) best = sources.find((s) => s.box)?.box;
    out.push({
      type: ft,
      name: str(fd.fieldName) || textFieldName(ft),
      lcid: typeof fd.lcid === "number" ? fd.lcid : undefined,
      value: str(fd.value),
      // Prefer the field's aggregate status (OK when the value is trusted) over
      // validityStatus, which is often WAS_NOT_DONE from a plain photo.
      validity: validity(fd.status ?? fd.validityStatus),
      page,
      box: best,
      sources,
      comparisons,
      pii: isPiiField(ft),
    });
  }
  return out;
}

function extractGraphics(c: Dict, page: number): GraphicField[] {
  const out: GraphicField[] = [];
  const gi = asDict(c.DocGraphicsInfo);
  for (const g of asArr(gi.pArrayFields)) {
    const gd = asDict(g);
    const ft = num(gd.FieldType);
    const img = asDict(gd.image);
    out.push({
      type: ft,
      name: str(gd.FieldName) || graphicFieldName(ft),
      page,
      box: box(gd.FieldRect),
      src: imageSrc(img.image, str(img.format)),
    });
  }
  const images = asDict(c.Images);
  for (const im of asArr(images.fieldList)) {
    const imd = asDict(im);
    const ft = num(imd.fieldType);
    for (const vl of asArr(imd.valueList)) {
      const vd = asDict(vl);
      const src = imageSrc(vd.value);
      if (!src) continue;
      // A single Images container can carry both the front and back crops; route
      // each by its own page index so a back crop is not shown as a front image.
      const vp = num(vd.pageIndex ?? vd.originalPageIndex);
      const gpage = Number.isFinite(vp) ? Math.max(0, Math.trunc(vp)) : page;
      out.push({ type: ft, name: str(imd.fieldName) || graphicFieldName(ft), page: gpage, box: box(vd.fieldRect), src });
    }
  }
  return out;
}

function extractQuality(c: Dict, page: number): QualityCheck[] {
  const iq = asDict(c.ImageQualityCheckList);
  const out: QualityCheck[] = [];
  for (const q of asArr(iq.List)) {
    const qd = asDict(q);
    const r = num(qd.result); // CheckResult: 1 = OK, 0 = ERROR, 2 = WAS_NOT_DONE
    if (r === 2) continue; // a check that was not performed is not shown
    const t = num(qd.type ?? qd.featureType);
    out.push({
      type: t,
      name: qualityName(t),
      passed: r === 1,
      probability: typeof qd.probability === "number" ? qd.probability : undefined,
      mean: typeof qd.mean === "number" ? qd.mean : undefined,
      stdDev: typeof qd.std_dev === "number" ? qd.std_dev : undefined,
      page,
    });
  }
  return out;
}

function extractAuth(c: Dict, page: number): AuthCheck[] {
  const al = asDict(c.AuthenticityCheckList);
  return asArr(al.List).map((a) => {
    const ad = asDict(a);
    const elements = asArr(ad.List).map((e) => {
      const ed = asDict(e);
      return {
        type: num(ed.ElementType),
        result: validity(ed.ElementResult),
        diagnose: typeof ed.ElementDiagnose === "number" ? ed.ElementDiagnose : undefined,
        critical: Boolean(num(ed.CriticalFlag)),
        box: box(ed.ElementRect),
      };
    });
    return { type: num(ad.Type), name: authTypeName(num(ad.Type)), result: validity(ad.Result), page, elements };
  });
}

function extractPosition(c: Dict): DocumentPosition | undefined {
  const p = asDict(c.DocumentPosition);
  if (!Object.keys(p).length) return undefined;
  const pt = (v: unknown) => ({ x: num(asDict(v).x), y: num(asDict(v).y) });
  return {
    quad: [pt(p.LeftTop), pt(p.RightTop), pt(p.RightBottom), pt(p.LeftBottom)],
    center: pt(p.Center),
    angle: num(p.Angle),
    width: num(p.Width),
    height: num(p.Height),
    dpi: num(p.Dpi),
    status: validity(p.ResultStatus),
  };
}

function extractFaces(c: Dict, page: number): FaceInfo | undefined {
  const fd = asDict(c.FaceDetection);
  if (!("Count" in fd)) return undefined;
  const boxes = asArr(fd.Res)
    .map((r) => box(asDict(r).FaceRect))
    .filter((b): b is BoundingBox => !!b);
  return { count: num(fd.Count), boxes, page };
}

function extractMrz(c: Dict, rt: number, page: number, acc: Record<number, MrzInfo>) {
  if (rt === 87) {
    const m = asDict(c.ResultMRZDetector);
    if (m.MRZRows) {
      // rows can arrive as objects (character boxes), not text: keep text rows only; the MRZ text itself is in the MRZ Strings field
      (acc[page] ||= { rows: [], checksums: [], page }).rows = asArr(m.MRZRows).filter((r): r is string => typeof r === "string" && r.length > 0);
      acc[page].format = str(m.MRZFormat) || acc[page].format;
    }
  }
  if (rt === 7) {
    const mq = asDict(c.MRZTestQuality);
    const cur = (acc[page] ||= { rows: [], checksums: [], page });
    for (const k of Object.keys(mq)) {
      if (k === "Strings" || k === "StrCount") continue;
      cur.checksums.push({ name: k, value: str(mq[k]) });
    }
  }
}

function extractLexical(c: Dict, page: number): LexicalField[] {
  const lv = asDict(c.ListVerifiedFields);
  return asArr(lv.pFieldMaps).map((m) => {
    const md = asDict(m);
    const ft = num(md.FieldType);
    const sources: string[] = [];
    if ("Field_Visual" in md) sources.push("VISUAL");
    if ("Field_Barcode" in md) sources.push("BARCODE");
    if ("Field_MRZ" in md) sources.push("MRZ");
    if ("Field_RFID" in md) sources.push("RFID");
    return {
      type: ft,
      name: textFieldName(ft),
      lcid: typeof md.wLCID === "number" ? md.wLCID : undefined,
      sources,
      matrix: asArr(md.Matrix).map(num),
    };
  });
}

function extractVerdict(c: Dict): Verdict {
  const s = asDict(c.Status);
  const d = asDict(s.detailsOptical);
  const r = asDict(s.detailsRFID);
  return {
    overallStatus: validity(s.overallStatus),
    optical: validity(s.optical),
    security: validity(d.security),
    text: validity(d.text),
    mrz: validity(d.mrz),
    imageQA: validity(d.imageQA),
    expiry: validity(d.expiry),
    docType: validity(d.docType),
    portrait: validity(s.portrait),
    rfid: validity(s.rfid),
    stopList: validity(s.stopList),
    rfidDetails: Object.keys(r).length
      ? { AA: num(r.AA), BAC: num(r.BAC), CA: num(r.CA), PA: num(r.PA), PACE: num(r.PACE), TA: num(r.TA) }
      : undefined,
    specimen: false,
  };
}

/* ----------------------------- orchestrator ----------------------------- */

/** Find the ContainerList wherever it sits in the envelope. */
export function extractContainerList(resp: unknown): { List: unknown[]; Count?: number } {
  let node: unknown = resp;
  for (let i = 0; i < 6 && node && typeof node === "object"; i++) {
    const d = node as Dict;
    if (d.ContainerList) {
      const cl = asDict(d.ContainerList);
      return { List: asArr(cl.List), Count: typeof cl.Count === "number" ? cl.Count : undefined };
    }
    node = d.data;
  }
  return { List: [] };
}

/** Real, non-negative page index of a container (front = 0). Missing -> 0. */
const pageOf = (c: Dict): number => Math.max(0, Math.trunc(num(c.page_idx)) || 0);

/** Raw response -> FullResult with `anomalies: []` (analyze.ts fills anomalies). */
export function extractFull(resp: unknown, opts: ParseOptions): FullResult {
  const { List } = extractContainerList(resp);
  const pagesMap: Record<number, PageResult> = {};
  const boxes: BoxIndex = {};
  const mrzAcc: Record<number, MrzInfo> = {};
  const authChecks: AuthCheck[] = [];
  const containerCounts = new Map<string, ContainerReport>();
  let verdict: Verdict | null = null;
  let faces = 0;
  let specimenText = false;

  const page = (p: number): PageResult => (pagesMap[p] ||= { page: p, fields: [], graphics: [], quality: [] });
  // every detail a text container read with a value, and which sources read it (see FullResult.readFields)
  const read = new Map<number, Set<string>>();
  const noteRead = (ft: number, source: string) => {
    if (Number.isFinite(ft) && ft >= 0) (read.get(ft) ?? read.set(ft, new Set()).get(ft)!).add(source);
  };

  // First pass: index per-source boxes so text fields can attach them.
  for (const raw of List) {
    const c = asDict(raw);
    if (typeof c.result_type === "number" && TEXT_SOURCE_BY_RT[c.result_type]) indexSourceBoxes(c, c.result_type, pageOf(c), boxes);
  }

  for (const raw of List) {
    const c = asDict(raw);
    const rt = typeof c.result_type === "number" ? c.result_type : -1;
    const p = pageOf(c);
    const pg = page(p);
    if (rt >= 0) {
      const key = `${rt}:${p}`;
      const rep = containerCounts.get(key);
      if (rep) rep.count += 1;
      else containerCounts.set(key, { resultType: rt, name: resultName(rt), page: p, count: 1 });
    }

    // the per-source text containers (printed side, barcode, MRZ, chip): what each one read, field by field
    const src = TEXT_SOURCE_BY_RT[rt];
    if (src)
      for (const f of asArr(asDict(c.DocVisualExtendedInfo).pArrayFields)) {
        const fd = asDict(f);
        const text = typeof fd.Buf_Text === "string" ? fd.Buf_Text.trim() : "";
        if (text) noteRead(num(fd.FieldType), src);
      }

    switch (rt) {
      case 9:
        pg.docClass = extractDocClass(c, p) || pg.docClass;
        break;
      case 36: {
        const fields = extractTextFields(c, p, boxes);
        pg.fields.push(...fields);
        for (const fld of fields) {
          const withValue = fld.sources.filter((s) => s.value);
          for (const s of withValue) noteRead(fld.type, s.source);
          if (fld.value && !withValue.length) noteRead(fld.type, "TEXT");
        }
        for (const fld of fields) {
          const v = `${fld.value} ${fld.sources.map((s) => s.value).join(" ")}`.toUpperCase();
          if (/\b(SPECIMEN|SAMPLE|MUSTER|VOID)\b/.test(v)) specimenText = true;
        }
        break;
      }
      case 6:
      case 37:
        // Route each figure to the page it actually belongs to (an Images
        // container on the front page can still hold the back crop).
        for (const g of extractGraphics(c, p)) page(g.page).graphics.push(g);
        break;
      case 30:
        pg.quality.push(...extractQuality(c, p));
        break;
      case 15:
        (pg.lexical ||= []).push(...extractLexical(c, p));
        break;
      case 20:
        authChecks.push(...extractAuth(c, p));
        break;
      case 85:
        pg.position = extractPosition(c) || pg.position;
        break;
      case 97: {
        const f = extractFaces(c, p);
        if (f) {
          pg.faces = f;
          faces += f.count;
        }
        break;
      }
      case 87:
      case 7:
        extractMrz(c, rt, p, mrzAcc);
        break;
      case 33:
        verdict = extractVerdict(c);
        break;
      default:
        break;
    }
  }

  for (const [p, m] of Object.entries(mrzAcc)) page(Number(p)).mrz = m;

  const v: Verdict = verdict || {
    overallStatus: -1, optical: -1, security: -1, text: -1, mrz: -1, imageQA: -1,
    expiry: -1, docType: -1, portrait: -1, rfid: -1, stopList: -1, specimen: false,
  };
  // Specimen is driven only by explicit SPECIMEN / SAMPLE markers in the read
  // text. An `overallStatus` of 0 means "not performed" (a genuine document with
  // an incomplete read, e.g. one side only or no chip), NOT a fake, so it must
  // not fail a real holder.
  v.specimen = specimenText;

  const pages = Object.values(pagesMap).sort((a, b) => a.page - b.page);
  const containersPresent = [...containerCounts.values()].sort(
    (a, b) => a.page - b.page || a.resultType - b.resultType,
  );

  return {
    country: (opts.country || "").toUpperCase(),
    docType: opts.docType,
    pages,
    verdict: v,
    authChecks,
    anomalies: [],
    errors: [],
    readFields: [...read].map(([type, s]) => ({ type, key: TEXT_FIELD_TYPES[type] ?? "", sources: [...s] })),
    faces,
    containersPresent,
    raw: opts.keepRaw ? resp : undefined,
  };
}
