/**
 * Verification workflows: which checks an organisation's applicants go through, the rules that
 * route them, and how the result is decided. Pure definitions and rules (no I/O), shared by the
 * API, the applicant flow plan and the Trust Seal scoring.
 *
 * A workflow is edited as a draft and published as a numbered version. A published version
 * never changes: every session is pinned to the version it was created with, so editing a
 * workflow can never change a verification already under way.
 *
 * Rules are evaluated on the server only, on facts read from the verification record
 * (workflow-facts.ts). A rule can send the result to a person, decline it, or add a step that
 * comes later in the flow (step-up). The applicant's browser is told which steps to show; it is
 * never trusted to decide which checks run.
 */
import type { Facts } from './workflow-facts';

/** Every check the builder offers. `available: false` = shown, but locked as coming soon. */
export const CHECKS = [
  {
    id: 'document',
    name: 'Document Capture & Recognition',
    price: 0.35,
    available: true,
    note: 'Reads the ID document: type, fields, machine-readable zone.',
  },
  {
    id: 'authenticity',
    name: 'Document Authenticity',
    price: 0.25,
    available: true,
    note: 'Security features, specimen and tampering checks on the document.',
  },
  {
    id: 'nfc',
    name: 'NFC Verification',
    price: 0.9,
    available: false,
    note: 'ePassport chip check. Needs the mobile app: coming soon.',
  },
  {
    id: 'liveness',
    name: 'Face Liveness',
    price: 0.2,
    available: true,
    note: 'Confirms a live person is in front of the camera.',
  },
  {
    id: 'face-match',
    name: 'Face Match (1:1)',
    price: 0.2,
    available: true,
    note: 'The selfie must match the portrait on the document.',
  },
  {
    id: 'face-search',
    name: 'Face Search (1:N)',
    price: 0.3,
    available: false,
    note: 'Finds the same face in your earlier verifications: coming soon.',
  },
  {
    id: 'face-attributes',
    name: 'Face Attributes',
    price: 0.1,
    available: false,
    note: 'Age and other attributes estimated from the selfie: coming soon.',
  },
  {
    id: 'address',
    name: 'Proof of Address',
    price: 0.4,
    available: true,
    note: 'A utility bill or bank statement, read and matched to the applicant.',
  },
  {
    id: 'email',
    name: 'Email Verification',
    price: 0.05,
    available: true,
    note: 'One-time code to the email address, plus email risk.',
  },
  {
    id: 'phone',
    name: 'Phone Verification',
    price: 0.08,
    available: true,
    note: 'One-time code to the phone number, plus phone risk.',
  },
  {
    id: 'aml',
    name: 'AML Screening',
    price: 0.8,
    available: true,
    note: 'Sanctions, PEP, crime and debarment lists.',
  },
  {
    id: 'device-ip',
    name: 'Device & IP Analysis',
    price: 0.06,
    available: true,
    note: 'VPN, Tor, emulators, virtual cameras, location consistency.',
  },
  {
    id: 'database',
    name: 'Database Validation',
    price: 0.15,
    available: false,
    note: 'Government and bureau database checks: coming soon.',
  },
  {
    id: 'age',
    name: 'Age Verification',
    price: 0.05,
    available: true,
    note: 'Minimum age from the date of birth on the document.',
  },
  {
    id: 'questionnaire',
    name: 'Questionnaire',
    price: 0,
    available: false,
    note: 'Your own questions in the flow: coming soon.',
  },
] as const;

export type CheckId = (typeof CHECKS)[number]['id'];
const CHECK_IDS = new Set<string>(CHECKS.map((c) => c.id));
const AVAILABLE = new Set<string>(
  CHECKS.filter((c) => c.available).map((c) => c.id),
);
const priceOfCheck = (id: string) =>
  CHECKS.find((c) => c.id === id)?.price ?? 0;
const nameOf = (id: string) => CHECKS.find((c) => c.id === id)?.name ?? id;
/** The order checks run in the applicant flow (the builder shows them in this order). */
const FLOW_ORDER: CheckId[] = [
  'document',
  'authenticity',
  'age',
  'face-match',
  'nfc',
  'liveness',
  'phone',
  'email',
  'aml',
  'device-ip',
  'address',
];
/** Checks that only make sense with the document read. */
const NEEDS_DOCUMENT: CheckId[] = ['authenticity', 'age', 'face-match', 'nfc'];

/**
 * Where each check's screens sit in the flow (device signals are taken on the first page;
 * screening runs once the contact steps are done). A rule can only add a check that comes
 * after the fact it tests is known.
 */
export const STAGE: Record<string, number> = {
  'device-ip': 0,
  document: 1,
  authenticity: 1,
  age: 1,
  'face-match': 2,
  nfc: 3,
  liveness: 4,
  phone: 5,
  email: 5,
  aml: 6,
  address: 7,
};

