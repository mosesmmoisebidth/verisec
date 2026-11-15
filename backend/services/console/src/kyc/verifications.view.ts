/**
 * Turns a decrypted verification record into the shapes the console's Verifications screens
 * render (frontend/src/lib/console/types.ts: VerificationRow, VerificationDetail). Built on
 * the server so the pages only display; nothing here is ever stored.
 */
import type { Attempt, RecordMeta, RecordSections, TimelineEvent } from './records.service';
import { amlDetail } from './verifications.aml-view';
import { rescoreDeviceSection } from './device.score';
import { deviceFlags, deviceTab } from './verifications.device-view';
import { factsOf } from './workflow-facts';
import { conditionText, holds, partOf, type PartId, type ScorePolicy } from './workflows';

type Outcome = 'pass' | 'fail' | 'review' | 'pending';
type Verdict = 'Approved' | 'Needs review' | 'Declined' | 'Abandoned' | 'In progress' | 'Disabled';
type Fact = { term: string; detail: string; mono?: boolean };
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ABANDON_AFTER_MS = 60 * 60_000; // a session token lives 1 hour

const DOC_LABEL: Record<string, string> = {
  passport: 'Passport',
  'national-id': 'National ID',
  licence: "Driver's licence",
  'residence-permit': 'Residence permit',
};

