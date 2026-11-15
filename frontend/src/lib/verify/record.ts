"use client";

/**
 * Tells the verification record about steps only the browser can see: the details the
 * applicant confirmed, the liveness outcome (with the selfie, encrypted here first), and the
 * end of the flow. Everything else is recorded by the server as it happens.
 *
 * Fire and forget: recording never blocks or fails the applicant's flow.
 */
import { collectDeviceSignals } from "./device-signals";
import { encryptDocument } from "./document-crypto";
import { toAlpha2 } from "./idv";
import { markFinished, session } from "./dpop";
import { dataUrlBytes } from "./idv-client";
import type { KycResolution } from "./idv/types";
import { readFlow } from "./flow-store";
import { kycApi, type ApplicantOutcome } from "./kyc-api";

const toneOutcome = (t: string) => (t === "pass" ? "pass" : t === "fail" ? "fail" : t === "warn" ? "review" : "pending");

/** Which details the printed side and the barcode / MRZ agreed on (names only), for the team. */
const crossMatchRecord = (r: KycResolution) => ({
  agree: r.crossMatch.agree,
  // the sources as one short text ("VISUAL/BARCODE,VISUAL/MRZ"): the record keeps values only a few levels deep
  fields: r.crossMatch.fields.map((f) => ({ name: f.name, agree: f.pairs.every((x) => x.agree), pairs: [...new Set(f.pairs.map((x) => `${x.left}/${x.right}`))].join(",") })),
});

/** Why the document check stopped the applicant, in a few words for the team (what failed, or what they were told). */
function blockedReason(r: KycResolution): string {
  const labels = [...new Set(r.errors.map((e) => `${e.label}${e.side === "back" ? " (back)" : e.side === "front" ? " (front)" : ""}`))].slice(0, 3);
  if (labels.length) return labels.join(", ");
  return r.guidance || (r.gate.reason === "quality-retake" ? "Photo not clear enough" : "The document could not be accepted");
}

export function recordDocument(r: KycResolution, docType: string | undefined, subject: { name?: string; dob?: string; nationality?: string }) {
  // The document check stopped the applicant (glare, not sharp, front and back not matching...): this upload is a try
  // that was not accepted. Nothing is confirmed, so the verification stays at the document step until a photo passes.
  if (!r.gate.canProceed) {
    void kycApi.event({ type: "document", data: { ok: false, blocked: r.gate.reason, reason: blockedReason(r), crossMatch: crossMatchRecord(r) } });
    return;
  }
  const d = r.display;
  if (!d) return;
  const f = r.full;
  const page = f.pages.find((p) => p.docClass) ?? f.pages[0];
  void kycApi.event({
    type: "document",
    data: {
      ok: r.gate.canProceed,
      outcome: r.outcome,
      recognisedAs: d.documentName,
      status: d.status.label,
      specimen: d.status.specimen,
      decision: d.decision.label,
      flagged: r.gate.flagged,
      // let through after repeated quality failures: screening counts it, and a resumed session keeps it
      qualityAllowed: r.gate.reason === "quality-allowed",
      // let through with a warning: the photo problems, and whether the front and back details agreed
      ...(r.gate.reason === "quality-allowed" ? { warning: blockedReason(r) } : {}),
      crossMatch: crossMatchRecord(r),
      qualityAttempts: readFlow().qualityRecord?.attempts,
      guidance: r.guidance,
      checks: d.signals.map((s) => ({ label: s.name, outcome: toneOutcome(s.tone), note: s.note })),
      quality: d.quality.map((q) => ({ label: q.name, outcome: toneOutcome(q.tone) })),
      verdict: f.verdict,
      authenticity: f.authChecks.map((a) => ({ label: a.name, result: a.result, page: a.page, elements: a.elements.length })),
      anomalies: f.anomalies.map((a) => ({ kind: a.kind, severity: a.severity, detail: a.detail, field: a.field })),
      errors: f.errors.map((e) => ({ area: e.area, label: e.label, detail: e.detail, severity: e.severity, critical: e.critical, side: e.side })),
      docClass: page?.docClass
        ? { name: page.docClass.documentName, country: page.docClass.country, countryName: page.docClass.countryName, type: page.docClass.dTypeName, confidence: page.docClass.confidence }
        : null,
      mrz: f.pages.find((p) => p.mrz)?.mrz ? { format: f.pages.find((p) => p.mrz)!.mrz!.format, rows: f.pages.find((p) => p.mrz)!.mrz!.rows } : null,
      faces: d.faces,
      sides: f.pages.length,
    },
  });
  void kycApi.event({
    type: "identity",
    data: {
      name: subject.name ?? "",
      dob: subject.dob ?? "",
      nationality: subject.nationality ?? "",
      documentType: docType ?? d.docType,
      documentCountry: toAlpha2(d.country) || d.country,
      fields: d.fields
        .filter((x) => x.value)
        .map((x) => ({
          term: x.name,
          detail: x.value,
          key: x.key,
          mono: /NUMBER|MRZ|CODE/.test(x.key),
          outcome: toneOutcome(x.tone),
          sources: x.sources,
          crossChecked: x.crossChecked,
        })),
    },
  });
}

