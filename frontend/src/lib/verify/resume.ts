"use client";

/**
 * Coming back to a verification.
 *
 * The server keeps every finished part of a verification on its record; this device keeps the
 * link it was opened with (dpop.ts, bound to this device's key). When a tab opens the flow with
 * nothing of its own yet, it asks the server how far this verification got, offers to continue,
 * and puts the saved answers back into the tab so the later screens have what they need.
 *
 * A part counts as finished only if it PASSED (the server decides, see resume.view.ts), so
 * continuing never skips a check the applicant had not cleared. A part left halfway (photos
 * taken, face not yet matched) starts again from its first screen.
 */
import { hasVerificationToOpen, resumable } from "./dpop";
import { readFlow, writeFlow } from "./flow-store";
import { kycApi, type ResumeFacts, type ResumeNext } from "./kyc-api";

/** The first screen of each place a verification can continue at. */
export const RESUME_SCREEN: Record<ResumeNext, string> = {
  document: "document-type",
  face: "face-intro",
  phone: "phone",
  email: "email",
  screening: "checking",
  "address-upload": "address-upload",
  "address-confirm": "address-confirm",
  result: "result",
};

/** The flow step (the rail) each place belongs to. */
export const RESUME_STEP: Record<ResumeNext, string> = {
  document: "document",
  face: "face",
  phone: "contact",
  email: "contact",
  screening: "contact",
  "address-upload": "address",
  "address-confirm": "address",
  result: "result",
};

const ANNOUNCED = "verisec.kyc.announced";
const DISMISSED = "verisec.kyc.resume.dismissed";

/** True when this tab is already walking the flow (its answers were written here). */
export function tabHasProgress(): boolean {
  const f = readFlow();
  return !!(f.resumedAt || f.docType || f.documents?.front || f.subject || f.contact || f.screening || f.poa);
}

/** Put the saved answers back into this tab, so the later screens have what they need. */
export function applyResume(facts: ResumeFacts) {
  writeFlow({ ...(facts.restore ?? {}), resumedAt: Date.now() });
}

/** The applicant closed the offer: do not ask again in this tab. */
export function dismissResume() {
  try {
    sessionStorage.setItem(DISMISSED, "1");
  } catch {}
}

/**
 * A verification this device started that this tab should offer to continue, or null: nothing
 * kept, nothing done beyond opening it, already walking it here, declined here, or it cannot be
 * opened right now.
 */
export async function findResume(): Promise<ResumeFacts | null> {
  try {
    if (sessionStorage.getItem(DISMISSED)) return null;
  } catch {}
  if (tabHasProgress() || !hasVerificationToOpen()) return null;
  // the return goes on the verification's timeline once per tab, not on every page
  const mark = `${ANNOUNCED}:${resumable()?.sessionId ?? "link"}`;
  let announce = true;
  try {
    // marked before the call, so a second check running at the same moment does not log it again
    announce = sessionStorage.getItem(mark) !== "1";
    sessionStorage.setItem(mark, "1");
  } catch {}
  const r = await kycApi.resume({ announce });
  if (!r.ok || r.data.status !== "in_progress" || !r.data.progress || !r.data.next) return null;
  return r.data;
}