const when = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString('en-US') : '');
/** "7 Oct, 01:52": a step's time, short enough for the progress stepper. */
const short = (d: Date | string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(' at ', ', ');

function ago(d: Date): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const dd = Math.round(h / 24);
  return dd < 30 ? `${dd} day${dd === 1 ? '' : 's'} ago` : new Date(d).toLocaleDateString('en-US');
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** Verdict as the operator should read it right now. */
export function verdictOf(meta: RecordMeta): Verdict {
  // stopped by the organisation before the applicant finished
  if (meta.status === 'disabled') return 'Disabled';
  if (meta.verdict && ['Approved', 'Needs review', 'Declined', 'Abandoned', 'In progress'].includes(meta.verdict)) return meta.verdict as Verdict;
  if (meta.status === 'in_progress') return Date.now() - new Date(meta.updated_at).getTime() > ABANDON_AFTER_MS ? 'Abandoned' : 'In progress';
  return 'Needs review';
}

/*
 * The Trust Seal (policy TS-2): one score and one verdict, explainable line by line. Modelled on
 * how identity vendors decide (Didit, Persona, Onfido, Jumio, Stripe; research 2026-10-07):
 *
 *  1. Every check the workflow requires counts. One that did not run scores 0 and is named
 *     (missing); the old formula dropped it from the total, so a run without a document scored 92.
 *  2. Each check scores 0 to 100 from its own evidence, in three bands (pass, review, decline):
 *     face similarity, liveness attempts, document reason codes, list hits, contact and device risk.
 *  3. The verdict comes from rules, first match wins:
 *       knock-out (specimen or expired document, face below the decline line, liveness not
 *       confirmed, hard device proof: a virtual camera used, a bot browser, an emulator,
 *       a hijacked network)                               -> Declined, score at most 19
 *     (Tor, like a VPN, only asks for a face check: TS-4, 2026-10-16)
 *       a required check missing                          -> Needs review, score at most 49
 *       any check in its review band                      -> Needs review, score at most 79
 *       score under 80                                    -> Needs review
 *       otherwise                                         -> Approved
 *  4. An unfinished session gets no seal: it shows how far the applicant got (progressOf).
 */
export const TRUST_POLICY = 'TS-4 (2026-10-16)';
type Part = { id: string; label: string; weight: number; score: number | null; knockout?: string; review?: string; notes: string[]; internal?: string[] };
const CAP = { knockout: 19, missing: 49, review: 79 };
const APPROVE_AT = 80;
const FACE = { decline: 0.6, review: 0.75, strong: 0.95 }; // similarity bands
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const pct = (n: number) => `${Math.round(n * 100)}%`;

function documentPart(doc: Any | undefined, idn: Any | undefined, policy: ScorePolicy | null = null): Part {
  const p: Part = { id: 'document', label: 'Document', weight: 30, score: null, notes: [] };
  if (!doc) return { ...p, notes: ['Missing: the document was not read'] };
  if (doc.specimen) return { ...p, score: 0, knockout: 'Specimen document', notes: ['Specimen document'] };
  const v = (doc.verdict ?? {}) as Any;
  if (v.expiry === 0) return { ...p, score: 0, knockout: 'Document expired', notes: ['Document expired'] };
  let s = 100;
  const minus = (n: number, note: string, review?: string) => {
    s -= n;
    p.notes.push(`${note} (-${n})`);
    if (review) p.review ??= review;
  };
  if (!doc.ok) minus(30, doc.decision ? `Not accepted: ${doc.decision}` : 'Not accepted by the reader', 'Document not accepted');
  if (v.mrz === 0) minus(40, 'MRZ check digits failed', 'MRZ check digits failed');
  // Authenticity checks that failed. One that is only a readable-but-off-template difference (e.g. the barcode's
  // layout does not match the stored template, though the barcode WAS read) is treated softly WHEN the barcode was
  // read and the front and back agree: a small score penalty and an internal-review note, and the overall result
  // still passes. A serious failure (a real fraud signal) still penalises hard and sends the whole result to a person.
  const authGroups = arr(doc.authenticity).filter((a) => a.result === 0);
  const authErr = arr(doc.errors).filter((e) => e.area === 'authenticity');
  const authLabel = (a: Any) => String(a.name ?? a.label ?? '');
  const isHardAuth = (n: string) => authErr.some((e) => String(e.label) === n && (e.severity === 'serious' || e.critical));
  const isSoftAuth = (n: string) => !isHardAuth(n) && authErr.some((e) => String(e.label) === n && e.severity === 'quality');
  // the front and back were compared and agreed (the barcode / MRZ matches the printed side)
  const crossOk = (doc.crossMatch as Any)?.agree === true && arr((doc.crossMatch as Any)?.fields).length > 0;
  const softAuth = crossOk ? authGroups.filter((a) => isSoftAuth(authLabel(a))) : [];
  const softNames = new Set(softAuth.map(authLabel));
  const hardAuth = authGroups.filter((a) => !softNames.has(authLabel(a))).length;
  if (hardAuth) minus(Math.min(45, hardAuth * 15), `${hardAuth} authenticity check(s) failed`, 'Authenticity checks failed');
  if (softAuth.length) {
    const pen = Math.min(9, softAuth.length * 3);
    s -= pen;
    const names = [...new Set(softAuth.map(authLabel))];
    p.notes.push(`${softAuth.length} security check(s) to verify internally (-${pen}): ${names.join(', ')}. The barcode was read and the front and back match.`);
    p.internal = names;
  }
  const fields = arr(idn?.fields);
  const fFail = fields.filter((f) => f.outcome === 'fail').length;
  if (fFail) minus(Math.min(30, fFail * 10), `${fFail} field(s) disagree between sources`, 'Fields disagree between sources');
  const critical = arr(doc.anomalies).filter((a) => a.severity === 'critical').length + arr(doc.errors).filter((e) => e.severity === 'serious' || e.critical).length;
  if (critical) minus(Math.min(40, critical * 20), `${critical} serious issue(s) reported`, 'Serious document issues');
  const conf = Number((doc.docClass as Any)?.confidence);
  if (Number.isFinite(conf) && (conf <= 1 ? conf : conf / 100) < 0.8) minus(10, 'Low recognition confidence');
  const type = typeof idn?.documentType === 'string' ? idn.documentType : '';
  if (policy && type && !policy.documentTypes.includes(type)) {
    p.notes.push('Document type not accepted by this workflow');
    p.review ??= 'Document type not accepted by this workflow';
  }
  if (!p.notes.length) p.notes.push('Read, recognised and accepted');
  return { ...p, score: clamp(s) };
}

function facePart(m: Any | undefined, reviewAt: number = FACE.review): Part {
  const p: Part = { id: 'face', label: 'Face match', weight: 20, score: null, notes: [] };
  if (!m) return { ...p, notes: ['Missing: the selfie was not matched'] };
  const sim = Number(m.similarity ?? 0);
  if (sim <= FACE.decline) return { ...p, score: 0, knockout: 'Selfie does not match the document', notes: [`${pct(sim)} similarity, below ${pct(FACE.decline)}`] };
  if (sim < reviewAt) {
    // review band: 0 at the decline line, 70 at the review line
    return {
      ...p,
      score: clamp((70 * (sim - FACE.decline)) / Math.max(0.01, reviewAt - FACE.decline)),
      review: 'Face similarity in the review band',
      notes: [`${pct(sim)} similarity, review band ${pct(FACE.decline)} to ${pct(reviewAt)}`],
    };
  }
  return { ...p, score: clamp(70 + (30 * (sim - reviewAt)) / Math.max(0.01, FACE.strong - reviewAt)), notes: [`${pct(sim)} similarity`] };
}

/** Whole years since a date of birth (YYYY-MM-DD), or null when it cannot be read. */
function ageOf(dob: unknown): number | null {
  const m = typeof dob === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dob) : null;
  if (!m) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - Number(m[1]);
  const before = now.getUTCMonth() + 1 < Number(m[2]) || (now.getUTCMonth() + 1 === Number(m[2]) && now.getUTCDate() < Number(m[3]));
  if (before) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function livenessPart(l: Any | undefined): Part {
  const p: Part = { id: 'liveness', label: 'Liveness', weight: 20, score: null, notes: [] };
  if (!l) return { ...p, notes: ['Missing: liveness did not run'] };
  if (!l.passed) return { ...p, score: 0, knockout: 'Liveness not confirmed', notes: ['Not confirmed'] };
  const tries = Math.max(1, Number(l.attempts ?? 1));
  return { ...p, score: clamp(100 - 10 * (tries - 1)), notes: [tries > 1 ? `Confirmed after ${tries} attempts (-${10 * (tries - 1)})` : 'Confirmed on the first attempt'] };
}

function screeningPart(scr: Any | undefined): Part {
  const p: Part = { id: 'screening', label: 'Watchlist screening', weight: 15, score: null, notes: [] };
  if (!scr) return { ...p, notes: ['Missing: screening did not run'] };
  if (scr.outcome === 'approved') return { ...p, score: 100, notes: ['No list matches'] };
  return { ...p, score: 50, review: 'Watchlist screening needs review', notes: ['Possible list match (-50)'] };
}

function contactPart(c: Any | undefined, findings: Any | undefined): Part {
  // only the channels this verification actually used: a workflow that confirms email only (Standard KYC) is not
  // penalised for a phone it never asked for, and the part is labelled for what it really checked.
  const phonePresent = !!c?.phone;
  const emailPresent = !!c?.email;
  const label = phonePresent && emailPresent ? 'Phone & email' : phonePresent ? 'Phone' : 'Email';
  const p: Part = { id: 'contact', label, weight: 5, score: null, notes: [] };
  if (!phonePresent && !emailPresent) return { ...p, label: 'Phone & email', notes: ['Missing: no contact confirmed'] };
  let s = 100;
  // a channel that was collected but not confirmed is penalised; a channel the workflow did not use is not mentioned
  if (phonePresent && !c?.phone?.verified) {
    s -= 25;
    p.notes.push('Phone not confirmed (-25)');
  }
  if (emailPresent && !c?.email?.verified) {
    s -= 25;
    p.notes.push('Email not confirmed (-25)');
  }
  const risks = [phonePresent ? findings?.scores?.phoneRisk : undefined, emailPresent ? findings?.scores?.emailRisk : undefined]
    .map(Number)
    .filter(Number.isFinite);
  if (risks.length) {
    const r = Math.max(...risks); // the worst channel decides
    const n = Math.round(r * 0.5);
    if (n) {
      s -= n;
      p.notes.push(`Contact risk ${r}/100 (-${n})`);
    }
    if (r >= 60) p.review = phonePresent && emailPresent ? 'Risky phone or email' : phonePresent ? 'Risky phone' : 'Risky email';
  }
  if (!p.notes.length) p.notes.push(`${label} confirmed`);
  return { ...p, score: clamp(s) };
}

function devicePart(dev: Any | undefined, otherPeople: number): Part {
  const p: Part = { id: 'device', label: 'Device & IP', weight: 10, score: null, notes: [] };
  // scored again from the saved device data with today's rules (fixes apply to stored verifications too)
  const risk = rescoreDeviceSection(dev, otherPeople).risk as Any | null;
  if (!risk) return { ...p, notes: ['Missing: no device signals'] };
  const r = Math.max(0, Math.min(100, Number(risk.score ?? 0)));
  // only hard proof declines; a high score made of likelihoods goes to a person
  const hard = arr(risk.reasons).filter((x) => x.hard);
  if (hard.length) return { ...p, score: 0, knockout: String(hard[0].label), notes: hard.map((x) => String(x.label)) };
  if (risk.action === 'review' || risk.action === 'block') p.review = 'Device & IP needs review';
  for (const x of arr(risk.reasons).slice(0, 4)) p.notes.push(`${x.label ?? x.code} (+${x.points ?? '?'} risk)`);
  if (!p.notes.length) p.notes.push(r ? `Risk ${r}/100` : 'No risk signals');
  return { ...p, score: clamp(100 - r) };
}

/**
 * `policy` is the session's workflow version (workflows.ts): which checks count, which are
 * required, which failures go to a person instead of declining, the approval line and whether a
 * person decides every result. Without one, every check counts as before.
 */
export function scoreOf(d: RecordSections, otherPeople = 0, policy: ScorePolicy | null = null) {
  const face = (d.face ?? {}) as Any;
  const scr = d.screening as Any | undefined;
  const all = [
    documentPart(d.document as Any | undefined, d.identity as Any | undefined, policy),
    facePart(face.match, policy?.faceReview),
    livenessPart(face.liveness),
    screeningPart(scr),
    contactPart(d.contact as Any | undefined, scr?.findings),
    devicePart(d.device as Any | undefined, otherPeople),
  ];
  // the workflow's rules, on what the record shows: steps they added count as required
  const facts = policy?.rules.length ? factsOf(d, otherPeople) : null;
  const include = new Set<PartId>(policy?.include ?? []);
  const required = new Set<PartId>(policy?.required ?? []);
  let addressRequired = policy?.address === 'required';
  for (const rule of policy?.rules ?? []) {
    if (rule.then !== 'require' || !rule.check || !facts || !holds(rule.when, facts)) continue;
    const part = partOf(rule.check);
    if (part) {
      include.add(part);
      required.add(part);
    }
    if (rule.check === 'address') addressRequired = true;
  }
  const parts = all
    // only the checks the workflow runs count; an optional one counts only when it ran
    .filter((p) => !policy || include.has(p.id as PartId))
    .filter((p) => !policy || p.score !== null || required.has(p.id as PartId))
    // a failure the workflow sends to a person is a review, not a decline
    .map((p) => (p.knockout && policy?.reviewOnFail.has(p.id as PartId) ? { ...p, review: `${p.knockout} (sent to review)`, knockout: undefined } : p));
  const weight = parts.reduce((s, p) => s + p.weight, 0);
  const raw = weight ? clamp(parts.reduce((s, p) => s + p.weight * (p.score ?? 0), 0) / weight) : 100;
  const knockouts = parts.filter((p) => p.knockout).map((p) => p.knockout!);
  const missing = parts.filter((p) => p.score === null).map((p) => p.label);
  const addrOff = policy?.address === 'off' && !addressRequired;
  const addr = addrOff ? undefined : (d.address as Any)?.outcome;
  // proof of address is optional unless the workflow requires it: only a document sent to a
  // reviewer holds the decision (a typed address, a skipped step or a rejected upload the
  // applicant did not replace do not)
  const reviews = [...parts.filter((p) => p.review).map((p) => p.review!), ...(addr === 'review' ? ['Proof of address needs review'] : [])];
  if (addressRequired && !d.address) missing.push('Proof of address');
  // decision rules: send to a person, or decline, when their condition holds
  for (const rule of policy?.rules ?? []) {
    if (rule.then === 'require' || !facts || !holds(rule.when, facts)) continue;
    const why = conditionText(rule.when);
    if (rule.then === 'decline') knockouts.push(why);
    else reviews.push(why);
  }
  if (policy?.minimumAge != null) {
    const age = ageOf((d.identity as Any | undefined)?.dob);
    const under = `Under the minimum age (${policy.minimumAge})`;
    if (age === null) {
      if (policy.ageRequired) missing.push('Age verification');
    } else if (age < policy.minimumAge) {
      if (policy.ageReviewOnFail) reviews.push(`${under} (sent to review)`);
      else knockouts.push(under);
    }
  }
  const approveAt = policy?.approveAt ?? APPROVE_AT;
  const rule = knockouts.length ? 'knockout' : missing.length ? 'missing' : reviews.length ? 'review' : raw < approveAt ? 'low' : 'clear';
  // a workflow where a person decides every result: a clear run waits for them, its score unchanged
  const held = rule === 'clear' && !!policy?.manual;
  if (held) reviews.push('A person reviews every result in this workflow');
  const score = rule === 'knockout' ? Math.min(raw, CAP.knockout) : rule === 'missing' ? Math.min(raw, CAP.missing) : rule === 'review' ? Math.min(raw, CAP.review) : raw;
  const verdict: Verdict = rule === 'knockout' ? 'Declined' : rule === 'clear' && !held ? 'Approved' : 'Needs review';
  return {
    policy: TRUST_POLICY,
    workflow: policy?.label ?? null,
    score,
    raw,
    verdict,
    rule,
    parts: parts.map((p) => ({ ...p, points: p.score === null ? 0 : Math.round((p.weight * p.score) / (weight || 1)) })),
    knockouts,
    missing,
    reviews,
    // readable security checks that passed the overall result but should be looked at inside the portal
    internalChecks: [...new Set(parts.flatMap((p) => p.internal ?? []))],
  };
}

/** The decision stored at the end of the flow. */
export function decide(d: RecordSections, otherPeople = 0, policy: ScorePolicy | null = null): { verdict: Verdict; score: number } {
  const s = scoreOf(d, otherPeople, policy);
  return { verdict: s.verdict, score: s.score };
}

/*
 * How far the applicant got. Built from the steps the record holds (each is stamped when it
 * happens), so an unfinished session shows exactly where the applicant stopped and when, and
 * everything captured up to there stays on the record.
 */
type StageState = 'done' | 'current' | 'todo' | 'skipped';
const STAGES: { id: string; label: string; any: string[]; all: string[]; optional?: boolean }[] = [
  { id: 'start', label: 'Started', any: ['opened'], all: ['opened'] },
  { id: 'document', label: 'Document', any: ['document_read', 'document', 'identity'], all: ['identity'] },
  { id: 'face', label: 'Face', any: ['face_match', 'liveness'], all: ['face_match', 'liveness'] },
  { id: 'contact', label: 'Phone & email', any: ['phone', 'email'], all: ['phone', 'email'] },
  { id: 'screening', label: 'Screening', any: ['screening'], all: ['screening'] },
  { id: 'address', label: 'Proof of address', any: ['address', 'address_confirmed'], all: ['address_confirmed'], optional: true },
  { id: 'result', label: 'Result', any: ['completed'], all: ['completed'] },
];

/** The checks behind each stage (a stage shows only when its verification's workflow runs one of them). */
const STAGE_CHECKS: Record<string, string[]> = {
  document: ['document'],
  face: ['face-match', 'liveness'],
  contact: ['phone', 'email'],
  screening: ['aml', 'phone', 'email'],
  address: ['address'],
};
const STEP_CHECK: Record<string, string> = { face_match: 'face-match', liveness: 'liveness', phone: 'phone', email: 'email' };

/**
 * `checks`: what the verification's own workflow runs (null: before workflows, every stage). Its stages, and the
 * percentage, count only those, so a 4-step workflow that finished is 100%, not measured against the full KYC. A
 * check a rule added while it ran counts too (its step is on the record).
 */
export function progressOf(meta: RecordMeta, checks: readonly string[] | null = null, timeline: TimelineEvent[] = []) {
  const steps = meta.steps ?? {};
  // every try at a stage (a refused document, a failed face check): how many failed, and whether the last one did
  const triesAt = (stage: string) => timeline.filter((e) => e.stage === stage && e.attempt);
  const completed = meta.status === 'completed' || !!steps.completed;
  const latest = (ids: string[]) => ids.map((s) => steps[s]).filter(Boolean).sort().pop();
  let open = false; // the first stage not finished is where the applicant is (or stopped)
  const plan = STAGES.filter((s) => !checks || !STAGE_CHECKS[s.id] || STAGE_CHECKS[s.id]!.some((c) => checks.includes(c)) || s.any.some((x) => steps[x])).map(
    (s) => (checks && (s.id === 'face' || s.id === 'contact') ? { ...s, all: s.all.filter((x) => checks.includes(STEP_CHECK[x]!) || !!steps[x]) } : s),
  );
  const stages = plan.map((s) => {
    const done = s.all.every((x) => steps[x]);
    const started = s.any.some((x) => steps[x]);
    let state: StageState;
    if (done) state = 'done';
    else if (s.optional && (completed || !started)) state = completed ? 'skipped' : 'todo';
    else if (!open && !completed) {
      state = 'current';
      open = true;
    } else state = 'todo';
    const tries = triesAt(s.id);
    const failed = tries.filter((e) => e.tone === 'fail').length;
    const last = tries[tries.length - 1];
    const at = latest(s.any) ?? last?.at;
    return {
      id: s.id,
      label: s.label,
      state,
      ...(at ? { at: short(at) } : {}),
      ...(failed ? { failed } : {}),
      // the latest try at this stage failed: what went wrong, in a few words
      ...(last?.tone === 'fail' && last.attempt ? { problem: TRY_TITLE[last.attempt.kind][last.attempt.outcome] ?? 'Failed' } : {}),
      // or it went on with a warning (a photo let through despite low quality)
      ...(last?.tone === 'review' && last.attempt ? { warning: 'Accepted with a warning' } : {}),
    };
  });
  const counted = stages.filter((s) => s.state !== 'skipped');
  const current = stages.find((s) => s.state === 'current');
  const abandoned = !completed && meta.status !== 'redacted' && Date.now() - new Date(meta.updated_at).getTime() > ABANDON_AFTER_MS;
  return {
    stages,
    percent: Math.round((counted.filter((s) => s.state === 'done').length / Math.max(1, counted.length)) * 100),
    state: completed ? 'completed' : meta.status === 'redacted' ? 'redacted' : abandoned ? 'abandoned' : 'in_progress',
    ...(current ? { at: current.label } : {}),
    lastActivity: when(meta.updated_at),
    lastActivityAgo: ago(meta.updated_at),
  };
}

/** Device & IP: hard proof fails; a high score made of likelihoods reviews; otherwise passes. */
function deviceOutcome(dev: Any | null | undefined): Outcome {
  const a = dev?.risk?.action;
  if (!a) return 'pending';
  if (arr(dev?.risk?.reasons).some((x) => x.hard)) return 'fail';
  return a === 'block' || a === 'review' ? 'review' : 'pass';
}

type Flag = { label: string; severity: 'info' | 'warn' | 'critical' };
type Check = { label: string; outcome: Outcome; note?: string };
type Group = { title: string; facts?: Fact[]; checks?: Check[]; raw?: string; collapsed?: boolean };

/*
 * Documents differ by country and type (fields, sides, MRZ, barcode, chip), so everything
 * below is driven by what the record actually holds: every array is guarded, every group
 * appears only when it has content, and unknown keys are labelled generically.
 */
const arr = (v: unknown): Any[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Any[]) : []);
const val = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const fct = (term: string, v: unknown, mono = false): Fact | null => (val(v) ? { term, detail: val(v)!, ...(mono ? { mono } : {}) } : null);
const facts = (xs: (Fact | null | false | undefined)[]) => xs.filter(Boolean) as Fact[];
const OUTCOMES = new Set(['pass', 'fail', 'review', 'pending']);
const asOutcome = (o: unknown): Outcome => (OUTCOMES.has(String(o)) ? (o as Outcome) : 'pending');
/** Regula validity: 1 checked OK, 0 failed, 2 (or absent) not checked. */
const validity = (v: unknown): Outcome => (v === 1 ? 'pass' : v === 0 ? 'fail' : 'pending');
const nonEmpty = (g: Group) => !!g.raw || (g.facts?.length ?? 0) > 0 || (g.checks?.length ?? 0) > 0;
const pretty = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const VERDICT: Record<string, string> = {
  overallStatus: 'Overall',
  optical: 'Optical checks',
  security: 'Security features',
  text: 'Text fields',
  mrz: 'MRZ',
  imageQA: 'Image quality',
  expiry: 'Not expired',
  docType: 'Document type',
  portrait: 'Portrait',
  rfid: 'Chip (RFID)',
  stopList: 'Stop list',
};
const SEVERITY: Record<string, Flag['severity']> = { critical: 'critical', serious: 'critical', warn: 'warn', quality: 'warn', info: 'info' };

