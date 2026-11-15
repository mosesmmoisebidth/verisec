/**
 * The public landing-page demo's fixed menu. A guest can run only these, each with one uploaded
 * image, and only through the gate in demo.controller.ts. Two transports:
 *   - 'enc'       the image is encrypted in the browser (JWE), turned into a vault token and run on
 *                 the identity engines over mTLS, exactly as the signed-in Playground does.
 *   - 'micr'/'card' a cheque or card photo goes as a multipart upload to the reading services.
 * Nothing here forwards an arbitrary path: only these ids and paths can run.
 */

export type DemoTransport = 'enc' | 'micr' | 'card' | 'alpr';

export type DemoApi = {
  /** Stable id: the counter key and what the browser names in /run. */
  id: string;
  /** What the visitor sees. */
  label: string;
  blurb: string;
  transport: DemoTransport;
  /** The engine path this runs. */
  path: string;
  /** Required image field in the request body (JWE for 'enc', the multipart part name otherwise). */
  imageKey: string;
  /** An optional second image (document back); never required unless `pair` is set. */
  imageKey2?: string;
  /** Both images are required and of the same kind (a 1:1 comparison), not a document front/back. */
  pair?: boolean;
  /** Does not use the shared free-run budget (only a high per-network safety ceiling against bots). */
  unlimited?: boolean;
  /** Fixed fields merged into every request for this api. */
  extra?: Record<string, unknown>;
  timeoutMs?: number;
  /** Sample images the UI offers, under /demo/samples/. */
  samples: { src: string; label: string }[];
};

/** A curated set of face attributes for the demo (the engine's own names). */
const DEMO_ATTRS = ['Age', 'Emotion', 'Smile', 'Glasses', 'MedicalMask', 'EyeLeft', 'EyeRight', 'HeadCovering'];

export const DEMO_APIS: DemoApi[] = [
  {
    id: 'document',
    label: 'Identity document',
    blurb: 'Upload either side of an ID, passport or licence: type, country, fields and checks.',
    transport: 'enc',
    path: '/v1/idv/read',
    imageKey: 'image_front',
    imageKey2: 'image_back',
    extra: { scenario: 'FullProcess' },
    timeoutMs: 180_000,
    samples: [{ src: '/samples/id-sample.png', label: 'Specimen ID' }],
  },
  {
    id: 'cheque',
    label: 'Cheque (MICR)',
    blurb: 'Read the MICR line at the foot of a cheque and name its fields.',
    transport: 'micr',
    path: '/v2/cheques/micr-line',
    imageKey: 'image',
    extra: { format: 'auto' },
    samples: [
      { src: '/finance/samples/cheque-us.jpg', label: 'US cheque' },
      { src: '/finance/samples/cheque-ca.jpg', label: 'Canada cheque' },
    ],
  },
  {
    id: 'card',
    label: 'Payment card',
    blurb: 'Read a card photo: number, expiry, network, and who issued it.',
    transport: 'card',
    path: '/v2/cards/read',
    imageKey: 'image',
    samples: [
      { src: '/finance/samples/card-mastercard.jpg', label: 'Mastercard' },
      { src: '/developers/samples/card-visa-classic.jpg', label: 'Visa specimen' },
    ],
  },
  {
    id: 'alpr',
    label: 'License plate',
    blurb: 'Read a vehicle plate and classify the car: plate, country, colour, body and make.',
    transport: 'alpr',
    path: '/v1/anpr/read',
    imageKey: 'image',
    unlimited: true,
    timeoutMs: 60_000,
    samples: [{ src: '/samples/alpr-car.jpg', label: 'Car & plate' }],
  },
  {
    id: 'liveness',
    label: 'Passive liveness',
    blurb: 'One selfie: is this a real, present person or a spoof?',
    transport: 'enc',
    path: '/v1/liveness',
    imageKey: 'image',
    samples: [],
  },
  {
    id: 'age',
    label: 'Age estimation',
    blurb: 'Estimate a person’s age range from a single photo.',
    transport: 'enc',
    // the analyze call returns the age range together with the face box and its landmarks (drawn as dots)
    path: '/v1/face/analyze',
    imageKey: 'image',
    extra: { attributes: ['Age'], onlyCentralFace: true, crop: { type: '1' } },
    samples: [],
  },
  {
    id: 'attributes',
    label: 'Face attributes',
    blurb: 'Age, emotion, smile, glasses, mask and more from one face.',
    transport: 'enc',
    path: '/v1/face/analyze',
    imageKey: 'image',
    extra: { attributes: DEMO_ATTRS, onlyCentralFace: true, crop: { type: '1' } },
    samples: [],
  },
  {
    id: 'face-match',
    label: 'Face compare (1:1)',
    blurb: 'Upload two photos and see if they are the same person, with a similarity score.',
    transport: 'enc',
    path: '/v1/face/verify',
    imageKey: 'image1',
    imageKey2: 'image2',
    pair: true,
    extra: { threshold: 0.75 },
    timeoutMs: 60_000,
    samples: [],
  },
];

export const DEMO_BY_ID = new Map(DEMO_APIS.map((a) => [a.id, a]));

/** What the browser needs to render the demo (no engine paths leak out). */
export function demoApisForClient() {
  return DEMO_APIS.map((a) => ({
    id: a.id,
    label: a.label,
    blurb: a.blurb,
    /** true: the image is encrypted in the browser before it is sent. */
    encrypted: a.transport === 'enc',
    /** true: this api takes an optional second image (document back). */
    hasBack: !!a.imageKey2,
    /** true: this api compares two photos of the same kind, both required. */
    pair: !!a.pair,
    /** true: runs on this api do not count against the free-run budget. */
    unlimited: !!a.unlimited,
    samples: a.samples,
  }));
}
