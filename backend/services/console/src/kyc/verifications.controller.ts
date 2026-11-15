import {
  BadRequestException,
  Body,
  CanActivate,
  HttpException,
  HttpStatus,
  ConflictException,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { MetricsService } from './metrics.service';
import { WorkflowsService } from './workflows.service';
import { CreditsService } from './credits.service';
import { holdFor } from './billing-items';
import { KycEvents, VERDICT_EVENT } from './kyc-events';
import { RecordsService } from './records.service';
import { SessionsService } from './sessions.service';
import { RateLimiter } from './stores';
import { scoreOf, toDetail, toRow, TRUST_POLICY } from './verifications.view';
import type { Capability, Role } from '../auth/roles';
import { allowed, Need, NeedGuard } from '../auth/roles';
import { maskDetail } from './pii-mask';
import { buildXlsx } from './xlsx';
import { clientIp } from './client-ip';

/** `org`: the operator's organisation. Every record they reach must belong to it. */
export type OperatorRequest = Request & { operator?: string; org?: string; homeOrg?: string; role?: Role; userId?: string; caps?: Capability[] };

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Only a signed-in console operator (Zitadel session in the httpOnly vs_session cookie) may
 * read verification records. Confirmed with Zitadel, cached for a minute.
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  private readonly cache = new Map<string, { who: string; org: string; role: Role; caps: Capability[]; userId: string; at: number; exp: number }>();
  private readonly gateOff: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    // Operator sign-in is not wired on a dev machine yet (same switch as the frontend's NEXT_PUBLIC_AUTH_GATE).
    // CONSOLE_AUTH_GATE=0 lets requests from this computer through; a request from any other host still needs a session.
    this.gateOff = config.get<string>('CONSOLE_AUTH_GATE') === '0';
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<OperatorRequest>();
    if (this.gateOff && LOOPBACK.has(req.socket?.remoteAddress ?? '')) {
      req.operator = 'local-dev';
      req.role = 'owner';
      // signed in on this computer: a new session is still filed under that organisation
      // (lists stay unfiltered on the dev gate)
      try {
        const sid = (JSON.parse((req.cookies?.['vs_session'] as string) ?? 'null') as { sessionId?: string } | null)?.sessionId;
        if (sid) req.homeOrg = (await this.auth.sessionOrg(sid))?.orgId ?? undefined;
      } catch {}
      return true;
    }
    let sessionId: string | undefined;
    try {
      sessionId = (JSON.parse((req.cookies?.['vs_session'] as string) ?? 'null') as { sessionId?: string } | null)?.sessionId;
    } catch {}
    if (!sessionId) throw new UnauthorizedException('Sign in to the console to view verifications.');
    const hit = this.cache.get(sessionId);
    if (hit && hit.exp > Date.now() && !this.auth.changedSince(hit.userId, hit.at)) {
      await this.auth.enforceRequestSecurity(hit.org, sessionId, clientIp(req));
      req.operator = hit.who;
      req.org = hit.org;
      req.role = hit.role;
      req.caps = hit.caps;
      req.userId = hit.userId;
      return true;
    }
    const me = await this.auth.me(sessionId, clientIp(req));
    if (!me?.userId || !me.passwordVerified || !me.orgId) throw new UnauthorizedException('Your console session has ended. Sign in again.');
    const who = me.loginName ?? me.userId;
    const role: Role = me.role ?? 'viewer';
    const caps = (me.capabilities ?? []) as Capability[];
    this.cache.set(sessionId, { who, org: me.orgId, role, caps, userId: me.userId, at: Date.now(), exp: Date.now() + 60_000 });
    req.operator = who;
    req.org = me.orgId;
    req.role = role;
    req.caps = caps;
    req.userId = me.userId;
    this.auth.touch(me.userId, me.orgId);
    return true;
  }
}

/** a•••@example.com: enough for the applicant to know which inbox to look in, nothing more. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** Blur a document/ID number for export: keep only the last two characters, e.g. ••••_89. */
function blurId(v: string): string {
  const s = v.replace(/\s+/g, '');
  return s.length <= 2 ? '••' : `••••${s.slice(-2)}`;
}

/** The dashboard's periods. */
const periodOf = (days?: string) => ([7, 30, 90].includes(Number(days)) ? Number(days) : 30);

const SLOTS = new Set(['document_front', 'document_back', 'selfie', 'portrait', 'address_document']);