/** The fields worth a first look, whatever the document calls them. */
const PERSONAL =
  /^(SURNAME_AND_GIVEN_NAMES|SURNAME|GIVEN_NAMES|FIRST_NAME|LAST_NAME|DATE_OF_BIRTH|SEX|NATIONALITY|NATIONALITY_CODE|DOCUMENT_NUMBER|PERSONAL_NUMBER|DATE_OF_EXPIRY|DATE_OF_ISSUE|PLACE_OF_BIRTH|PLACE_OF_ISSUE|ISSUING_STATE_NAME|ADDRESS)$/;

/** Field types the engine adds on its own for any document: never a sign of an unusual document. */
const DERIVED = /^(AGE|AGE_AT_ISSUE|REMAINDER_TERM|YEARS_SINCE_ISSUE|ISSUING_STATE_CODE|ISSUING_STATE_NAME|SURNAME|GIVEN_NAMES|FIRST_NAME|LAST_NAME|MIDDLE_NAME|SURNAME_AND_GIVEN_NAMES|NATIONALITY|NATIONALITY_CODE|DOCUMENT_CLASS_CODE|DOCUMENT_CLASS_NAME|OPTIONAL_DATA)$|CHECK_?DIGIT|^MRZ_/;

/** The genuinely new fields a document carried (the reader's "unexpected field" notes, minus derived ones). */
function extraFields(doc: Any | null): string[] {
  const out = new Set<string>();
  for (const a of arr(doc?.anomalies)) {
    if (a.kind !== 'unexpected-field' || !a.field) continue;
    const key = String(a.field).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    if (!DERIVED.test(key)) out.add(String(a.field));
  }
  return [...out];
}

function documentExtras(doc: Any | null, idn: Any) {
  const flags: Flag[] = [];
  const groups: Group[] = [];
  const fields = arr(idn.fields);
  if (doc) {
    if (doc.specimen) flags.push({ label: 'Specimen document', severity: 'critical' });
    if (doc.ok === false) flags.push({ label: doc.decision ? `Document: ${doc.decision}` : 'Document not accepted', severity: 'warn' });
    const repeat = (t: string) => !!doc.specimen && /specimen|sample/i.test(t);
    const extra = extraFields(doc);
    for (const a of arr(doc.anomalies).filter((x) => x.kind !== 'unexpected-field')) {
      const label = String(a.detail ?? a.kind);
      if (!repeat(label)) flags.push({ label, severity: SEVERITY[a.severity] ?? 'info' });
    }
    if (extra.length) flags.push({ label: `Fields read that this document's profile does not list: ${extra.join(', ')}`, severity: 'info' });
    for (const e of arr(doc.errors).filter((x) => x.severity === 'serious' || x.critical)) {
      const label = `${e.label}${e.detail ? `: ${e.detail}` : ''}`;
      if (!repeat(label)) flags.push({ label, severity: 'critical' });
    }
    const seen = new Set<string>();
    for (let i = flags.length - 1; i >= 0; i--) {
      const k = flags[i].label.trim().toLowerCase();
      if (seen.has(k)) flags.splice(i, 1);
      else seen.add(k);
    }
  }
  const cls = (doc?.docClass ?? {}) as Any;
  groups.push({
    title: 'Document',
    facts: facts([
      fct('Recognised as', doc?.recognisedAs ?? cls.name),
      fct('Type', cls.type ?? DOC_LABEL[String(idn.documentType ?? '')] ?? idn.documentType),
      fct('Issuing country', cls.countryName ? `${cls.countryName} (${cls.country})` : idn.documentCountry),
      fct('Recognition confidence', typeof cls.confidence === 'number' ? `${Math.round(cls.confidence <= 1 ? cls.confidence * 100 : cls.confidence)}%` : null),
      fct('Sides read', doc?.sides),
      fct('Faces on document', doc?.faces),
      fct('Status', doc?.status),
      fct('Decision', doc?.decision),
      fct('Guidance', doc?.guidance),
    ]),
  });
  groups.push({
    title: 'Field checks',
    checks: fields
      .filter((x) => x.outcome)
      .map((x) => ({
        label: String(x.term ?? x.key ?? 'Field'),
        outcome: asOutcome(x.outcome),
        note: [Array.isArray(x.sources) ? x.sources.join(', ') : '', x.crossChecked ? 'cross-checked' : ''].filter(Boolean).join(' · ') || undefined,
      })),
  });
  const mrz = (doc?.mrz ?? null) as Any | null;
  if (mrz && Array.isArray(mrz.rows) && mrz.rows.length) {
    groups.push({ title: 'MRZ', facts: facts([fct('Format', mrz.format), ...mrz.rows.map((r: unknown, i: number) => fct(`Line ${i + 1}`, r, true))]) });
  }
  const verdict = (doc?.verdict ?? {}) as Any;
  groups.push({
    title: 'Verdict by area',
    checks: Object.entries(verdict)
      .filter(([k, v]) => typeof v === 'number' && k !== 'specimen')
      .map(([k, v]) => ({ label: VERDICT[k] ?? pretty(k), outcome: validity(v), ...(v === 2 ? { note: 'Not checked on this document' } : {}) })),
  });
  if (verdict.rfidDetails && typeof verdict.rfidDetails === 'object') {
    groups.push({ title: 'Chip protocols', checks: Object.entries(verdict.rfidDetails as Any).map(([k, v]) => ({ label: k, outcome: validity(v) })), collapsed: true });
  }
  groups.push({
    title: 'Authenticity',
    checks: arr(doc?.authenticity).map((a) => ({
      label: String(a.label),
      outcome: validity(a.result),
      note: [a.elements ? `${a.elements} element(s)` : '', a.page ? `page ${a.page}` : ''].filter(Boolean).join(', ') || undefined,
    })),
  });
  groups.push({ title: 'Image quality', checks: arr(doc?.quality).map((q) => ({ label: String(q.label), outcome: asOutcome(q.outcome) })), collapsed: true });
  groups.push({
    title: 'Issues reported',
    checks: [
      ...arr(doc?.errors).map((e) => ({
        label: `${e.label}${e.side ? ` (${e.side})` : ''}`,
        outcome: (e.severity === 'serious' || e.critical ? 'fail' : 'review') as Outcome,
        note: e.detail ? String(e.detail) : undefined,
      })),
      ...arr(doc?.anomalies)
        .filter((a) => a.kind !== 'unexpected-field')
        .map((a) => ({
          label: String(a.detail ?? a.kind),
          outcome: (a.severity === 'critical' ? 'fail' : a.severity === 'info' ? 'pending' : 'review') as Outcome,
          note: a.field ? String(a.field) : undefined,
        })),
      ...(extraFields(doc).length
        ? [{ label: 'Fields read that this document\'s profile does not list', outcome: 'pending' as Outcome, note: extraFields(doc).join(', ') }]
        : []),
    ],
  });
  return { flags, groups: groups.filter(nonEmpty) };
}

