/**
 * The webhook event catalogue and the payload rules.
 *
 * Every event belongs to one portal: the KYC console lists the `kyc` events, the Financial portal the
 * `fin` ones, and an endpoint can only subscribe to its own portal's events.
 *
 * Payloads never carry personal data: ids, statuses, verdicts, scores, counts and timestamps only.
 * `cleanData()` enforces that with an allow-list, so a caller cannot leak a name or a document
 * number by accident (unknown keys are dropped and logged by name).
 */

export type WebhookPortal = 'kyc' | 'fin';
export type WebhookEnv = 'live' | 'test';

export interface WebhookEventDef {
  name: string;
  portal: WebhookPortal;
  description: string;
}

export const WEBHOOK_EVENTS: readonly WebhookEventDef[] = [
  // ---- KYC: verification lifecycle ----
  {
    name: 'verification.created',
    portal: 'kyc',
    description: 'A verification session was created.',
  },
  {
    name: 'verification.started',
    portal: 'kyc',
    description: 'The applicant opened the session and started.',
  },
  {
    name: 'verification.step_completed',
    portal: 'kyc',
    description: 'The applicant finished one step of the workflow.',
  },
  {
    name: 'verification.completed',
    portal: 'kyc',
    description: 'Every step is done and a verdict is ready.',
  },
  {
    name: 'verification.approved',
    portal: 'kyc',
    description: 'The verification was approved.',
  },
  {
    name: 'verification.needs_review',
    portal: 'kyc',
    description: 'The verification needs a manual review.',
  },
  {
    name: 'verification.declined',
    portal: 'kyc',
    description: 'The verification was declined.',
  },
  {
    name: 'verification.updated',
    portal: 'kyc',
    description: 'A reviewer changed the verdict or the status.',
  },
  {
    name: 'verification.redacted',
    portal: 'kyc',
    description: 'The personal data of a verification was deleted.',
  },
  // ---- KYC: individual checks ----
  {
    name: 'face.liveness.completed',
    portal: 'kyc',
    description: 'A liveness check finished.',
  },
  {
    name: 'face.match.completed',
    portal: 'kyc',
    description: 'A face match finished.',
  },
  {
    name: 'aml.screening.completed',
    portal: 'kyc',
    description: 'An AML screening finished.',
  },
  {
    name: 'aml.hit',
    portal: 'kyc',
    description: 'An AML screening found a possible match.',
  },
  // ---- Financial portal: scans ----
  { name: 'cheque.read', portal: 'fin', description: 'A cheque was read.' },
  {
    name: 'cheque.failed',
    portal: 'fin',
    description: 'A cheque could not be read.',
  },
  { name: 'card.read', portal: 'fin', description: 'A card was read.' },
  {
    name: 'card.failed',
    portal: 'fin',
    description: 'A card could not be read.',
  },
];

/** The event names the platform emits (for callers of `WebhooksService.emit`). */
export type WebhookEventType =
  | 'verification.created'
  | 'verification.started'
  | 'verification.step_completed'
  | 'verification.completed'
  | 'verification.approved'
  | 'verification.needs_review'
  | 'verification.declined'
  | 'verification.updated'
  | 'verification.redacted'
  | 'face.liveness.completed'
  | 'face.match.completed'
  | 'aml.screening.completed'
  | 'aml.hit'
  | 'cheque.read'
  | 'cheque.failed'
  | 'card.read'
  | 'card.failed';

/**
 * The console's "Send test event". Every endpoint is quietly subscribed to it (it is not in the
 * catalogue, so it is never offered or listed) and a test is addressed to exactly one endpoint.
 */
export const TEST_EVENT = 'webhook.test';
export const TEST_EVENT_DESCRIPTION = 'A test event sent from the console.';

const BY_NAME = new Map(WEBHOOK_EVENTS.map((e) => [e.name, e]));

export const eventDef = (name: string) => BY_NAME.get(name);

export const eventsOf = (portal: WebhookPortal) =>
  WEBHOOK_EVENTS.filter((e) => e.portal === portal);

/* ------------------------------------------------------------ payload rules -- */

/** Keys a payload's `data` may carry, besides any `*_id`, `*_at`, `*_score` or `*_count`. */
const DATA_KEYS = new Set([
  'id',
  'status',
  'verdict',
  'score',
  'step',
  'check',
  'result',
  'outcome',
  'decision',
  'reason_codes',
  'risk_level',
  'hits',
  'match',
  'similarity',
  'liveness',
  'product',
  'document_type',
  'workflow_version',
  'attempt',
]);
const KEY_SHAPE = /^[a-z][a-z0-9_]{0,63}$/;
const SUFFIXES = /_(id|at|score|count)$/;

const allowedKey = (k: string) =>
  KEY_SHAPE.test(k) && (DATA_KEYS.has(k) || SUFFIXES.test(k));

type Clean = string | number | boolean | null | string[];

function cleanValue(v: unknown): Clean | undefined {
  if (v === null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.length <= 200 ? v : undefined;
  if (v instanceof Date)
    return Number.isNaN(v.getTime()) ? undefined : v.toISOString();
  if (Array.isArray(v)) {
    // only short codes (e.g. reason codes); anything else is not a webhook field
    const codes = v.filter(
      (x): x is string => typeof x === 'string' && x.length <= 64,
    );
    return codes.length === v.length && codes.length <= 50 ? codes : undefined;
  }
  return undefined;
}

/** The allowed, flat part of `data`, plus the names of what was dropped (never the values). */
export function cleanData(data: Record<string, unknown> | null | undefined): {
  data: Record<string, Clean>;
  dropped: string[];
} {
  const out: Record<string, Clean> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(data ?? {})) {
    const c = allowedKey(k) ? cleanValue(v) : undefined;
    if (c === undefined) dropped.push(k.slice(0, 64));
    else out[k] = c;
  }
  return { data: out, dropped };
}