export async function recordLiveness(
  result: { passed: boolean; mode: string; engine: string; attempts: number; status?: number; code?: number; transactionId?: string },
  selfie?: string,
) {
  let file: string | undefined;
  try {
    if (selfie) {
      const { bytes, mime } = dataUrlBytes(selfie.startsWith("data:") ? selfie : `data:image/jpeg;base64,${selfie}`);
      file = await encryptDocument(bytes, mime);
    }
  } catch {
    file = undefined;
  }
  // awaited: a phone hands its face check back to the computer only once it is on the record
  await kycApi.event({ type: "liveness", data: result, file });
}

/**
 * A face check that ended without a result (the camera check failed, or the applicant closed it): it still goes on
 * the record, so the team sees every try and not only the one that worked. Silent; never throws.
 */
export function recordStoppedFaceCheck(outcome: "error" | "cancelled", reason?: string) {
  void kycApi.event({ type: "attempt", data: { kind: "liveness", outcome, ...(reason ? { reason } : {}) } }).catch(() => undefined);
}

/**
 * Device & IP signals, once per stage per session: "open" when the flow starts, "camera" once
 * the camera is allowed (device labels, virtual camera check). A report that did not get through
 * is sent again from the next screen. Silent; never throws.
 */
export function recordDevice(stage: "open" | "camera" | "final"): Promise<void> {
  let mark: string | null = null;
  return (async () => {
    const { accessToken } = await session();
    mark = `verisec.kyc.device.${stage}:${accessToken.slice(-24)}`;
    if (sessionStorage.getItem(mark)) return;
    // claimed before sending, so two screens never send the same stage at once
    sessionStorage.setItem(mark, "1");
    const r = await kycApi.device({ stage, signals: await collectDeviceSignals() });
    if (!r.ok) sessionStorage.removeItem(mark);
  })().catch(() => {
    try {
      if (mark) sessionStorage.removeItem(mark);
    } catch {
      /* storage unavailable: nothing to free */
    }
  });
}

/** Once per session: the flow reached its result screen. */
/**
 * The flow reached its result: the server decides now (once; asking again returns the same decision) and answers with
 * the applicant's real result. Only a tab that walked this verification closes it, so a result page opened on its own
 * never finishes a verification that is still being done. Null: nothing to finish here, or it could not be reached.
 */
export async function completeVerification(): Promise<ApplicantOutcome | null> {
  const f = readFlow();
  const progressed = !!(
    f.idvProcessed ||
    f.faceMatch ||
    f.faceResult ||
    f.screening ||
    f.contact?.phoneVerified ||
    f.contact?.emailVerified ||
    f.poa
  );
  if (!progressed) return null;
  const r = await kycApi.event({ type: "completed" });
  if (!r.ok) return null;
  // finished: coming back on this device says so, and no other verification opens in its place
  markFinished();
  return r.data.outcome ?? null;
}
