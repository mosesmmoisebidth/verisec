import { Body, Controller, ForbiddenException, Get, HttpCode, HttpException, HttpStatus, Logger, NotFoundException, Param, PayloadTooLargeException, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

import { AuthService } from '../auth/auth.service';
import { clientIp } from './client-ip';
import { DeviceService } from './device.service';
import { DocumentsService } from './documents.service';
import { KycEvents } from './kyc-events';
import { RecordsService, type Attempt, type RecordSections } from './records.service';
import { BrandingService } from './branding.service';
import { RateLimiter } from './stores';
import { ageVerdict, applicantOutcome, decide } from './verifications.view';
import { resumeFacts } from './resume.view';
import { DpopGuard, PublicKyc, SessionContextInterceptor, TenantOnly } from './dpop.guard';
import { KycService } from './kyc.service';
import { PoaService } from './poa.service';
import { SessionsService, type HandoffStep } from './sessions.service';
import { DOCUMENT_TYPES, includes, type CheckId } from './workflows';
import { detectedDocument, DOCUMENT_LABEL } from './document-class';
import { WorkflowsService } from './workflows.service';
import { CreditsService } from './credits.service';
import { checksRan, holdFor } from './billing-items';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { maskEmail } from './verifications.controller';

class PhoneDto {
  @IsString() @Length(6, 24) phone!: string;
}
class PhoneCodeDto extends PhoneDto {
  @IsString() @Length(4, 10) code!: string;
}
class EmailDto {
  @IsString() @Length(3, 254) email!: string;
}
class EmailCodeDto extends EmailDto {
  @IsString() @Length(4, 10) code!: string;
}
class ScreenDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}(-\d{2}(-\d{2})?)?$/) dob?: string;
  @IsOptional() @IsString() @MaxLength(3) nationality?: string;
  @IsOptional() @IsString() @MaxLength(3) documentCountry?: string;
  @IsOptional() @IsString() @MaxLength(3) declaredCountry?: string;
  @IsOptional() @IsString() @MaxLength(24) phone?: string;
  @IsOptional() @IsString() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(128) @Matches(/^[\x21-\x7e]*$/) walletAddress?: string;
  @IsOptional() @IsInt() @Min(0) @Max(50) livenessAttempts?: number;
  @IsOptional() @IsBoolean() faceMatched?: boolean;
  @IsOptional() @IsBoolean() documentQualityOverride?: boolean;
  @IsOptional() @IsString() @MaxLength(600) phoneToken?: string;
  @IsOptional() @IsString() @MaxLength(900) emailToken?: string;
  @IsOptional() @IsString() @MaxLength(64) deviceId?: string;
}

/** Images encrypted in the browser (compact JWE with the upload key). This API cannot read them. */
class IdvReadDto {
  @IsString() @MaxLength(14_000_000) @Matches(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*){4}$/) front!: string;
  @IsOptional() @IsString() @MaxLength(14_000_000) @Matches(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*){4}$/) back?: string;
}
class FaceMatchDto {
  @IsString() @MaxLength(14_000_000) @Matches(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*){4}$/) selfie!: string;
  @IsString() @MaxLength(14_000_000) @Matches(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*){4}$/) portrait!: string;
  /** Whether the selfie passed the passive liveness check the browser ran before the match. */
  @IsOptional() @IsBoolean() liveness?: boolean;
}

/** The browser coming back to a verification: `announce` puts the return on the timeline (once per visit). */
class ResumeDto {
  @IsOptional() @IsBoolean() announce?: boolean;
}

/** A step the browser reports that the server cannot observe itself (e.g. confirmed fields). */
class EventDto {
  @IsString() @Matches(/^(identity|document|liveness|attempt|completed)$/) type!: string;
  @IsOptional() data?: Record<string, unknown>;
  /** Liveness selfie, encrypted in the browser (JWE). */
  @IsOptional() @IsString() @MaxLength(14_000_000) @Matches(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*){4}$/) file?: string;
}

/** Browser device signals (lib/verify/device-signals.ts). Untrusted: size-capped and flattened. */
class DeviceDto {
  @IsString() @Matches(/^(open|camera|final)$/) stage!: string;
  @IsObject() signals!: Record<string, unknown>;
}

/** A face step moved to the applicant's phone (this browser has no usable camera). */
class HandoffDto {
  @IsString() @Matches(/^(liveness|face-match)$/) step!: string;
  /** Sealed in the browser (AES-GCM) with a key the server never sees. */
  @IsOptional() @IsString() @MaxLength(4_000_000) @Matches(/^[A-Za-z0-9_-]+$/) payload?: string;
}
class HandoffExchangeDto {
  @IsString() @Length(20, 200) code!: string;
}
class HandoffDoneDto {
  @IsString() @MaxLength(4_000_000) @Matches(/^[A-Za-z0-9_-]+$/) result!: string;
}

class SessionCreateDto {
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
}
class SessionExchangeDto {
  @IsString() @Length(20, 200) clientSecret!: string;
  /** The link's access code, when the operator gave one with the link. */
  @IsOptional() @IsString() @MaxLength(12) accessCode?: string;
}

class DevSessionDto {
  /** An operator's preview of one of their workflows (or a template); none = their default. */
  @IsOptional() @IsString() @MaxLength(80) workflowId?: string;
  @IsOptional() @IsString() @MaxLength(80) template?: string;
}

class PoaSubjectDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}(-\d{2}(-\d{2})?)?$/) dob?: string;
  @IsOptional() @IsString() @MaxLength(300) idAddress?: string;
  @IsOptional() @IsString() @MaxLength(3) country?: string;
}
class PoaAnalyzeDto {
  /** The file encrypted in the browser: compact JWE (RSA-OAEP-256 + A256GCM) with the upload key.
   *  This API cannot decrypt it. 10 MB of file is about 13.4 MB of JWE. */
  @IsString() @MaxLength(14_000_000) @Matches(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*){4}$/) document!: string;
  @IsOptional() @IsString() @MaxLength(200) filename?: string;
  @IsOptional() @IsString() @MaxLength(300) declaredAddress?: string;
  @IsOptional() @ValidateNested() @Type(() => PoaSubjectDto) subject?: PoaSubjectDto;
}
class PoaAddressDto {
  @IsOptional() @IsString() @MaxLength(160) street?: string;
  @IsOptional() @IsString() @MaxLength(80) building?: string;
  @IsOptional() @IsString() @MaxLength(80) village?: string;
  @IsOptional() @IsString() @MaxLength(80) cell?: string;
  @IsOptional() @IsString() @MaxLength(80) sector?: string;
  @IsOptional() @IsString() @MaxLength(80) district?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(3) country?: string;
  @IsOptional() @IsString() @MaxLength(300) typed?: string;
}
class PoaConfirmDto {
  @IsOptional() @IsString() @MaxLength(20) reference?: string;
  @IsDefined() @ValidateNested() @Type(() => PoaAddressDto) address!: PoaAddressDto;
}


/**
 * Applicant contact verification and screening for the KYC flow. The browser
 * calls only these routes; the intelligence API on Contabo (Twilio, yente,
 * IP reputation) is never exposed to it directly.
 */
@Controller('api/kyc')
@UseGuards(DpopGuard)
@UseInterceptors(SessionContextInterceptor)
export class KycController {
  private readonly log = new Logger('Kyc');
  /** Tries the browser reports that ended without a result: capped per verification, so the record stays readable. */
  private readonly stoppedTries = new RateLimiter();

  constructor(
    private readonly device: DeviceService,
    private readonly kyc: KycService,
    private readonly poa: PoaService,
    private readonly sessions: SessionsService,
    private readonly documents: DocumentsService,
    private readonly records: RecordsService,
    private readonly auth: AuthService,
    private readonly workflows: WorkflowsService,
    private readonly events: KycEvents,
    private readonly credits: CreditsService,
    private readonly notes: NotificationsService,
    private readonly mail: MailService,
    private readonly branding: BrandingService,
  ) {}

  /**
   * The session's workflow must include the check: what the applicant's browser asks for is
   * never trusted to decide which checks run (a check a workflow leaves out cannot be called).
   */
  private async need(req: Request, check: CheckId) {
    const w = await this.workflows.forSession(this.sid(req));
    if (!includes(w?.definition ?? null, check)) throw new ForbiddenException({ ok: false, reason: 'This check is not part of this verification.' });
    return w;
  }

  /** What this verification runs: the browser shows only these steps. */
  @Post('plan') @HttpCode(200)
  plan(@Req() req: Request) {
    return this.workflows.planFor(this.sid(req));
  }

  private sid(req: Request) {
    return (req as Request & { kycSession?: string }).kycSession;
  }

  /** Set when the request comes from a phone doing one face step of this verification (see SessionsService). */
  private handoff(req: Request) {
    return (req as Request & { kycHandoff?: { id: string; step: HandoffStep; jkt: string } }).kycHandoff;
  }

