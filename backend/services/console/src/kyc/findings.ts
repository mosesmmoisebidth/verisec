import type { EmailCheck } from './email-check';
import type { RiskResult } from './risk';

/**
 * The applicant-facing "Here's What We Found" report.
 *
 * Built only from real results; anything we do not measure says "Not checked"
 * rather than inventing a clean value. Watchlist and PEP outcomes are NEVER
 * included (AML tipping-off): they only surface as a neutral "manual review".
 */

export type Tone = 'pass' | 'warn' | 'fail' | 'na';

export interface FindingRow {
  label: string;
  value: string;
  tone?: Tone;
}
export interface FindingSection {
  title: string;
  tone: Tone;
  rows: FindingRow[];
}
export interface Findings {
  scores: { phoneRisk: number | null; emailRisk: number | null; identityScore: number };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  decision: 'PASS' | 'REVIEW';
  /** `code` for systems, `label` for people. */
  codes: { code: string; label: string; tone: Tone }[];
  /** Risk screening summary for the explainer column. Watchlist rows move
   *  together (all clear, or all pending review) so no single list is revealed. */
  screening: FindingRow[];
  phone: FindingSection[] | null;
  email: FindingSection[] | null;
  /** Each pair carries the two values compared (null when one side was not available). */
  consistency: { left: string; right: string; tone: Tone; leftIcon: string; rightIcon: string; leftValue?: string | null; rightValue?: string | null }[];
  velocity: FindingRow[];
  explain: { summary: string };
}

export interface OtpMeta {
  sends: number;
  attempts: number;
  failed: number;
  verifiedAt?: number;
}

export interface FindingsInput {
  risk: RiskResult;
  subject: { name?: string; documentCountry?: string; nationality?: string };
  declaredCountry?: string;
  phone: null | {
    verified: boolean;
    testMode: boolean;
    meta?: OtpMeta;
    valid?: boolean;
    country?: string | null;
    lineType?: string | null;
    carrier?: string | null;
    status?: string | null;
    network?: string | null;
    reputation?: { score: number | null; carrierRisk: string | null; blocked: boolean; blockedRecently: boolean } | null;
    lookup?: Record<string, { code: number | null; data: Record<string, unknown> }>;
  };
  email: null | { verified: boolean; meta?: OtpMeta; check?: EmailCheck | null };
  ip: { ran: boolean; country?: string | null; tor?: boolean; proxy?: boolean; abuseScore?: number | null };
  velocity: {
    phoneAccounts: number | null;
    emailAccounts: number | null;
    deviceAccounts: number | null;
    otpRetriesHour: number;
    ipSessions24h: number;
  };
}

/** Reasons the applicant must never see. */
const HIDDEN = new Set(['watchlist_confirmed', 'watchlist_possible', 'watchlist_former', 'pep_confirmed', 'pep_possible', 'screening_unavailable']);

const up = (c?: string | null) => (c ?? '').trim().toUpperCase().slice(0, 2);
const LINE: Record<string, string> = {
  mobile: 'Mobile',
  landline: 'Landline',
  fixedVoip: 'Fixed VoIP',
  nonFixedVoip: 'Virtual (VoIP)',
  personal: 'Personal',
  tollFree: 'Toll-free',
  premium: 'Premium',
  sharedCost: 'Shared cost',
  voicemail: 'Voicemail',
  pager: 'Pager',
};
const LABEL: Record<string, string> = {
  PHONE_OTP_VERIFIED: 'Phone verified',
  PHONE_NOT_VERIFIED: 'Phone not verified',
  MOBILE_LINE: 'Mobile line',
  VOIP_NUMBER: 'Virtual (VoIP) number',
  PHONE_BLOCKED: 'Number blocked',
  PHONE_FRAUD_SCORE: 'High phone fraud score',
  EMAIL_OTP_VERIFIED: 'Email verified',
  EMAIL_NOT_VERIFIED: 'Email not verified',
  EMAIL_DELIVERABLE: 'Email deliverable',
  DISPOSABLE_EMAIL: 'Temporary email',
  TOR_NETWORK: 'Tor network',
  VPN_OR_PROXY: 'VPN or proxy',
  IP_ABUSE_REPORTED: 'Connection abuse reported',
  CONTACT_REUSED: 'Contact used by another applicant',
  DEVICE_REUSED: 'Device used by another applicant',
  FACE_MISMATCH: 'Face did not match',
  LIVENESS_RETRIES: 'Several liveness attempts',
  DOC_QUALITY_RETRIES: 'Document photo retries',
  COUNTRY_MISMATCH: 'Country mismatch',
  IDENTITY_CONSISTENT: 'Details consistent',
  MANUAL_REVIEW: 'Manual review',
};