function faceExtras(face: Any) {
  const flags: Flag[] = [];
  const groups: Group[] = [];
  const m = face.match as Any | undefined;
  const l = face.liveness as Any | undefined;
  if (m && !m.matched) flags.push({ label: 'Selfie does not match the document photo', severity: 'critical' });
  if (m?.matched && typeof m.similarity === 'number' && m.similarity < 0.85) flags.push({ label: `Low face similarity (${Math.round(m.similarity * 100)}%)`, severity: 'warn' });
  if (l && !l.passed) flags.push({ label: 'Liveness not confirmed', severity: 'critical' });
  if (l && (l.attempts ?? 1) > 2) flags.push({ label: `${l.attempts} liveness attempts`, severity: 'warn' });
  groups.push({
    title: 'Checks',
    checks: [
      ...(m ? [{ label: 'Face match', outcome: (m.matched ? 'pass' : 'fail') as Outcome, note: `${Math.round((m.similarity ?? 0) * 100)}% similarity, threshold ${Math.round((m.threshold ?? 0.75) * 100)}%` }] : []),
      ...(l ? [{ label: 'Liveness', outcome: (l.passed ? 'pass' : 'fail') as Outcome, note: [l.mode, l.attempts ? `${l.attempts} attempt(s)` : ''].filter(Boolean).join(', ') || undefined }] : []),
    ],
  });
  if (l) {
    groups.push({
      title: 'Liveness session',
      facts: facts([
        fct('Result', l.passed ? 'Live person confirmed' : 'Not confirmed'),
        fct('Check', l.mode ? `${String(l.mode).charAt(0).toUpperCase()}${String(l.mode).slice(1)} liveness` : null),
        fct('Attempts', l.attempts),
        fct('Checked at', l.at ? when(l.at) : null),
        fct('Reference', l.transactionId, true),
      ]),
    });
  }
  return { flags, groups: groups.filter(nonEmpty) };
}

/*
 * Document fields, grouped by what kind of field they are. Nothing here lists the fields a
 * document should have: every field the engine read is shown, in the engine's order, and its
 * group comes from tokens in its type name (DATE_OF_BIRTH -> Personal, DATE_OF_EXPIRY ->
 * Document). A type no rule recognises lands in "Other details", so a new document or country
 * never loses a field.
 */
const FIELD_GROUP_RULES: { title: string; test: RegExp }[] = [
  { title: 'Machine-readable zone', test: /MRZ|CHECK_?DIGIT|CHECKDIGIT|OPTIONAL_DATA/ },
  { title: 'Document', test: /ISSUING|ISSUE|AUTHORITY|EXPIR|DOCUMENT|^DL_|CATEGOR|CLASS|LICEN|VALID|SERIAL|RESTRICT|ENDORSE|PERMIT|VISA/ },
  { title: 'Personal', test: /NAME|BIRTH|SEX|GENDER|NATIONALITY|PERSONAL_NUMBER|(^|_)AGE(_|$)|HEIGHT|WEIGHT|EYES|HAIR|SPOUSE|MARITAL|RELIGION|PROFESSION|BLOOD|ETHNIC|CITIZEN/ },
  { title: 'Address', test: /ADDRESS|STREET|CITY|ZIP|POSTAL|PROVINCE|DISTRICT|JURISDICTION|RESIDENCE|COUNTY|BUILDING|APARTMENT|SECTOR|VILLAGE/ },
  { title: 'Document', test: /NUMBER|CODE|TYPE|VERSION/ },
];
const FIELD_GROUP_ORDER = ['Personal', 'Document', 'Address', 'Machine-readable zone', 'Other details'];