  /** Steps only the browser sees (confirmed ID fields, liveness outcome, the end of the flow). */
  @Post('events') @HttpCode(200)
  async event(@Body() dto: EventDto, @Req() req: Request) {
    const sid = this.sid(req);
    // a finished verification takes no more steps: only asking for its decision again is answered
    if (dto.type !== 'completed' && sid && this.sessions.isComplete(sid))
      throw new HttpException(
        { ok: false, error: 'session_complete', reason: "This verification can't be opened again. You can close this page." },
        HttpStatus.GONE,
      );
    // a phone doing the face check records that check and nothing else
    if (this.handoff(req) && dto.type !== 'liveness' && dto.type !== 'attempt')
      throw new ForbiddenException({ ok: false, reason: 'This page can only do the face check.' });
    const data = clean(dto.data ?? {});
    if (dto.type === 'identity' || dto.type === 'document') await this.need(req, 'document');
    if (dto.type === 'liveness') await this.need(req, 'liveness');
    if (dto.type === 'identity') {
      // the document's kind is the one the server's read found (set at idv/read), never the browser's claim; a kind
      // this workflow does not accept is refused here too, so no browser can confirm its way past it
      const rec = sid ? await this.records.get(sid) : null;
      const seen = rec?.meta.document_type ?? null;
      const w = await this.workflows.forSession(sid);
      const accepts = w?.policy?.documentTypes ?? [];
      const restricted = accepts.length > 0 && accepts.length < DOCUMENT_TYPES.length;
      // a strict workflow never confirms a document its read did not classify as an accepted kind
      if (restricted && !seen)
        throw new ForbiddenException({
          ok: false,
          error: 'document_not_accepted',
          reason: `This verification accepts only ${accepts.map((a) => `a ${DOCUMENT_LABEL[a as keyof typeof DOCUMENT_LABEL] ?? a}`).join(' or ')}, and your document could not be recognised as one.`,
        });
      if (seen && accepts.length && !accepts.includes(seen))
        throw new ForbiddenException({
          ok: false,
          error: 'document_not_accepted',
          reason: `This verification does not accept a ${DOCUMENT_LABEL[seen as keyof typeof DOCUMENT_LABEL] ?? seen}. Please upload ${accepts.map((a) => `a ${DOCUMENT_LABEL[a as keyof typeof DOCUMENT_LABEL] ?? a}`).join(' or ')}.`,
        });
      await this.records.put(sid, 'identity', { ...data, ...(seen ? { documentType: seen } : {}), confirmedAt: new Date().toISOString() }, {
        event: { type: 'document', label: 'Document details confirmed' }, step: 'identity', name: String(data.name ?? ''),
        meta: { document_type: seen ?? str(data.documentType), country: str(data.documentCountry) },
      });
      this.events.emit(sid, 'verification.step_completed', { step: 'document' });
    } else if (dto.type === 'document' && data.ok === false && data.blocked) {
      // the document check stopped the applicant on this upload (glare, not sharp, front and back not matching): it
      // is a try that was not accepted. Its photos stop being the verification's document and the step stays open,
      // so the record shows them still at the document step, with why.
      const quality = data.blocked === 'quality-retake';
      const reason = text(data.reason, 200);
      const t = await this.records.amendLastTry(
        sid,
        'document',
        { outcome: quality ? 'retake' : 'not-accepted', reason, ...crossMatched(data.crossMatch) },
        { tone: 'fail', label: quality ? 'Document photo not clear enough: a new photo was asked for' : 'Document not accepted: a new upload was asked for' },
      );
      if (t) await Promise.all([this.records.moveFile(sid, t.fileId, 'document_refused'), this.records.moveFile(sid, t.backFileId, 'document_refused_back')]);
    } else if (dto.type === 'document') {
      await this.records.put(sid, 'document', { ...data, readAt: new Date().toISOString() }, { step: 'document' });
      // the upload went on: what the front and back agreed on goes on its try, and a photo let through despite low
      // quality is marked as accepted with a warning (amber), with the problems
      const warning = data.qualityAllowed ? text(data.warning, 200) : null;
      const agree = (data.crossMatch as { agree?: unknown } | undefined)?.agree === true;
      await this.records.amendLastTry(
        sid,
        'document',
        { ...crossMatched(data.crossMatch), ...(data.qualityAllowed ? { reason: warning } : {}) },
        data.qualityAllowed
          ? {
              tone: 'review',
              label: agree
                ? 'Document accepted with a warning: low photo quality, the front and back details agree'
                : 'Document accepted with a warning: low photo quality after a second try',
            }
          : {},
      );
    } else if (dto.type === 'liveness') {
      const fileId = dto.file ? await this.records.addFile(sid, 'selfie', dto.file) : null;
      const attempt: Attempt = { kind: 'liveness', outcome: data.passed ? 'passed' : 'failed', mode: str(data.mode) ?? null, fileId };
      await this.records.put(sid, 'face', { liveness: { ...data, at: new Date().toISOString() } }, {
        event: data.passed
          ? { type: 'selfie', tone: 'pass', stage: 'face', label: 'Liveness passed: a live person', attempt }
          : { type: 'selfie', tone: 'fail', stage: 'face', label: 'Liveness failed: not confirmed as a live person', attempt },
        step: 'liveness',
      });
      this.events.emit(sid, 'face.liveness.completed', { liveness: data.passed ? 'passed' : 'not_confirmed' });
      this.events.emit(sid, 'verification.step_completed', { step: 'liveness' });
    } else if (dto.type === 'attempt') {
      // a face check that ended without a result: the camera check failed, or the applicant closed it
      await this.need(req, 'liveness');
      if (sid && this.stoppedTries.take(sid, 20, 60 * 60_000)) {
        const outcome = data.outcome === 'cancelled' ? 'cancelled' : 'error';
        const reason = text(data.reason, 160);
        await this.records.put(sid, null, null, {
          event: {
            type: 'selfie',
            tone: 'fail',
            stage: 'face',
            label: outcome === 'cancelled' ? 'Face check closed before it finished' : 'Face check did not finish',
            attempt: { kind: 'liveness', outcome, reason },
          },
        });
      }
    } else if (dto.type === 'completed') {
      const rec = sid ? await this.records.get(sid) : null;
      // decided once: a repeated "completed" never decides (or notifies) twice
      if (rec && rec.meta.status === 'in_progress') {
        const w = await this.workflows.forSession(sid);
        // other PEOPLE on this device (never the applicant's own earlier sessions)
        const d = decide(rec.data, await this.records.otherPeopleOnDevice(sid), w?.policy ?? null);
        await this.records.put(sid, null, null, {
          event: { type: 'decision', label: `Decision: ${d.verdict.toLowerCase()} (score ${d.score})` },
          meta: { verdict: d.verdict, score: d.score, status: 'completed' }, step: 'completed',
        });
        // from now on the device's session takes no more steps (its token is refused, see SessionsService)
        this.sessions.setStatus(sid!, 'completed');
        this.events.decided(sid, d.verdict, d.score);
        // the applicant's copy of the result, by email (sent once, when the verification is decided)
        void this.emailResult(sid!, rec.meta.tenant, rec.meta.reference, d.verdict, rec.data);
        if (rec.meta.tenant && (d.verdict === 'Needs review' || d.verdict === 'Declined'))
          this.notes.notify(
            d.verdict === 'Needs review'
              ? {
                  org: rec.meta.tenant,
                  audience: 'verifications.summary',
                  kind: 'verification.review',
                  tone: 'warning',
                  title: 'A verification needs your review',
                  body: 'Open the review queue to approve or decline it.',
                  href: '/verifications/?queue=flagged',
                }
              : {
                  org: rec.meta.tenant,
                  audience: 'verifications.summary',
                  kind: 'verification.declined',
                  tone: 'danger',
                  title: 'A verification was declined',
                  body: 'See why in Verifications.',
                  href: '/verifications/',
                },
          );
        // the checks that ran are charged from its hold, the rest goes back (retried by the sweeper if this fails)
        if (w && sid)
          await this.credits
            .settle(sid, checksRan(w.definition, rec.data), `${rec.meta.reference}: verification finished`)
            .catch((e: Error) => this.log.warn(`credits not settled for ${sid}: ${e.message}`));
      }
      // the applicant's own result screen: the decision just made (or made earlier) and only this workflow's checks
      const done = sid ? await this.records.get(sid) : null;
      if (done) {
        const w2 = await this.workflows.forSession(sid);
        // the screen says where the copy of the result goes, only when one is really being sent
        const to = this.deliveryOf(done.data);
        return {
          ok: true,
          outcome: { ...applicantOutcome(done.data, w2?.policy ?? null, done.meta.verdict ?? null, done.meta.reference), emailedTo: to ? maskEmail(to) : null },
        };
      }
    }
    return { ok: true };
  }

