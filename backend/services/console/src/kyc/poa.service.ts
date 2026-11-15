import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

import { IntelClient } from './intel.client';
import { RateLimiter, TtlMap } from './stores';
import { VaultService } from './vault.service';

const MIN = 60_000;

/** What the applicant told us, from their confirmed ID and what they typed. */
export type PoaSubject = {
  name?: string;
  dob?: string;
  idAddress?: string;
  country?: string;
};

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

export type PoaTone = 'pass' | 'warn' | 'fail' | 'na';
export type PoaCheck = { label: string; value: string; tone: PoaTone };

/** The applicant-safe answer. Forgery signals are never included (they would teach a forger
 *  what we look for); they only move the outcome to "review" and stay in the reviewer report. */
/** What was read off the document, in plain words, for the applicant to see. */
export type PoaDetail = { label: string; value: string };

export type PoaResult = {
  ok: true;
  reference: string;
  outcome: 'accepted' | 'review' | 'retake';
  message: string;
  /** False when the upload is not a proof of address at all (ID card, receipt, ...). */
  isProofOfAddress: boolean;
  /** What the upload looks like, in plain words (e.g. "supermarket receipt"). */
  whatItIs: string | null;
  details: PoaDetail[];
  document: { type: string; issuer: string | null; issued: string | null };
  holderName: string | null;
  address: PoaAddress;
  checks: PoaCheck[];
  tips: string[];
};

type Stored = { report: any; address: PoaAddress; declared?: string; subject: PoaSubject; at: number; confirmed?: unknown };

const TYPE_LABEL: Record<string, string> = {
  utility_bill: 'Utility bill',
  bank_statement: 'Bank statement',
  mobile_money_statement: 'Mobile money statement',
  credit_card_statement: 'Credit card statement',
  tenancy_agreement: 'Tenancy agreement',
  mortgage_statement: 'Mortgage statement',
  residence_certificate: 'Certificate of residence',
  affidavit: 'Sworn statement',
  government_letter: 'Government letter',
  tax_invoice: 'Tax invoice',
  national_address_certificate: 'National address certificate',
  insurance_document: 'Insurance document',
  employer_letter: 'Employer letter',
};

// Reasons the applicant can fix by uploading something else / a better photo.
const FIXABLE = new Set(['NOT_POA', 'NAME_MISMATCH', 'NAME_NOT_FOUND', 'TOO_OLD', 'ADDRESS_NOT_FOUND', 'NOT_READ', 'TYPE_UNCLEAR']);
// Signs of forgery: never shown, never "retake" (a forger would just try again).
const HIDDEN = new Set([
  'PASTED_TEXT', 'TEXT_LOOKS_EDITED', 'TOTALS_INCONSISTENT', 'DATES_INCONSISTENT', 'PDF_EDITED', 'PDF_EDITOR',
  'HANDWRITTEN_EDITS', 'NOT_ORIGINAL', 'QR_MISMATCH', 'QR_NOT_OFFICIAL', 'DOB_MISMATCH',
]);
const TIPS: Record<string, string> = {
  NOT_POA: 'Upload a utility bill, bank statement, tenancy agreement or residence certificate that shows your name and home address.',
  BLURRY: 'Take the photo in good light and hold the camera steady.',
  PAGE_CUT: 'Make sure all four corners of the page are in the photo.',
  CODE_UNREADABLE: 'Make sure any QR code or barcode on the page is sharp.',
  TOO_OLD: 'Upload a document issued in the last 3 months.',
  NAME_MISMATCH: 'Upload a document in your own name, spelled as on your ID.',
  NAME_NOT_FOUND: 'Upload a document that shows your full name.',
  ADDRESS_NOT_FOUND: 'Upload a document that shows your full address.',
  TYPE_UNCLEAR: 'Upload a utility bill, bank statement, tenancy agreement or residence certificate.',
  NOT_READ: 'Upload a clearer photo or the original PDF.',
};