function pair(a: string | null | undefined, b: string | null | undefined): Tone {
  if (!a || !b) return 'na';
  return up(a) === up(b) ? 'pass' : 'warn';
}

function when(ts?: number): string {
  if (!ts) return 'Not yet';
  // ISO; the browser renders it in the viewer's local time.
  return new Date(ts).toISOString();
}

/** Does the email's local part carry a piece of the document name? */
function emailNameTone(email: string | undefined, name: string | undefined): Tone {
  if (!email || !name) return 'na';
  const local = email.split('@')[0]!.toLowerCase().replace(/[^a-z]/g, '');
  const parts = name.toLowerCase().normalize('NFD').replace(/[^a-z\s]/g, '').split(/\s+/).filter((p) => p.length >= 3);
  if (!local || !parts.length) return 'na';
  return parts.some((p) => local.includes(p)) ? 'pass' : 'na';
}

export function buildFindings(i: FindingsInput): Findings {
  const visible = i.risk.reasons.filter((r) => !HIDDEN.has(r.code));
  const hiddenReview = i.risk.outcome === 'review' && i.risk.reasons.some((r) => HIDDEN.has(r.code));
  const sum = (pred: (c: string) => boolean) =>
    Math.min(100, visible.filter((r) => pred(r.code)).reduce((s, r) => s + r.points, 0));

  const visibleScore = Math.min(100, visible.reduce((s, r) => s + r.points, 0));
  const identityScore = Math.max(0, 100 - visibleScore);
  let riskLevel: Findings['riskLevel'] = visibleScore >= 50 ? 'HIGH' : visibleScore >= 25 ? 'MEDIUM' : 'LOW';
  if (i.risk.outcome === 'review' && riskLevel === 'LOW') riskLevel = 'MEDIUM';
  const decision: Findings['decision'] = i.risk.outcome === 'approved' ? 'PASS' : 'REVIEW';

  const docC = i.subject.documentCountry || i.subject.nationality;
  const has = (code: string) => visible.some((r) => r.code === code);

  /* ---- reason-code badges -------------------------------------------------- */
  const codes: Findings['codes'] = [];
  const push = (code: string, tone: Tone) => codes.push({ code, label: LABEL[code] ?? code, tone });
  if (i.phone) i.phone.verified ? push('PHONE_OTP_VERIFIED', 'pass') : push('PHONE_NOT_VERIFIED', 'warn');
  if (i.phone?.lineType === 'mobile') push('MOBILE_LINE', 'pass');
  if (has('phone_voip') || has('phone_fixed_voip')) push('VOIP_NUMBER', 'warn');
  if (i.email) i.email.verified ? push('EMAIL_OTP_VERIFIED', 'pass') : push('EMAIL_NOT_VERIFIED', 'warn');
  if (i.email?.check?.hasMailServer && !i.email.check.disposable) push('EMAIL_DELIVERABLE', 'pass');
  if (has('email_disposable')) push('DISPOSABLE_EMAIL', 'fail');
  if (has('ip_tor')) push('TOR_NETWORK', 'warn');
  if (has('ip_proxy')) push('VPN_OR_PROXY', 'warn');
  if (has('ip_abuse_high') || has('ip_abuse')) push('IP_ABUSE_REPORTED', has('ip_abuse_high') ? 'fail' : 'warn');
  if (has('contact_reused')) push('CONTACT_REUSED', 'fail');
  if (has('device_reused')) push('DEVICE_REUSED', 'fail');
  if (has('phone_blocked')) push('PHONE_BLOCKED', 'fail');
  if (has('phone_fraud_score')) push('PHONE_FRAUD_SCORE', 'warn');
  if (has('face_mismatch')) push('FACE_MISMATCH', 'fail');
  if (has('liveness_retries')) push('LIVENESS_RETRIES', 'warn');
  if (has('doc_quality_override')) push('DOC_QUALITY_RETRIES', 'warn');
  const mismatch = has('phone_country_mismatch') || has('ip_country_mismatch');
  if (mismatch) push('COUNTRY_MISMATCH', 'warn');
  else if (docC && (i.phone?.country || i.ip.country)) push('IDENTITY_CONSISTENT', 'pass');
  if (hiddenReview) push('MANUAL_REVIEW', 'warn');

  /* ---- phone card ----------------------------------------------------------- */
  // Twilio Lookup reasons, per Twilio's error reference.
  const why = (code: number | null | undefined): string =>
    code === 60600
      ? 'Not available for this number'
      : code === 60607
        ? 'Not supported in this country'
        : code === 60617
          ? 'Needs more details to run'
          : 'Unavailable';
  const pkg = (k: string) => i.phone?.lookup?.[k];
  const yesNo = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : 'Unknown');
  const matchWord: Record<string, string> = {
    exact_match: 'Exact match',
    high_partial_match: 'Close match',
    partial_match: 'Partial match',
    no_match: 'No match',
    no_data_available: 'No carrier data',
  };

  let phone: FindingSection[] | null = null;
  if (i.phone) {
    const p = i.phone;
    const lt = p.lineType ?? '';
    const lineStatus = pkg('line_status');
    const caller = pkg('caller_name');
    const fwd = pkg('call_forwarding');
    const sim = pkg('sim_swap');
    const swap = (sim?.data?.last_sim_swap ?? null) as { swapped_in_period?: boolean; last_sim_swap_date?: string } | null;
    const idm = pkg('identity_match');
    const rep = p.reputation;
    const repTone: Tone = !rep ? 'na' : rep.blocked || (rep.score ?? 0) >= 80 ? 'fail' : (rep.score ?? 0) >= 50 ? 'warn' : 'pass';
    const fwdRow: FindingRow = {
      label: 'Call forwarding',
      value: fwd && !fwd.code ? yesNo(fwd.data.call_forwarding_enabled) : why(fwd?.code),
      tone: fwd && !fwd.code ? (fwd.data.call_forwarding_enabled ? 'warn' : undefined) : 'na',
    };

    phone = [
      {
        title: 'OTP status',
        tone: p.verified ? 'pass' : 'warn',
        rows: [
          { label: 'Result', value: p.verified ? 'Verified' : 'Not verified', tone: p.verified ? 'pass' : 'warn' },
          { label: 'Method', value: p.testMode ? 'SMS (test mode)' : 'SMS' },
          { label: 'Timestamp', value: when(p.meta?.verifiedAt) },
          { label: 'Attempts', value: String(p.meta?.attempts ?? 0) },
        ],
      },
      {
        title: 'Number validity',
        tone: p.valid === false ? 'fail' : 'pass',
        rows: [
          { label: 'Valid', value: p.valid === false ? 'No' : 'Yes', tone: p.valid === false ? 'fail' : 'pass' },
          { label: 'Country', value: up(p.country) || 'Unknown' },
          { label: 'Format', value: 'E.164' },
        ],
      },
      {
        title: 'Line intelligence',
        tone: lt === 'nonFixedVoip' || lt === 'fixedVoip' ? 'warn' : lt ? 'pass' : 'na',
        rows: [
          { label: 'Line type', value: LINE[lt] ?? (lt || 'Unknown'), tone: lt === 'mobile' ? 'pass' : lt.includes('Voip') ? 'warn' : undefined },
          { label: 'Carrier', value: p.carrier || 'Unknown' },
          ...(p.network ? [{ label: 'Network code', value: p.network }] : []),
          {
            label: 'Line status',
            value:
              lineStatus && !lineStatus.code && lineStatus.data.status
                ? String(lineStatus.data.status).replace(/^./, (c) => c.toUpperCase())
                : why(lineStatus?.code),
            tone: lineStatus && !lineStatus.code ? (lineStatus.data.status === 'active' ? 'pass' : 'warn') : 'na',
          },
          {
            label: 'Caller name',
            value: caller && !caller.code ? String(caller.data.caller_name ?? 'Not listed') : why(caller?.code),
            tone: caller && !caller.code ? undefined : 'na',
          },
        ],
      },
      {
        title: 'SIM risk',
        tone: sim && !sim.code ? (swap?.swapped_in_period ? 'warn' : 'pass') : 'na',
        rows:
          sim && !sim.code
            ? [
                { label: 'Recent SIM swap', value: yesNo(swap?.swapped_in_period), tone: swap?.swapped_in_period ? 'warn' : 'pass' },
                ...(swap?.last_sim_swap_date ? [{ label: 'Last swap', value: String(swap.last_sim_swap_date) }] : []),
                fwdRow,
              ]
            : [{ label: 'SIM swap', value: why(sim?.code), tone: 'na' }, fwdRow],
      },
      {
        title: 'Reputation',
        tone: repTone,
        rows: rep
          ? [
              { label: 'Fraud score', value: rep.score == null ? 'Unknown' : `${rep.score}/100`, tone: repTone === 'pass' ? undefined : repTone },
              { label: 'Carrier risk', value: rep.carrierRisk ? rep.carrierRisk.replace(/^./, (c) => c.toUpperCase()) : 'Unknown' },
              { label: 'Blocked now', value: rep.blocked ? 'Yes' : 'No', tone: rep.blocked ? 'fail' : undefined },
              { label: 'Blocked in 3 months', value: rep.blockedRecently ? 'Yes' : 'No', tone: rep.blockedRecently ? 'warn' : undefined },
            ]
          : [{ label: 'Fraud score', value: why(pkg('sms_pumping_risk')?.code), tone: 'na' }],
      },
      {
        title: 'Identity match',
        tone:
          idm && !idm.code
            ? ['exact_match', 'high_partial_match'].includes(String(idm.data.first_name_match))
              ? 'pass'
              : 'warn'
            : pair(p.country, docC),
        rows: [
          {
            label: 'Phone country',
            value:
              pair(p.country, docC) === 'pass'
                ? 'Matches document'
                : pair(p.country, docC) === 'warn'
                  ? `${up(p.country)} vs ${up(docC)}`
                  : 'Not available',
            tone: pair(p.country, docC),
          },
          ...(idm && !idm.code
            ? [
                { label: 'Name on carrier', value: matchWord[String(idm.data.first_name_match)] ?? 'Unknown' },
                { label: 'Birth date', value: matchWord[String(idm.data.date_of_birth_match)] ?? 'Unknown' },
                ...(typeof idm.data.summary_score === 'number' ? [{ label: 'Match score', value: `${idm.data.summary_score}/100` }] : []),
              ]
            : [{ label: 'Carrier records', value: why(idm?.code), tone: 'na' as Tone }]),
        ],
      },
    ];
  }

  /* ---- email card ----------------------------------------------------------- */
  let email: FindingSection[] | null = null;
  if (i.email) {
    const e = i.email;
    const c = e.check;
    const type = !c ? 'Unknown' : c.disposable ? 'Temporary' : c.freeProvider ? 'Free provider' : 'Work or custom';
    const nameTone = emailNameTone(c?.email, i.subject.name);
    email = [
      {
        title: 'OTP status',
        tone: e.verified ? 'pass' : 'warn',
        rows: [
          { label: 'Result', value: e.verified ? 'Verified' : 'Not verified', tone: e.verified ? 'pass' : 'warn' },
          { label: 'Timestamp', value: when(e.meta?.verifiedAt) },
          { label: 'Attempts', value: String(e.meta?.attempts ?? 0) },
        ],
      },
      {
        title: 'Deliverability',
        tone: c?.hasMailServer ? 'pass' : 'warn',
        rows: [
          { label: 'Mail server', value: c?.hasMailServer ? 'Found' : 'Not found', tone: c?.hasMailServer ? 'pass' : 'fail' },
          {
            label: 'Mailbox',
            value: c?.mailbox === 'exists' ? 'Confirmed' : c?.mailbox === 'catch_all' ? 'Accepts all' : e.verified ? 'Confirmed by code' : 'Unconfirmed',
            tone: c?.mailbox === 'exists' || e.verified ? 'pass' : 'na',
          },
        ],
      },
      { title: 'Email type', tone: c?.disposable ? 'fail' : 'pass', rows: [{ label: 'Type', value: type, tone: c?.disposable ? 'fail' : undefined }] },
      {
        title: 'Identity match',
        tone: nameTone,
        rows: [{ label: 'Name in address', value: nameTone === 'pass' ? 'Yes' : 'No (common)', tone: nameTone }],
      },
    ];
  }

  /* ---- risk screening (explainer column) ----------------------------------- */
  const sancCheck = i.risk.checks.find((c) => c.name.startsWith('Sanctions'));
  const listHit = i.risk.reasons.some((r) => ['watchlist_confirmed', 'watchlist_possible', 'pep_confirmed'].includes(r.code));
  const listState: FindingRow =
    !sancCheck || sancCheck.status === 'skipped'
      ? { label: '', value: 'Not run', tone: 'na' }
      : i.risk.reasons.some((r) => r.code === 'screening_unavailable')
        ? { label: '', value: 'Unavailable', tone: 'warn' }
        : listHit
          ? { label: '', value: 'Pending review', tone: 'warn' }
          : { label: '', value: 'Clear', tone: 'pass' };
  const conn: FindingRow = !i.ip.ran
    ? { label: 'Connection', value: 'Local network', tone: 'na' }
    : i.ip.tor
      ? { label: 'Connection', value: `${up(i.ip.country)}, Tor`, tone: 'warn' }
      : i.ip.proxy
        ? { label: 'Connection', value: `${up(i.ip.country)}, VPN or proxy`, tone: 'warn' }
        : { label: 'Connection', value: `${up(i.ip.country) || 'Known'}, direct`, tone: 'pass' };
  const repScore = i.phone?.reputation?.score;
  const abuse = i.ip.abuseScore;
  const screening: FindingRow[] = [
    { ...listState, label: 'Sanctions lists' },
    { ...listState, label: 'Politically exposed' },
    { ...listState, label: 'Crime & wanted lists' },
    conn,
    ...(i.ip.ran && typeof abuse === 'number'
      ? [{ label: 'Connection abuse', value: `${abuse}/100`, tone: (abuse >= 75 ? 'fail' : abuse >= 25 ? 'warn' : 'pass') as Tone }]
      : []),
    ...(typeof repScore === 'number'
      ? [{ label: 'Phone fraud score', value: `${repScore}/100`, tone: (repScore >= 80 ? 'fail' : repScore >= 50 ? 'warn' : 'pass') as Tone }]
      : []),
  ];

  /* ---- cross-channel consistency ----------------------------------------------- */
  const tld = (i.email?.check?.email ?? '').split('.').pop() ?? '';
  const emailCountry = tld.length === 2 ? tld : null;
  // each pair keeps the two values it compared, so a reviewer sees what matched, not only that it did
  const val = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : null);
  const ipC = i.ip.ran ? val(up(i.ip.country)) : null;
  const consistency: Findings['consistency'] = [
    { left: 'Document', right: 'Phone country', tone: pair(docC, i.phone?.country), leftIcon: 'doc', rightIcon: 'phone', leftValue: val(up(docC)), rightValue: val(up(i.phone?.country)) },
    { left: 'Document', right: 'Email name', tone: emailNameTone(i.email?.check?.email, i.subject.name), leftIcon: 'doc', rightIcon: 'mail', leftValue: val(i.subject.name), rightValue: val(i.email?.check?.email) },
    { left: 'Phone', right: 'IP country', tone: i.ip.ran ? pair(i.phone?.country, i.ip.country) : 'na', leftIcon: 'phone', rightIcon: 'globe', leftValue: val(up(i.phone?.country)), rightValue: ipC },
    { left: 'Declared', right: 'Doc country', tone: pair(i.declaredCountry, i.subject.documentCountry), leftIcon: 'user', rightIcon: 'doc', leftValue: val(up(i.declaredCountry)), rightValue: val(up(i.subject.documentCountry)) },
    { left: 'Email', right: 'IP region', tone: i.ip.ran && emailCountry ? pair(emailCountry, i.ip.country) : 'na', leftIcon: 'mail', rightIcon: 'globe', leftValue: tld ? `.${tld.toLowerCase()}` : null, rightValue: ipC },
  ];

  /* ---- velocity & duplicates ------------------------------------------------ */
  const v = i.velocity;
  const count = (n: number | null, warnAt: number): FindingRow['tone'] => (n == null ? 'na' : n >= warnAt ? 'warn' : undefined);
  const velocity: FindingRow[] = [
    { label: 'Same phone across accounts', value: v.phoneAccounts == null ? 'Not checked' : String(v.phoneAccounts), tone: count(v.phoneAccounts, 2) },
    { label: 'Same email across accounts', value: v.emailAccounts == null ? 'Not checked' : String(v.emailAccounts), tone: count(v.emailAccounts, 2) },
    ...(v.deviceAccounts == null ? [] : [{ label: 'Same device across accounts', value: String(v.deviceAccounts), tone: count(v.deviceAccounts, 2) }]),
    { label: 'OTP retries in last hour', value: String(v.otpRetriesHour), tone: v.otpRetriesHour >= 3 ? 'warn' : undefined },
    { label: 'Sessions from this IP (24h)', value: String(v.ipSessions24h), tone: v.ipSessions24h >= 5 ? 'warn' : undefined },
  ];

  /* ---- plain-language decision ------------------------------------------------- */
  const flagged = codes.filter((c) => c.tone === 'warn' || c.tone === 'fail').map((c) => c.label.toLowerCase());
  // name only the contact channels this verification actually used, so an email-only workflow does not claim a phone
  const checkedContact = [i.phone ? 'phone' : null, i.email ? 'email' : null].filter(Boolean) as string[];
  const verifiedText =
    checkedContact.length === 2
      ? 'Phone and email are verified'
      : checkedContact.length === 1
        ? `The ${checkedContact[0]} is verified`
        : 'The identity details are checked';
  const summary =
    decision === 'PASS'
      ? flagged.length
        ? `Approved. Minor signals noted (${flagged.join(', ')}), none serious enough to hold the verification.`
        : `Approved. ${verifiedText} and no duplicate, connection or consistency concerns were detected.`
      : 'Held for a quick manual review before approval. No action is needed from you.';

  return {
    scores: {
      phoneRisk: i.phone ? sum((c) => c.startsWith('phone_')) : null,
      emailRisk: i.email ? sum((c) => c.startsWith('email_')) : null,
      identityScore,
    },
    riskLevel,
    decision,
    codes,
    screening,
    phone,
    email,
    consistency,
    velocity,
    explain: { summary },
  };
}
