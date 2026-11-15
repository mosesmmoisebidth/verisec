/**
 * What a face API's answer says about WHERE things are in the uploaded image, read into one shape the playground can
 * draw: each face's box, its tilt, its five landmarks, a short label for the picture and the details for the list
 * beside it. Coordinates stay exactly as the API returned them: pixels of the image that was sent, top-left origin.
 *
 * Every reader follows its endpoint's documented response; an answer without positions returns null, so nothing is
 * ever drawn that the API did not say.
 */

export type Tone = "pass" | "fail" | "neutral";
export type Fact = { label: string; value: string; tone?: Tone };

export type FaceMark = {
  /** What the face is called on the picture and in the list: "1", or "A1" / "B1" when two images are compared. */
  key: string;
  /** x, y, width, height in the image's own pixels. */
  box: [number, number, number, number];
  /** In-plane tilt in degrees, as the API reports it (the box is drawn turned by minus this). */
  angle?: number;
  /** Eye on the image's left, eye on the image's right, nose tip, left and right mouth corners. */
  points?: [number, number][];
  /** A few words drawn on the picture next to the box. */
  tag?: string;
  tone?: Tone;
  facts: Fact[];
  /** A cropped face the API returned (base64), shown in the list. */
  crop?: string;
};

export type ImageMarks = { image: number; faces: FaceMark[] };