export const DOCUMENT_TYPES = [
  'passport',
  'national-id',
  'licence',
  'residence-permit',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * FATF high-risk jurisdictions subject to a call for action, and jurisdictions under increased
 * monitoring, after the 19 June 2026 plenary (ISO 3166 alpha-2). Sources: FATF statements as
 * relayed by MAS Singapore and two compliance publishers (amluae.com, citadel365.com), checked
 * 2026-10-08. Update at each plenary (October, February, June).
 */
export const FATF_JUNE_2026 = {
  id: 'fatf-2026-06',
  label: 'FATF high-risk and monitored (June 2026)',
  countries: [
    'IR',
    'KP',
    'MM',
    'AO',
    'BO',
    'BA',
    'BG',
    'CM',
    'CI',
    'CD',
    'HT',
    'IQ',
    'KE',
    'KW',
    'LA',
    'LB',
    'MC',
    'NP',
    'PG',
    'SS',
    'SY',
    'VE',
    'VN',
    'VG',
    'YE',
  ],
};

/* ------------------------------------------------------------------ rules -- */

/** What a rule can test. `source` is the step after which the fact is known. */
export const FIELDS = [
  {
    id: 'ip.country',
    label: 'Connection country',
    kind: 'countries',
    source: 'device-ip',
  },
  // the broad one: VPN, proxy, Tor or a hosting network (see workflow-facts); the narrower ones follow
  { id: 'ip.vpn', label: 'VPN, proxy, Tor or data-centre network', kind: 'flag', source: 'device-ip' },
  { id: 'ip.tor', label: 'Tor detected', kind: 'flag', source: 'device-ip' },
  {
    id: 'ip.proxy',
    label: 'Proxy detected (real address hidden)',
    kind: 'flag',
    source: 'device-ip',
  },
  {
    id: 'ip.datacenter',
    label: 'Hosting or data-centre network',
    kind: 'flag',
    source: 'device-ip',
  },
  {
    id: 'device.risk',
    label: 'Device risk score at or above',
    kind: 'number',
    min: 10,
    max: 100,
    unit: '/100',
    source: 'device-ip',
  },
  {
    id: 'document.country',
    label: 'Document country',
    kind: 'countries',
    source: 'document',
  },
  {
    id: 'document.type',
    label: 'Document type',
    kind: 'documentTypes',
    source: 'document',
  },
  {
    id: 'age',
    label: 'Age below',
    kind: 'number',
    min: 13,
    max: 99,
    unit: ' years',
    source: 'document',
  },
  {
    id: 'ip.document_mismatch',
    label: 'Connection country differs from the document country',
    kind: 'flag',
    source: 'document',
  },
  {
    id: 'face.similarity',
    label: 'Face similarity below',
    kind: 'number',
    min: 50,
    max: 99,
    unit: '%',
    source: 'face-match',
  },
  {
    id: 'aml.hit',
    label: 'Possible watchlist match',
    kind: 'flag',
    source: 'aml',
  },
  {
    id: 'email.risk',
    label: 'Email risk score at or above',
    kind: 'number',
    min: 10,
    max: 100,
    unit: '/100',
    source: 'email',
  },
  {
    id: 'phone.risk',
    label: 'Phone risk score at or above',
    kind: 'number',
    min: 10,
    max: 100,
    unit: '/100',
    source: 'phone',
  },
] as const;
export type FieldId = (typeof FIELDS)[number]['id'];
const FIELD = new Map<string, (typeof FIELDS)[number]>(
  FIELDS.map((f) => [f.id, f]),
);

export type Condition = { field: FieldId; values?: string[]; number?: number };
export type RuleAction = 'review' | 'decline' | 'require';
export type Rule = { when: Condition; then: RuleAction; check?: CheckId };

/** Does the condition hold on these facts? Undefined facts never fire a rule. */
export function holds(c: Condition, f: Facts): boolean {
  const v = f[c.field];
  if (v === undefined) return false;
  const field = FIELD.get(c.field);
  if (!field) return false;
  if (field.kind === 'flag') return v === true;
  if (field.kind === 'countries' || field.kind === 'documentTypes')
    return typeof v === 'string' && !!c.values?.includes(v);
  if (typeof v !== 'number' || typeof c.number !== 'number') return false;
  if (c.field === 'face.similarity') return v * 100 < c.number;
  if (c.field === 'age') return v < c.number;
  return v >= c.number;
}

/** "Document country is FATF high-risk and monitored (June 2026)": how a rule reads. */
export function conditionText(c: Condition): string {
  const field = FIELD.get(c.field);
  if (!field) return c.field;
  if (field.kind === 'flag') return field.label;
  if (field.kind === 'countries') {
    const values = c.values ?? [];
    const preset = sameSet(values, HIGH_RISK);
    return `${field.label} is ${preset ? 'FATF high-risk and monitored jurisdictions' : values.length === 1 ? values[0] : `one of ${values.length} countries`}`;
  }
  if (field.kind === 'documentTypes')
    return `${field.label} is ${(c.values ?? []).join(' or ')}`;
  return `${field.label} ${c.number}${'unit' in field ? field.unit : ''}`;
}

export function ruleText(r: Rule): string {
  const then =
    r.then === 'review'
      ? 'send to a person'
      : r.then === 'decline'
        ? 'decline'
        : `add ${nameOf(r.check ?? '')}`;
  const cond = conditionText(r.when);
  // keep acronyms and names as written (VPN, Tor, FATF); lower-case an ordinary first word
  const lead =
    /^[A-Z][a-z]/.test(cond) && !/^Tor\b/.test(cond)
      ? cond[0].toLowerCase() + cond.slice(1)
      : cond;
  return `If ${lead}, ${then}`;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/* ------------------------------------------------------------- definitions -- */

export type DecisionMode = 'auto' | 'manual';

export type WorkflowCheck = {
  id: CheckId;
  /** Required: a run without it is not approved. Optional: it counts only when it ran. */
  required: boolean;
  /** When the check fails outright: decline the verification, or send it to a person. */
  onFail: 'decline' | 'review';
};

export type WorkflowDefinition = {
  checks: WorkflowCheck[];
  rules: Rule[];
  settings: {
    /** Face match: below this similarity the verification goes to review (0.65 to 0.90). */
    faceMatchThreshold: number;
    /** Which document types the applicant may use. */
    documentTypes: DocumentType[];
    /** Age verification: the minimum age in years. */
    minimumAge: number;
  };
  decision: {
    /** auto: approved when every check is clear and the score reaches approveAt; manual: a person decides every one. */
    mode: DecisionMode;
    /** Trust Seal score needed for automatic approval (50 to 100). */
    approveAt: number;
  };
};

const DEFAULT_SETTINGS: WorkflowDefinition['settings'] = {
  faceMatchThreshold: 0.75,
  documentTypes: [...DOCUMENT_TYPES],
  minimumAge: 18,
};

type CheckSpec = [CheckId, boolean?, ('decline' | 'review')?];
const def = (
  checks: CheckSpec[],
  opts: {
    rules?: Rule[];
    decision?: Partial<WorkflowDefinition['decision']>;
    settings?: Partial<WorkflowDefinition['settings']>;
  } = {},
): WorkflowDefinition => ({
  checks: checks.map(([id, required = true, onFail = 'decline']) => ({
    id,
    required,
    onFail,
  })),
  rules: opts.rules ?? [],
  settings: { ...DEFAULT_SETTINGS, ...opts.settings },
  decision: { mode: 'auto', approveAt: 80, ...opts.decision },
});

/**
 * The FATF high-risk and monitored countries the rules screen against. Seeded from the committed list above and kept
 * current by FatfService (which proposes each change for an operator to confirm). The conditions below hold THIS exact
 * array by reference, so replacing its contents with setHighRisk updates every rule and the builder preset at once.
 */
export const HIGH_RISK: string[] = [...FATF_JUNE_2026.countries];

/** Replace the active FATF list in place, keeping the same array reference so docHighRisk/ipHighRisk and the preset follow. */
export function setHighRisk(codes: string[]): void {
  HIGH_RISK.splice(0, HIGH_RISK.length, ...codes);
}

/** The FATF preset as the builder shows it: the live list in force, not the frozen seed, with a date-free label. */
export function fatfPreset(): { id: string; label: string; countries: string[] } {
  return { id: FATF_JUNE_2026.id, label: 'FATF high-risk and monitored jurisdictions', countries: [...HIGH_RISK] };
}
const r = {
  review: (when: Condition): Rule => ({ when, then: 'review' }),
  decline: (when: Condition): Rule => ({ when, then: 'decline' }),
  require: (when: Condition, check: CheckId): Rule => ({
    when,
    then: 'require',
    check,
  }),
};
const docHighRisk: Condition = { field: 'document.country', values: HIGH_RISK };
const ipHighRisk: Condition = { field: 'ip.country', values: HIGH_RISK };

/* -------------------------------------------------------------- templates -- */

export const CATEGORIES = [
  {
    id: 'identity',
    name: 'Identity verification',
    summary: 'Who the applicant is: document, face, liveness.',
  },
  {
    id: 'compliance',
    name: 'Compliance & AML',
    summary: 'Watchlists, high-risk countries and review routing.',
  },
  {
    id: 'age',
    name: 'Age assurance',
    summary: 'Minimum age, proven from the document and the holder.',
  },
  {
    id: 'fraud',
    name: 'Fraud prevention',
    summary: 'Networks, devices and step-up checks when risk rises.',
  },
  {
    id: 'address',
    name: 'Address & residency',
    summary: 'Proof of address, matched to the applicant.',
  },
  {
    id: 'contact',
    name: 'Contact verification',
    summary: 'Phone and email you can trust, low friction.',
  },
  {
    id: 'returning',
    name: 'Returning customers',
    summary: 'Re-authentication and duplicate prevention.',
  },
] as const;

export const INDUSTRIES = [
  'Fintech',
  'Banking',
  'Crypto & Web3',
  'Tokenization & RWA',
  'Payments & Remittance',
  'Lending & BNPL',
  'Wealth & Brokerage',
  'Insurance',
  'iGaming',
  'Gaming',
  'E-commerce',
  'Marketplace',
  'Gig & Sharing economy',
  'Mobility & Car rental',
  'Travel & Hospitality',
  'Telecom',
  'Healthcare',
  'HR & Workforce',
  'Real estate',
  'Education',
  'Government',
  'Dating & Social',
] as const;

export type Template = {
  id: string;
  name: string;
  summary: string;
  category: (typeof CATEGORIES)[number]['id'];
  industries: (typeof INDUSTRIES)[number][];
  recommended?: boolean;
  available: boolean;
  definition: WorkflowDefinition;
  /** Document kinds this template is built for and keeps: a workflow made from it can never accept others. */
  fixedDocumentTypes?: DocumentType[];
};

/** A workflow made from a template with fixed document kinds keeps exactly those, whatever an edit sends. */
export function lockDocumentTypes(definition: WorkflowDefinition, template: string | null | undefined): WorkflowDefinition {
  const fixed = TEMPLATES.find((t) => t.id === template)?.fixedDocumentTypes;
  if (!fixed?.length) return definition;
  return { ...definition, settings: { ...definition.settings, documentTypes: [...fixed] } };
}

/**
 * Ready-made workflows (research 2026-10-08: how identity providers and their customers run
 * KYC and face flows; see the research notes). Every one runs on checks we provide today,
 * except the two marked coming soon.
 */
export const TEMPLATES: Template[] = [
  /* ---- identity ---- */
  {
    id: 'id-liveness-face',
    name: 'ID + Liveness + Face Match',
    summary:
      'Government national ID cards only: the card is genuine, the person is live, and it is their face.',
    category: 'identity',
    industries: [
      'Fintech',
      'Marketplace',
      'Gig & Sharing economy',
      'Education',
      'Healthcare',
      'HR & Workforce',
    ],
    recommended: true,
    available: true,
    definition: def(
      [['document'], ['authenticity'], ['face-match'], ['liveness']],
      { decision: { approveAt: 75 }, settings: { documentTypes: ['national-id'] } },
    ),
    fixedDocumentTypes: ['national-id'],
  },
  {
    id: 'standard-kyc',
    name: 'Standard KYC',
    summary:
      'ID, liveness, face match, AML screening and device risk, with email confirmed when given.',
    category: 'identity',
    industries: [
      'Fintech',
      'Banking',
      'Payments & Remittance',
      'Insurance',
      'Telecom',
    ],
    recommended: true,
    available: true,
    definition: def([
      ['document'],
      ['authenticity'],
      ['face-match'],
      ['liveness'],
      ['email', false],
      ['aml'],
      ['device-ip'],
    ]),
  },
  {
    id: 'fast-onboarding',
    name: 'Fast onboarding',
    summary:
      'Document, liveness and face match only, device risk recorded when available. Under two minutes.',
    category: 'identity',
    industries: [
      'E-commerce',
      'Marketplace',
      'Gig & Sharing economy',
      'Travel & Hospitality',
      'Education',
    ],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['device-ip', false],
      ],
      { decision: { approveAt: 75 } },
    ),
  },
  {
    id: 'driver-verification',
    name: 'Driver verification',
    summary:
      "Driver's licence only, with a live selfie matched to it. For drivers, couriers and car rental.",
    category: 'identity',
    industries: ['Mobility & Car rental', 'Gig & Sharing economy'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['device-ip', false],
      ],
      {
        settings: { documentTypes: ['licence'] },
      },
    ),
  },
  {
    id: 'passport-only',
    name: 'Passport verification',
    summary:
      'Passports only, read and checked, with the holder matched by selfie. Travel and cross-border.',
    category: 'identity',
    industries: ['Travel & Hospitality', 'Payments & Remittance', 'Government'],
    available: true,
    definition: def(
      [['document'], ['authenticity'], ['face-match'], ['liveness']],
      { settings: { documentTypes: ['passport'] } },
    ),
  },
  {
    id: 'document-only',
    name: 'Document verification',
    summary:
      'The ID document read and authenticated, no selfie. For back-office checks and low-risk sign-ups.',
    category: 'identity',
    industries: ['E-commerce', 'Real estate', 'Insurance'],
    available: true,
    definition: def([['document'], ['authenticity']]),
  },
  {
    id: 'vpn-step-up',
    name: 'ID + device check, liveness on VPN',
    summary:
      'Document and device risk for everyone; a live selfie is added only when a VPN, Tor or proxy hides the connection.',
    category: 'fraud',
    industries: ['Fintech', 'E-commerce', 'Marketplace', 'iGaming'],
    recommended: true,
    available: true,
    definition: def([['document'], ['authenticity'], ['device-ip']], {
      rules: [
        r.require({ field: 'ip.vpn' }, 'liveness'),
        r.require({ field: 'ip.tor' }, 'liveness'),
        r.require({ field: 'ip.proxy' }, 'liveness'),
      ],
    }),
  },

  /* ---- compliance & AML ---- */
  {
    id: 'high-risk-country-review',
    name: 'High-risk country review',
    summary:
      'Standard KYC where documents from FATF high-risk or monitored countries go to a person.',
    category: 'compliance',
    industries: [
      'Banking',
      'Fintech',
      'Payments & Remittance',
      'Crypto & Web3',
    ],
    recommended: true,
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['aml'],
        ['device-ip'],
      ],
      { rules: [r.review(docHighRisk)] },
    ),
  },
  {
    id: 'aml-escalation',
    name: 'AML risk escalation',
    summary:
      'Standard KYC with watchlist screening; any possible match is routed to manual review.',
    category: 'compliance',
    industries: [
      'Banking',
      'Crypto & Web3',
      'Wealth & Brokerage',
      'Payments & Remittance',
    ],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['aml'],
        ['device-ip'],
      ],
      { rules: [r.review({ field: 'aml.hit' })] },
    ),
  },
  {
    id: 'risk-based-id',
    name: 'Risk-based ID by connection',
    summary:
      'Phone and email for everyone; ID, face match and liveness only when the applicant connects from a high-risk country.',
    category: 'compliance',
    industries: ['Fintech', 'Payments & Remittance', 'Telecom', 'Marketplace'],
    recommended: true,
    available: true,
    definition: def([['phone'], ['email'], ['device-ip']], {
      rules: [
        r.require(ipHighRisk, 'document'),
        r.require(ipHighRisk, 'face-match'),
        r.require(ipHighRisk, 'liveness'),
      ],
      decision: { approveAt: 75 },
    }),
  },
  {
    id: 'enhanced-due-diligence',
    name: 'Enhanced due diligence',
    summary:
      'Standard KYC plus proof of address, phone and email, and a person reviews every result.',
    category: 'compliance',
    industries: [
      'Banking',
      'Wealth & Brokerage',
      'Tokenization & RWA',
      'Government',
    ],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['phone'],
        ['email'],
        ['aml'],
        ['device-ip'],
        ['address'],
      ],
      {
        decision: { mode: 'manual', approveAt: 85 },
      },
    ),
  },
  {
    id: 'document-watchlist',
    name: 'Document and watchlist',
    summary:
      'The ID document authenticated and screened against sanctions and PEP lists, no selfie.',
    category: 'compliance',
    industries: ['Banking', 'Insurance', 'Real estate', 'Wealth & Brokerage'],
    available: true,
    definition: def([
      ['document'],
      ['authenticity'],
      ['aml'],
      ['device-ip', false],
    ]),
  },
  {
    id: 'sanctions-with-address',
    name: 'Screening with address for high-risk countries',
    summary:
      'KYC with AML screening; applicants with a document from a high-risk country also prove their address.',
    category: 'compliance',
    industries: ['Banking', 'Crypto & Web3', 'Lending & BNPL'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['aml'],
        ['device-ip'],
      ],
      {
        rules: [
          r.require(docHighRisk, 'address'),
          r.review({ field: 'aml.hit' }),
        ],
      },
    ),
  },
  {
    id: 'investor-onboarding',
    name: 'Investor onboarding',
    summary:
      'Full KYC, proof of address and screening for investors; a person approves every investor.',
    category: 'compliance',
    industries: ['Tokenization & RWA', 'Wealth & Brokerage', 'Crypto & Web3'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['email'],
        ['aml'],
        ['device-ip'],
        ['address'],
      ],
      {
        rules: [r.review({ field: 'ip.document_mismatch' })],
        decision: { mode: 'manual', approveAt: 85 },
      },
    ),
  },

  /* ---- age ---- */
  {
    id: 'age-check',
    name: 'Age check (18+)',
    summary:
      'Minimum age from the ID document, with liveness and face match so it is the holder.',
    category: 'age',
    industries: ['iGaming', 'Gaming', 'E-commerce', 'Dating & Social'],
    recommended: true,
    available: true,
    definition: def(
      [['document'], ['authenticity'], ['age'], ['face-match'], ['liveness']],
      { decision: { approveAt: 75 } },
    ),
  },
  {
    id: 'age-check-21',
    name: 'Age check (21+)',
    summary:
      'For alcohol, tobacco, cannabis and car hire: 21 or older, proven from the document and the holder.',
    category: 'age',
    industries: ['E-commerce', 'Mobility & Car rental', 'Travel & Hospitality'],
    available: true,
    definition: def(
      [['document'], ['authenticity'], ['age'], ['face-match'], ['liveness']],
      { decision: { approveAt: 75 }, settings: { minimumAge: 21 } },
    ),
  },
  {
    id: 'adaptive-age',
    name: 'Adaptive age escalation',
    summary:
      'Estimate age from a selfie first; ask for the ID only when the estimate is close to the limit. Coming soon.',
    category: 'age',
    industries: ['Gaming', 'E-commerce', 'Dating & Social'],
    available: false,
    definition: def([['liveness'], ['face-attributes']]),
  },

  /* ---- fraud ---- */
  {
    id: 'anonymizer-block',
    name: 'Block anonymised connections',
    summary:
      'KYC that declines Tor connections and sends VPN, proxy and data-centre connections to review.',
    category: 'fraud',
    industries: ['iGaming', 'Crypto & Web3', 'Fintech', 'Lending & BNPL'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['device-ip'],
      ],
      {
        rules: [
          r.decline({ field: 'ip.tor' }),
          r.review({ field: 'ip.vpn' }),
          r.review({ field: 'ip.proxy' }),
          r.review({ field: 'ip.datacenter' }),
        ],
      },
    ),
  },
  {
    id: 'location-consistency',
    name: 'Location consistency',
    summary:
      'KYC that reviews applicants whose connection country differs from their document country.',
    category: 'fraud',
    industries: ['Lending & BNPL', 'Fintech', 'Telecom', 'Insurance'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['device-ip'],
      ],
      {
        rules: [r.review({ field: 'ip.document_mismatch' })],
      },
    ),
  },
  {
    id: 'risky-device-step-up',
    name: 'Step up on risky devices',
    summary:
      'Document for everyone; a live selfie and phone check are added when the device risk score is high.',
    category: 'fraud',
    industries: ['E-commerce', 'Marketplace', 'Lending & BNPL'],
    available: true,
    definition: def([['document'], ['authenticity'], ['device-ip']], {
      rules: [
        r.require({ field: 'device.risk', number: 50 }, 'liveness'),
        r.require({ field: 'device.risk', number: 50 }, 'phone'),
      ],
    }),
  },
  {
    id: 'contact-risk-review',
    name: 'Contact risk review',
    summary:
      'KYC with phone and email; risky phone numbers or email addresses go to a person.',
    category: 'fraud',
    industries: ['Lending & BNPL', 'E-commerce', 'Telecom'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['phone'],
        ['email'],
        ['device-ip'],
      ],
      {
        rules: [
          r.review({ field: 'phone.risk', number: 60 }),
          r.review({ field: 'email.risk', number: 60 }),
        ],
      },
    ),
  },

  /* ---- address ---- */
  {
    id: 'proof-of-address',
    name: 'Proof of address',
    summary:
      'The ID document and a utility bill or bank statement, read and matched to the applicant.',
    category: 'address',
    industries: ['Lending & BNPL', 'Telecom', 'Real estate', 'Banking'],
    available: true,
    definition: def([['document'], ['authenticity'], ['address']]),
  },
  {
    id: 'tenant-screening',
    name: 'Tenant screening',
    summary:
      'Identity, face match, proof of address and watchlist screening for tenants and buyers.',
    category: 'address',
    industries: ['Real estate'],
    available: true,
    definition: def([
      ['document'],
      ['authenticity'],
      ['face-match'],
      ['liveness'],
      ['aml'],
      ['address'],
    ]),
  },
  {
    id: 'address-for-high-risk',
    name: 'Address for high-risk countries',
    summary:
      'KYC where only applicants with a document from a high-risk country are asked for proof of address.',
    category: 'address',
    industries: ['Banking', 'Payments & Remittance', 'Fintech'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['device-ip'],
      ],
      { rules: [r.require(docHighRisk, 'address')] },
    ),
  },

  /* ---- contact ---- */
  {
    id: 'phone-email',
    name: 'Phone and email verification',
    summary:
      'One-time codes to the phone and email, with risk scores. The lightest sign-up check.',
    category: 'contact',
    industries: ['E-commerce', 'Marketplace', 'Dating & Social', 'Gaming'],
    available: true,
    definition: def([['phone'], ['email'], ['device-ip', false]], {
      decision: { approveAt: 70 },
    }),
  },
  {
    id: 'sim-registration',
    name: 'SIM registration',
    summary:
      'National ID read and matched to a live selfie before a SIM is activated.',
    category: 'contact',
    industries: ['Telecom', 'Government'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['phone', false],
      ],
      {
        settings: {
          documentTypes: ['national-id', 'passport', 'residence-permit'],
        },
      },
    ),
  },

  /* ---- industry-ready ---- */
  {
    id: 'crypto-exchange',
    name: 'Crypto exchange onboarding',
    summary:
      'Full KYC and AML for exchanges: watchlist matches reviewed, high-risk countries prove their address.',
    category: 'compliance',
    industries: ['Crypto & Web3'],
    recommended: true,
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['email'],
        ['aml'],
        ['device-ip'],
      ],
      {
        rules: [
          r.review({ field: 'aml.hit' }),
          r.require(docHighRisk, 'address'),
          r.review({ field: 'ip.tor' }),
        ],
      },
    ),
  },
  {
    id: 'igaming-player',
    name: 'iGaming player verification',
    summary:
      '18+ from the document, face match, screening, and review of VPN or mismatched locations.',
    category: 'age',
    industries: ['iGaming'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['age'],
        ['face-match'],
        ['liveness'],
        ['aml'],
        ['device-ip'],
      ],
      {
        rules: [
          r.review({ field: 'ip.vpn' }),
          r.review({ field: 'ip.document_mismatch' }),
        ],
      },
    ),
  },
  {
    id: 'marketplace-seller',
    name: 'Marketplace seller verification',
    summary:
      'Sellers and hosts: identity, face match, phone and email confirmed, device risk recorded.',
    category: 'identity',
    industries: ['Marketplace', 'E-commerce', 'Travel & Hospitality'],
    available: true,
    definition: def([
      ['document'],
      ['authenticity'],
      ['face-match'],
      ['liveness'],
      ['phone'],
      ['email'],
      ['device-ip'],
    ]),
  },
  {
    id: 'remote-hiring',
    name: 'Remote hiring check',
    summary:
      'Confirms a new hire is who they say: document, live selfie, email, and screening.',
    category: 'identity',
    industries: ['HR & Workforce', 'Government'],
    available: true,
    definition: def([
      ['document'],
      ['authenticity'],
      ['face-match'],
      ['liveness'],
      ['email'],
      ['aml', false],
    ]),
  },
  {
    id: 'patient-identity',
    name: 'Patient identity',
    summary:
      'Telehealth and prescriptions: the patient’s document and a live selfie, contact confirmed by email.',
    category: 'identity',
    industries: ['Healthcare'],
    available: true,
    definition: def([
      ['document'],
      ['authenticity'],
      ['face-match'],
      ['liveness'],
      ['email'],
    ]),
  },
  {
    id: 'lending-application',
    name: 'Loan application',
    summary:
      'KYC, proof of address, phone and device risk for credit decisions; risky contacts reviewed.',
    category: 'address',
    industries: ['Lending & BNPL', 'Banking'],
    available: true,
    definition: def(
      [
        ['document'],
        ['authenticity'],
        ['face-match'],
        ['liveness'],
        ['phone'],
        ['aml'],
        ['device-ip'],
        ['address'],
      ],
      {
        rules: [r.review({ field: 'phone.risk', number: 60 })],
      },
    ),
  },
  {
    id: 'exam-candidate',
    name: 'Exam candidate check',
    summary:
      'Confirms the candidate before an online exam: document and a live selfie matched to it.',
    category: 'identity',
    industries: ['Education'],
    available: true,
    definition: def([['document'], ['face-match'], ['liveness']], {
      decision: { approveAt: 75 },
    }),
  },

  /* ---- returning (coming soon) ---- */
  {
    id: 'face-reauthentication',
    name: 'Face re-authentication',
    summary:
      'Returning customers prove it is them with a live selfie against their enrolled face. Coming soon.',
    category: 'returning',
    industries: [
      'Banking',
      'Fintech',
      'Crypto & Web3',
      'Gig & Sharing economy',
    ],
    available: false,
    definition: def([['liveness'], ['face-match']]),
  },
  {
    id: 'duplicate-check',
    name: 'Duplicate account check',
    summary:
      'Stops one person opening several accounts by searching their face across your verifications. Coming soon.',
    category: 'returning',
    industries: [
      'iGaming',
      'Marketplace',
      'Lending & BNPL',
      'Gig & Sharing economy',
    ],
    available: false,
    definition: def([['document'], ['liveness'], ['face-search']]),
  },
];