function tooMany(msg = 'Too many attempts. Please wait a few minutes and try again.'): never {
  throw new HttpException({ ok: false, reason: msg }, HttpStatus.TOO_MANY_REQUESTS);
}

function fail(reason: string, status = HttpStatus.BAD_REQUEST): never {
  throw new HttpException({ ok: false, reason }, status);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-09-05 -> 5 Sep 2026 (no timezone games: the document date is a calendar date). */
function day(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}
/** Keep the last 4 characters of an account-like number. */
function tail4(v: string | null | undefined): string | null {
  const t = (v ?? '').replace(/\s+/g, '');
  return t ? (t.length > 4 ? `\u2022\u2022\u2022\u2022 ${t.slice(-4)}` : t) : null;
}
const REF_LABEL: Record<string, string> = {
  invoice_number: 'Invoice number',
  customer_number: 'Customer number',
  contract_number: 'Contract number',
  application_number: 'Application number',
  certificate_number: 'Certificate number',
  fiscal_document_number: 'Tax receipt number',
  council_tax_ref: 'Council tax reference',
  ejari_number: 'Ejari number',
};

/** The important things read from the document, as label/value rows. Forgery signals never appear. */
function buildDetails(r: any): PoaDetail[] {
  const out: PoaDetail[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const v = (value ?? '').toString().replace(/\s+/g, ' ').trim();
    if (v) out.push({ label, value: v });
  };
  const d = r.document ?? {};
  const sub = d.subtype ? ` (${String(d.subtype).replace(/_/g, ' ')})` : '';
  push('Document', d.what_it_is ? `${d.what_it_is[0].toUpperCase()}${d.what_it_is.slice(1)}` : (TYPE_LABEL[d.type] ?? null) && `${TYPE_LABEL[d.type]}${sub}`);
  push('Title on the page', d.title_as_printed);
  push('Issued by', r.issuer?.name);
  push('Issue date', day(d.issue_date));
  const ps = day(d.period_start), pe = day(d.period_end);
  push('Period', ps && pe ? `${ps} to ${pe}` : ps ?? pe);
  push('Due date', day(d.due_date));
  push('Name on the document', (r.holder?.names ?? []).join(', '));
  push('Address on the document', r.address?.raw);
  const a = r.account ?? {};
  push('Account number', tail4(a.account_number));
  push('Meter number', a.meter_number);
  for (const ref of (a.references ?? []).slice(0, 3)) push(REF_LABEL[ref.kind] ?? 'Reference', ref.value);
  const amt = r.amounts ?? {};
  if (amt.amount_due != null) {
    push('Amount due', `${Number(amt.amount_due).toLocaleString('en-US')}${amt.currency ? ` ${amt.currency}` : ''}`);
  }
  push('Usage', (amt.consumption ?? []).map((c: any) => `${Number(c.value).toLocaleString('en-US')} ${c.unit ?? ''}`.trim()).join(', '));
  const att = r.attestation ?? {};
  push('Certified by', [att.certifier_name, att.certifier_role].filter(Boolean).join(', '));
  const sec = r.security ?? {};
  (sec.stamps ?? []).forEach((st: any, i: number) => {
    const look = [st.shape, st.color].filter(Boolean).join(', ');
    push((sec.stamps.length > 1 ? `Stamp ${i + 1}` : 'Stamp'), st.text ? `\u201c${st.text}\u201d${look ? ` (${look})` : ''}` : look ? `Unreadable stamp (${look})` : null);
  });
  (sec.signatures ?? []).forEach((sg: any, i: number) => {
    const who = [sg.name_near_it, sg.role_near_it].filter(Boolean).join(', ');
    push((sec.signatures.length > 1 ? `Signature ${i + 1}` : 'Signature'), who ? `Signed by ${who}` : 'Signed');
  });
  for (const q of (sec.qr_codes ?? []).slice(0, 2)) {
    push('QR code', q.link_domain ? `Links to ${q.link_domain}${q.domain_trusted ? ' (official site)' : ''}` : 'Read');
  }
  if ((sec.barcodes ?? []).length) push('Barcode', `${sec.barcodes.length} read`);
  return out;
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Proof of address. The document goes to the global API (reading, codes, pixel and PDF
 * forensics, comparisons with the ID and what the applicant typed); this service turns the
 * full report into what the applicant may see, and keeps the full report for reviewers.
 */
@Injectable()
export class PoaService {
  private readonly log = new Logger('Poa');
  private readonly limiter = new RateLimiter();
  /** Reports by reference, encrypted by OpenBao (never held in clear). */
  private readonly store = new TtlMap<string>(24 * 60 * MIN);
  readonly exposeReport: boolean;

  constructor(
    private readonly intel: IntelClient,
    private readonly vault: VaultService,
    config: ConfigService,
  ) {
    this.exposeReport = config.get<string>('KYC_EXPOSE_REPORT') === 'true';
  }

  /** The public key browsers encrypt documents with (the private half never leaves OpenBao). */
  async uploadKey() {
    const env = await this.intel.get<{ keys: unknown[] }>('/v1/vault/upload-key');
    if (!env.ok || !env.data) fail("We can't accept documents right now. Please try again.", HttpStatus.BAD_GATEWAY);
    return { ok: true as const, ...env.data };
  }

  async analyze(
    input: { document: string; filename?: string; declaredAddress?: string; subject?: PoaSubject },
    ip: string,
  ): Promise<PoaResult & { report?: unknown }> {
    if (!this.limiter.take(`poa:ip:${ip}`, 12, 60 * MIN)) tooMany();
    const subject = input.subject ?? {};
    const declared = input.declaredAddress?.trim() || undefined;

    // The document arrives encrypted by the browser (JWE). We cannot read it: it is stored as-is
    // at the processing side, and from here on only the token travels.
    const stored = await this.intel.post<{ token: string }>('/v1/vault/documents', { jwe: input.document }, 60_000);
    if (!stored.ok || !stored.data?.token) {
      this.log.warn(`poa store failed: ${stored.error?.code ?? 'unknown'}`);
      fail("We couldn't receive your document. Please upload it again.");
    }

    const env = await this.intel.post<any>(
      '/v1/poa/analyze',
      {
        document_token: stored.data.token,
        filename: input.filename,
        expected: {
          name: subject.name,
          dob: subject.dob,
          id_address: subject.idAddress,
          address: declared,
          country: subject.country?.toUpperCase(),
        },
      },
      200_000,
    );
    if (!env.ok || !env.data) {
      const code = env.error?.code;
      if (code === 'unsupported_file') fail('Please upload a PDF, JPG, PNG or WEBP file.');
      if (code === 'file_too_large') fail('This file is too large. Please upload a file under 10 MB.');
      if (code === 'bad_file') fail("We couldn't open this file. Please upload a clearer photo or the original PDF.");
      this.log.warn(`poa analyze failed: ${code ?? 'unknown'}`);
      fail("We couldn't check your document right now. Please try again.", HttpStatus.BAD_GATEWAY);
    }

    const r = env.data;
    const v = r.verification;
    const reasons: { code: string; label: string; tone: string }[] = v.reasons ?? [];
    const codes = new Set(reasons.map((x) => x.code));
    const hiddenHit = reasons.some((x) => HIDDEN.has(x.code) && x.tone !== 'pass');
    const fixable = reasons.filter((x) => FIXABLE.has(x.code) && x.tone === 'fail');

    const notPoa = codes.has('NOT_POA');
    // The reader could not read the page at all: nobody can tell whether it is a proof of address,
    // so it is never waved through to review. The applicant uploads a clearer copy, types the
    // address, or skips this optional step.
    const unread = codes.has('NOT_READ');
    let outcome: PoaResult['outcome'];
    // Not a proof of address at all: always "upload the right document", whatever else was seen.
    if (notPoa || unread) outcome = 'retake';
    else if (fixable.length && !hiddenHit) outcome = 'retake';
    else if (v.decision === 'pass') outcome = 'accepted';
    else outcome = 'review';

    const message = {
      accepted: 'Your document checks out. Confirm your address on the next screen.',
      review: 'Thanks. Confirm your address on the next screen. A reviewer may take a closer look at your document.',
      retake: "We couldn't use this document. See below, then upload another one.",
    }[outcome];
    const whatItIs: string | null = r.document?.what_it_is ?? null;
    const finalMessage = notPoa
      ? `This doesn't look like a proof of address${whatItIs ? ` (it looks like a ${whatItIs})` : ''}. Please upload a document that shows your name and home address.`
      : unread
        ? "We couldn't read this document. Please upload a clearer photo or the original PDF, or type your address instead."
        : message;

    const a = r.address ?? {};
    const address: PoaAddress = {
      street: a.street ?? null,
      building: a.building_or_plot ?? a.unit ?? null,
      village: a.village ?? null,
      cell: a.cell ?? null,
      sector: a.sector ?? a.sub_locality ?? null,
      district: a.district ?? null,
      city: a.city ?? null,
      region: a.region ?? null,
      postalCode: a.postal_code ?? a.po_box ?? null,
      country: (a.country ?? r.document?.country ?? null)?.toLowerCase() ?? null,
      raw: a.raw ?? null,
    };

    const c = v.comparisons ?? {};
    const checks: PoaCheck[] = [];
    const typeLabel = TYPE_LABEL[r.document?.type] ?? 'Other document';
    checks.push(
      notPoa
        ? { label: 'Document type', value: 'Not a proof of address', tone: 'fail' }
        : { label: 'Document type', value: typeLabel, tone: r.document?.type && TYPE_LABEL[r.document.type] ? 'pass' : 'warn' },
    );
    checks.push(
      {
        pass: { label: 'Name on the document', value: 'Matches your ID', tone: 'pass' as PoaTone },
        review: { label: 'Name on the document', value: 'Partly matches your ID', tone: 'warn' as PoaTone },
        fail: { label: 'Name on the document', value: codes.has('NAME_NOT_FOUND') ? 'Not found' : "Doesn't match your ID", tone: 'fail' as PoaTone },
        not_available: { label: 'Name on the document', value: 'Not compared', tone: 'na' as PoaTone },
      }[c.name_vs_id?.status as string] ?? { label: 'Name on the document', value: 'Not compared', tone: 'na' },
    );
    if (declared) {
      checks.push(
        {
          pass: { label: 'Address', value: 'Matches what you entered', tone: 'pass' as PoaTone },
          review: { label: 'Address', value: 'Partly matches what you entered', tone: 'warn' as PoaTone },
          fail: { label: 'Address', value: codes.has('ADDRESS_NOT_FOUND') ? 'Not found on the document' : "Doesn't match what you entered", tone: 'fail' as PoaTone },
          not_available: { label: 'Address', value: 'Not compared', tone: 'na' as PoaTone },
        }[c.address_vs_declared?.status as string] ?? { label: 'Address', value: 'Not compared', tone: 'na' },
      );
    } else {
      checks.push({ label: 'Address', value: address.raw ? 'Found on the document' : 'Not found on the document', tone: address.raw ? 'pass' : 'fail' });
    }
    if (c.address_vs_id?.status === 'pass' || c.address_vs_id?.status === 'review') {
      checks.push({
        label: 'Compared with your ID',
        value: c.address_vs_id.status === 'pass' ? 'Same address as your ID' : 'Different from your ID (that is fine if you moved)',
        tone: c.address_vs_id.status === 'pass' ? 'pass' : 'na',
      });
    }
    const rec = v.recency ?? {};
    checks.push(
      rec.days_old == null
        ? { label: 'Issued', value: 'Date not found', tone: 'warn' }
        : rec.status === 'pass'
          ? { label: 'Issued', value: rec.days_old <= 1 ? 'In the last day' : `${rec.days_old} days ago`, tone: 'pass' }
          : rec.status === 'fail'
            ? { label: 'Issued', value: `More than ${Math.round(rec.max_days / 30)} months ago`, tone: 'fail' }
            : { label: 'Issued', value: 'Date looks wrong', tone: 'warn' },
    );

    // Comparing names and dates on a receipt or an ID card means nothing: show only the verdict.
    if (notPoa) checks.splice(1);

    const tips = notPoa
      ? [] // the message already says what to upload instead
      : [...new Set(reasons.filter((x) => TIPS[x.code] && x.tone !== 'pass').map((x) => TIPS[x.code]))];
    // For an upload that is not a proof of address, say what it is and who issued it, nothing more
    // (an ID card's details are not ours to echo back, and its dates are not billing periods).
    const details = buildDetails(r);
    const shown = notPoa ? details.filter((d) => d.label === 'Document' || d.label === 'Issued by') : details;
    const reference = 'POA-' + randomBytes(4).toString('hex').toUpperCase();
    // Kept only encrypted. If encryption is unavailable nothing is kept (the applicant can
    // still continue; the reviewer just has no stored report for this reference).
    const sealed = await this.vault.seal({ report: r, address, declared, subject, at: Date.now() } satisfies Stored);
    if (sealed) this.store.set(reference, sealed);

    return {
      ok: true,
      reference,
      outcome,
      message: finalMessage,
      isProofOfAddress: !notPoa,
      whatItIs,
      details: shown,
      document: { type: typeLabel, issuer: r.issuer?.name ?? null, issued: r.document?.issue_date ?? null },
      holderName: r.holder?.names?.[0] ?? null,
      address,
      checks,
      tips,
      // The full report never goes to the applicant's browser: operators read it from the record.
    };
  }

  /**
   * The address the applicant confirmed. Any field changed from what the document says is
   * recorded for the reviewer (people fix reading mistakes, but also try to swap an address).
   */
  async confirm(input: { reference?: string; address: Partial<PoaAddress> & { typed?: string } }, ip: string) {
    if (!this.limiter.take(`poac:ip:${ip}`, 30, 60 * MIN)) tooMany();
    const sealed = input.reference ? this.store.get(input.reference) : undefined;
    const stored = sealed ? await this.vault.open<Stored>(sealed) : null;
    // Compare with exactly what the confirm screen showed, so an untouched field never counts as edited.
    const shown = shownFields(stored?.address);
    const edited = stored
      ? (Object.keys(shown) as (keyof typeof shown)[]).filter(
          (k) => input.address[k] !== undefined && norm(input.address[k] as string) !== norm(shown[k]),
        )
      : [];
    if (stored) {
      stored.confirmed = { address: input.address, edited, at: Date.now() };
      const again = await this.vault.seal(stored);
      if (again) this.store.set(input.reference!, again);
    }
    return {
      ok: true as const,
      reference: input.reference ?? null,
      source: input.reference ? ('document' as const) : ('typed' as const),
      edited,
    };
  }

  /** The full internal report (forgery signals included) for the verification record. */
  async internal(reference: string) {
    const sealed = this.store.get(reference);
    return sealed ? ((await this.vault.open<Stored>(sealed)) ?? undefined) : undefined;
  }

  async report(reference: string) {
    if (!this.exposeReport) return undefined;
    const sealed = this.store.get(reference);
    return sealed ? ((await this.vault.open<Stored>(sealed)) ?? undefined) : undefined;
  }
}

/** The address as the confirm screen pre-fills it (same rules as address-steps.tsx). */
function shownFields(a: PoaAddress | undefined) {
  const area = [...new Set([a?.sector, a?.village, a?.cell].filter((x): x is string => !!x?.trim()))].join(', ');
  const street = a?.street ?? (!a?.city && a?.raw ? a.raw : '');
  return {
    street: street ?? '',
    building: a?.building ?? '',
    sector: area,
    district: a?.district ?? '',
    city: a?.city ?? '',
    postalCode: a?.postalCode ?? '',
    country: a?.country ?? '',
  };
}
