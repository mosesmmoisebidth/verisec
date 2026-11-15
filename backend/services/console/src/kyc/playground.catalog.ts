/**
 * The API Playground catalog: every sellable API, each described once here on the server as the single source of
 * truth: its own request fields (exactly the designed request, Regula_Coverage/FACE_API_DESIGN.md and
 * UNIFIED_API_IMPLEMENTATION_DESIGN.md), an example response captured from a real run, and its how-to guide.
 * The UI reads the safe view (`GET /api/playground/catalog`); a run goes through `POST /api/playground/run`, which
 * validates the id against this list and turns every encrypted image into a vault token before anything is called.
 */

import { CONTACT_ENDPOINTS } from './playground.contact';
import type { RunContext } from './playground.contact';
import { DOCS } from './playground.docs';
import type { EndpointDocs } from './playground.docs';
import { EXAMPLES } from './playground.examples';

export type PgGroup = 'Face' | 'Face workflows' | 'Document' | 'MRZ' | 'Contact & risk';

export type ParamKind = 'image' | 'images' | 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'string[]' | 'json' | 'rgb';
export type UploadKind = 'face' | 'id-front' | 'id-back' | 'passport' | 'document';
export type CheckDef = { name: string; group: string; range: [number, number] };

/** One request field. `name` is the key in the request body; `path` places it deeper (e.g. "crop.type"). */
export type Param = {
  name: string;
  kind: ParamKind;
  label: string;
  required?: boolean;
  note?: string;
  path?: string;
  choices?: { value: string; label: string }[];
  default?: unknown;
  min?: number;
  max?: number;
  /** Structured editors: pick names from `choices`, checks with ranges, or one line per entry. */
  widget?: 'chips' | 'checks' | 'lines';
  /** What an empty input shows (a line of a `lines` list, or a short field). */
  placeholder?: string;
  /** `lines` holding a machine-readable zone: upper case, `<` fillers, 30/36/44 characters per line. */
  format?: 'mrz';
  checks?: CheckDef[];
  /** For `image` / `images`: what the upload area shows. */
  upload?: UploadKind;
  /** For `image`: the API takes a vault token here, not base64 (proof of address). */
  token?: boolean;
  /** For `images`: a list of uploads. Without `imageKey` each entry is the image itself (base64 strings). */
  list?: { imageKey?: string; idKey?: string; labelKey?: string; indexKey?: string; fields?: Param[]; min: number; max: number; itemLabel: string };
};

export type RunResult = { ok: boolean; data: unknown; error?: { code?: string; message?: string } | null; warnings?: string[] };

export type PgEndpoint = {
  id: string;
  group: PgGroup;
  name: string;
  method: 'POST';
  path: string;
  summary: string;
  /** Major APIs return everything they were asked for; minors return only their own answer. */
  tier: 'major' | 'minor' | 'workflow';
  params: Param[];
  /** Where images sit in the body: "image", "frames[]", "gallery[].image", "images[].data". */
  images?: string[];
  timeoutMs?: number;
  /** For APIs served by the orchestration layer (Contact & risk): runs the call and shapes the designed answer. */
  run?: (body: Record<string, unknown>, ctx: RunContext) => Promise<RunResult>;
};

/* ---------------------------------------------------------------- shared vocabulary -- */

export function looksLikeJwe(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){4}$/.test(v) && v.length < 20_000_000;
}

const ATTRS = ['Age', 'EyeRight', 'EyeLeft', 'Mouth', 'Emotion', 'Smile', 'Glasses', 'HeadCovering', 'ForeheadCovering', 'MedicalMask', 'Occlusion', 'StrongMakeup', 'Headphones'];
const ATTR_LABEL: Record<string, string> = {
  Age: 'Age range', EyeRight: 'Right eye', EyeLeft: 'Left eye', Mouth: 'Mouth', Emotion: 'Emotion', Smile: 'Smile', Glasses: 'Glasses',
  HeadCovering: 'Head covering', ForeheadCovering: 'Forehead covering', MedicalMask: 'Medical mask', Occlusion: 'Face covered',
  StrongMakeup: 'Strong makeup', Headphones: 'Headphones',
};
const ATTR_CHOICES = ATTRS.map((n) => ({ value: n, label: ATTR_LABEL[n] ?? n }));
const PPE = ['MedicalMask', 'Glasses', 'HeadCovering', 'ForeheadCovering', 'Headphones', 'Occlusion'];