/** "Start from scratch": the smallest valid workflow, the ID document alone. */
export const BLANK = {
  id: 'blank',
  name: 'Untitled workflow',
  available: true,
  definition: def([['document']]),
};

/** Price per verification: always-on checks, and with every step a rule can add. */
export function priceRange(d: WorkflowDefinition): {
  min: number;
  max: number;
} {
  const base = new Set(d.checks.map((c) => c.id));
  const extra = new Set(
    d.rules
      .filter((x) => x.then === 'require' && x.check && !base.has(x.check))
      .map((x) => x.check!),
  );
  const sum = (ids: Iterable<string>) =>
    [...ids].reduce((s, id) => s + priceOfCheck(id), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return { min: round(sum(base)), max: round(sum(base) + sum(extra)) };
}
export const priceOf = (d: WorkflowDefinition) => priceRange(d).min;

/* -------------------------------------------------------------- validation -- */

/** The checks a rule's fact comes from (added when the rule is used). */
const FACT_CHECK: Record<string, CheckId> = {
  'device-ip': 'device-ip',
  document: 'document',
  'face-match': 'face-match',
  aml: 'aml',
  email: 'email',
  phone: 'phone',
};

/**
 * A definition as the API accepts it: unknown or locked checks refused, dependencies added
 * (authenticity, age, face match need the document; a rule needs the check its fact comes
 * from), values clamped, rules checked against the flow order, checks in flow order.
 * Returns a list of problems instead when it cannot be used.
 */
export function cleanDefinition(
  input: unknown,
):
  | { ok: true; definition: WorkflowDefinition }
  | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const raw = (input && typeof input === 'object' ? input : {}) as Record<
    string,
    unknown
  >;
  const rawChecks = Array.isArray(raw.checks) ? raw.checks : [];
  const seen = new Map<CheckId, WorkflowCheck>();
  const add = (id: CheckId) => {
    if (!seen.has(id)) seen.set(id, { id, required: true, onFail: 'decline' });
  };
  for (const c of rawChecks) {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    if (!CHECK_IDS.has(id)) {
      problems.push(`Unknown check: ${id || '(empty)'}`);
      continue;
    }
    if (!AVAILABLE.has(id)) {
      problems.push(`${nameOf(id)} is not available yet.`);
      continue;
    }
    seen.set(id as CheckId, {
      id: id as CheckId,
      required: o.required !== false,
      onFail: o.onFail === 'review' ? 'review' : 'decline',
    });
  }

  // rules
  const rules: Rule[] = [];
  const rawRules = Array.isArray(raw.rules) ? raw.rules.slice(0, 20) : [];
  for (const x of rawRules) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const w = (o.when && typeof o.when === 'object' ? o.when : {}) as Record<
      string,
      unknown
    >;
    const field = FIELD.get(typeof w.field === 'string' ? w.field : '');
    if (!field) {
      problems.push('A rule tests something unknown.');
      continue;
    }
    const then =
      o.then === 'decline'
        ? 'decline'
        : o.then === 'require'
          ? 'require'
          : o.then === 'review'
            ? 'review'
            : null;
    if (!then) {
      problems.push(`The rule on "${field.label}" needs an action.`);
      continue;
    }
    const when: Condition = { field: field.id };
    if (field.kind === 'countries') {
      const values = Array.isArray(w.values)
        ? [
            ...new Set(
              w.values
                .map((v) => String(v).trim().toUpperCase())
                .filter((v) => /^[A-Z]{2}$/.test(v)),
            ),
          ]
        : [];
      if (!values.length) {
        problems.push(
          `The rule on "${field.label}" needs at least one country.`,
        );
        continue;
      }
      when.values = values;
    } else if (field.kind === 'documentTypes') {
      const values = Array.isArray(w.values)
        ? w.values
            .map(String)
            .filter((v) => (DOCUMENT_TYPES as readonly string[]).includes(v))
        : [];
      if (!values.length) {
        problems.push(
          `The rule on "${field.label}" needs at least one document type.`,
        );
        continue;
      }
      when.values = [...new Set(values)];
    } else if (field.kind === 'number') {
      const n = Number(w.number);
      if (!Number.isFinite(n)) {
        problems.push(`The rule on "${field.label}" needs a number.`);
        continue;
      }
      when.number = Math.round(Math.min(field.max, Math.max(field.min, n)));
    }
    const rule: Rule = { when, then };
    if (then === 'require') {
      const check = typeof o.check === 'string' ? o.check : '';
      if (!AVAILABLE.has(check)) {
        problems.push(
          `The rule on "${field.label}" must add an available check.`,
        );
        continue;
      }
      if ((STAGE[check] ?? 0) <= (STAGE[field.source] ?? 0)) {
        problems.push(
          `${nameOf(check)} comes before "${field.label}" is known, so a rule cannot add it. Make it always-on instead.`,
        );
        continue;
      }
      rule.check = check as CheckId;
    }
    // the fact needs the check that produces it
    add(FACT_CHECK[field.source] ?? 'device-ip');
    rules.push(rule);
  }

  // a check a rule adds is not also always-on; the document goes with what reads it
  for (const x of rules)
    if (x.then === 'require' && x.check && seen.has(x.check))
      problems.push(
        `${nameOf(x.check)} is always on, so a rule cannot add it.`,
      );
  const everything = new Set<string>([
    ...seen.keys(),
    ...rules.filter((x) => x.check).map((x) => x.check!),
  ]);
  if (
    [...everything].some((id) => NEEDS_DOCUMENT.includes(id as CheckId)) &&
    !seen.has('document')
  ) {
    const conditionalOnly = rules.some(
      (x) => x.then === 'require' && x.check === 'document',
    );
    if (!conditionalOnly) add('document');
  }
  if (!seen.size) problems.push('Add at least one check.');

  const s = (
    raw.settings && typeof raw.settings === 'object' ? raw.settings : {}
  ) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const types = Array.isArray(s.documentTypes)
    ? s.documentTypes.filter((t): t is DocumentType =>
        (DOCUMENT_TYPES as readonly string[]).includes(String(t)),
      )
    : [...DOCUMENT_TYPES];
  if (everything.has('document') && !types.length)
    problems.push('Allow at least one document type.');
  const d = (
    raw.decision && typeof raw.decision === 'object' ? raw.decision : {}
  ) as Record<string, unknown>;
  if (problems.length) return { ok: false, problems: [...new Set(problems)] };
  return {
    ok: true,
    definition: {
      checks: FLOW_ORDER.filter((id) => seen.has(id)).map((id) =>
        seen.get(id)!,
      ),
      rules,
      settings: {
        faceMatchThreshold:
          Math.round(
            num(
              s.faceMatchThreshold,
              0.65,
              0.9,
              DEFAULT_SETTINGS.faceMatchThreshold,
            ) * 100,
          ) / 100,
        documentTypes: [...new Set(types)],
        minimumAge: Math.round(
          num(s.minimumAge, 13, 25, DEFAULT_SETTINGS.minimumAge),
        ),
      },
      decision: {
        mode: d.mode === 'manual' ? 'manual' : 'auto',
        approveAt: Math.round(num(d.approveAt, 50, 100, 80)),
      },
    },
  };
}