/** "RemainderTerm" -> "Remainder term", "DATE_OF_BIRTH" -> "Date of birth"; labels with spaces stay as they are. */
function readable(t: string) {
  if (/\s/.test(t.trim())) return t.trim();
  const words = t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The MRZ as text lines, from the document's "MRZ Strings" field (lines joined by ^), and its format. */
function mrzLines(doc: Any | null, idn: Any) {
  const f = arr(idn.fields).find((x) => /^MRZ_STRINGS?$/i.test(String(x.key ?? '')) || /^mrz strings?$/i.test(String(x.term ?? '')));
  let lines = f ? String(f.detail ?? '').split(/\^|\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  if (!lines.length) {
    const rows = (doc?.mrz as Any | undefined)?.rows;
    lines = Array.isArray(rows) ? rows.filter((r): r is string => typeof r === 'string' && !r.startsWith('[object')) : [];
  }
  if (!lines.length) return null;
  const n = lines[0].length;
  const format = lines.length === 3 && n === 30 ? 'TD1, ID card' : lines.length === 2 && n === 36 ? 'TD2' : lines.length === 2 && n === 44 ? 'TD3, passport' : `${lines.length} lines`;
  return { format, lines };
}

function fieldGroups(idn: Any) {
  const groups = new Map<string, Any[]>();
  for (const x of arr(idn.fields)) {
    const value = val(x.detail);
    if (!value) continue;
    const key = String(x.key || x.term || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const title = FIELD_GROUP_RULES.find((r) => r.test.test(key))?.title ?? 'Other details';
    const sources = Array.isArray(x.sources) ? (x.sources as unknown[]).map(String) : [];
    groups.set(title, [
      ...(groups.get(title) ?? []),
      {
        label: readable(String(x.term ?? x.key ?? 'Field')),
        value,
        ...(x.mono || /NUMBER|MRZ|CODE|CHECK/.test(key) ? { mono: true } : {}),
        sources,
        status: asOutcome(x.outcome),
        crossChecked: !!x.crossChecked,
      },
    ]);
  }
  return FIELD_GROUP_ORDER.filter((t) => groups.has(t)).map((title) => ({ title, fields: groups.get(title)! }));
}

function documentSummary(doc: Any | null, idn: Any, meta: RecordMeta) {
  const cls = (doc?.docClass ?? {}) as Any;
  const conf = typeof cls.confidence === 'number' ? Math.round(cls.confidence <= 1 ? cls.confidence * 100 : cls.confidence) : null;
  return [
    { label: 'Recognised as', value: val(doc?.recognisedAs ?? cls.name) ?? 'Not recognised' },
    { label: 'Issuing country', value: val(cls.countryName ?? idn.documentCountry ?? meta.country) ?? 'Unknown' },
    { label: 'Document type', value: val(cls.type ?? DOC_LABEL[String(idn.documentType ?? meta.document_type ?? '')] ?? idn.documentType) ?? 'Unknown' },
    ...(conf != null ? [{ label: 'Recognition', value: `${conf}%` }] : []),
    ...(doc?.sides ? [{ label: 'Sides read', value: String(doc.sides) }] : []),
  ];
}

/*
 * How the two faces were compared, in words: how many faces were found in each image, which face
 * was compared with which, the similarity against the threshold, and how long it took. Built from
 * the engine's answer, which itself is never shown (no codes, no internal fields).
 * Image 1 is the live selfie and image 2 the document photo (the order the console sends them in).
 */
function faceComparison(m: Any | undefined) {
  if (!m) return null;
  const detail = (m.detail ?? {}) as Any;
  const name = (i: unknown) => (Number(i) === 1 ? 'Selfie' : Number(i) === 2 ? 'Document photo' : `Image ${i}`);
  const res = arr(detail.results)[0] ?? {};
  const secs = Number(detail.elapsedTime ?? detail.elapsed_time);
  const similarity = typeof res.similarity === 'number' ? res.similarity : Number(m.similarity ?? 0);
  return {
    images: arr(detail.detections).map((d) => ({ label: name(d.imageIndex), faces: arr(d.faces).length, read: d.status === 0 || d.status == null })),
    pair:
      res.firstIndex != null && res.secondIndex != null
        ? `The face in the ${name(res.firstIndex).toLowerCase()} was compared with the face on the ${name(res.secondIndex).toLowerCase()}.`
        : null,
    similarity,
    threshold: Number(m.threshold ?? 0.75),
    matched: !!m.matched,
    seconds: Number.isFinite(secs) && secs > 0 ? Math.round(secs * 10) / 10 : null,
  };
}

/*
 * Contact & risk evidence with its values. Each consistency pair shows the two values that were
 * compared and what came out; pairs stored before the values were kept are rebuilt from the
 * record itself (identity, contact, phone lookup, device). A value nobody recorded says so.
 */
const PAIR_LABEL: Record<string, [string, string]> = {
  'Document|Phone country': ['Document country', 'Phone number country'],
  'Document|Email name': ['Name on the document', 'Email address'],
  'Phone|IP country': ['Phone number country', 'Connection country'],
  'Declared|Doc country': ['Country chosen by the applicant', 'Document country'],
  'Email|IP region': ['Email domain', 'Connection country'],
};

function consistencyPairs(findings: Any | null, d: RecordSections, meta: RecordMeta) {
  const idn = (d.identity ?? {}) as Any;
  const contact = (d.contact ?? {}) as Any;
  const dev = (d.device ?? {}) as Any;
  // a verification that did not check phone shows no phone consistency rows (they would all read "not available")
  const usedPhone = !!(contact.phone || findings?.phone);
  const row = (sections: unknown, title: RegExp, label: RegExp) => {
    for (const sec of arr(sections)) if (title.test(String(sec.title))) for (const r of arr(sec.rows)) if (label.test(String(r.label))) return val(r.value);
    return null;
  };
  const up2 = (v: unknown) => (val(v) ? String(v).trim().toUpperCase() : null);
  const phoneC = up2(row(findings?.phone, /validity|number/i, /^country$/i));
  const docC = up2(idn.documentCountry ?? meta.country);
  const ipC = up2((dev.ip as Any)?.countryCode ?? (dev.ip as Any)?.country);
  const email = val(contact.email?.address);
  const domain = email && email.includes('.') ? `.${email.split('.').pop()!.toLowerCase()}` : null;
  const rebuilt: Record<string, [string | null, string | null]> = {
    'Document|Phone country': [docC, phoneC],
    'Document|Email name': [val(idn.name), email],
    'Phone|IP country': [phoneC, ipC],
    'Declared|Doc country': [null, docC],
    'Email|IP region': [domain, ipC],
  };
  return arr(findings?.consistency)
    .filter((c) => usedPhone || !/phone/i.test(`${c.left} ${c.right}`))
    .map((c) => {
    const key = `${c.left}|${c.right}`;
    const [l, r] = PAIR_LABEL[key] ?? [String(c.left), String(c.right)];
    const lv = val(c.leftValue) ?? rebuilt[key]?.[0] ?? null;
    const rv = val(c.rightValue) ?? rebuilt[key]?.[1] ?? null;
    const stored: Outcome = c.tone === 'pass' ? 'pass' : c.tone === 'warn' ? 'review' : c.tone === 'fail' ? 'fail' : 'pending';
    // A result is only shown with both values beside it. When screening compared values this record
    // did not keep (older verifications), say what screening found, without a pass or fail mark.
    if (stored !== 'pending' && (!lv || !rv)) {
      const missing = [!lv && l.toLowerCase(), !rv && r.toLowerCase()].filter(Boolean).join(' and ');
      const found = stored === 'pass' ? (key === 'Document|Email name' ? 'Name found in the address' : 'Matched') : 'Differed';
      return {
        left: { label: l, icon: 'document' },
        right: { label: r, icon: 'device-ip' },
        leftValue: lv,
        rightValue: rv,
        outcome: 'pending' as Outcome,
        note: `${found} at screening; the ${missing} was not kept with this record`,
      };
    }
    const outcome = stored;
    const note =
      outcome === 'pass'
        ? key === 'Document|Email name'
          ? 'Part of the name appears in the address'
          : 'Same country'
        : outcome === 'review' || outcome === 'fail'
          ? key === 'Document|Email name'
            ? 'The address does not carry the name'
            : `Different countries${lv && rv ? `: ${lv} and ${rv}` : ''}`
          : !lv && !rv
            ? 'Not compared: neither value was available'
            : !lv
              ? `Not compared: ${l.toLowerCase()} not available`
              : !rv
                ? `Not compared: ${r.toLowerCase()} not available`
                : key === 'Email|IP region'
                  ? `Not compared: ${lv} is not tied to a country`
                  : key === 'Document|Email name'
                    ? 'No part of the name appears in the address'
                    : 'Not compared';
    return { left: { label: l, icon: 'document' }, right: { label: r, icon: 'device-ip' }, leftValue: lv, rightValue: rv, outcome, note };
  });
}

/** Velocity rows with what each count is about: whose number, which address, which connection. */
function velocityRows(findings: Any | null, d: RecordSections) {
  const contact = (d.contact ?? {}) as Any;
  const dev = (d.device ?? {}) as Any;
  // no phone was checked: drop the "same phone across accounts" row instead of showing it as "Not checked"
  const usedPhone = !!(contact.phone || findings?.phone);
  const at = (dev.atScreening ?? {}) as Any;
  const phone = val(contact.phone?.e164);
  const email = val(contact.email?.address);
  const ip = val(at.ip ?? (dev.ip as Any)?.address);
  const device = val(at.deviceId ?? (dev.session as Any)?.deviceId);
  const shown = (s: string | null, fallback: string) => s ?? fallback;
  return arr(findings?.velocity)
    .filter((v) => usedPhone || !/phone/i.test(String(v.label)))
    .map((v) => {
    const label = String(v.label);
    const n = Number(v.value);
    const known = v.value != null && v.value !== '' && Number.isFinite(n);
    let note = '';
    let outcome: Outcome = known ? 'pass' : 'pending';
    if (!known) note = 'Not checked for this verification';
    else if (/phone/i.test(label)) {
      note = n <= 1 ? `Only this applicant has used ${shown(phone, 'this number')}` : `${shown(phone, 'This number')} was used by ${n} applicants`;
      if (n >= 2) outcome = 'review';
    } else if (/email/i.test(label)) {
      note = n <= 1 ? `Only this applicant has used ${shown(email, 'this address')}` : `${shown(email, 'This address')} was used by ${n} applicants`;
      if (n >= 2) outcome = 'review';
    } else if (/device/i.test(label)) {
      const dv = device ? `this device (${device.slice(0, 12)})` : 'this device';
      note = n <= 1 ? `Only this applicant has used ${dv}` : `${dv.charAt(0).toUpperCase()}${dv.slice(1)} was used by ${n} applicants`;
      if (n >= 2) outcome = 'review';
    } else if (/otp|code/i.test(label)) {
      note = n === 0 ? 'No wrong codes were entered' : `${n} wrong code${n === 1 ? ' was' : 's were'} entered in the last hour`;
      if (n >= 3) outcome = 'review';
    } else if (/ip|session/i.test(label)) {
      note = `${n} verification${n === 1 ? '' : 's'} from ${shown(ip, 'this connection')} in the last 24 hours`;
      if (n >= 5) outcome = 'review';
    }
    return { label, value: known ? String(n) : 'Not checked', note, outcome };
  });
}

/*
 * Proof of address for reviewers: the outcome in words, the address in parts (what the
 * applicant confirmed, with the fields they changed), the checks the applicant saw, what was
 * read from the page, and every reason the reader raised, including the forgery signals the
 * applicant is never shown.
 */
const POA_PARTS: [string, string][] = [
  ['street', 'Street'],
  ['building', 'House or plot'],
  ['sector', 'Area or sector'],
  ['village', 'Village'],
  ['cell', 'Cell'],
  ['district', 'District'],
  ['city', 'City or town'],
  ['region', 'Region'],
  ['postalCode', 'Postal code'],
];
const TONE_OUTCOME: Record<string, Outcome> = { pass: 'pass', warn: 'review', fail: 'fail', na: 'pending' };
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2006-09-06 -> 6 Sep 2006 (a calendar date on a document: no time zone involved). */
const longDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTH[Number(m[2]) - 1]} ${m[1]}` : iso;
};

function addressEvidence(addr: Any) {
  const internal = (addr.internal ?? {}) as Any;
  const report = (internal.report ?? {}) as Any;
  const confirmed = (addr.confirmed ?? null) as Any | null;
  const read = (addr.address ?? {}) as Any;
  const edited = new Set(((addr.edited ?? []) as string[]).map(String));
  const outcome = String(addr.outcome ?? (addr.source === 'typed' ? 'typed' : ''));
  const notPoa = addr.isProofOfAddress === false;
  const status =
    outcome === 'accepted'
      ? { outcome: 'pass' as Outcome, title: 'Accepted', detail: 'The document is a valid proof of address and matches the applicant.' }
      : outcome === 'review'
        ? { outcome: 'review' as Outcome, title: 'Needs review', detail: 'The document was read, but something needs a person to look at it (see the reviewer checks).' }
        : outcome === 'retake'
          ? {
              outcome: 'fail' as Outcome,
              title: 'Not accepted',
              detail: notPoa
                ? `Not a proof of address${addr.whatItIs ? `: it looks like a ${addr.whatItIs}` : ''}. The applicant was asked to upload another document.`
                : String(addr.message ?? 'The applicant was asked to upload another document.'),
            }
          : outcome === 'typed'
            ? { outcome: 'pending' as Outcome, title: 'Typed, not proven', detail: 'The applicant typed the address. No document was uploaded to prove it.' }
            : { outcome: 'pending' as Outcome, title: 'Not completed', detail: 'The applicant did not finish this optional step.' };
  // the address in parts: what the applicant confirmed, else what was read from the document
  const src = confirmed ?? read;
  const parts = POA_PARTS.map(([k, label]) => ({ label, value: val(src?.[k]) ?? '', edited: edited.has(k) })).filter((x) => x.value);
  const country = val(src?.country ?? read.country);
  const reasons = arr(report.verification?.reasons);
  const integ = (report.forensics?.integrity ?? {}) as Any;
  const file = (report.file ?? {}) as Any;
  return {
    status,
    document: facts([
      // an upload that is not a proof of address is named for what it is
      fct('Document', notPoa && addr.whatItIs ? `${String(addr.whatItIs).charAt(0).toUpperCase()}${String(addr.whatItIs).slice(1)} (not a proof of address)` : addr.document?.type),
      fct('Issued by', addr.document?.issuer),
      fct('Issue date', addr.document?.issued ? longDate(String(addr.document.issued)) : null),
      fct('Name on the document', addr.holderName),
    ]),
    address: {
      parts,
      country: country ? country.toUpperCase() : null,
      readAs: val(read.raw),
      confirmed: !!confirmed,
      source: addr.source === 'typed' ? 'Typed by the applicant' : confirmed ? 'Confirmed by the applicant' : 'As read from the document',
    },
    checks: arr(addr.checks).map((c) => ({ label: String(c.label), outcome: TONE_OUTCOME[String(c.tone)] ?? 'pending', note: val(c.value) ?? undefined })),
    details: arr(addr.details).map((d) => ({ label: String(d.label), value: String(d.value ?? '') })).filter((d) => d.value),
    reviewer: reasons.map((r) => ({ label: String(r.label ?? r.code), outcome: TONE_OUTCOME[String(r.tone)] ?? 'pending' })),
    integrity: facts([
      fct('File', file.kind ? `${String(file.kind).toUpperCase()}${file.pages ? `, ${file.pages} page${file.pages === 1 ? '' : 's'}` : ''}` : null),
      fct('Pixel check', integ.pixel_check === 'checked' ? `Checked${Array.isArray(integ.pasted_patches) && integ.pasted_patches.length ? `, ${integ.pasted_patches.length} pasted area(s) found` : ', nothing pasted found'}` : integ.pixel_check ? 'Not checked' : null),
      fct('Amounts add up', integ.totals_consistent === true ? 'Yes' : integ.totals_consistent === false ? 'No' : null),
      fct('Reference', addr.reference, true),
    ]),
  };
}

/** Personal data for the overview: the key identity fields, in the document's own labels. */
function personalData(idn: Any, meta: RecordMeta): Fact[] {
  const fields = arr(idn.fields);
  const picked = fields.filter((x) => typeof x.key === 'string' && PERSONAL.test(x.key)).map((x) => ({ term: String(x.term), detail: String(x.detail ?? ''), ...(x.mono ? { mono: true } : {}) }));
  const base = facts([
    !picked.some((x) => /name/i.test(x.term)) && fct('Full name', idn.name),
    !picked.some((x) => /birth/i.test(x.term)) && fct('Date of birth', idn.dob),
    !picked.some((x) => /nationality/i.test(x.term)) && fct('Nationality', idn.nationality ? String(idn.nationality).toUpperCase() : null),
    fct('Document type', DOC_LABEL[meta.document_type ?? ''] ?? meta.document_type),
    fct('Document country', idn.documentCountry ?? meta.country),
  ]);
  return [...picked.filter((x) => x.detail), ...base];
}

/* ------------------------------------------------------------------------ list -- */

/** `workflow`: the name of the workflow the verification runs (none for ones made before workflows). */
export function toRow(meta: RecordMeta, identity: Any | null, workflow?: string, checks: readonly string[] | null = null) {
  const name = (identity?.name as string) || (meta.status === 'redacted' ? '[redacted]' : 'New applicant');
  const p = meta.status === 'in_progress' ? progressOf(meta, checks) : null;
  return {
    id: meta.id,
    reference: meta.reference,
    applicant: name,
    initials: initials(name),
    document: DOC_LABEL[meta.document_type ?? ''] ?? meta.document_type ?? 'Not captured',
    country: meta.country ?? '',
    // the workflow it runs (the version pinned when it was created); before workflows, every check
    workflow: workflow ?? 'Standard KYC',
    // where an unfinished session is, or where the applicant stopped
    stage: p
      ? p.at === 'Started'
        ? // the applicant has not opened the link
          p.state === 'abandoned'
          ? 'Link never opened'
          : 'Link not opened yet'
        : p.at
          ? `${p.state === 'abandoned' ? 'Stopped at' : 'At'} ${p.at.toLowerCase()} (${p.percent}%)`
          : 'In progress'
      : meta.status === 'redacted'
        ? 'Redacted'
        : meta.status === 'disabled'
          ? 'Disabled: the link no longer opens'
          : null,
    // what the row's menu offers (Disable while it runs, Enable once disabled)
    status: meta.status,
    score: meta.score ?? 0,
    verdict: verdictOf(meta),
    when: ago(meta.created_at),
  };
}

/* ---------------------------------------------------------------------- detail -- */

const TAB_CHECKS: Record<string, { checks: string[]; steps: string[] }> = {
  document: { checks: ['document'], steps: ['document_read', 'document', 'identity'] },
  face: { checks: ['face-match', 'liveness'], steps: ['face_match', 'liveness'] },
  nfc: { checks: ['nfc'], steps: ['nfc'] },
  aml: { checks: ['aml'], steps: ['screening'] },
  'device-ip': { checks: ['device-ip'], steps: ['device_open', 'device'] },
  contact: { checks: ['phone', 'email'], steps: ['phone', 'email'] },
  address: { checks: ['address'], steps: ['address', 'address_confirmed'] },
};
function tabsFor(checks: readonly string[] | null, steps: Record<string, string>): string[] | null {
  if (!checks) return null;
  const on = Object.entries(TAB_CHECKS)
    .filter(([, t]) => t.checks.some((c) => checks.includes(c)) || t.steps.some((s) => steps[s]))
    .map(([id]) => id);
  return ['overview', ...on, 'timeline'];
}

/** The Trust Seal badges and the workflow checks each belongs to: a verification shows only its own. */
const BADGES: { label: string; needs: string[]; on: (c: { doc: Any | null; face: Any; contact: Any; addr: Any | null; scr: Any | null }) => boolean }[] = [
  { label: 'Document', needs: ['document'], on: ({ doc }) => !!doc?.ok },
  { label: 'Face', needs: ['face-match', 'liveness'], on: ({ face }) => !!face.match?.matched && !!face.liveness?.passed },
  { label: 'Phone', needs: ['phone'], on: ({ contact }) => !!contact.phone?.verified },
  { label: 'Address', needs: ['address'], on: ({ addr }) => addr?.outcome === 'accepted' },
  { label: 'AML-clear', needs: ['aml'], on: ({ scr }) => scr?.outcome === 'approved' },
];

export function toDetail(
  meta: RecordMeta,
  d: RecordSections,
  files: { slot: string; mime: string | null }[],
  fileUrl: (slot: string) => string,
  access: { actor: string; action: string; at: Date }[],
  otherPeople = 0,
  policy: ScorePolicy | null = null,
) {
  const idn = (d.identity ?? {}) as Any;
  const doc = (d.document ?? null) as Any | null;
  const tl = (d.timeline ?? []) as TimelineEvent[];
  // every try, numbered per kind, with its own image: shown on the Document and Face tabs and on the timeline
  const tries = triesOf(tl, fileUrl);
  const docTries = tries.filter((t): t is Try => !!t && t.kind === 'document');
  const faceTries = tries.filter((t): t is Try => !!t && t.kind !== 'document');
  const face = (d.face ?? {}) as Any;
  const contact = (d.contact ?? {}) as Any;
  const scr = (d.screening ?? null) as Any | null;
  const addr = (d.address ?? null) as Any | null;
  // the device section scored again with today's rules (other people on the device, used cameras)
  const dev = rescoreDeviceSection(d.device as Any | null, otherPeople).section as Any | null;
  const has = (slot: string) => files.some((f) => f.slot === slot);
  const slot = (s: string, label: string) => (has(s) ? { label, image: fileUrl(s), real: true } : { label });
  const verdict = verdictOf(meta);
  const redacted = meta.status === 'redacted';
  const trust = scoreOf(d, otherPeople, policy);
  const docName = DOC_LABEL[meta.document_type ?? ''] ?? meta.document_type ?? 'Not captured';
  const docX = documentExtras(doc, idn);
  const faceX = faceExtras(face);
  const amlX = redacted ? null : amlDetail(scr);
  const devX = dev ? deviceTab(dev) : null;
  const pick = (gs: Group[], ...titles: string[]) => gs.filter((g) => titles.includes(g.title));
  const drop = (gs: Group[], ...titles: string[]) => gs.filter((g) => !titles.includes(g.title));
  const otherFlags: Flag[] = [
    ...(scr && scr.outcome !== 'approved' ? [{ label: 'Watchlist screening needs review', severity: 'warn' as const }] : []),
    ...(addr?.outcome === 'retake' ? [{ label: 'Proof of address upload not accepted (optional step)', severity: 'info' as const }] : []),
    ...(addr?.outcome === 'review' ? [{ label: 'Proof of address needs review', severity: 'warn' as const }] : []),
  ];

  // the latest upload: let through with a warning, or not accepted yet (said under the Trust Seal)
  const lastDoc = docTries[docTries.length - 1];
  const tryFlags: Flag[] = lastDoc?.warn
    ? [{ label: `Document accepted with a warning (${lastDoc.reason ?? 'a check did not pass'})${doc?.crossMatch?.agree ? ', because the front and back details agree' : ', after a second try'}`, severity: 'warn' }]
    : lastDoc && !lastDoc.ok
      ? [{ label: `Document not accepted yet: ${lastDoc.title.toLowerCase()}${lastDoc.reason ? ` (${lastDoc.reason})` : ''}`, severity: 'warn' }]
      : [];
  const outcomeOf = (ok: boolean | undefined | null, ran: boolean): Outcome => (!ran ? 'pending' : ok ? 'pass' : 'fail');
  // a workflow's verification lists its own checks: the always-on ones and those its rules added
  const facts = policy?.rules.length ? factsOf(d, otherPeople) : null;
  const runs = policy
    ? new Set<string>([
        ...policy.checks,
        ...policy.rules.filter((r) => r.then === 'require' && r.check && facts && holds(r.when, facts)).map((r) => r.check!),
      ])
    : null;
  const checks = [
    { id: 'document', label: 'Document Capture & Recognition', outcome: outcomeOf(doc?.ok, !!doc) },
    { id: 'face-match', label: 'Face Match (1:1)', outcome: outcomeOf(face.match?.matched, !!face.match) },
    { id: 'liveness', label: 'Face Liveness', outcome: outcomeOf(face.liveness?.passed, !!face.liveness) },
    { id: 'phone', label: 'Phone verification', outcome: outcomeOf(contact.phone?.verified, !!contact.phone) },
    { id: 'email', label: 'Email verification', outcome: outcomeOf(contact.email?.verified, !!contact.email) },
    { id: 'aml', label: 'Watchlist screening', outcome: (scr ? (scr.outcome === 'approved' ? 'pass' : 'review') : 'pending') as Outcome },
    { id: 'device-ip', label: 'Device & IP', outcome: deviceOutcome(dev) },
    { id: 'address', label: 'Proof of address', outcome: (addr?.outcome === 'accepted' ? 'pass' : addr?.outcome === 'review' ? 'review' : 'pending') as Outcome },
  ]
    .filter((c) => !runs || runs.has(c.id))
    .map(({ label, outcome }) => ({ label, outcome }));

  const findings = (scr?.findings ?? null) as Any | null;
  // the contact channels this verification actually used: Standard KYC confirms email only, so no empty Phone appears
  const usedPhone = !!(contact.phone || findings?.phone);
  const usedEmail = !!(contact.email || findings?.email);
  // how the watchlist screening landed, so the result can state plainly when the applicant is not associated
  const amlMatches = (amlX?.matches ?? []) as Any[];
  const amlConfirmed = amlMatches.filter((m) => m.status === 'confirmed').length;
  const amlPossible = amlMatches.filter((m) => m.status === 'possible').length;
  const channel = (title: string, icon: string, sections: Any[] | null | undefined) => ({
    title,
    icon,
    sections: (sections ?? []).map((s: Any, i: number) => ({
      label: s.title,
      open: i === 0,
      rows: (s.rows ?? []).map((r: Any) => ({ term: r.label, detail: String(r.value ?? '') })),
    })),
  });

  return {
    id: meta.id,
    reference: meta.reference,
    applicant: (idn.name as string) || (redacted ? '[redacted]' : 'New applicant'),
    verdict,
    backLabel: 'All verifications',
    backHref: '/verifications',
    downloadLabel: 'Download report',
    emptyLabel: redacted ? 'This verification was redacted: its personal data has been destroyed.' : 'This check did not run for this verification.',
    status: meta.status,
    progress: progressOf(meta, policy?.checks ?? null, tl),
    // the tabs this verification has: its workflow's checks, and any a rule added while it ran (null: every tab)
    tabs: tabsFor(policy?.checks ?? null, meta.steps ?? {}),
    seal: {
      // recomputed from the record every time, so the dial, its breakdown and the verdict rules always agree
      score: redacted ? meta.score ?? 0 : trust.score,
      label: 'Trust Seal',
      provisional: meta.status !== 'completed',
      ...(redacted
        ? {}
        : {
            breakdown: trust.parts.map((p) => ({ label: p.label, weight: p.weight, score: p.score, points: p.points, notes: p.notes, ...(p.knockout ? { knockout: p.knockout } : {}) })),
            policy: trust.policy,
            raw: trust.raw,
            rule: trust.rule,
            knockouts: trust.knockouts,
            missing: trust.missing,
            reviews: trust.reviews,
            internalChecks: trust.internalChecks,
          }),
      // only the badges this verification's workflow runs (so a document-only check does not advertise Face,
      // Phone, Address and AML it never does); a session without a workflow (checks null) keeps all of them
      badges: BADGES.filter((b) => !policy?.checks || b.needs.some((c) => (policy.checks as readonly string[]).includes(c))).map((b) => ({
        label: b.label,
        on: b.on({ doc, face, contact, addr, scr }),
      })),
    },
    overview: {
      factsTitle: 'Key facts',
      facts: [
        { term: 'Reference', detail: meta.reference, mono: true },
        // the workflow and version this verification runs (pinned when it was created)
        { term: 'Workflow', detail: policy?.label ?? 'Standard KYC' },
        { term: 'Status', detail: meta.status === 'in_progress' ? 'In progress' : meta.status === 'completed' ? 'Completed' : 'Redacted' },
        { term: 'Score', detail: meta.score != null ? String(meta.score) : 'Not scored yet' },
        { term: 'Document', detail: docName },
        { term: 'Country', detail: meta.country ?? '' },
        { term: 'Started', detail: when(meta.created_at) },
        ...(meta.completed_at ? [{ term: 'Completed', detail: when(meta.completed_at) }] : []),
      ] as Fact[],
      checksTitle: 'Check summary',
      checks,
    },
    document: doc || has('document_front') || docTries.length
      ? {
          // every upload, accepted or refused (a refused one is never the verification's document)
          attempts: docTries,
          crossMatch: crossMatchView(doc),
          accepted: !!doc || has('document_front'),
          captures: [
            slot('document_front', meta.document_type === 'passport' || doc?.sides === 1 ? 'Document' : 'Document front'),
            ...(has('document_back') || !(meta.document_type === 'passport' || doc?.sides === 1) ? [slot('document_back', 'Document back')] : []),
          ],
          fieldsTitle: 'Extracted fields',
          fields: arr(idn.fields).length
            ? arr(idn.fields).map((x) => ({ term: String(x.term ?? x.key ?? 'Field'), detail: String(x.detail ?? ''), ...(x.mono ? { mono: true } : {}) }))
            : ([
                idn.name && { term: 'Name', detail: idn.name },
                idn.dob && { term: 'Date of birth', detail: idn.dob },
                idn.nationality && { term: 'Nationality', detail: String(idn.nationality).toUpperCase() },
              ].filter(Boolean) as Fact[]),
          metricsTitle: 'Document checks',
          metrics: arr(doc?.checks).length
            ? arr(doc?.checks).map((c) => ({ label: String(c.label), outcome: asOutcome(c.outcome), ...(c.note ? { note: String(c.note) } : {}) }))
            : [{ label: doc?.recognisedAs ? `Recognised as ${doc.recognisedAs}` : 'Recognition', outcome: outcomeOf(doc?.ok, !!doc) }],
          groups: drop(docX.groups, 'Document'),
          // the redesigned tab: whatever the engine read, grouped by field type, with sources and status
          summary: documentSummary(doc, idn, meta),
          // the issuing country, for its flag: whatever form the record holds (alpha-2, alpha-3 or a name)
          country: {
            code: val(idn.documentCountry ?? meta.country ?? (doc?.docClass as Any)?.country) ?? '',
            name: val((doc?.docClass as Any)?.countryName ?? idn.documentCountry ?? meta.country) ?? '',
          },
          ...(has('portrait') ? { portrait: fileUrl('portrait') } : {}),
          fieldGroups: fieldGroups(idn),
          checkGroups: docX.groups
            .filter((g) => g.checks?.length && g.title !== 'Field checks')
            .map((g) => ({ title: g.title, checks: g.checks! })),
          mrz: mrzLines(doc, idn),
        }
      : null,
    face: face.match || face.liveness || has('selfie') || faceTries.length
      ? {
          // every liveness check and face match, passed or failed, with its own selfie
          attempts: faceTries,
          captures: [slot('portrait', 'Document photo'), slot('selfie', 'Selfie')],
          similarity: {
            label: 'Face match similarity',
            value: face.match ? `${Math.round((face.match.similarity ?? 0) * 100)}%` : 'Not run',
            // for the gauge: the raw similarity and the Trust Seal's decline / review lines
            ...(face.match ? { score: Number(face.match.similarity ?? 0), bands: { decline: FACE.decline, review: FACE.review } } : {}),
          },
          liveness: {
            label: 'Liveness verdict',
            detail: face.liveness
              ? `${face.liveness.engine ?? face.liveness.mode ?? ''} check, ${face.liveness.attempts ?? 1} attempt${(face.liveness.attempts ?? 1) === 1 ? '' : 's'}`
              : 'Not run',
            tag: face.liveness ? (face.liveness.passed ? 'Live person' : 'Not confirmed') : 'Not run',
          },
          comparison: faceComparison(face.match),
          spoofTitle: 'Anti-spoof breakdown',
          spoof: [],
          attributes: [
            ...(face.match ? [{ term: 'Match threshold', detail: `${Math.round((face.match.threshold ?? 0.75) * 100)}%` }] : []),
            ...(face.liveness?.mode ? [{ term: 'Liveness mode chosen', detail: face.liveness.mode }] : []),
          ],
          groups: drop(faceX.groups, 'Checks'),
        }
      : null,
    nfc: null,
    aml: scr
      ? {
          notice: !amlX
            ? {
                // screening detail is not available to show (for example a redacted record): claim nothing either way
                title: 'Watchlist screening',
                body: 'The screening result is not available to show for this verification.',
                tag: 'n/a',
              }
            : amlConfirmed > 0
              ? {
                  // a real match: name AND birth date line up with a listed person, so a reviewer confirms it
                  title: 'Possible watchlist match',
                  body: `Screened against sanctions, politically exposed person and crime lists. ${amlConfirmed} ${amlConfirmed === 1 ? 'entry matches' : 'entries match'} on name and birth date and ${amlConfirmed === 1 ? 'needs' : 'need'} a person to confirm.`,
                  tag: 'Match',
                }
              : {
                  // no confirmed match: say plainly the applicant is not associated, noting any name-only namesake
                  title: 'Not associated with any sanctions or PEP list',
                  body:
                    amlPossible > 0
                      ? `Screened against sanctions, politically exposed person and crime lists with no confirmed match. ${amlPossible} ${amlPossible === 1 ? 'namesake shares' : 'namesakes share'} the name only, with nothing to confirm or rule ${amlPossible === 1 ? 'it' : 'them'} out, so ${amlPossible === 1 ? 'it is' : 'they are'} noted for a person to check.`
                      : 'Screened against sanctions, politically exposed person and crime lists with no match.',
                  tag: amlPossible > 0 ? 'Review' : 'Clear',
                },
          screens: [
            { label: 'Sanctions', icon: 'aml' },
            { label: 'PEP', icon: 'face-search' },
            { label: 'Crime & wanted', icon: 'questionnaire' },
            { label: 'Connection', icon: 'device-ip' },
          ],
          ...(amlX ? { groups: drop(amlX.groups, 'What was screened', 'Risk reasons'), matches: amlX.matches } : {}),
        }
      : null,
    deviceIp: devX ? { facts: devX.reasons ? [] : devX.facts, devices: devX.devices } : null,
    // Live records: under the Trust Seal, the open tab's flags and summary.
    side: redacted
      ? undefined
      : {
          flags: {
            overview: [...tryFlags, ...docX.flags, ...faceX.flags, ...(amlX?.flags ?? []), ...deviceFlags(dev), ...otherFlags],
            document: doc || tryFlags.length ? [...tryFlags, ...(doc ? docX.flags : [])] : undefined,
            face: face.match || face.liveness ? faceX.flags : undefined,
            aml: amlX?.flags,
            'device-ip': devX?.flags,
          },
          groups: {
            overview: [{ title: 'Personal data', facts: personalData(idn, meta) }].filter((g) => g.facts.length),
            document: pick(docX.groups, 'Document'),
            face: pick(faceX.groups, 'Checks'),
            aml: amlX ? pick(amlX.groups, 'What was screened', 'Risk reasons') : [],
            'device-ip': devX?.reasons
              ? [
                  { title: 'Device risk', facts: devX.facts },
                  {
                    title: 'What raised the risk score',
                    checks: devX.reasons.map((r) => ({ label: r.label, outcome: (r.points >= 40 ? 'fail' : 'review') as Outcome, note: `+${r.points}` })),
                  },
                ].filter((g) => (g.facts?.length ?? 0) + (g.checks?.length ?? 0) > 0)
              : [],
          },
        },
    contact: findings || contact.phone || contact.email
      ? {
          metrics: findings
            ? [
                ...(usedPhone ? [{ label: 'Phone risk', value: findings.scores?.phoneRisk != null ? `${findings.scores.phoneRisk}/100` : 'n/a' }] : []),
                ...(usedEmail ? [{ label: 'Email risk', value: findings.scores?.emailRisk != null ? `${findings.scores.emailRisk}/100` : 'n/a' }] : []),
                { label: 'Identity score', value: `${findings.scores?.identityScore ?? 0}/100` },
              ]
            : [],
          risk: { label: 'Risk level', value: findings?.riskLevel ?? 'n/a' },
          decision: { label: 'Decision', value: findings?.decision ?? 'n/a' },
          reasonCodes: (findings?.codes ?? []).map((c: Any) => c.code),
          // the same signals in words, coloured by what they mean (the codes are for systems, not people)
          reasons: (findings?.codes ?? []).map((c: Any) => ({ label: String(c.label ?? c.code), tone: ['pass', 'warn', 'fail'].includes(c.tone) ? c.tone : 'na' })),
          channels: [
            ...(usedPhone
              ? [findings?.phone ? channel('Phone', 'phone', findings.phone) : channel('Phone', 'phone', contact.phone ? [{ title: 'Number', rows: [{ label: 'Number', value: contact.phone.e164 }, { label: 'Verified', value: contact.phone.verified ? 'Yes' : 'No' }] }] : [])]
              : []),
            ...(usedEmail
              ? [findings?.email ? channel('Email', 'email', findings.email) : channel('Email', 'email', contact.email ? [{ title: 'Address', rows: [{ label: 'Email', value: contact.email.address }, { label: 'Verified', value: contact.email.verified ? 'Yes' : 'No' }] }] : [])]
              : []),
          ],
          consistency: {
            title: 'Cross-channel consistency',
            pairs: consistencyPairs(findings, d, meta),
          },
          velocity: { title: 'Velocity & duplicates', rows: velocityRows(findings, d) },
          explain: {
            title: 'Explainable decision',
            verdictTag: findings?.decision ?? '',
            riskTag: findings?.riskLevel ? `${findings.riskLevel} risk` : '',
            // an email-only workflow must not read "Phone and email are verified" on a record saved before this fix
            summary: usedPhone
              ? (findings?.explain?.summary ?? '')
              : (findings?.explain?.summary ?? '').replace('Phone and email are verified', usedEmail ? 'The email is verified' : 'The identity details are checked'),
            codes: (findings?.codes ?? []).map((c: Any) => c.label ?? c.code),
          },
        }
      : null,
    address: addr
      ? {
          documentsTitle: 'Documents',
          documents: [slot('address_document', addr.isProofOfAddress === false ? 'Uploaded document' : (addr.document?.type ?? 'Proof of address'))],
          address: {
            label: 'Address',
            value: addr.confirmed
              ? Object.entries(addr.confirmed).filter(([k, v]) => v && k !== 'country').map(([, v]) => v).join(', ')
              : addr.address?.raw ?? '',
          },
          facts: [
            { term: 'Outcome', detail: addr.outcome === 'accepted' ? 'Accepted' : addr.outcome === 'retake' ? 'Rejected' : 'Needs review' },
            ...((addr.checks ?? []) as Any[]).map((c) => ({ term: c.label, detail: c.value })),
            ...((addr.details ?? []) as Any[]).map((c) => ({ term: c.label, detail: c.value })),
            ...((addr.edited ?? []) as string[]).length ? [{ term: 'Edited by applicant', detail: (addr.edited as string[]).join(', ') }] : [],
          ] as Fact[],
          // the redesigned tab: status, the address in parts, what was checked, what was read
          poa: addressEvidence(addr),
        }
      : null,
    timeline: {
      events: [
        ...tl.map((e, i) => ({
          at: when(e.at),
          // the browser shows it in the viewer's own time
          iso: new Date(e.at).toISOString(),
          label: e.label,
          icon: iconOf(e),
          tone: e.tone ?? legacyTone(e),
          ...(tries[i] ? { attempt: tries[i] } : {}),
        })),
        ...(meta.redacted_at
          ? [{ at: when(meta.redacted_at), iso: new Date(meta.redacted_at).toISOString(), label: 'Personal data redacted', icon: 'decision', tone: 'info' }]
          : []),
      ],
    },
    access: access.map((a) => ({ at: when(a.at), actor: a.actor, action: a.action })),
  };
}

/* ------------------------------------------------------------------------ tries -- */

/** What each try came to, in a few words (the tabs' cards and the stepper). */
const TRY_TITLE: Record<Attempt['kind'], Partial<Record<Attempt['outcome'], string>>> = {
  document: { accepted: 'Accepted', refused: 'Not the expected document', retake: 'Photo not clear enough', 'not-accepted': 'Document not accepted' },
  liveness: { passed: 'Live person', failed: 'Liveness not confirmed', error: 'Face check did not finish', cancelled: 'Face check closed early' },
  'face-match': { passed: 'Face matched', failed: 'Face did not match' },
};

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** One try as the console shows it. */
export type Try = {
  n: number;
  kind: Attempt['kind'];
  outcome: Attempt['outcome'];
  ok: boolean;
  title: string;
  at: string;
  iso: string;
  expected?: string[];
  seen?: string;
  seenName?: string;
  country?: string;
  image?: string;
  similarity?: number;
  threshold?: number;
  reason?: string;
  mode?: string;
  /** Document: the details the front and back agreed on, out of how many compared. */
  matched?: string[];
  compared?: number;
  /** Accepted, with a warning (a photo let through despite low quality). */
  warn?: boolean;
};

/** Every try on the timeline (null for other entries), numbered per kind: uploads 1, 2..., face checks 1, 2..., matches 1, 2... */
function triesOf(tl: TimelineEvent[], fileUrl: (slot: string) => string): (Try | null)[] {
  const count: Record<string, number> = {};
  return tl.map((e) => {
    const a = e.attempt;
    if (!a) return null;
    count[a.kind] = (count[a.kind] ?? 0) + 1;
    const warn = e.tone === 'review' && (a.outcome === 'accepted' || a.outcome === 'passed');
    return {
      n: count[a.kind]!,
      kind: a.kind,
      outcome: a.outcome,
      ok: a.outcome === 'accepted' || a.outcome === 'passed',
      ...(warn ? { warn: true } : {}),
      title: warn ? 'Accepted with a warning' : TRY_TITLE[a.kind][a.outcome] ?? e.label,
      at: when(e.at),
      iso: new Date(e.at).toISOString(),
      ...(a.kind === 'document'
        ? { expected: a.expected?.length ? a.expected.map(cap) : ['Any identity document'], seen: a.seen ? cap(a.seen) : 'Not recognised' }
        : {}),
      ...(a.seenName ? { seenName: a.seenName } : {}),
      ...(a.country ? { country: a.country } : {}),
      ...(a.fileId ? { image: fileUrl(`attempt-${a.fileId}`) } : {}),
      ...(typeof a.similarity === 'number' ? { similarity: a.similarity, threshold: a.threshold ?? 0.75 } : {}),
      ...(a.reason ? { reason: a.reason } : {}),
      ...(a.mode ? { mode: a.mode } : {}),
      ...(a.compared ? { matched: a.matched ?? [], compared: a.compared } : {}),
    };
  });
}

/** The front and back check of the document read: each compared detail, and whether its sources agreed. */
function crossMatchView(doc: Any | null) {
  const fields = arr((doc?.crossMatch as Any | undefined)?.fields);
  if (!fields.length) return null;
  return {
    agree: (doc!.crossMatch as Any).agree === true,
    fields: fields.map((f) => ({
      label: String(f.name ?? 'Detail'),
      agree: f.agree === true,
      // "Printed / barcode": where each value came from, in words
      sources: (Array.isArray(f.pairs) ? (f.pairs as unknown[]) : typeof f.pairs === 'string' ? f.pairs.split(',') : []).filter(Boolean).map((p) =>
        String(p)
          .split('/')
          .map((x) => (x === 'VISUAL' ? 'Printed' : x === 'BARCODE' ? 'Barcode' : x === 'MRZ' ? 'MRZ' : x === 'RFID' ? 'Chip' : cap(x.toLowerCase())))
          .join(' and '),
      ),
    })),
  };
}

/** An entry written before entries carried how they went: read from its words. */
function legacyTone(e: TimelineEvent): 'pass' | 'fail' | 'review' | 'info' {
  const l = e.label.toLowerCase();
  if (/refused|not confirmed|did not|failed|declined|retake/.test(l)) return 'fail';
  if (/needs review|\(review\)|disabled/.test(l)) return 'review';
  if (/passed|approved|accepted|verified|confirmed|no concerns|enabled again/.test(l)) return 'pass';
  return 'info';
}

/** The entry's icon, from what happened (older entries filed a phone check as "opened", so the words decide). */
function iconOf(e: TimelineEvent): string {
  const l = e.label.toLowerCase();
  if (e.type === 'relinked') return 'link';
  if (e.type === 'disabled' || e.type === 'enabled') return e.type;
  if (e.type === 'device') return 'device';
  if (l.startsWith('phone')) return 'phone';
  if (l.startsWith('email')) return 'email';
  if (l.startsWith('screening')) return 'screening';
  if (l.includes('address')) return 'address';
  if (e.type === 'selfie' && e.attempt?.kind === 'face-match') return 'match';
  return ['created', 'opened', 'document', 'selfie', 'nfc', 'decision'].includes(e.type) ? e.type : 'decision';
}

/* ------------------------------------------------------------------ applicant outcome -- */

export type ApplicantCheckOutcome = 'pass' | 'fail' | 'review' | 'pending' | 'done';
export type ApplicantOutcome = {
  verdict: 'Verified' | 'Needs review' | 'Declined' | 'In progress';
  reference: string;
  /** Only this verification's own checks, in flow order, each with its real result. */
  checks: { id: string; label: string; outcome: ApplicantCheckOutcome }[];
  /** Plain reasons the applicant may see (their own data only; screening results are never shown). */
  reasons: string[];
};

/** The minimum age a workflow asks for, and whether the person's document date of birth meets it (null: unread). */
export function ageVerdict(d: RecordSections, policy: ScorePolicy | null): { minimumAge: number; meets: boolean | null } | null {
  if (policy?.minimumAge == null) return null;
  const age = ageOf((d.identity as Any | undefined)?.dob);
  return { minimumAge: policy.minimumAge, meets: age === null ? null : age >= policy.minimumAge };
}

/**
 * What the applicant's own result screen shows: the server's decision and ONLY the checks this verification's
 * workflow runs (plus any a rule added while it ran), each with what really happened. Never the score, never a
 * watchlist result (that is never told to the person screened).
 */
export function applicantOutcome(d: RecordSections, policy: ScorePolicy | null, verdict: string | null, reference: string): ApplicantOutcome {
  const runs = (id: string, present: boolean) => !policy?.checks || (policy.checks as readonly string[]).includes(id) || present;
  const doc = d.document as Any | undefined;
  const face = (d.face ?? {}) as Any;
  const contact = (d.contact ?? {}) as Any;
  const addr = d.address as Any | undefined;
  const scr = d.screening as Any | undefined;
  const ran = (present: boolean, ok: boolean): ApplicantCheckOutcome => (!present ? 'pending' : ok ? 'pass' : 'fail');
  const checks: ApplicantOutcome['checks'] = [];
  const reasons: string[] = [];
  if (runs('document', !!doc)) checks.push({ id: 'document', label: 'Identity document', outcome: ran(!!doc, !!doc?.ok) });
  const age = ageVerdict(d, policy);
  if (age) {
    checks.push({ id: 'age', label: `Age ${age.minimumAge} or older`, outcome: age.meets === null ? 'pending' : age.meets ? 'pass' : 'fail' });
    if (age.meets === false) reasons.push(`You need to be ${age.minimumAge} or older for this verification, and the date of birth on your document shows you are under ${age.minimumAge}.`);
  }
  if (runs('face-match', !!face.match)) checks.push({ id: 'face-match', label: 'Your face matches your document', outcome: ran(!!face.match, !!face.match?.matched) });
  if (runs('liveness', !!face.liveness)) checks.push({ id: 'liveness', label: 'Live person check', outcome: ran(!!face.liveness, !!face.liveness?.passed) });
  if (runs('phone', !!contact.phone)) checks.push({ id: 'phone', label: 'Phone number', outcome: ran(!!contact.phone, !!contact.phone?.verified) });
  if (runs('email', !!contact.email)) checks.push({ id: 'email', label: 'Email address', outcome: ran(!!contact.email, !!contact.email?.verified) });
  if (runs('aml', !!scr)) checks.push({ id: 'aml', label: 'Screening', outcome: scr ? 'done' : 'pending' });
  if (runs('address', !!addr))
    checks.push({
      id: 'address',
      label: 'Proof of address',
      outcome: !addr ? 'pending' : addr.outcome === 'accepted' ? 'pass' : addr.outcome === 'review' ? 'review' : 'fail',
    });
  const v = verdict === 'Approved' ? 'Verified' : verdict === 'Needs review' || verdict === 'Declined' ? verdict : 'In progress';
  return { verdict: v, reference, checks, reasons };
}
