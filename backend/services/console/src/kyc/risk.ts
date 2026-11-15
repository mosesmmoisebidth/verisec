/**
 * KYC risk scoring for the contact + screening stage.
 *
 * Principles:
 *   - No single weak signal rejects anyone. Weak signals add points; only hard
 *     hits (a confirmed sanctions/crime match) or a high total go to review.
 *   - Watchlist hits are confirmed by BIRTH DATE, never by name alone. A hit
 *     whose list entry has no birth date is only "possible", for a human.
 *   - A PEP is not wrongdoing. It triggers enhanced due diligence (review),
 *     not a decline.
 *   - Every point carries a plain reason a reviewer can act on. None of this is
 *     shown to the applicant (AML "tipping off" rules forbid telling someone
 *     they matched a watchlist).
 */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface RiskReason {
  code: string;
  severity: Severity;
  points: number;
  message: string;
}

export interface RiskCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  detail: string;
}

export interface WatchlistHit {
  id?: string;
  caption: string;
  score: number;
  topics: string[];
  datasets: string[];
  birthDates: string[];
  nationalities: string[];
  countries: string[];
  /** On the formerly-listed history only (removed from every list): a note for the reviewer, never a hit. */
  formerly?: boolean;
}

export interface RiskInput {
  subject: { name?: string; dob?: string; nationality?: string; documentCountry?: string };
  sanctions: { ran: boolean; error?: boolean; hits: WatchlistHit[] };
  phone: {
    provided: boolean;
    verified: boolean;
    lineType?: string | null;
    country?: string | null;
    /** Twilio SMS-pumping fraud score 0-100 and whether the number is blocked now. */
    smsRiskScore?: number | null;
    blocked?: boolean;
  };
  email: {
    provided: boolean;
    verified: boolean;
    disposable?: boolean;
    mailbox?: string;
  };
  ip: {
    ran: boolean;
    country?: string | null;
    tor?: boolean;
    proxy?: boolean;
    hosting?: boolean;
    abuseScore?: number | null;
  };
  reuse: { contactUsedByAnother: boolean; deviceUsedByAnother?: boolean };
  session: {
    livenessAttempts?: number;
    faceMatched?: boolean | null;
    documentQualityOverride?: boolean;
  };
}

export interface RiskResult {
  score: number;
  level: 'low' | 'medium' | 'high';
  outcome: 'approved' | 'review';
  hardHit: boolean;
  reasons: RiskReason[];
  checks: RiskCheck[];
  watchlist: { confirmed: WatchlistHit[]; possible: WatchlistHit[] };
}

const MATCH_SCORE = 0.85;
const has = (topics: string[], ...prefixes: string[]) =>
  topics.some((t) => prefixes.some((p) => t === p || t.startsWith(p + '.')));
const isSanctionOrCrime = (h: WatchlistHit) => has(h.topics, 'sanction', 'crime', 'wanted', 'debarment');
const isPep = (h: WatchlistHit) => has(h.topics, 'role.pep', 'role.pol', 'role.rca', 'role.oligarch');
const cc = (c?: string | null) => (c ?? '').trim().toLowerCase().slice(0, 2);

/** Birth dates may be "1952", "1952-10" or "1952-10-07"; compare by prefix. */
function dobMatches(applicant: string | undefined, listed: string[]): boolean {
  if (!applicant) return false;
  const a = applicant.trim();
  return listed.some((l) => a.startsWith(l) || l.startsWith(a));
}

