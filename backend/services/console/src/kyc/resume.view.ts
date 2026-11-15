import type { RecordMeta, RecordSections } from './records.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

/** Where a resumed applicant continues: one id per place in the flow (the browser maps it to a screen). */
export type ResumeNext = 'document' | 'face' | 'phone' | 'email' | 'screening' | 'address-upload' | 'address-confirm' | 'result';

const NEXT_LABEL: Record<ResumeNext, string> = {
  document: 'Document',
  face: 'Face verification',
  phone: 'Phone number',
  email: 'Email address',
  screening: 'Screening',
  'address-upload': 'Proof of address',
  'address-confirm': 'Proof of address',
  result: 'Result',
};

/** The keys of the proof-of-address answer the applicant was shown (never the reviewer-only part). */
const POA_RESULT_KEYS = ['ok', 'reference', 'outcome', 'message', 'isProofOfAddress', 'whatItIs', 'details', 'document', 'holderName', 'address', 'checks', 'tips'];

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const time = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : undefined;
};

/** The address printed on the ID, from the confirmed fields (same keys the flow reads). */
function idAddress(fields: unknown): string | undefined {
  const list = Array.isArray(fields) ? (fields as Any[]) : [];
  const get = (k: string) => str(list.find((f) => f?.key === k)?.detail);
  const one = get('ADDRESS') ?? get('RESIDENT_ADDRESS');
  if (one) return one;
  const parts = ['ADDRESS_STREET', 'ADDRESS_AREA', 'ADDRESS_CITY', 'ADDRESS_STATE', 'ADDRESS_POSTAL_CODE'].map(get).filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * What the applicant's browser needs to continue a verification it started earlier: which parts
 * are finished (each must have PASSED, so a resume never skips a gate the applicant had not
 * cleared), where to continue, and the answers later screens use. Only data this applicant gave or
 * was already shown: no reviewer-only reasons, no internal scores, no images.
 */
export function resumeFacts(
  meta: RecordMeta,
  d: RecordSections,
  reissue: (channel: 'phone' | 'email', value: string, at: number, attempts: number) => string,
) {
  const steps = meta.steps ?? {};
  const identity = (d.identity ?? {}) as Any;
  const face = (d.face ?? {}) as Any;
  const contact = (d.contact ?? {}) as Any;
  const screening = (d.screening ?? {}) as Any;
  const address = (d.address ?? {}) as Any;
  const document = (d.document ?? {}) as Any;

  const match = face.match as Any | undefined;
  const live = face.liveness as Any | undefined;
  const done = {
    // the flow's Document step ends with the selfie matched to the document portrait
    document: !!steps.identity && match?.matched === true && match?.livenessConfirmed !== false,
    liveness: live?.passed === true,
    phone: contact.phone?.verified === true,
    email: contact.email?.verified === true,
    screening: !!str(screening.reference),
    address: (steps.address_confirmed || address.confirmed
      ? 'confirmed'
      : address.outcome === 'retake'
        ? 'retake'
        : address.outcome
          ? 'uploaded'
          : 'none') as 'none' | 'retake' | 'uploaded' | 'confirmed',
    completed: meta.status === 'completed',
  };
  const next: ResumeNext = !done.document
    ? 'document'
    : !done.liveness
      ? 'face'
      : !done.phone
        ? 'phone'
        : !done.email
          ? 'email'
          : !done.screening
            ? 'screening'
            : done.address === 'uploaded'
              ? 'address-confirm'
              : done.address === 'confirmed'
                ? 'result'
                : 'address-upload';
  // anything beyond opening the link: otherwise there is nothing to come back to
  const progress = ['document_read', 'identity', 'document', 'face_match', 'liveness', 'phone', 'email', 'screening', 'address', 'address_confirmed'].some(
    (k) => !!steps[k],
  );

  const restore: Any = {};
  if (steps.identity) {
    restore.docType = str(identity.documentType);
    restore.country = str(identity.documentCountry) ?? meta.country ?? undefined;
    restore.subject = {
      name: str(identity.name),
      dob: str(identity.dob),
      nationality: str(identity.nationality),
      documentCountry: str(identity.documentCountry),
      address: idAddress(identity.fields),
    };
    if (document.qualityAllowed === true) {
      restore.qualityRecord = { attempts: Number(document.qualityAttempts ?? 1), errors: [], at: time(document.readAt) ?? Date.now() };
    }
  }
  if (done.document && match) {
    restore.faceMatch = {
      matched: true,
      similarity: Number(match.similarity ?? 0),
      score: Number(match.similarity ?? 0),
      threshold: Number(match.threshold ?? 0.75),
      at: time(match.at) ?? Date.now(),
    };
  }
  if (done.liveness) {
    restore.faceAttempts = Number(live!.attempts ?? 1);
    if (str(live!.mode)) restore.faceMode = str(live!.mode);
  }
  const c: Any = {};
  if (done.phone && str(contact.phone.e164)) {
    const at = time(contact.phone.verifiedAt) ?? Date.now();
    c.phone = contact.phone.e164;
    c.phoneVerified = true;
    c.phoneToken = reissue('phone', contact.phone.e164, at, Number(contact.phone.attempts ?? 1));
  }
  if (done.email && str(contact.email.address)) {
    const at = time(contact.email.verifiedAt) ?? Date.now();
    const email = String(contact.email.address).trim().toLowerCase();
    c.email = email;
    c.emailVerified = true;
    c.emailToken = reissue('email', email, at, Number(contact.email.attempts ?? 1));
  }
  if (Object.keys(c).length) restore.contact = c;
  if (done.screening) {
    restore.screening = {
      reference: screening.reference,
      outcome: screening.outcome === 'approved' ? 'approved' : 'review',
      at: time(steps.screening) ?? Date.now(),
      findings: screening.findings ?? undefined,
    };
  }
  if (done.address === 'uploaded' || done.address === 'confirmed') {
    const result = Object.fromEntries(POA_RESULT_KEYS.filter((k) => k in address).map((k) => [k, address[k]]));
    restore.poa = {
      ...(Object.keys(result).length ? { result } : {}),
      ...(address.confirmed ? { confirmed: address.confirmed, edited: Array.isArray(address.edited) ? address.edited : [] } : {}),
      at: time(steps.address_confirmed ?? steps.address) ?? Date.now(),
    };
  }

  // for the timeline: the details were confirmed but the selfie was not matched yet
  const nextLabel = next === 'document' && steps.identity ? 'Face match' : NEXT_LABEL[next];
  return { done, next, nextLabel, progress, restore };
}