  /**
   * Right after the applicant confirms their document details: may they go on? A workflow with a minimum age stops
   * someone whose document shows them under it (unless its rule sends that case to a person instead), so they are not
   * walked through the face steps for a verification that cannot pass. `pending`: the details are not recorded yet.
   */
  @Post('gate') @HttpCode(200)
  async gate(@Req() req: Request) {
    const sid = this.sid(req);
    const rec = sid ? await this.records.get(sid) : null;
    const w = await this.workflows.forSession(sid);
    const policy = w?.policy ?? null;
    if (!rec || policy?.minimumAge == null) return { ok: true, stop: null };
    if (!rec.data.identity) return { ok: true, stop: null, pending: true };
    const age = ageVerdict(rec.data, policy);
    if (age && age.meets === false && !policy.ageReviewOnFail)
      return {
        ok: true,
        stop: {
          code: 'under_minimum_age',
          minimumAge: age.minimumAge,
          reason: `You need to be ${age.minimumAge} or older for this verification, and the date of birth on your document shows you are under ${age.minimumAge}.`,
        },
      };
    return { ok: true, stop: null };
  }

  /** ID document read (front + optional back), encrypted end to end. */
  @Post('idv/read') @HttpCode(200)
  async idvRead(@Body() dto: IdvReadDto, @Req() req: Request) {
    const w = await this.need(req, 'document');
    const sid = this.sid(req);
    // keeping the images on the record runs alongside the read (the applicant waits for the read only); they are kept
    // as a try first and become the verification's document only once the read accepts it
    const [r, frontFile, backFile, earlierRetakes] = await Promise.all([
      this.documents.idvRead(dto.front, dto.back, clientIp(req)),
      this.records.addFile(sid, 'document_refused', dto.front),
      dto.back ? this.records.addFile(sid, 'document_refused_back', dto.back) : Promise.resolve(null),
      this.photoRetakes(sid),
    ]);
    // the kind of document is what the reader saw on the image, never what the browser says was chosen; a workflow
    // that accepts only some kinds refuses the others here (a passport-only workflow refuses a driver's licence)
    const det = detectedDocument(r);
    const accepts = w?.policy?.documentTypes ?? [];
    // a workflow that accepts only some kinds (ID + Liveness + Face Match: national ID cards) is strict: a document the
    // reader could not classify as one of them is refused too (a fake card, a membership card, a photo of anything)
    const restricted = accepts.length > 0 && accepts.length < DOCUMENT_TYPES.length;
    const accepted = det?.type ? !accepts.length || accepts.includes(det.type) : !restricted;
    // what the reader's own classification said, for the record and the server log (never the browser's choice)
    const seenAs = det ? `${det.name || 'unnamed document'}${det.country ? ` (${det.country})` : ''}, type code ${det.code}` : 'no classification';
    this.log.log(`idv/read ${sid}: classified as ${det?.type ?? 'unknown'} [${seenAs}] -> ${accepted ? 'accepted' : 'refused'} (accepts ${accepts.join(',') || 'any'})`);
    if (accepted) await Promise.all([this.records.moveFile(sid, frontFile, 'document_front'), this.records.moveFile(sid, backFile, 'document_back')]);
    const seen = det?.type ? DOCUMENT_LABEL[det.type] : null;
    const attempt: Attempt = {
      kind: 'document',
      outcome: accepted ? 'accepted' : 'refused',
      expected: accepts.map((a) => DOCUMENT_LABEL[a as keyof typeof DOCUMENT_LABEL] ?? a),
      seen,
      seenName: det?.name || null,
      country: det?.country || null,
      fileId: frontFile,
      backFileId: backFile,
    };
    // a refused document never marks the document step done, nor becomes the verification's document type: it stays
    // on the record as a try (its image, what was expected and what it was)
    await this.records.put(sid, null, null, {
      event: accepted
        ? { type: 'document', tone: 'pass', stage: 'document', label: `Document accepted: ${seen ?? 'type not recognised'}`, attempt }
        : {
            type: 'document',
            tone: 'fail',
            stage: 'document',
            label: seen ? `Document refused: a ${seen} is not the expected document` : 'Document refused: not recognised as the expected document',
            attempt,
          },
      ...(accepted ? { step: 'document_read', ...(det?.type ? { meta: { document_type: det.type } } : {}) } : {}),
    });
    return {
      ...(r as Record<string, unknown>),
      // which photo try this is for the verification (earlier ones asked for a clearer photo, + 1), counted on the record
      // so a new tab or device carries on from it: the second try with a photo problem goes on, flagged
      verisec: { documentType: det?.type ?? null, recognised: !!det?.type, accepted, accepts, photoTry: earlierRetakes + 1 },
    };
  }