export type FaceDrawing = {
  images: ImageMarks[];
  /** The answer in one line ("2 faces found", "Same person, 99.8%"). */
  headline?: { text: string; tone: Tone };
  /** Face-to-face comparisons (match, verify, similarity). */
  pairs?: { a: string; b: string; similarity: number; tone: Tone }[];
  /** The image the API sent back (redaction), shown instead of the original on request. */
  result?: string;
  /** 1:N search: every gallery photo scored against the reference, marked as a match or not. index = its place in the gallery. */
  gallery?: { index: number; id: string; similarity: number; match: boolean; rank: number }[];
};

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const recs = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 1000) / 10}%` : "");

function box(v: unknown): FaceMark["box"] | null {
  if (!Array.isArray(v) || v.length < 4) return null;
  const [x, y, w, h] = [Number(v[0]), Number(v[1]), Number(v[2]), Number(v[3])];
  return [x, y, w, h].every((n) => Number.isFinite(n)) && w > 0 && h > 0 ? [x, y, w, h] : null;
}

function points(v: unknown): FaceMark["points"] {
  if (!Array.isArray(v)) return undefined;
  const pts = v.filter((p) => Array.isArray(p) && p.length >= 2 && p.every((n: unknown) => typeof n === "number")) as [number, number][];
  return pts.length ? pts.map(([x, y]) => [x, y]) : undefined;
}

/** "EyeRight" -> "Right eye", "MedicalMask" -> "Medical mask". */
const ATTR_LABEL: Record<string, string> = {
  EyeRight: "Right eye", EyeLeft: "Left eye", MedicalMask: "Medical mask", HeadCovering: "Head covering", ForeheadCovering: "Forehead covering",
  Headphones: "Headphones", Occlusion: "Occlusion", Glasses: "Glasses", Smile: "Smile", Mouth: "Mouth", Emotion: "Emotion", Age: "Age",
  FacialHair: "Facial hair", Beard: "Beard", Gender: "Gender", Hat: "Hat", StrongMakeup: "Strong makeup",
};
const words = (k: string) => ATTR_LABEL[k] ?? k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

function attrValue(v: unknown): string {
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number")) return `${v[0]} to ${v[1]}`;
  if (Array.isArray(v)) return v.join(", ");
  return v === null || v === undefined ? "" : String(v);
}

/** One fact per attribute: "Smile: yes (100%)". A yes on a covering reads as worth a look. */
function attributeFacts(list: unknown): Fact[] {
  return recs(list)
    .map((a) => {
      const name = String(a.name ?? "");
      const value = attrValue(a.value);
      if (!name || !value) return null;
      const conf = num(a.confidence);
      const covering = /mask|covering|glasses|headphones|occlusion/i.test(name);
      return {
        label: words(name),
        value: `${value}${conf !== undefined && name !== "Age" ? ` (${pct(conf)})` : ""}`,
        tone: covering && value === "yes" ? "fail" : undefined,
      } as Fact;
    })
    .filter((f): f is Fact => !!f);
}

function ageTag(list: unknown): string | undefined {
  const age = recs(list).find((a) => a.name === "Age")?.value;
  return Array.isArray(age) && age.length === 2 ? `${age[0]} to ${age[1]} yrs` : undefined;
}

function geometryFacts(f: Rec): Fact[] {
  const b = box(f.roi);
  const out: Fact[] = [];
  if (b) out.push({ label: "Box", value: `${b[2]} x ${b[3]} px at ${b[0]}, ${b[1]}` });
  const a = num(f.rotationAngle);
  if (a !== undefined) out.push({ label: "Tilt", value: `${Math.round(a * 10) / 10}°` });
  const p = points(f.landmarks);
  if (p) out.push({ label: "Landmarks", value: `${p.length} points` });
  return out;
}

/** The common case: `faces[]` with a box, an optional tilt and landmarks. */
function faceList(list: unknown, read: (f: Rec, i: number) => Partial<FaceMark> = () => ({})): FaceMark[] {
  return recs(list)
    .map((f, i) => {
      const b = box(f.roi);
      if (!b) return null;
      const extra = read(f, i);
      return {
        key: String(i + 1),
        box: b,
        angle: num(f.rotationAngle),
        points: points(f.landmarks),
        crop: typeof f.crop === "string" && f.crop.length > 100 ? f.crop : undefined,
        ...extra,
        facts: [...(extra.facts ?? []), ...geometryFacts(f)],
      } as FaceMark;
    })
    .filter((m): m is FaceMark => !!m);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function single(faces: FaceMark[], headline?: FaceDrawing["headline"]): FaceDrawing | null {
  return faces.length ? { images: [{ image: 0, faces }], headline: headline ?? { text: `${plural(faces.length, "face")} found`, tone: "neutral" } } : null;
}

/** Faces in a compared image are A1, A2 (first image), B1 (second). */
const letter = (image: number) => String.fromCharCode(65 + image);

const READERS: Record<string, (d: Rec) => FaceDrawing | null> = {
  "face.detect": (d) => single(faceList(d.faces)),

  "face.count": (d) => {
    const ok = d.ok === true;
    const expected = /(\d+)/.exec(String(d.rule ?? ""))?.[1];
    const faces = faceList(d.faces, () => ({ tone: ok ? "pass" : "fail" }));
    const n = num(d.faceCount) ?? faces.length;
    return faces.length
      ? { images: [{ image: 0, faces }], headline: { text: `${plural(n, "face")}${expected ? `, expected ${expected}` : ""}: ${ok ? "as expected" : "not as expected"}`, tone: ok ? "pass" : "fail" } }
      : null;
  },

  "face.analyze": (d) =>
    single(
      faceList(d.faces, (f) => {
        const q = isRec(f.quality) ? f.quality : {};
        const checks = recs(q.checks);
        const failed = Array.isArray(q.nonCompliant) ? (q.nonCompliant as unknown[]).map(String) : [];
        const facts = attributeFacts(f.attributes);
        if (checks.length) {
          facts.push({ label: "Quality", value: `${checks.length - failed.length} of ${checks.length} checks pass`, tone: failed.length ? "fail" : "pass" });
          if (failed.length) facts.push({ label: "Not compliant", value: failed.map(words).join(", "), tone: "fail" });
        }
        return { tag: ageTag(f.attributes), facts, tone: failed.length ? "fail" : "neutral" };
      }),
    ),

  "face.attributes": (d) => single(faceList(d.faces, (f) => ({ tag: ageTag(f.attributes), facts: attributeFacts(f.attributes) }))),

  "face.ppe": (d) =>
    single(
      faceList(d.faces, (f) => {
        const items = Object.entries(f).filter(([k, v]) => typeof v === "string" && !["roi", "landmarks", "rotationAngle", "crop"].includes(k));
        const worn = items.filter(([, v]) => v === "yes").map(([k]) => words(k).toLowerCase());
        return {
          tag: worn.length ? worn.join(", ") : "nothing worn",
          tone: worn.length ? "fail" : "pass",
          facts: items.map(([k, v]) => ({ label: words(k), value: String(v), tone: v === "yes" ? "fail" : undefined }) as Fact),
        };
      }),
    ),

  "face.emotion": (d) =>
    single(
      faceList(d.faces, (f) => {
        const e = typeof f.emotion === "string" ? f.emotion : "";
        const c = num(f.confidence);
        return { tag: e ? `${e}${c !== undefined ? ` ${pct(c)}` : ""}` : undefined, facts: e ? [{ label: "Emotion", value: `${e}${c !== undefined ? ` (${pct(c)})` : ""}` }] : [] };
      }),
    ),

  "face.crop": (d) => single(faceList(d.crops, () => ({ tag: "cropped" })), undefined),

  "face.age": (d) =>
    single(
      faceList(d.faces, (f) => {
        const age = Array.isArray(f.age) ? (f.age as number[]) : null;
        const mid = num(f.ageMid);
        return {
          tag: age ? `${age[0]} to ${age[1]} yrs` : undefined,
          facts: [
            ...(age ? [{ label: "Age range", value: `${age[0]} to ${age[1]}` }] : []),
            ...(mid !== undefined ? [{ label: "Best estimate", value: `${mid}` }] : []),
          ],
        };
      }),
    ),

  "face.redact": (d) => {
    const faces = (Array.isArray(d.boxes) ? d.boxes : [])
      .map((b, i) => {
        const r = box(b);
        return r ? ({ key: String(i + 1), box: r, tag: "hidden", facts: [{ label: "Box", value: `${r[2]} x ${r[3]} px at ${r[0]}, ${r[1]}` }] } as FaceMark) : null;
      })
      .filter((m): m is FaceMark => !!m);
    if (!faces.length) return null;
    return {
      images: [{ image: 0, faces }],
      headline: { text: `${plural(faces.length, "face")} hidden`, tone: "neutral" },
      result: typeof d.image === "string" && d.image.length > 100 ? d.image : undefined,
    };
  },

  "face.match": (d) => {
    const images: ImageMarks[] = recs(d.detections).map((det) => {
      const image = num(det.imageIndex) ?? 0;
      return {
        image,
        faces: recs(det.faces)
          .map((f, i) => {
            const b = box(f.roi);
            if (!b) return null;
            const idx = num(f.faceIndex) ?? i;
            return { key: `${letter(image)}${idx + 1}`, box: b, angle: num(f.rotationAngle), points: points(f.landmarks), facts: geometryFacts(f) } as FaceMark;
          })
          .filter((m): m is FaceMark => !!m),
      };
    });
    const threshold = num(d.threshold) ?? 0.75;
    const pairs = recs(d.results)
      .map((r) => {
        const s = num(r.similarity);
        if (s === undefined) return null;
        const a = `${letter(num(r.firstIndex) ?? 0)}${(num(r.firstFaceIndex) ?? 0) + 1}`;
        const b = `${letter(num(r.secondIndex) ?? 1)}${(num(r.secondFaceIndex) ?? 0) + 1}`;
        return { a, b, similarity: s, tone: (s >= threshold ? "pass" : "fail") as Tone };
      })
      .filter((p): p is NonNullable<typeof p> => !!p)
      .sort((x, y) => y.similarity - x.similarity);
    if (!images.some((i) => i.faces.length)) return null;
    const best = pairs[0];
    return {
      images,
      pairs,
      headline: best
        ? { text: `Best pair ${best.a} and ${best.b}: ${pct(best.similarity)} similar`, tone: best.tone }
        : { text: "No pair could be compared", tone: "fail" },
    };
  },
};

/** Verify (1:1) and Similarity answer with the two faces they compared. */
function compared(d: Rec): FaceDrawing | null {
  const images: ImageMarks[] = [];
  for (const c of recs(d.compared)) {
    const b = box(c.roi);
    const image = c.image === "image2" ? 1 : 0;
    if (!b) continue;
    images.push({ image, faces: [{ key: `${letter(image)}1`, box: b, facts: [{ label: "Box", value: `${b[2]} x ${b[3]} px at ${b[0]}, ${b[1]}` }] }] });
  }
  if (!images.length) return null;
  const s = num(d.similarity);
  const threshold = num(d.threshold);
  const same = typeof d.match === "boolean" ? d.match : threshold !== undefined && s !== undefined ? s >= threshold : undefined;
  const tone: Tone = same === undefined ? "neutral" : same ? "pass" : "fail";
  return {
    images,
    pairs: s !== undefined ? [{ a: "A1", b: "B1", similarity: s, tone }] : [],
    headline: {
      text:
        s === undefined
          ? "Compared"
          : same === undefined
            ? `${pct(s)} similar`
            : `${same ? "Same person" : "Not the same person"}: ${pct(s)}${threshold !== undefined ? `, needs ${pct(threshold)}` : ""}`,
      tone,
    },
  };
}
READERS["face.verify"] = compared;
READERS["face.similarity"] = compared;

/** Face Search (1:N): each gallery photo with its similarity to the reference, matches marked. */
READERS["face.search"] = (d) => {
  const gallery = recs(d.results).map((r, i) => ({
    index: num(r.index) ?? i,
    id: String(r.id ?? `face-${i + 1}`),
    similarity: num(r.similarity) ?? 0,
    match: r.match === true,
    rank: num(r.rank) ?? i + 1,
  }));
  if (!gallery.length) return null;
  const hits = gallery.filter((g) => g.match).length;
  const threshold = num(d.threshold);
  const needs = threshold !== undefined ? `, needs ${pct(threshold)}` : "";
  return {
    images: [],
    gallery,
    headline: {
      text: hits
        ? `${hits} of ${gallery.length} ${gallery.length === 1 ? "photo matches" : "photos match"}${needs}`
        : `No match in ${gallery.length} ${gallery.length === 1 ? "photo" : "photos"}${needs}`,
      tone: hits ? "pass" : "fail",
    },
  };
};

/** The endpoints whose answers carry positions in the image. */
export const DRAWABLE = new Set(Object.keys(READERS));

/** What to draw for this endpoint's answer, or null when it says nothing about positions. */
export function faceDrawing(endpointId: string, data: unknown): FaceDrawing | null {
  const read = READERS[endpointId];
  if (!read || !isRec(data)) return null;
  try {
    return read(data);
  } catch {
    return null;
  }
}