/** A stored definition from before rules existed reads as one without rules. */
export function normalized(d: WorkflowDefinition): WorkflowDefinition {
  return { ...d, rules: Array.isArray(d.rules) ? d.rules : [] };
}

/* ------------------------------------------------------------------ the policy -- */

/** The Trust Seal's parts (verifications.view.ts) and the checks that feed each. */
export type PartId =
  'document' | 'face' | 'liveness' | 'screening' | 'contact' | 'device';
const PART_OF: Partial<Record<CheckId, PartId>> = {
  document: 'document',
  authenticity: 'document',
  'face-match': 'face',
  liveness: 'liveness',
  aml: 'screening',
  email: 'contact',
  phone: 'contact',
  'device-ip': 'device',
};
export const partOf = (id: CheckId) => PART_OF[id];

/** How one workflow version decides (consumed by scoreOf, which applies the rules to the record's facts). */
export type ScorePolicy = {
  label: string;
  /** The always-on checks (a rule may add more). */
  checks: CheckId[];
  include: Set<PartId>;
  required: Set<PartId>;
  reviewOnFail: Set<PartId>;
  approveAt: number;
  manual: boolean;
  faceReview: number;
  documentTypes: string[];
  minimumAge: number | null;
  ageRequired: boolean;
  ageReviewOnFail: boolean;
  address: 'off' | 'optional' | 'required';
  rules: Rule[];
};