  /** How many uploads of this verification were sent back for a clearer photo so far. */
  private async photoRetakes(sid: string | undefined): Promise<number> {
    if (!sid) return 0;
    const rec = await this.records.get(sid).catch(() => null);
    return (rec?.data.timeline ?? []).filter((e) => e.attempt?.kind === 'document' && e.attempt.outcome === 'retake').length;
  }

  /**
   * Where the applicant's copy of the result goes: the email address they verified during the flow (they proved they
   * own it with a one-time code), or, failing that, the address a link was sent to. Null when neither is valid.
   */
  private deliveryOf(data: RecordSections): string | null {
    const ok = (v: unknown) => {
      const s = String(v ?? '').trim();
      return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s) ? s : null;
    };
    const contact = (data.contact as { email?: { address?: unknown; verified?: unknown } } | undefined)?.email;
    const verified = contact?.verified ? ok(contact.address) : null;
    return verified ?? ok((data.delivery as { email?: unknown } | undefined)?.email);
  }

  /** Email the applicant their result (the outcome only, never the reasons) and note it on the timeline. */
  private async emailResult(sid: string, tenant: string, reference: string, verdict: string, data: RecordSections) {
    const to = this.deliveryOf(data);
    if (!to) return;
    try {
      const orgName = (await this.auth.orgDisplayName(tenant).catch(() => null)) ?? 'The organisation';
      await this.mail.sendVerificationResult(to, { orgName, verdict, reference });
      await this.records.put(sid, null, null, { event: { type: 'decision', tone: 'info', label: `Result emailed to the applicant (${maskEmail(to)})` } });
    } catch (e) {
      this.log.warn(`result email for ${sid} not sent: ${(e as Error).message}`);
    }
  }

  /** Live selfie vs document portrait, encrypted end to end. */
  @Post('face/match') @HttpCode(200)
  async faceMatch(@Body() dto: FaceMatchDto, @Req() req: Request) {
    const w = await this.need(req, 'face-match');
    const threshold = w?.definition.settings.faceMatchThreshold ?? 0.75;
    const sid = this.sid(req);
    const r = (await this.documents.faceMatch(dto.selfie, dto.portrait, clientIp(req))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const selfieFile = await this.records.addFile(sid, 'selfie', dto.selfie);
    await this.records.addFile(sid, 'portrait', dto.portrait);
    const res = Array.isArray(r?.results) ? r.results[0] : undefined;
    const similarity = typeof res?.similarity === 'number' ? res.similarity : 0;
    const matched = r?.code === 0 && similarity >= threshold;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const attempt: Attempt = {
      kind: 'face-match',
      outcome: matched ? 'passed' : 'failed',
      similarity,
      threshold,
      fileId: selfieFile,
      reason: r?.code === 0 ? null : 'No clear face to compare',
    };
    await this.records.put(sid, 'face', { match: { similarity, matched, threshold, livenessConfirmed: dto.liveness ?? null, at: new Date().toISOString(), detail: clean(stripBlobs(r)) } }, {
      event: matched
        ? { type: 'selfie', tone: 'pass', stage: 'face', label: `Face matched the document photo (${pct(similarity)})`, attempt }
        : r?.code === 0
          ? { type: 'selfie', tone: 'fail', stage: 'face', label: `Face did not match the document photo (${pct(similarity)}, needs ${pct(threshold)})`, attempt }
          : { type: 'selfie', tone: 'fail', stage: 'face', label: 'Face match could not be done: no clear face to compare', attempt },
      step: 'face_match',
    });
    this.events.emit(sid, 'face.match.completed', { match: matched, similarity: Math.round(similarity * 1000) / 1000 });
    this.events.emit(sid, 'verification.step_completed', { step: 'face_match' });
    return r;
  }

  /* ---- sessions (RFC 9449 DPoP) ---- */

  /** The tenant's server opens a verification session and gets a one-time link secret. */
  @Post('sessions') @HttpCode(201) @TenantOnly()
  createSession(@Body() dto: SessionCreateDto) {
    return this.sessions.create('tenant', dto.reference);
  }

  /** DEV ONLY (KYC_DEV_SESSIONS=true): the demo flow opens its own session, no tenant key. */
  @Post('sessions/dev') @HttpCode(201) @PublicKyc()
  async devSession(@Req() req: Request, @Body() dto: DevSessionDto) {
    if (!this.sessions.devSessions) throw new ForbiddenException();
    let org: string | null = null;
    let operator: string | undefined;
    try {
      const s = JSON.parse((req.cookies?.['vs_session'] as string) ?? 'null') as { sessionId?: string } | null;
      const who = s?.sessionId ? await this.auth.sessionOrg(s.sessionId) : null;
      org = who?.orgId ?? null;
      operator = who?.userId;
    } catch {}
    // someone not signed in gets no demo outside local development
    if (!org && !this.sessions.anonDevSessions) throw new ForbiddenException({ ok: false, reason: 'Please open the verification link you were sent.' });
    // the operator's preview runs the workflow they chose (the same one the applicant's link runs)
    const pin = org
      ? await this.workflows.forNewSession(org, { workflowId: dto?.workflowId, template: dto?.template, by: operator }).catch(() => null)
      : null;
    // a signed-in organisation's demo verification uses its credits like any other
    const sessionId = this.sessions.newId();
    const amount = org && pin ? holdFor(pin.definition) : 0;
    if (amount > 0) await this.credits.hold(org!, sessionId, amount, { note: `new verification on ${pin!.name} v${pin!.version}` });
    let made: Awaited<ReturnType<SessionsService['create']>>;
    try {
      made = await this.sessions.create(org ?? `dev:${clientIp(req)}`, undefined, pin ? { id: pin.id, version: pin.version } : undefined, sessionId);
    } catch (e) {
      if (amount > 0) await this.credits.release(sessionId, 'Released: the verification could not be created').catch(() => undefined);
      throw e;
    }
    if (amount > 0) await this.credits.holdRef(sessionId, made.reference).catch(() => undefined);
    return { ok: true as const, clientSecret: made.clientSecret, expiresAt: made.expiresAt };
  }

  /** The applicant's browser swaps the link secret + proof of its key for a key-bound token. */
  @Post('sessions/exchange') @HttpCode(200) @PublicKyc()
  exchange(@Body() dto: SessionExchangeDto, @Req() req: Request) {
    const proof = req.headers['dpop'];
    return this.sessions.exchange(dto.clientSecret, Array.isArray(proof) ? proof[0] : proof, clientIp(req), dto.accessCode);
  }

  /**
   * The applicant's browser coming back to a verification it started (same device, inside the
   * resume window): which parts are finished, where to continue, and the answers later screens
   * need. Contact proofs are issued again for this session with their original times.
   */
  @Post('resume') @HttpCode(200)
  async resume(@Body() dto: ResumeDto, @Req() req: Request) {
    const sid = this.sid(req)!;
    const rec = await this.records.get(sid);
    if (!rec) return { ok: true, status: 'in_progress', progress: false, canRestart: this.sessions.isDevSession(sid) };
    const f = resumeFacts(rec.meta, rec.data, (c, v, at, n) => this.kyc.reissueProof(c, v, at, n));
    if (dto.announce && f.progress && rec.meta.status === 'in_progress') {
      await this.records.put(sid, null, null, { event: { type: 'opened', label: `Applicant came back (stopped at ${f.nextLabel.toLowerCase()})` } });
    }
    const until = this.sessions.resumeUntilOf(sid);
    return {
      ok: true,
      status: rec.meta.status,
      startedAt: new Date(rec.meta.created_at).toISOString(),
      resumeUntil: until ? new Date(until).toISOString() : null,
      canRestart: this.sessions.isDevSession(sid),
      ...f,
    };
  }

  /**
   * Who asked the applicant to verify: the display name of the organisation that opened this
   * session. A demo session no organisation opened is shown as VeriSec itself.
   */
  @Post('brand') @HttpCode(200)
  async brand(@Req() req: Request) {
    const tenant = await this.sessions.tenantOf(this.sid(req)!);
    const real = tenant && /^\d{6,32}$/.test(tenant) ? tenant : '';
    // The applicant sees the organisation's branding first (company name, logo, where to return),
    // falling back to the org's own name, then VeriSec for a demo session no organisation opened.
    const [orgName, b] = await Promise.all([
      real ? this.auth.orgDisplayName(real).catch(() => null) : null,
      real ? this.branding.get(real).catch(() => null) : null,
    ]);
    return {
      ok: true as const,
      name: b?.companyName?.trim() || orgName?.trim() || 'VeriSec',
      logoUrl: b?.logo ?? null,
      returnUrl: b?.returnUrl ?? null,
    };
  }

  @Post('phone/check') @HttpCode(200)
  async phoneCheck(@Body() dto: PhoneDto, @Req() req: Request) {
    await this.need(req, 'phone');
    return this.kyc.phoneCheck(dto.phone, clientIp(req));
  }

  @Post('phone/send') @HttpCode(200)
  async phoneSend(@Body() dto: PhoneDto, @Req() req: Request) {
    await this.need(req, 'phone');
    return this.kyc.phoneSend(dto.phone, clientIp(req));
  }

  @Post('phone/verify') @HttpCode(200)
  async phoneVerify(@Body() dto: PhoneCodeDto, @Req() req: Request) {
    await this.need(req, 'phone');
    const r = await this.kyc.phoneVerify(dto.phone, dto.code, clientIp(req));
    if (r.verified) {
      // the attempts it took are kept, so a resumed session's proof says the same
      const attempts = this.kyc.proofOf(r.token, 'phone', dto.phone)?.attempts ?? 1;
      await this.records.put(this.sid(req), 'contact', { phone: { e164: dto.phone, verified: true, verifiedAt: new Date().toISOString(), attempts } }, {
        event: { type: 'opened', label: 'Phone number verified' }, step: 'phone',
      });
      this.events.emit(this.sid(req), 'verification.step_completed', { step: 'phone' });
    }
    return r;
  }

  @Post('email/check') @HttpCode(200)
  async emailCheck(@Body() dto: EmailDto, @Req() req: Request) {
    await this.need(req, 'email');
    const c = await this.kyc.emailCheck(dto.email, clientIp(req));
    // Applicant-facing fields only.
    return { ok: true, exists: c.deliverable !== 'no', deliverable: c.deliverable, suggestion: c.suggestion, reason: c.reason };
  }

  @Post('email/send') @HttpCode(200)
  async emailSend(@Body() dto: EmailDto, @Req() req: Request) {
    await this.need(req, 'email');
    return this.kyc.emailSend(dto.email, clientIp(req));
  }

  @Post('email/verify') @HttpCode(200)
  async emailVerify(@Body() dto: EmailCodeDto, @Req() req: Request) {
    await this.need(req, 'email');
    const r = await this.kyc.emailVerify(dto.email, dto.code, clientIp(req));
    if (r.verified) {
      const attempts = this.kyc.proofOf(r.token, 'email', dto.email.trim().toLowerCase())?.attempts ?? 1;
      await this.records.put(this.sid(req), 'contact', { email: { address: dto.email, verified: true, verifiedAt: new Date().toISOString(), attempts } }, {
        event: { type: 'opened', label: 'Email address verified' }, step: 'email',
      });
      this.events.emit(this.sid(req), 'verification.step_completed', { step: 'email' });
    }
    return r;
  }

  @Post('screen') @HttpCode(200)
  async screen(@Body() dto: ScreenDto, @Req() req: Request) {
    const w = (await this.workflows.forSession(this.sid(req)))?.definition ?? null;
    if (!includes(w, 'aml') && !includes(w, 'phone') && !includes(w, 'email') && !includes(w, 'device-ip')) {
      throw new ForbiddenException({ ok: false, reason: 'This check is not part of this verification.' });
    }
    // the watchlists, the phone and the email are screened only when the workflow runs them
    const input: ScreenDto = {
      ...dto,
      name: includes(w, 'aml') ? dto.name : undefined,
      phone: includes(w, 'phone') ? dto.phone : undefined,
      phoneToken: includes(w, 'phone') ? dto.phoneToken : undefined,
      email: includes(w, 'email') ? dto.email : undefined,
      emailToken: includes(w, 'email') ? dto.emailToken : undefined,
    };
    const r = await this.kyc.screen(input, clientIp(req));
    const internal = (await this.kyc.report(r.reference)) as Record<string, unknown> | undefined;
    await this.records.put(this.sid(req), 'screening', { reference: r.reference, outcome: r.outcome, findings: r.findings, risk: internal ?? null }, {
      event: { type: 'decision', label: r.outcome === 'approved' ? 'Screening: no concerns' : 'Screening: needs review' }, step: 'screening',
    });
    this.events.emit(this.sid(req), 'verification.step_completed', { step: 'screening', outcome: r.outcome });
    if (input.name) {
      // watchlist hits still standing after review rules (confirmed or possible), never who they are
      const listed = (internal?.screening as { hits?: { status?: string }[] } | null | undefined)?.hits ?? [];
      const hits = listed.filter((h) => h.status === 'confirmed' || h.status === 'possible').length;
      const level = typeof internal?.level === 'string' ? internal.level : null;
      this.events.emit(this.sid(req), 'aml.screening.completed', { outcome: r.outcome, hits, risk_level: level });
      if (hits > 0) this.events.emit(this.sid(req), 'aml.hit', { hits, risk_level: level });
    }
    await this.records.put(this.sid(req), 'device', {
      atScreening: { ip: clientIp(req), deviceId: dto.deviceId ?? null, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) },
    });
    return r;
  }

  /**
   * Device & IP signals from the applicant's browser (at open, and again once the camera is
   * allowed). Analysed and stored encrypted; the applicant only ever gets { ok: true }.
   */
  @Post('device') @HttpCode(200)
  async deviceSignals(@Body() dto: DeviceDto, @Req() req: Request) {
    const sid = this.sid(req);
    const ip = clientIp(req);
    // the applicant still only ever gets { ok: true }; the team's log says why a report was not analysed
    if (!sid) {
      this.log.warn(`device report (${dto.stage}) not analysed: no verification session on the request`);
      return { ok: true };
    }
    if (!this.device.allowed(sid, ip)) {
      this.log.warn(`device ${sid} ${dto.stage}: not analysed, too many reports for this session or address`);
      return { ok: true };
    }
    // a workflow without device checks keeps no device signals
    if (!includes((await this.workflows.forSession(sid))?.definition ?? null, 'device-ip')) {
      this.log.log(`device ${sid} ${dto.stage}: not analysed, this workflow has no device check`);
      return { ok: true };
    }
    if (JSON.stringify(dto.signals).length > 64_000) throw new PayloadTooLargeException();
    await this.device.analyze(sid, clean(dto.signals), req, ip, dto.stage, this.handoff(req)?.jkt).catch((e) => this.log.error(`device ${sid}: ${(e as Error).message}`));
    return { ok: true };
  }

  /* ---- a face step on the applicant's phone (this browser has no usable camera, e.g. Tor Browser) ---- */

  /** The device holding the verification asks for a one-time code; the phone opens a link with it. */
  @Post('handoff') @HttpCode(200)
  async handoffCreate(@Body() dto: HandoffDto, @Req() req: Request) {
    const step = dto.step as HandoffStep;
    await this.need(req, step === 'liveness' ? 'liveness' : 'face-match');
    const made = this.sessions.createHandoff(this.sid(req)!, step, dto.payload);
    return { ok: true as const, code: made.code, expiresAt: made.expiresAt };
  }

  /** The computer waits for its phone: waiting, opened, expired, or done with the sealed result. */
  @Post('handoff/status') @HttpCode(200)
  handoffStatus(@Req() req: Request) {
    return { ok: true as const, ...this.sessions.handoffStatus(this.sid(req)!) };
  }

  /** The computer stopped waiting: the code and the phone token stop working. */
  @Post('handoff/cancel') @HttpCode(200)
  handoffCancel(@Req() req: Request) {
    this.sessions.cancelHandoff(this.sid(req)!);
    return { ok: true as const };
  }

  /** The phone swaps the code + proof of its own key for a token for that one face step. */
  @Post('handoff/exchange') @HttpCode(200) @PublicKyc()
  handoffExchange(@Body() dto: HandoffExchangeDto, @Req() req: Request) {
    const proof = req.headers['dpop'];
    return this.sessions.exchangeHandoff(dto.code, Array.isArray(proof) ? proof[0] : proof, clientIp(req));
  }

  /** The phone finished its face step: the sealed result waits for the computer, the phone token stops working. */
  @Post('handoff/done') @HttpCode(200)
  handoffDone(@Body() dto: HandoffDoneDto, @Req() req: Request) {
    const h = this.handoff(req);
    if (!h) throw new ForbiddenException({ ok: false, reason: 'Only the phone doing the face check can finish it.' });
    this.sessions.finishHandoff(h.id, dto.result);
    return { ok: true as const };
  }

  /** The public key the browser encrypts documents with before upload (JWKS). */
  @Post('keys/upload') @HttpCode(200)
  uploadKey() {
    return this.poa.uploadKey();
  }

  /** Proof of address: read and check the uploaded document against the ID and the typed address. */
  @Post('poa/analyze') @HttpCode(200)
  async poaAnalyze(@Body() dto: PoaAnalyzeDto, @Req() req: Request) {
    await this.need(req, 'address');
    const sid = this.sid(req);
    // the copy kept on the record is written alongside the check, never before it
    const [r] = await Promise.all([this.poa.analyze(dto, clientIp(req)), this.records.addFile(sid, 'address_document', dto.document)]);
    const { report: _r, ...safe } = r as typeof r & { report?: unknown };
    await this.records.put(sid, 'address', { ...safe, internal: (await this.poa.internal(r.reference)) ?? null }, {
      event: { type: 'document', label: `Proof of address uploaded (${r.outcome})` }, step: 'address',
    });
    return r;
  }

  /** The address the applicant confirmed (edits against the document are recorded). */
  @Post('poa/confirm') @HttpCode(200)
  async poaConfirm(@Body() dto: PoaConfirmDto, @Req() req: Request) {
    await this.need(req, 'address');
    const r = await this.poa.confirm(dto, clientIp(req));
    await this.records.put(this.sid(req), 'address', { confirmed: dto.address, edited: r.edited, source: r.source }, {
      event: { type: 'document', label: r.edited.length ? `Address confirmed (edited: ${r.edited.join(', ')})` : 'Address confirmed' }, step: 'address_confirmed',
    });
    this.events.emit(this.sid(req), 'verification.step_completed', { step: 'address' });
    return r;
  }

  /** Reviewer view of a proof-of-address report. Dev only until console auth guards it. */
  @Get('poa/reports/:ref') @TenantOnly()
  async poaReport(@Param('ref') ref: string) {
    const r = await this.poa.report(ref);
    if (!r) throw new NotFoundException();
    return r;
  }

  /** Reviewer view of a screening report. Dev only until console auth guards it. */
  @Get('reports/:ref') @TenantOnly()
  async report(@Param('ref') ref: string) {
    const r = this.kyc.exposeReport ? await this.kyc.report(ref) : undefined;
    if (!r) throw new NotFoundException();
    return r;
  }
}