/** Verification records for the console (list, detail, stored files, redaction). */
@Controller('api/verifications')
@UseGuards(OperatorGuard, NeedGuard)
export class VerificationsController {
  private readonly origin: string;

  private readonly app: string;
  private readonly echoCode: boolean;
  private readonly relinks = new RateLimiter();

  constructor(
    private readonly records: RecordsService,
    private readonly sessions: SessionsService,
    private readonly metrics: MetricsService,
    private readonly workflows: WorkflowsService,
    private readonly events: KycEvents,
    private readonly credits: CreditsService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.echoCode = config.get<string>('KYC_ACCESS_CODE_ECHO') === 'true';
    this.origin = (config.get<string>('KYC_PUBLIC_ORIGIN') ?? 'https://localhost:3001').replace(/\/$/, '');
    this.app = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  /**
   * A new verification for one applicant, filed under the operator's organisation: the link
   * (and the QR the console draws from it) opens the flow on any device. The link works once,
   * for an hour; the device that opens it can come back to it (see SessionsService).
   */
  /** The organisation's data‑retention window: records older than this are shredded automatically. */
  @Need('verifications.summary')
  @Get('retention')
  async getRetentionSetting(@Req() req: OperatorRequest) {
    return { seconds: await this.records.getRetention(req.org ?? req.homeOrg ?? '') };
  }

  /** Allowed keep-windows (seconds); nothing over 3 years, no custom value. 120 is for testing only. */
  private static readonly RETENTION = new Set([
    120, 1800, 3600, 7200, 18000, 43200, 86400, 604800, 2592000, 7776000, 15552000, 31536000, 63072000, 94608000,
  ]);

  /**
   * How many kept records are already older than a window the operator is about to choose. The console shows this
   * first so an owner can decide, for records older than the new window, between shredding them now and letting
   * them live out one more window.
   */
  @Need('verifications.summary')
  @Get('retention/impact')
  async retentionImpact(@Req() req: OperatorRequest, @Query('seconds') seconds?: string) {
    const s = Number(seconds);
    if (!VerificationsController.RETENTION.has(s)) return { older: 0 };
    return { older: await this.records.retentionImpact(req.org ?? req.homeOrg ?? '', s) };
  }

  @Need('verifications.summary')
  @Patch('retention')
  async setRetentionSetting(@Req() req: OperatorRequest, @Body() body: { seconds?: unknown; applyExisting?: unknown }) {
    if (req.role !== 'owner' && req.role !== 'admin')
      throw new ForbiddenException('Only an owner or admin can change the retention period.');
    const tenant = req.org ?? req.homeOrg ?? '';
    if (body?.seconds === null || body?.seconds === undefined) {
      await this.records.setRetention(tenant, null);
      return { seconds: null };
    }
    const s = Number(body.seconds);
    if (!VerificationsController.RETENTION.has(s))
      throw new BadRequestException('Choose one of the listed retention periods.');
    // applyExisting true: records already past the new window are shredded on the next sweep. false (default):
    // they are given one more window from now before the sweep touches them.
    await this.records.setRetention(tenant, s, body?.applyExisting === true);
    return { seconds: s };
  }

  @Need('run')
  @Post('sessions') @HttpCode(201)
  async newSession(@Req() req: OperatorRequest, @Body() body: { reference?: unknown; workflowId?: unknown; template?: unknown; email?: unknown }) {
    const ref = typeof body?.reference === 'string' ? body.reference.trim().slice(0, 60).replace(/[^\w .\-/]/g, '') : '';
    // the applicant's email: their access code goes there, never to the screen of the organisation that asked
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email))
      throw new BadRequestException({ code: 'email_required', message: "Enter the applicant's email: their access code is sent there." });
    const tenant = req.org ?? req.homeOrg ?? 'local-dev';
    // the workflow or template asked for (or the organisation's default), pinned at its published version
    const wf = await this.workflows.forNewSession(tenant, {
      workflowId: typeof body?.workflowId === 'string' ? body.workflowId : undefined,
      template: typeof body?.template === 'string' ? body.template : undefined,
      by: req.operator,
    });
    // its credits first (the most this workflow can cost); not enough credits, no session
    const sessionId = this.sessions.newId();
    const amount = holdFor(wf.definition);
    if (amount > 0)
      await this.credits.hold(tenant, sessionId, amount, { actor: req.operator, note: `new verification on ${wf.name} v${wf.version}` });
    let s: Awaited<ReturnType<SessionsService['create']>>;
    try {
      // the link's second factor: a 6-digit code, emailed to the applicant (the screen only says where it went)
      s = await this.sessions.create(tenant, ref || undefined, { id: wf.id, version: wf.version }, sessionId, { accessCode: true, hint: maskEmail(email) });
      const orgName = (await this.auth.orgDisplayName(tenant).catch(() => null)) ?? 'An organisation';
      try {
        await this.mail.sendAccessCode(email, { orgName, code: s.accessCode!, minutes: 60 });
      } catch (e) {
        // no code reached them: the verification is undone rather than left unopenable
        await this.records.remove(sessionId).catch(() => undefined);
        throw Object.assign(new Error(`access code email failed: ${(e as Error).message}`), { mailFailed: true });
      }
    } catch (e) {
      await this.credits.release(sessionId, 'Released: the verification could not be created').catch(() => undefined);
      if ((e as { mailFailed?: boolean }).mailFailed)
        throw new HttpException({ code: 'email_failed', message: "We couldn't email the access code. Check the address and try again." }, HttpStatus.BAD_GATEWAY);
      throw e;
    }
    if (amount > 0) await this.credits.holdRef(sessionId, s.reference).catch(() => undefined);
    // where the applicant's copy of their result is emailed once the verification is decided (encrypted with the record)
    await this.records.put(sessionId, 'delivery', { email });
    return {
      ok: true,
      reference: s.reference,
      link: `${this.app}/verify/start?session=${encodeURIComponent(s.clientSecret)}`,
      // where the code went (masked); the code itself only in a test setup (KYC_ACCESS_CODE_ECHO), never in production
      accessSentTo: maskEmail(email),
      ...(this.echoCode ? { accessCode: s.accessCode } : {}),
      expiresAt: s.expiresAt,
      workflow: { id: wf.id, name: wf.name, version: wf.version },
    };
  }

  /** A record the operator may open: it must belong to their organisation (the local dev gate sees all). */
  private async owned(id: string, req: OperatorRequest) {
    const rec = await this.records.get(id);
    if (!rec || (req.org !== undefined && rec.meta.tenant !== req.org)) throw new NotFoundException();
    return rec;
  }

  @Need('verifications.summary')
  @Get()
  async list(@Req() req: OperatorRequest, @Query('q') q?: string, @Query('verdict') verdict?: string, @Query('page') page = '1', @Query('size') size = '20') {
    const limit = Math.min(Math.max(Number(size) || 20, 1), 100);
    const p = Math.max(Number(page) || 1, 1);
    const r = await this.records.list({ search: q?.trim() || undefined, verdict: verdict || undefined, limit, offset: (p - 1) * limit, org: req.org });
    // each row names the workflow version it runs (looked up once per version, cached)
    const names = new Map<string, { name?: string; checks: string[] | null }>();
    for (const { meta: m } of r.rows) {
      const k = `${m.workflow_id}@${m.workflow_version}`;
      if (m.workflow_id && m.workflow_version && !names.has(k)) {
        const w = await this.workflows.pinned(m.workflow_id, m.workflow_version);
        names.set(k, { name: w?.name, checks: w?.policy?.checks ?? null });
      }
    }
    // each row's progress counts only the steps of its own workflow
    const rows = r.rows.map((x) => {
      const w = names.get(`${x.meta.workflow_id}@${x.meta.workflow_version}`);
      return toRow(x.meta, x.identity, w?.name, w?.checks ?? null);
    });
    return { total: r.total, live: r.live, page: p, size: limit, rows };
  }

  /** The dashboard: the organisation's verifications, API calls and the platform's health over 7, 30 or 90 days. */
  @Need('verifications.summary')
  @Get('dashboard')
  dashboard(@Req() req: OperatorRequest, @Query('days') days?: string, @Query('workflow') workflow?: string) {
    return this.metrics.dashboard(req.org, periodOf(days), workflow && /^wf_[0-9a-f]{6,40}$/.test(workflow) ? workflow : undefined);
  }

  /** The dashboard period's verifications as a CSV file (plain columns only, no personal data). */
  @Need('verifications.reveal')
  @Get('export')
  async export(@Req() req: OperatorRequest, @Res() res: Response, @Query('days') days?: string) {
    const d = periodOf(days);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="verisec-verifications-last-${d}-days.csv"`);
    res.send(await this.metrics.exportCsv(req.org, d));
  }

  /**
   * Every verification as an Excel (.xlsx) workbook. Public columns are kept in the clear (reference, name,
   * nationality, country, decision, score, dates); sensitive personal fields are BLURRED before they leave the
   * server — the date of birth is hidden and the document/ID number is masked to its last two characters.
   */
  @Need('verifications.reveal')
  @Get('export.xlsx')
  async exportXlsx(@Req() req: OperatorRequest, @Res() res: Response) {
    const rows = await this.records.exportVerifications(req.org, 10000);
    const headers = [
      'Reference', 'Applicant', 'Nationality', 'Country', 'Document type', 'Date of birth (hidden)',
      'ID / document number (masked)', 'Status', 'Decision', 'Trust score', 'Created (UTC)', 'Completed (UTC)',
    ];
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : v ? String(v) : '');
    const data = rows.map(({ meta, identity }) => {
      const id = (identity ?? {}) as Record<string, unknown>;
      const name = (id.name as string) || (meta.status === 'redacted' ? '[redacted]' : 'New applicant');
      const num = id.documentNumber ?? id.document_number ?? id.number ?? id.docNumber;
      return [
        meta.reference ?? '',
        name,
        (id.nationality as string) ?? '',
        meta.country ?? '',
        meta.document_type ?? '',
        id.dob ? '[hidden]' : '', // date of birth is never exported in the clear
        num ? blurId(String(num)) : '', // document number masked to its last two characters
        meta.status ?? '',
        meta.verdict ?? '',
        meta.score ?? 0,
        iso(meta.created_at),
        iso(meta.completed_at),
      ];
    });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="verisec-verifications-${stamp}.xlsx"`);
    res.send(buildXlsx('Verifications', headers, data));
  }

  @Need('verifications.detail')
  @Get(':id')
  async detail(@Param('id') id: string, @Req() req: OperatorRequest) {
    let rec = await this.owned(id, req);
    // A completed record scored under an earlier Trust Seal policy is re-scored once, openly (a
    // timeline entry says so), so the list, the header and the seal all show the same decision.
    const otherPeople = await this.records.otherPeopleOnDevice(rec.meta.id);
    // decided under the workflow version the verification was created with
    const policy =
      rec.meta.workflow_id && rec.meta.workflow_version ? ((await this.workflows.pinned(rec.meta.workflow_id, rec.meta.workflow_version))?.policy ?? null) : null;
    if (rec.meta.status === 'completed') {
      const s = scoreOf(rec.data, otherPeople, policy);
      if (s.score !== rec.meta.score || s.verdict !== rec.meta.verdict) {
        await this.records.put(rec.meta.id, null, null, {
          event: { type: 'decision', label: `Trust Seal recalculated under policy ${TRUST_POLICY}: ${s.verdict.toLowerCase()} (score ${s.score})` },
          meta: { verdict: s.verdict, score: s.score },
        });
        this.events.emit(rec.meta.id, 'verification.updated', { verdict: VERDICT_EVENT[s.verdict]?.code ?? s.verdict, score: s.score });
        rec = (await this.records.get(id)) ?? rec;
      }
    }
    await this.records.logAccess(rec.meta.id, req.operator ?? 'unknown', 'viewed record');
    const access = await this.records.accessLog(rec.meta.id);
    const detail = toDetail(rec.meta, rec.data, rec.files, (slot) => `${this.origin}/api/verifications/${rec.meta.id}/files/${slot}`, access, otherPeople, policy);
    // a role that may not reveal personal data sees the document number, date of birth, MRZ and images hidden
    return allowed(req, 'verifications.reveal') ? detail : maskDetail(detail);
  }

  @Need('verifications.reveal')
  @Get(':id/files/:slot')
  async file(@Param('id') id: string, @Param('slot') slot: string, @Req() req: OperatorRequest, @Res() res: Response) {
    // a slot (the latest image of its kind), or one try's own image ("attempt-<id>": a refused document, a failed selfie)
    const tryId = /^attempt-(\d{1,18})$/.exec(slot)?.[1];
    if (!SLOTS.has(slot) && !tryId) throw new NotFoundException();
    const rec = await this.owned(id, req);
    const f = tryId ? await this.records.fileById(rec.meta.id, tryId) : await this.records.file(rec.meta.id, slot);
    if (!f) throw new NotFoundException();
    await this.records.logAccess(rec.meta.id, req.operator ?? 'unknown', tryId ? 'viewed an attempt image' : `viewed ${slot.replace('_', ' ')}`);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    // The console page is cross-origin isolated (COEP require-corp): allow our own site to embed
    // the image, and no other site.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.send(f.data);
  }

  /**
   * Stop a verification: from now on its link, and any session already open on it, tell the applicant it was
   * disabled. Enable lets it go on where it was. A finished verification has nothing left to stop.
   */
  @Need('run')
  @Post(':id/disable') @HttpCode(200)
  disable(@Param('id') id: string, @Req() req: OperatorRequest) {
    return this.setDisabled(id, req, true);
  }

  @Need('run')
  @Post(':id/enable') @HttpCode(200)
  enable(@Param('id') id: string, @Req() req: OperatorRequest) {
    return this.setDisabled(id, req, false);
  }

  private async setDisabled(id: string, req: OperatorRequest, off: boolean) {
    const rec = await this.owned(id, req);
    if (off && rec.meta.status === 'disabled') return { ok: true, status: 'disabled' };
    if (!off && rec.meta.status === 'in_progress') return { ok: true, status: 'in_progress' };
    if (rec.meta.status === 'completed') throw new ConflictException({ code: 'complete', message: 'This verification is already complete, so its link no longer opens.' });
    if (rec.meta.status === 'redacted') throw new ConflictException({ code: 'redacted', message: 'This verification was redacted, so its link no longer opens.' });
    if (!(await this.records.setDisabled(rec.meta.id, off))) throw new ConflictException({ code: 'changed', message: 'This verification changed meanwhile. Refresh and try again.' });
    this.sessions.setStatus(rec.meta.id, off ? 'disabled' : 'in_progress');
    await this.records.logAccess(rec.meta.id, req.operator ?? 'unknown', off ? 'disabled verification' : 'enabled verification');
    await this.records.put(rec.meta.id, null, null, {
      event: off ? { type: 'disabled', label: 'Disabled by your team: the link no longer opens' } : { type: 'enabled', label: 'Enabled again by your team' },
    });
    this.events.emit(rec.meta.id, 'verification.updated', { status: off ? 'disabled' : 'in_progress' });
    return { ok: true, status: off ? 'disabled' : 'in_progress' };
  }

  /**
   * A new link and access code for an unfinished verification, to continue it on another device (`send` false: the
   * operator's own, the code goes to their email) or to send it to someone (`send` true: the link is emailed too).
   * The code always goes by email, never to this screen, so whoever opens the link must hold that inbox. The earlier
   * link and the device that held the verification stop working; the flow continues where it stopped.
   */
  @Need('run')
  @Post(':id/link') @HttpCode(200)
  async relink(@Param('id') id: string, @Req() req: OperatorRequest, @Body() body: { email?: unknown; send?: unknown }) {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email)) throw new BadRequestException({ code: 'email_required', message: 'Enter an email: the access code is sent there.' });
    const send = body?.send === true;
    const rec = await this.owned(id, req);
    if (rec.meta.status === 'disabled')
      throw new ConflictException({ code: 'disabled', message: 'This verification is disabled. Enable it again first.' });
    if (rec.meta.status !== 'in_progress')
      throw new ConflictException({ code: 'finished', message: 'This verification is no longer in progress, so it cannot be continued.' });
    // a verification whose time to finish ran out was billed for what ran: it does not open again
    const [b, hold] = await Promise.all([this.records.binding({ id: rec.meta.id }), this.credits.holdStatus(rec.meta.id)]);
    if ((b?.boundKey && b.resumeUntil && Date.now() > b.resumeUntil) || hold === 'settled')
      throw new ConflictException({ code: 'ended', message: 'This verification ended: its time to finish ran out. Start a new verification instead.' });
    if (!this.relinks.take(rec.meta.id, 5, 60 * 60_000))
      throw new HttpException({ code: 'rate_limited', message: 'Too many new links for this verification. Try again in an hour.' }, HttpStatus.TOO_MANY_REQUESTS);
    // its first link was never used and its credits went back: they are set aside again first
    if (hold === 'released') await this.credits.reopen(rec.meta.id, { actor: req.operator, note: `${rec.meta.reference}: new link` });
    const sentTo = maskEmail(email);
    const s = await this.sessions.relink(rec.meta.id, sentTo);
    if (!s) throw new ConflictException({ code: 'changed', message: 'This verification changed meanwhile. Refresh and try again.' });
    const link = `${this.app}/verify/start?session=${encodeURIComponent(s.clientSecret)}`;
    const orgName = (await this.auth.orgDisplayName(rec.meta.tenant).catch(() => null)) ?? 'An organisation';
    try {
      await this.mail.sendAccessCode(email, { orgName, code: s.accessCode, minutes: 60 });
      if (send) await this.mail.sendVerificationLink(email, { orgName, link, minutes: 60 });
    } catch {
      throw new HttpException({ code: 'email_failed', message: "We couldn't email the access code. Check the address and try again." }, HttpStatus.BAD_GATEWAY);
    }
    // sent on to someone: the person who finishes it gets the result. Continuing it yourself keeps the applicant's address.
    if (send) await this.records.put(rec.meta.id, 'delivery', { email });
    await this.records.logAccess(rec.meta.id, req.operator ?? 'unknown', send ? 'sent a new link' : 'made a new link');
    await this.records.put(rec.meta.id, null, null, {
      event: {
        type: 'relinked',
        label: send
          ? `New link sent to ${sentTo} by your team. The earlier link no longer opens.`
          : `New link made by your team, access code sent to ${sentTo}. The earlier link no longer opens.`,
      },
    });
    return {
      ok: true,
      reference: rec.meta.reference,
      link,
      accessSentTo: sentTo,
      linkSent: send,
      // the code itself only in a test setup (KYC_ACCESS_CODE_ECHO), never in production
      ...(this.echoCode ? { accessCode: s.accessCode } : {}),
      expiresAt: s.expiresAt,
    };
  }

  /**
   * Delete a verification for good: its key and files are destroyed first (as Redact does), then the record leaves
   * the organisation's lists. Credits still held for it come back. The access log keeps that it happened.
   */
  @Need('settings.manage')
  @Delete(':id') @HttpCode(200)
  async remove(@Param('id') id: string, @Req() req: OperatorRequest) {
    const rec = await this.owned(id, req);
    if (!(await this.deleteOne(rec.meta.id, req))) throw new NotFoundException();
    return { ok: true, deleted: true };
  }

  /**
   * Delete several verifications at once (the list's batch action), each exactly as Delete does one: its key and
   * files destroyed, its held credits given back, its webhook sent. One the operator may not reach is skipped, never
   * deleted, and reported back.
   */
  @Need('settings.manage')
  @Post('delete') @HttpCode(200)
  async removeMany(@Body() body: { ids?: unknown }, @Req() req: OperatorRequest) {
    const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && /^ses_[0-9a-f]{8,48}$/.test(x)))] : [];
    if (!ids.length) throw new BadRequestException({ code: 'no_ids', message: 'Select the verifications to delete.' });
    if (ids.length > 100) throw new BadRequestException({ code: 'too_many', message: 'Delete at most 100 verifications at a time.' });
    let deleted = 0;
    const skipped: string[] = [];
    for (const id of ids) {
      const rec = await this.owned(id, req).catch(() => null);
      if (rec && (await this.deleteOne(rec.meta.id, req))) deleted++;
      else skipped.push(id);
    }
    return { ok: true, deleted, skipped };
  }

  /** One verification gone for good (see Delete). False when it was already gone. */
  private async deleteOne(id: string, req: OperatorRequest) {
    // the webhook goes before the record (it reads the record to know whose it is)
    this.events.emit(id, 'verification.redacted', { status: 'deleted' });
    await this.credits.release(id, 'Released: the verification was deleted').catch(() => undefined);
    this.sessions.forget(id);
    if (!(await this.records.remove(id))) return false;
    await this.records.logAccess(id, req.operator ?? 'unknown', 'deleted record');
    return true;
  }

  /** Irreversible: destroys the record's key and files. Personal data can never be read again. */
  @Need('settings.manage')
  @Post(':id/redact') @HttpCode(200)
  async redact(@Param('id') id: string, @Req() req: OperatorRequest) {
    const rec = await this.owned(id, req);
    const ok = await this.records.redact(rec.meta.id);
    if (!ok) throw new NotFoundException();
    await this.records.logAccess(rec.meta.id, req.operator ?? 'unknown', 'redacted record');
    this.events.emit(rec.meta.id, 'verification.redacted', { status: 'redacted' });
    return { ok: true, redacted: true };
  }
}