export function policyOf(d0: WorkflowDefinition, label: string): ScorePolicy {
  const d = normalized(d0);
  const include = new Set<PartId>();
  const required = new Set<PartId>();
  const reviewOnFail = new Set<PartId>();
  for (const c of d.checks) {
    const part = PART_OF[c.id];
    if (!part) continue;
    include.add(part);
    if (c.required) required.add(part);
    if (c.onFail === 'review') reviewOnFail.add(part);
  }
  const age = d.checks.find((c) => c.id === 'age');
  const addr = d.checks.find((c) => c.id === 'address');
  return {
    label,
    checks: d.checks.map((c) => c.id),
    include,
    required,
    reviewOnFail,
    approveAt: d.decision.approveAt,
    manual: d.decision.mode === 'manual',
    faceReview: d.settings.faceMatchThreshold,
    documentTypes: d.settings.documentTypes,
    minimumAge: age ? d.settings.minimumAge : null,
    ageRequired: !!age?.required,
    ageReviewOnFail: age?.onFail === 'review',
    address: addr ? (addr.required ? 'required' : 'optional') : 'off',
    rules: d.rules,
  };
}

/** The checks this verification runs right now: the always-on ones and those its rules have added. */
export function activeChecks(
  d0: WorkflowDefinition,
  facts: Facts | null,
): CheckId[] {
  const d = normalized(d0);
  const ids = new Set<CheckId>(d.checks.map((c) => c.id));
  if (facts)
    for (const x of d.rules)
      if (x.then === 'require' && x.check && holds(x.when, facts))
        ids.add(x.check);
  return FLOW_ORDER.filter((id) => ids.has(id));
}

/** Does the workflow have rules that can add steps (the browser then asks again as facts arrive)? */
export const isDynamic = (d: WorkflowDefinition) =>
  normalized(d).rules.some((x) => x.then === 'require');

/** What the applicant's browser needs to run the flow for a session. */
export function planOf(
  d: WorkflowDefinition | null,
  name: string | null,
  facts: Facts | null = null,
) {
  if (!d)
    return {
      workflow: null,
      checks: null,
      documentTypes: null,
      dynamic: false,
    };
  return {
    workflow: name,
    checks: activeChecks(d, facts),
    documentTypes: d.settings.documentTypes,
    dynamic: isDynamic(d),
  };
}

/** Whether a session's workflow includes a check, always-on or added by a rule (a session without a workflow runs every check). */
export function includes(d0: WorkflowDefinition | null, id: CheckId): boolean {
  if (!d0) return true;
  const d = normalized(d0);
  return (
    d.checks.some((c) => c.id === id) ||
    d.rules.some((x) => x.then === 'require' && x.check === id)
  );
}