/** Browser-reported data: plain JSON only, bounded sizes (it is stored encrypted, not trusted). */
function clean(v: unknown, depth = 0): Record<string, unknown> {
  const walk = (x: unknown, d: number): unknown => {
    if (d > 4) return null;
    if (typeof x === 'string') return x.slice(0, 2000);
    if (typeof x === 'number' || typeof x === 'boolean' || x === null) return x;
    if (Array.isArray(x)) return x.slice(0, 80).map((y) => walk(y, d + 1));
    if (typeof x === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(x as Record<string, unknown>).slice(0, 80)) o[k.slice(0, 60)] = walk(val, d + 1);
      return o;
    }
    return null;
  };
  return (walk(v, depth) as Record<string, unknown>) ?? {};
}

/** The engine's answer without image data (base64 crops): numbers, codes and boxes only. */
function stripBlobs(v: unknown): unknown {
  if (typeof v === 'string') return v.length > 300 ? undefined : v;
  if (Array.isArray(v)) return v.map(stripBlobs);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripBlobs(x)]).filter(([, x]) => x !== undefined));
  return v;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : undefined;
}

/** What the front and back of an upload agreed on, as the browser reported it (field names only, capped). */
function crossMatched(v: unknown): { matched?: string[]; compared?: number } {
  const fields = Array.isArray((v as { fields?: unknown } | undefined)?.fields) ? ((v as { fields: unknown[] }).fields.slice(0, 40) as Record<string, unknown>[]) : [];
  if (!fields.length) return {};
  const names = (pick: (f: Record<string, unknown>) => boolean) =>
    fields.filter((f) => f && typeof f.name === 'string' && pick(f)).map((f) => String(f.name).slice(0, 60));
  return { matched: names((f) => f.agree === true), compared: fields.length };
}

/** A short sentence from the browser (why a try was not accepted), kept whole up to `max`; null when empty. */
function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}