export function computeRisk(input: RiskInput): RiskResult {
  const reasons: RiskReason[] = [];
  const checks: RiskCheck[] = [];
  const add = (code: string, severity: Severity, points: number, message: string) =>
    reasons.push({ code, severity, points, message });

  /* ---- watchlists (sanctions, crime, PEP) ------------------------------- */
  const confirmed: WatchlistHit[] = [];
  const possible: WatchlistHit[] = [];
  const former: WatchlistHit[] = [];
  const nat = cc(input.subject.nationality) || cc(input.subject.documentCountry);
  for (const h of input.sanctions.hits) {
    if (h.score < MATCH_SCORE) continue;
    if (h.formerly) {
      // the same birth date (or none to compare): worth a note, never a hit
      if (!h.birthDates.length || !input.subject.dob?.trim() || dobMatches(input.subject.dob, h.birthDates)) former.push(h);
      continue;
    }
    if (h.birthDates.length && input.subject.dob?.trim()) {
      if (dobMatches(input.subject.dob, h.birthDates)) confirmed.push(h);
      // A listed birth date that differs means a namesake: dropped.
      continue;
    }
    // Here either the list or the applicant has no birth date, so nothing can confirm or
    // rule the name out by date: it stays possible (for a human), unless nationality contradicts.
    const listedCountries = [...h.nationalities, ...h.countries].map(cc);
    // No birth date on the list. A contradicting nationality rules it out.
    if (nat && listedCountries.length && !listedCountries.includes(nat)) continue;
    possible.push(h);
  }

  let hardHit = false;
  let needsReview = false;
  if (!input.sanctions.ran) {
    checks.push({ name: 'Sanctions & PEP screening', status: 'skipped', detail: 'No name available from the document.' });
  } else if (input.sanctions.error) {
    checks.push({ name: 'Sanctions & PEP screening', status: 'warn', detail: 'Screening service unavailable, retry required.' });
    add('screening_unavailable', 'medium', 30, 'Watchlist screening could not run; screen again before approving.');
    needsReview = true;
  } else {
    const confSanction = confirmed.filter(isSanctionOrCrime);
    const confPep = confirmed.filter((h) => isPep(h) && !isSanctionOrCrime(h));
    const possSanction = possible.filter(isSanctionOrCrime);
    const possPep = possible.filter((h) => isPep(h) && !isSanctionOrCrime(h));
    if (confSanction.length) {
      hardHit = true;
      add('watchlist_confirmed', 'critical', 100, `Confirmed match (name and birth date) on a sanctions or crime list: ${confSanction[0]!.caption}.`);
    }
    if (confPep.length) {
      needsReview = true;
      add('pep_confirmed', 'high', 40, `Politically exposed person, confirmed by birth date: ${confPep[0]!.caption}. Enhanced due diligence required.`);
    }
    if (possSanction.length) {
      needsReview = true;
      add('watchlist_possible', 'high', 50, `Possible sanctions or crime list match by name (${possSanction[0]!.caption}); the list has no birth date to confirm or rule it out.`);
    }
    if (possPep.length) {
      add('pep_possible', 'low', 5, `Name resembles ${possPep.length} politically exposed person record(s) with no birth date listed. Likely a namesake.`);
    }
    if (former.length) {
      add('watchlist_former', 'info', 0, `Formerly listed and since removed: ${former[0]!.caption}. Not a current listing; noted for the reviewer.`);
    }
    checks.push({
      name: 'Sanctions & PEP screening',
      status: confSanction.length ? 'fail' : confPep.length || possSanction.length ? 'warn' : 'pass',
      detail: confirmed.length || possible.length
        ? `${confirmed.length} confirmed, ${possible.length} possible match(es).`
        : 'No match on sanctions, crime or PEP lists.',
    });
  }

  /* ---- phone -------------------------------------------------------------- */
  const docCountry = cc(input.subject.documentCountry) || nat;
  if (input.phone.provided) {
    if (!input.phone.verified) add('phone_unverified', 'medium', 20, 'Phone number was not confirmed with a one-time code.');
    const lt = input.phone.lineType ?? '';
    if (lt === 'nonFixedVoip') add('phone_voip', 'medium', 20, 'Virtual (VoIP) phone number, easy to obtain anonymously.');
    else if (lt === 'fixedVoip') add('phone_fixed_voip', 'low', 10, 'Internet (VoIP) phone line.');
    // Fraud reputation. A carrier's category alone never costs points (it would
    // penalise every number on that network); only a block or a very high score.
    if (input.phone.blocked) add('phone_blocked', 'high', 30, 'Number is currently blocked by fraud filters.');
    else if ((input.phone.smsRiskScore ?? 0) >= 80) add('phone_fraud_score', 'medium', 15, `Number has a high SMS fraud score (${input.phone.smsRiskScore}/100).`);
    const pc = cc(input.phone.country);
    if (pc && docCountry && pc !== docCountry) add('phone_country_mismatch', 'low', 10, `Phone country (${pc.toUpperCase()}) differs from the document country (${docCountry.toUpperCase()}).`);
    checks.push({
      name: 'Phone',
      status: !input.phone.verified ? 'warn' : lt === 'nonFixedVoip' ? 'warn' : 'pass',
      detail: `${input.phone.verified ? 'Verified by code' : 'Not verified'}${lt ? `, ${lt} line` : ''}.`,
    });
  }

  /* ---- email -------------------------------------------------------------- */
  if (input.email.provided) {
    if (!input.email.verified) add('email_unverified', 'medium', 20, 'Email address was not confirmed with a one-time code.');
    if (input.email.disposable) add('email_disposable', 'high', 30, 'Temporary (disposable) email address.');
    checks.push({
      name: 'Email',
      status: !input.email.verified || input.email.disposable ? 'warn' : 'pass',
      detail: `${input.email.verified ? 'Verified by code' : 'Not verified'}${input.email.mailbox ? `, mailbox ${input.email.mailbox.replace('_', '-')}` : ''}.`,
    });
  }

  /* ---- connection (IP) ---------------------------------------------------- */
  if (!input.ip.ran) {
    checks.push({ name: 'Connection', status: 'skipped', detail: 'Local or private network address, not checked.' });
  } else {
    // Tor hides the connection like a VPN and costs the same: never a review on its own. A Tor exit is shared by
    // thousands of people and its country is random, so its abuse reports and its country say nothing about this person.
    const tor = !!input.ip.tor;
    if (tor) add('ip_tor', 'medium', 20, 'Connected through the Tor anonymity network.');
    else if (input.ip.proxy || input.ip.hosting) add('ip_proxy', 'medium', 20, 'Connected through a VPN, proxy or data-centre network.');
    const abuse = tor ? 0 : (input.ip.abuseScore ?? 0);
    if (abuse >= 75) add('ip_abuse_high', 'high', 30, `Connection address has a high abuse score (${abuse}/100).`);
    else if (abuse >= 25) add('ip_abuse', 'medium', 15, `Connection address has reported abuse (${abuse}/100).`);
    const ic = cc(input.ip.country);
    const pc = cc(input.phone.country);
    if (!tor && ic && docCountry && ic !== docCountry && ic !== pc) add('ip_country_mismatch', 'low', 10, `Connecting from ${ic.toUpperCase()}, which matches neither the document nor the phone country.`);
    checks.push({
      name: 'Connection',
      status: abuse >= 75 ? 'fail' : tor || input.ip.proxy || input.ip.hosting || abuse >= 25 ? 'warn' : 'pass',
      detail: `${ic ? ic.toUpperCase() : 'Unknown country'}${input.ip.tor ? ', Tor' : input.ip.proxy || input.ip.hosting ? ', VPN/proxy/data centre' : ''}${abuse ? `, abuse ${abuse}/100` : ''}.`,
    });
  }

  /* ---- reuse and earlier steps ---------------------------------------------- */
  if (input.reuse.contactUsedByAnother) {
    add('contact_reused', 'high', 35, 'This phone or email was already used by a different applicant.');
  }
  if (input.reuse.deviceUsedByAnother) {
    add('device_reused', 'high', 30, 'This device was already used by a different applicant.');
  }
  if ((input.session.livenessAttempts ?? 0) >= 4) {
    add('liveness_retries', 'low', 10, `Liveness needed ${input.session.livenessAttempts} attempts.`);
  }
  if (input.session.faceMatched === false) {
    add('face_mismatch', 'high', 30, 'Selfie did not match the document portrait.');
  }
  if (input.session.documentQualityOverride) {
    add('doc_quality_override', 'low', 10, 'Document was accepted after repeated image-quality failures.');
  }

  const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0));
  const level = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
  const outcome = hardHit || needsReview || level === 'high' ? 'review' : 'approved';
  return { score, level, outcome, hardHit, reasons, checks, watchlist: { confirmed, possible } };
}
