/**
 * Browser client for the Console API's applicant routes (/api/kyc/*): phone
 * and email existence checks, one-time codes, and screening. The intelligence
 * services (Twilio, watchlists, IP reputation) sit behind the Console API and
 * are never called from the browser.
 *
 * Every call resolves (never throws) to `{ ok, data }` or `{ ok: false,
 * reason }`, where `reason` is already written for the applicant.
 */

import { dropSession, isHandoffTab, markFinished, proof, session, stopped } from "./dpop";

const API_BASE = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type KycResult<T> = { ok: true; data: T } | { ok: false; reason: string; status?: number };

/**
 * Every call is made inside this device's verification session: the session token plus a
 * fresh proof signed by the device's non-exportable key (see dpop.ts). If the token has
 * expired the session is reopened once and the call retried.
 */
async function post<T>(path: string, body: unknown, timeoutMs = 45_000, retried = false): Promise<KycResult<T>> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let s;
    try {
      s = await session();
    } catch (e) {
      return { ok: false, reason: (e as Error).message, status: 401 };
    }
    const url = `${API_BASE}/api/kyc/${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `DPoP ${s.accessToken}`,
        DPoP: await proof("POST", url, s.accessToken),
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const json = (await res.json().catch(() => null)) as (T & { reason?: string; message?: unknown; error?: string }) | null;
    if (res.status === 401 && json?.error === "invalid_token" && !retried) {
      dropSession();
      clearTimeout(t);
      return post<T>(path, body, timeoutMs, true);
    }
    // disabled by the organisation, or already finished: the flow stops and says why
    // (a phone doing one face step says it on its own page, and never marks itself as finished)
    if (res.status === 410 && !isHandoffTab() && (json?.error === "session_disabled" || json?.error === "session_complete") && typeof json.reason === "string") {
      if (json.error === "session_complete") markFinished();
      stopped(json.error, json.reason);
    }
    if (!res.ok) {
      const reason =
        (json && typeof json.reason === "string" && json.reason) ||
        (res.status === 429
          ? "Too many attempts. Please wait a few minutes and try again."
          : "Something went wrong on our side. Please try again.");
      return { ok: false, reason, status: res.status };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, reason: "We couldn't reach the verification service. Check your connection and try again." };
  } finally {
    clearTimeout(t);
  }
}

export type PhoneCheck = {
  ok: boolean;
  exists: boolean;
  e164: string;
  country: string | null;
  lineType: string | null;
  reason?: string;
  retryable?: boolean;
};
export type EmailCheck = { ok: boolean; exists: boolean; deliverable: "yes" | "no" | "unknown"; suggestion?: string; reason?: string };
/** `testCode` is only present in the server's SMS placeholder mode (dev). */
export type Sent = { ok: true; sentTo: string; testCode?: string };
/** `token`: signed proof of the verification, sent back with the screening. */
export type Verified = { ok: true; verified: boolean; reason?: string; token?: string };
export type FindingTone = "pass" | "warn" | "fail" | "na";
export type FindingRow = { label: string; value: string; tone?: FindingTone };
export type FindingSection = { title: string; tone: FindingTone; rows: FindingRow[] };
/** The applicant-safe "Here's What We Found" report (no watchlist details). */
export type Findings = {
  scores: { phoneRisk: number | null; emailRisk: number | null; identityScore: number };
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  decision: "PASS" | "REVIEW";
  codes: { code: string; label: string; tone: FindingTone }[];
  screening: FindingRow[];
  phone: FindingSection[] | null;
  email: FindingSection[] | null;
  consistency: { left: string; right: string; tone: FindingTone; leftIcon: string; rightIcon: string }[];
  velocity: FindingRow[];
  explain: { summary: string };
};
export type Screening = {
  ok: true;
  reference: string;
  outcome: "approved" | "review";
  message: string;
  findings: Findings;
};

export type PoaTone = "pass" | "warn" | "fail" | "na";
export type PoaAddress = {
  street: string | null;
  building: string | null;
  village: string | null;
  cell: string | null;
  sector: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  raw: string | null;
};
/** The applicant-safe proof-of-address answer (forgery signals are never included). */
export type PoaResult = {
  ok: true;
  reference: string;
  outcome: "accepted" | "review" | "retake";
  message: string;
  /** False when the upload is not a proof of address at all (ID card, receipt, ...). */
  isProofOfAddress: boolean;
  whatItIs: string | null;
  /** What was read off the document, as label / value rows. */
  details: { label: string; value: string }[];
  document: { type: string; issuer: string | null; issued: string | null };
  holderName: string | null;
  address: PoaAddress;
  checks: { label: string; value: string; tone: PoaTone }[];
  tips: string[];
};
export type PoaConfirmed = { ok: true; reference: string | null; source: "document" | "typed"; edited: string[] };

/** Where a resumed verification continues (the browser maps it to a screen, see resume.ts). */
export type ResumeNext = "document" | "face" | "phone" | "email" | "screening" | "address-upload" | "address-confirm" | "result";
/** A verification this device started earlier: what is finished, where to continue, and the saved answers. */
export type ResumeFacts = {
  ok: true;
  status: "in_progress" | "completed" | "redacted";
  startedAt?: string;
  resumeUntil?: string | null;
  /** Demo sessions only: the applicant may start a new verification instead. */
  canRestart: boolean;
  /** Anything done beyond opening the link. */
  progress: boolean;
  next?: ResumeNext;
  nextLabel?: string;
  done?: {
    document: boolean;
    liveness: boolean;
    phone: boolean;
    email: boolean;
    screening: boolean;
    address: "none" | "retake" | "uploaded" | "confirmed";
    completed: boolean;
  };
  restore?: Partial<Omit<import("./flow-store").FlowState, "documents">>;
};

/** The applicant's real result, decided by the server when the flow ends: only this workflow's checks. */
export type ApplicantOutcome = {
  verdict: "Verified" | "Needs review" | "Declined" | "In progress";
  reference: string;
  checks: { id: string; label: string; outcome: "pass" | "fail" | "review" | "pending" | "done" }[];
  reasons: string[];
  /** Masked address the applicant's copy of this result is being emailed to, when one was captured; else null. */
  emailedTo?: string | null;
};
/** May the applicant go on after confirming their document? (a workflow's minimum age) */
export type Gate = { ok: true; stop: null | { code: string; minimumAge: number; reason: string }; pending?: boolean };

export const kycApi = {
  phoneCheck: (phone: string) => post<PhoneCheck>("phone/check", { phone }),
  phoneSend: (phone: string) => post<Sent>("phone/send", { phone }),
  phoneVerify: (phone: string, code: string) => post<Verified>("phone/verify", { phone, code }),
  emailCheck: (email: string) => post<EmailCheck>("email/check", { email }),
  emailSend: (email: string) => post<Sent>("email/send", { email }),
  emailVerify: (email: string, code: string) => post<Verified>("email/verify", { email, code }),
  screen: (body: {
    name?: string;
    dob?: string;
    nationality?: string;
    documentCountry?: string;
    declaredCountry?: string;
    phone?: string;
    email?: string;
    walletAddress?: string;
    livenessAttempts?: number;
    faceMatched?: boolean;
    documentQualityOverride?: boolean;
    phoneToken?: string;
    emailToken?: string;
    deviceId?: string;
  }) => post<Screening>("screen", body, 90_000),
  /** ID document read; both images are JWE made by document-crypto.ts. Returns the engine envelope. */
  idvRead: (body: { front: string; back?: string }) => post<unknown>("idv/read", body, 200_000),
  /** Live selfie vs document portrait; both images are JWE. Returns the face engine's answer. */
  faceMatch: (body: { selfie: string; portrait: string; liveness?: boolean }) => post<unknown>("face/match", body, 120_000),
  /** A step only the browser sees, for the verification record (never blocks the flow). */
  event: (body: { type: "identity" | "document" | "liveness" | "attempt" | "completed"; data?: Record<string, unknown>; file?: string }) =>
    post<{ ok: true; outcome?: ApplicantOutcome }>("events", body, 60_000),
  /** Asked when the applicant confirms their document details (see Gate). */
  gate: () => post<Gate>("gate", {}, 15_000),
  /** Device & IP signals (device-signals.ts). The answer is always just { ok: true }. */
  device: (body: { stage: "open" | "camera" | "final"; signals: unknown }) => post<{ ok: true }>("device", body, 30_000),
  /** What this verification runs: its workflow's checks (see plan.ts). */
  plan: () => post<{ workflow: string | null; checks: string[] | null; documentTypes: string[] | null; dynamic?: boolean }>("plan", {}, 15_000),
  /** The branding the organisation shows its applicants: name, logo and return URL (see brand.ts). */
  brand: () => post<{ ok: true; name: string; logoUrl?: string | null; returnUrl?: string | null }>("brand", {}, 15_000),
  /** The public key documents are encrypted with in the browser (JWKS). */
  uploadKey: () => post<{ keys: unknown[] }>("keys/upload", {}),
  poaAnalyze: (body: {
    /** compact JWE made by document-crypto.ts; the server side cannot read it until processing */
    document: string;
    filename?: string;
    declaredAddress?: string;
    subject?: { name?: string; dob?: string; idAddress?: string; country?: string };
  }) => post<PoaResult>("poa/analyze", body, 210_000),
  poaConfirm: (body: { reference?: string; address: Partial<Record<keyof PoaAddress, string>> & { typed?: string } }) =>
    post<PoaConfirmed>("poa/confirm", body),
  /** Coming back to a verification started earlier on this device (see resume.ts). */
  resume: (body: { announce?: boolean }) => post<ResumeFacts>("resume", body, 30_000),
  /** A face step on the applicant's phone (handoff.ts). The computer: a one-time code, how the phone is doing, stop. */
  handoff: (body: { step: "liveness" | "face-match"; payload?: string }) => post<{ ok: true; code: string; expiresAt: string }>("handoff", body, 30_000),
  handoffStatus: () =>
    post<{ ok: true; state: "none" | "waiting" | "opened" | "expired" | "done"; step?: string; expiresAt?: string; result?: string | null }>(
      "handoff/status",
      {},
      15_000,
    ),
  handoffCancel: () => post<{ ok: true }>("handoff/cancel", {}, 15_000),
  /** The phone: its face step is done (the result sealed with the link key). */
  handoffDone: (body: { result: string }) => post<{ ok: true }>("handoff/done", body, 30_000),
};