const group = (g: string, rows: [string, number, number][]): CheckDef[] => rows.map(([name, a, b]) => ({ name, group: g, range: [a, b] }));
/** Every quality check the engine runs, with its default range (ICAO's 44, plus the three only the Full standard adds). */
export const CHECKS: CheckDef[] = [
  ...group('Image', [['ImageWidth', 480, 10000], ['ImageHeight', 640, 10000], ['ImageWidthToHeight', 0.74, 0.8], ['ImageChannelsNumber', 3, 3], ['ArtFace', 0, 0.5], ['PaddingRatio', 0, 0.05]]),
  ...group('Head position', [['FaceMidPointHorizontalPosition', 0.45, 0.55], ['FaceMidPointVerticalPosition', 0.3, 0.5], ['HeadWidthRatio', 0.5, 0.75], ['HeadHeightRatio', 0.6, 0.9], ['EyesDistance', 90, 10000], ['Yaw', -5, 5], ['Pitch', -8, 8], ['Roll', -5, 5]]),
  ...group('Face quality', [['BlurLevel', 0, 0.15], ['NoiseLevel', 0, 0.2], ['FaceDynamicRange', 7, 8], ['UnnaturalSkinTone', 0, 0.5]]),
  ...group('Eyes', [['EyeRightClosed', 0, 0.5], ['EyeLeftClosed', 0, 0.5], ['EyeRightOccluded', 0, 0.5], ['EyeLeftOccluded', 0, 0.5], ['EyesRed', 0, 0.5], ['EyeRightCoveredWithHair', 0, 0.05], ['EyeLeftCoveredWithHair', 0, 0.05], ['OffGaze', 0, 0.4]]),
  ...group('Lighting', [['TooDark', 0, 0.38], ['TooLight', 0, 0.5], ['FaceGlare', 0, 0.5], ['ShadowsOnFace', 0, 0.5]]),
  ...group('Pose and expression', [['ShouldersPose', 0.6, 1], ['ExpressionLevel', 0, 0.84], ['MouthOpen', 0, 0.5], ['Smile', 0, 0.5]]),
  ...group('Coverings', [['DarkGlasses', 0, 0.5], ['ReflectionOnGlasses', 0, 0.5], ['FramesTooHeavy', 0, 6], ['FaceOccluded', 0, 0.06], ['HeadCovering', 0, 0.5], ['ForeheadCovering', 0, 0.5], ['StrongMakeup', 0, 0.5], ['Headphones', 0, 0.5], ['MedicalMask', 0, 0.5]]),
  ...group('Background', [['BackgroundUniformity', 0.9, 1], ['ShadowsOnBackground', 0.9, 1], ['OtherFaces', 1, 1], ['BackgroundColorMatch', 0.8, 1]]),
];
const CHECK_CHOICES = CHECKS.map((c) => ({ value: c.name, label: c.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2') }));

const CROP = [
  { value: '0', label: '3:4 portrait' }, { value: '1', label: '4:5 portrait (standard)' }, { value: '2', label: '2:3 portrait' },
  { value: '3', label: '1:1 square' }, { value: '4', label: '3:4 portrait, wider' },
];
const CROP_OPTIONAL = [{ value: '', label: 'No crop' }, ...CROP];
const STANDARDS = [{ value: 'ICAO', label: 'ICAO passport photo' }, { value: 'VisaSchengen', label: 'Schengen visa' }, { value: 'VisaUSA', label: 'US visa' }, { value: 'Full', label: 'Every check (Full)' }];
const SCENARIOS = [{ value: 'QualityICAO', label: 'ICAO passport photo' }, { value: 'QualityVisaSchengen', label: 'Schengen visa' }, { value: 'QualityVisaUSA', label: 'US visa' }, { value: 'QualityFull', label: 'Every check (Full)' }];
const ASPECTS = [{ value: '3:4', label: '3:4' }, { value: '4:5', label: '4:5' }, { value: '2:3', label: '2:3' }, { value: '1:1', label: '1:1 square' }];

/* ---------------------------------------------------------------- field builders -- */

const face = (name: string, label: string, required = true, note?: string): Param => ({ name, kind: 'image', label, required, note, upload: 'face' });
const tag: Param = { name: 'tag', kind: 'string', label: 'Tag', note: 'Any text you want echoed back in the response.' };
const threshold = (d: number, note: string): Param => ({ name: 'threshold', kind: 'number', label: 'Threshold', default: d, min: 0, max: 1, note });
const gallery = (name: string, label: string, opts: { min: number; max: number; withLabel?: boolean }): Param => ({
  name, kind: 'images', label, required: true, upload: 'face',
  note: `${opts.min === opts.max ? opts.min : `${opts.min} to ${opts.max}`} faces, each with your own id${opts.withLabel ? ' and a label' : ''}.`,
  list: { imageKey: 'image', idKey: 'id', ...(opts.withLabel ? { labelKey: 'label' } : {}), min: opts.min, max: opts.max, itemLabel: 'face' },
});
const frames = (min: number): Param => ({
  name: 'frames', kind: 'images', label: 'Frames', required: min > 0, upload: 'face',
  note: `${min || 1} to 10 images of the same scene, in order.`, list: { min, max: 10, itemLabel: 'frame' },
});
const docImage = (name: string, label: string, upload: UploadKind, required = true, note?: string): Param => ({ name, kind: 'image', label, required, note, upload });

/* ---------------------------------------------------------------- the catalog -- */

const ep = (e: Omit<PgEndpoint, 'method'>): PgEndpoint => ({ method: 'POST', ...e });

const FACE: PgEndpoint[] = [
  /* Detection */
  ep({
    id: 'face.analyze', group: 'Face', tier: 'major', name: 'Face Analyze', path: '/v1/face/analyze',
    summary: 'Everything in one call: every face with its box, landmarks, aligned crop, the attributes you pick and your quality checks.',
    images: ['image'],
    params: [
      face('image', 'Face image'),
      { name: 'onlyCentralFace', kind: 'boolean', label: 'Only the central face', default: false, note: 'Off returns every face in the image.' },
      { name: 'cropType', path: 'crop.type', kind: 'enum', label: 'Aligned crop', choices: CROP_OPTIONAL, default: '1', note: 'An aligned crop of each face at this shape.' },
      { name: 'attributes', kind: 'string[]', widget: 'chips', choices: ATTR_CHOICES, label: 'Attributes to return', default: ATTRS, note: 'Any of the 13 attributes.' },
      { name: 'qualityChecks', kind: 'json', widget: 'checks', checks: CHECKS, label: 'Your quality checks', default: [{ name: 'Yaw', range: [-5, 5] }, { name: 'BlurLevel', range: [0, 0.15] }], note: 'A check passes when its value is within your range.' },
      tag,
    ],
  }),
  ep({
    id: 'face.detect', group: 'Face', tier: 'minor', name: 'Face Detect', path: '/v1/face/detect',
    summary: 'The faces in an image: box, landmarks, tilt and the count. Nothing else.',
    images: ['image'],
    params: [face('image', 'Image'), { name: 'onlyCentralFace', kind: 'boolean', label: 'Only the central face', default: false, note: 'Off returns every face.' }, tag],
  }),
  ep({
    id: 'face.count', group: 'Face', tier: 'minor', name: 'Face Count', path: '/v1/face/count',
    summary: 'Check that an image holds exactly the number of faces you expect.',
    images: ['image'],
    params: [face('image', 'Image'), { name: 'expected', kind: 'integer', label: 'Expected faces', default: 1, min: 0, max: 100, note: 'ok is true only when the count equals this.' }, tag],
  }),
  ep({
    id: 'face.attributes', group: 'Face', tier: 'minor', name: 'Face Attributes', path: '/v1/face/attributes',
    summary: 'The attributes you pick for each face: age range, emotion, eyes, mouth, glasses, mask, coverings and more.',
    images: ['image'],
    params: [face('image', 'Face image'), { name: 'attributes', kind: 'string[]', widget: 'chips', choices: ATTR_CHOICES, label: 'Attributes to return', required: true, default: ATTRS }, tag],
  }),
  ep({
    id: 'face.ppe', group: 'Face', tier: 'minor', name: 'Mask & Glasses (PPE)', path: '/v1/face/ppe',
    summary: 'Mask, glasses, head and forehead covering, headphones and occlusion, one value per item for each face.',
    images: ['image'],
    params: [face('image', 'Face image'), { name: 'items', kind: 'string[]', widget: 'chips', choices: PPE.map((n) => ({ value: n, label: ATTR_LABEL[n] ?? n })), label: 'Items to check', required: true, default: ['MedicalMask', 'Glasses', 'HeadCovering', 'Headphones'] }, tag],
  }),
  ep({
    id: 'face.emotion', group: 'Face', tier: 'minor', name: 'Emotion', path: '/v1/face/emotion',
    summary: 'The dominant expression of each face, or across a sequence of frames.',
    images: ['image', 'frames[]'],
    params: [face('image', 'Face image', false, 'One image. Or send frames instead.'), frames(0), tag],
  }),
  ep({
    id: 'face.crop', group: 'Face', tier: 'minor', name: 'Smart Crop', path: '/v1/face/crop',
    summary: 'An aligned, cropped face at the shape you choose, ready for an avatar or a document.',
    images: ['image'],
    params: [face('image', 'Image'), { name: 'type', kind: 'enum', label: 'Crop shape', choices: CROP, default: '3' }, { name: 'onlyCentralFace', kind: 'boolean', label: 'Only the central face', default: true }, tag],
  }),
  ep({
    id: 'face.redact', group: 'Face', tier: 'minor', name: 'Face Redact', path: '/v1/face/redact',
    summary: 'The image back with every face blurred, pixelated or boxed out, and where each face was.',
    images: ['image'],
    params: [face('image', 'Image'), { name: 'mode', kind: 'enum', label: 'How to hide faces', choices: [{ value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Pixelate' }, { value: 'box', label: 'Black box' }], default: 'blur' }, tag],
  }),
  /* Match */
  ep({
    id: 'face.match', group: 'Face', tier: 'major', name: 'Face Match', path: '/v1/face/match',
    summary: 'Compare the faces in two images, with each face found, its crop, and a similarity for every pair.',
    images: ['images[].data'],
    params: [
      {
        name: 'images', kind: 'images', label: 'Images', required: true, upload: 'face', note: 'Exactly two images.',
        list: {
          imageKey: 'data', indexKey: 'index', min: 2, max: 2, itemLabel: 'image',
          fields: [
            { name: 'type', kind: 'enum', label: 'Source', choices: [{ value: '3', label: 'Live photo' }, { value: '1', label: 'Printed (document)' }, { value: '2', label: 'Chip (RFID)' }, { value: '5', label: 'External' }], default: '3', note: 'What this image is: a live photo, a printed document portrait, the photo from the chip, or another source.' },
            { name: 'detectAll', kind: 'boolean', label: 'Every face', default: true, note: 'On: every face in the image is compared. Off: only the main face.' },
            { name: 'livenessTransactionId', kind: 'string', label: 'Liveness transaction', note: 'The id of a liveness check you already ran, to link this image to it.' },
          ],
        },
      },
      { name: 'cropType', path: 'crop.type', kind: 'enum', label: 'Aligned crop', choices: CROP_OPTIONAL, default: '', note: 'Adds an aligned crop of every face.' },
      { name: 'limitComparePerImageTypes', kind: 'integer', label: 'Compare limit', min: 1, max: 10, note: 'A cap on comparisons per image type.' },
      tag,
    ],
  }),
  ep({
    id: 'face.verify', group: 'Face', tier: 'minor', name: 'Face Verify (1:1)', path: '/v1/face/verify',
    summary: 'Same person or not: the similarity of two faces against your threshold.',
    images: ['image1', 'image2'],
    params: [face('image1', 'First face'), face('image2', 'Second face'), threshold(0.75, 'match is true at or above this similarity.'), { name: 'livenessTransactionId', kind: 'string', label: 'Liveness transaction', note: 'Links the first face to a passed liveness session.' }, tag],
  }),
  ep({
    id: 'face.similarity', group: 'Face', tier: 'minor', name: 'Similarity Score', path: '/v1/face/similarity',
    summary: 'Only the similarity and the raw distance between two faces.',
    images: ['image1', 'image2'],
    params: [face('image1', 'First face'), face('image2', 'Second face'), tag],
  }),
  ep({
    id: 'face.search', group: 'Face', tier: 'minor', name: 'Face Search (1:N)', path: '/v1/face/search', timeoutMs: 180_000,
    summary: 'Find a face in a gallery you send: the matches at or above your threshold, best first.',
    images: ['probe', 'gallery[].image'],
    params: [face('probe', 'Face to find'), gallery('gallery', 'Gallery', { min: 1, max: 10 }), { name: 'topK', kind: 'integer', label: 'Top matches', default: 3, min: 1, max: 10 }, threshold(0.5, 'Only faces at or above this similarity are matches. Every photo is scored and marked.'), tag],
  }),
  ep({
    id: 'face.dedupe', group: 'Face', tier: 'minor', name: 'Duplicate Check', path: '/v1/face/dedupe',
    summary: 'Is this face already in your set? The closest face and whether it counts as a duplicate.',
    images: ['candidate', 'existing[].image'],
    params: [face('candidate', 'New face'), gallery('existing', 'Existing faces', { min: 1, max: 10 }), threshold(0.8, 'A duplicate at or above this similarity.'), tag],
  }),
  ep({
    id: 'face.watchlist', group: 'Face', tier: 'minor', name: 'Watchlist Screening', path: '/v1/face/watchlist',
    summary: 'Check a face against your own list of faces (blocked, VIP, staff), each with a label.',
    images: ['probe', 'list[].image'],
    params: [face('probe', 'Face to check'), gallery('list', 'Your list', { min: 1, max: 10, withLabel: true }), threshold(0.8, 'A hit at or above this similarity.'), tag],
  }),
  ep({
    id: 'face.cluster', group: 'Face', tier: 'minor', name: 'Face Cluster', path: '/v1/face/cluster',
    summary: 'Group faces by person: every pair compared, faces linked at your threshold.',
    images: ['faces[].image'],
    params: [gallery('faces', 'Faces', { min: 2, max: 8 }), threshold(0.75, 'Two faces join a group at or above this similarity.'), tag],
  }),
  /* Age */
  ep({
    id: 'face.age', group: 'Face', tier: 'major', name: 'Age Estimation', path: '/v1/face/age',
    summary: 'The age range of each face, its midpoint, and an aligned crop.',
    images: ['image'],
    params: [face('image', 'Face image'), { name: 'onlyCentralFace', kind: 'boolean', label: 'Only the central face', default: false }, { name: 'cropType', path: 'crop.type', kind: 'enum', label: 'Aligned crop', choices: CROP_OPTIONAL, default: '1', note: 'Recommended: the range is most exact with a crop.' }, tag],
  }),
  ep({
    id: 'age.verify', group: 'Face', tier: 'minor', name: 'Age Check', path: '/v1/age/verify',
    summary: 'Pass or fail against a minimum age, with the rule that decided it.',
    images: ['image'],
    params: [face('image', 'Face image'), { name: 'minAge', kind: 'integer', label: 'Minimum age', default: 18, min: 0, max: 120 }, { name: 'policy', kind: 'enum', label: 'Decide on', choices: [{ value: 'lowerBound', label: 'Lower end of the range' }, { value: 'midpoint', label: 'Middle of the range' }], default: 'lowerBound' }, tag],
  }),
  ep({
    id: 'age.verify-live', group: 'Face', tier: 'minor', name: 'Age Check + Liveness', path: '/v1/age/verify-live',
    summary: 'The age check, allowed only when the face is also live.',
    images: ['image'],
    params: [face('image', 'Face image'), { name: 'minAge', kind: 'integer', label: 'Minimum age', default: 21, min: 0, max: 120 }, tag],
  }),
  /* Quality */
  ep({
    id: 'face.quality', group: 'Face', tier: 'major', name: 'Photo Quality', path: '/v1/face/quality',
    summary: 'A portrait scored against a photo standard or your own checks: every check with its value, its range and pass or fail.',
    images: ['image'],
    params: [
      face('image', 'Portrait'),
      { name: 'scenario', kind: 'enum', label: 'Standard', choices: SCENARIOS, default: 'QualityICAO' },
      { name: 'onlyCentralFace', kind: 'boolean', label: 'Only the central face', default: true },
      { name: 'outputCropType', path: 'output.crop.type', kind: 'enum', label: 'Aligned crop', choices: CROP_OPTIONAL, default: '0' },
      { name: 'backgroundColor', path: 'output.backgroundColor', kind: 'rgb', label: 'Crop background', default: [255, 255, 255], note: 'Replaces the background of the crop.' },
      { name: 'customChecks', kind: 'json', widget: 'checks', checks: CHECKS, label: 'Your own checks', note: 'When you add checks, they replace the standard: exactly these run, with your ranges.' },
      tag,
    ],
  }),
  ep({
    id: 'photo.compliance', group: 'Face', tier: 'minor', name: 'Photo Compliance', path: '/v1/photo/compliance',
    summary: 'Pass or fail against a passport or visa photo standard, and which checks failed.',
    images: ['image'],
    params: [face('image', 'Portrait'), { name: 'standard', kind: 'enum', label: 'Standard', choices: STANDARDS, default: 'ICAO' }, tag],
  }),
  ep({
    id: 'photo.policy', group: 'Face', tier: 'minor', name: 'Photo Policy', path: '/v1/photo/policy',
    summary: 'Your own checks with your own ranges: exactly those run.',
    images: ['image'],
    params: [face('image', 'Portrait'), { name: 'policy', kind: 'json', widget: 'checks', checks: CHECKS, label: 'Your checks', required: true, default: [{ name: 'Yaw', range: [-10, 10] }, { name: 'BlurLevel', range: [0, 0.15] }] }, tag],
  }),
  ep({
    id: 'photo.gate', group: 'Face', tier: 'minor', name: 'Quality Gate', path: '/v1/photo/gate',
    summary: 'A fast good-enough answer: only the checks you require, at their standard ranges.',
    images: ['image'],
    params: [face('image', 'Photo'), { name: 'require', kind: 'string[]', widget: 'chips', choices: CHECK_CHOICES, label: 'Required checks', required: true, default: ['BlurLevel', 'TooDark', 'OffGaze'] }, tag],
  }),
  ep({
    id: 'photo.autofix', group: 'Face', tier: 'minor', name: 'Photo Auto-fix', path: '/v1/photo/autofix',
    summary: 'The portrait cropped to the shape you need, with its background replaced.',
    images: ['image'],
    params: [face('image', 'Portrait'), { name: 'aspect', kind: 'enum', label: 'Shape', choices: ASPECTS, default: '3:4' }, { name: 'backgroundColor', kind: 'rgb', label: 'Background', default: [255, 255, 255] }, tag],
  }),
  ep({
    id: 'photo.best-frame', group: 'Face', tier: 'minor', name: 'Best Frame', path: '/v1/photo/best-frame',
    summary: 'The most compliant of several frames, and how every frame ranked.',
    images: ['frames[]'],
    params: [frames(2), { name: 'standard', kind: 'enum', label: 'Standard', choices: STANDARDS, default: 'ICAO' }, tag],
  }),
  /* Liveness */
  ep({
    id: 'liveness', group: 'Face', tier: 'major', name: 'Liveness', path: '/v1/liveness',
    summary: 'Passive liveness from one image: live or not, the reason code, and an age estimate.',
    images: ['image'],
    params: [face('image', 'Selfie'), tag],
  }),
  ep({
    id: 'liveness.antispoof', group: 'Face', tier: 'minor', name: 'Anti-spoof Reason', path: '/v1/liveness/antispoof',
    summary: 'Why a face is not live: the reason by name and its category (attack or capture problem).',
    images: ['image'],
    params: [face('image', 'Selfie'), tag],
  }),
  ep({
    id: 'liveness.gate', group: 'Face', tier: 'minor', name: 'Liveness Gate', path: '/v1/liveness/gate',
    summary: 'One pass or fail for a pipeline.',
    images: ['image'],
    params: [face('image', 'Selfie'), { name: 'strict', kind: 'boolean', label: 'Strict', default: true, note: 'Strict also requires a clean reason code.' }, tag],
  }),
];

const WORKFLOWS: PgEndpoint[] = [
  ep({
    id: 'identity.verify', group: 'Face workflows', tier: 'workflow', name: 'Identity Verification', path: '/v1/identity/verify',
    summary: 'Liveness, a quality gate and a 1:1 match against your reference face, in one call.',
    images: ['selfie', 'reference'],
    params: [face('selfie', 'Selfie'), face('reference', 'Reference face', true, 'For example the portrait from the ID document.'), { name: 'minQuality', kind: 'string[]', widget: 'chips', choices: CHECK_CHOICES, label: 'Quality checks', default: ['BlurLevel', 'OffGaze'] }, threshold(0.8, 'Match threshold.'), tag],
  }),
  ep({
    id: 'auth.login', group: 'Face workflows', tier: 'workflow', name: 'Face Login', path: '/v1/auth/login',
    summary: 'Passwordless login: a live selfie found among your enrolled users.',
    images: ['selfie', 'gallery[].image'],
    params: [face('selfie', 'Selfie'), gallery('gallery', 'Enrolled users', { min: 1, max: 10 }), threshold(0.8, 'Login at or above this similarity.'), tag],
  }),
  ep({
    id: 'fraud.signup-check', group: 'Face workflows', tier: 'workflow', name: 'Sign-up Fraud Check', path: '/v1/fraud/signup-check',
    summary: 'At sign-up: is the face live, and has it signed up before?',
    images: ['selfie', 'existing[].image'],
    params: [face('selfie', 'Selfie'), gallery('existing', 'Existing users', { min: 1, max: 10 }), tag],
  }),
  ep({
    id: 'proctor.check', group: 'Face workflows', tier: 'workflow', name: 'Proctoring Check', path: '/v1/proctor/check',
    summary: 'One webcam frame: live, exactly one face, looking at the screen, no mask.',
    images: ['frame'],
    params: [face('frame', 'Webcam frame'), tag],
  }),
  ep({
    id: 'age-gate.checkout', group: 'Face workflows', tier: 'workflow', name: 'Age-gated Checkout', path: '/v1/age-gate/checkout',
    summary: 'Age and liveness together, for age-restricted sales.',
    images: ['selfie'],
    params: [face('selfie', 'Selfie'), { name: 'minAge', kind: 'integer', label: 'Minimum age', default: 18, min: 0, max: 120 }, tag],
  }),
  ep({
    id: 'kiosk.photo', group: 'Face workflows', tier: 'workflow', name: 'Photo Kiosk', path: '/v1/kiosk/photo',
    summary: 'Passport or visa photo booth: compliance, an auto-fixed photo, and whether it is ready to print.',
    images: ['image'],
    params: [face('image', 'Portrait'), { name: 'standard', kind: 'enum', label: 'Standard', choices: STANDARDS, default: 'ICAO' }, { name: 'aspect', kind: 'enum', label: 'Shape', choices: ASPECTS, default: '3:4' }, { name: 'backgroundColor', kind: 'rgb', label: 'Background', default: [255, 255, 255] }, tag],
  }),
];

const DOCUMENT: PgEndpoint[] = [
  ep({
    id: 'idv.read', group: 'Document', tier: 'major', name: 'Document Read', path: '/v1/idv/read', timeoutMs: 180_000,
    summary: 'The full read of an ID document: every container the reader produced (type, fields, MRZ, portrait, checks).',
    images: ['image_front', 'image_back'],
    params: [
      docImage('image_front', 'Document front', 'id-front'),
      docImage('image_back', 'Document back', 'id-back', false, 'The reverse side, when it carries data.'),
      { name: 'scenario', kind: 'enum', label: 'Scenario', choices: [{ value: 'FullProcess', label: 'Full process' }, { value: 'FullAuth', label: 'Full + authenticity' }, { value: 'Barcode', label: 'Barcode only' }, { value: 'Mrz', label: 'MRZ only' }], default: 'FullProcess' },
      { name: 'hintCountry', path: 'doc_hint.country', kind: 'string', label: 'Expected country', note: 'ISO code, for example RW or RWA.' },
      { name: 'hintType', path: 'doc_hint.type', kind: 'enum', label: 'Expected type', choices: [{ value: '', label: 'Any' }, { value: 'passport', label: 'Passport' }, { value: 'national_id', label: 'National ID' }, { value: 'driving_licence', label: 'Driving licence' }, { value: 'residence_permit', label: 'Residence permit' }], default: '' },
    ],
  }),
  ep({
    id: 'idv.classify', group: 'Document', tier: 'minor', name: 'Document Classify', path: '/v1/idv/classify', timeoutMs: 180_000,
    summary: 'Which document this is: its name, type, issuing country, year and confidence.',
    images: ['image'], params: [docImage('image', 'Document', 'id-front')],
  }),
  ep({
    id: 'idv.mrz', group: 'Document', tier: 'minor', name: 'Document MRZ', path: '/v1/idv/mrz', timeoutMs: 180_000,
    summary: 'The MRZ lines read from the document, every field, and every check digit verified.',
    images: ['image'], params: [docImage('image', 'Document page with the MRZ', 'passport')],
  }),
  ep({
    id: 'idv.portrait', group: 'Document', tier: 'minor', name: 'Document Portrait', path: '/v1/idv/portrait', timeoutMs: 180_000,
    summary: 'The portrait cut from the document, and a reference you can pass straight to Face Verify.',
    images: ['image'], params: [docImage('image', 'Document', 'id-front')],
  }),
  ep({
    id: 'idv.authenticity', group: 'Document', tier: 'minor', name: 'Document Authenticity', path: '/v1/idv/authenticity', timeoutMs: 180_000,
    summary: 'The overall verdict, every document check, and the image-quality checks, each pass, fail or not checked.',
    images: ['image_front', 'image_back'],
    params: [docImage('image_front', 'Document front', 'id-front'), docImage('image_back', 'Document back', 'id-back', false)],
  }),
  ep({
    id: 'idv.fields', group: 'Document', tier: 'minor', name: 'Document Fields', path: '/v1/idv/fields', timeoutMs: 180_000,
    summary: 'Which fields were read, from which sources, whether each is valid and the sources agree. Values are masked.',
    images: ['image'], params: [docImage('image', 'Document', 'id-front')],
  }),
  ep({
    id: 'poa.analyze', group: 'Document', tier: 'major', name: 'Proof of Address', path: '/v1/poa/analyze', timeoutMs: 200_000,
    summary: 'Read a proof-of-address document and check it against the name, address and country you expect.',
    images: ['document_token'],
    params: [
      { name: 'document_token', kind: 'image', label: 'Address document', required: true, upload: 'document', token: true, note: 'Encrypted in your browser; the API takes the token of the stored document.' },
      { name: 'filename', kind: 'string', label: 'File name' },
      { name: 'expectedName', path: 'expected.name', kind: 'string', label: 'Expected name' },
      { name: 'expectedAddress', path: 'expected.address', kind: 'string', label: 'Expected address' },
      { name: 'expectedCountry', path: 'expected.country', kind: 'string', label: 'Expected country', note: 'ISO alpha-2, for example RW.' },
    ],
  }),
];

const MRZ: PgEndpoint[] = [
  ep({
    id: 'mrz.read', group: 'MRZ', tier: 'major', name: 'MRZ Read', path: '/v1/mrz/read',
    summary: 'Find the MRZ in an image, read it, parse every field and verify every check digit.',
    images: ['image'], params: [docImage('image', 'Document image', 'passport')],
  }),
  ep({
    id: 'mrz.recognize', group: 'MRZ', tier: 'minor', name: 'MRZ Recognize', path: '/v1/mrz/recognize',
    summary: 'Only the MRZ lines, where they are, and how confident the read is.',
    images: ['image'], params: [docImage('image', 'Document image', 'passport')],
  }),
  ep({
    id: 'mrz.parse', group: 'MRZ', tier: 'minor', name: 'MRZ Parse', path: '/v1/mrz/parse',
    summary: 'Parse MRZ lines you already have: every field, every check digit, and real dates.',
    params: [{ name: 'lines', kind: 'string[]', widget: 'lines', format: 'mrz', max: 3, placeholder: 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', label: 'MRZ lines', required: true, note: 'An ID card has 3 lines of 30 characters, a passport 2 lines of 44.', default: ['P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO7408122F1204159ZE184226B<<<<<10'] }],
  }),
];

export const PG_ENDPOINTS: PgEndpoint[] = [...FACE, ...WORKFLOWS, ...DOCUMENT, ...MRZ, ...CONTACT_ENDPOINTS];
export const PG_BY_ID = new Map(PG_ENDPOINTS.map((e) => [e.id, e]));

/** The safe view the browser receives: no run functions, plus each API's example response and how-to guide. */
export function catalogForClient() {
  const groups: PgGroup[] = ['Face', 'Face workflows', 'Document', 'MRZ', 'Contact & risk'];
  return groups.map((g) => ({
    group: g,
    endpoints: PG_ENDPOINTS.filter((e) => e.group === g).map((e) => ({
      id: e.id, name: e.name, method: e.method, path: e.path, summary: e.summary, tier: e.tier,
      params: e.params, images: e.images ?? [], example: EXAMPLES[e.id] ?? null, docs: (DOCS[e.id] ?? null) as EndpointDocs | null,
    })),
  }));
}
