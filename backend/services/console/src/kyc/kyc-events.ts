import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { IntegrationsService } from '../integrations/integrations.service';
import type { WebhookEventType } from '../webhooks/webhook-events';
import { WebhooksService } from '../webhooks/webhooks.service';
import { BrandingService } from './branding.service';
import { RecordsService } from './records.service';
import { WorkflowsService } from './workflows.service';

/** The decision, as webhooks name it. */
export const VERDICT_EVENT: Record<
  string,
  { code: string; type: WebhookEventType }
> = {
  Approved: { code: 'approved', type: 'verification.approved' },
  'Needs review': { code: 'needs_review', type: 'verification.needs_review' },
  Declined: { code: 'declined', type: 'verification.declined' },
};

/** A verification's environment (kyc_sessions.env, 'test' until Live opens) picks the endpoints. */
const envOf = (env: string | null | undefined): 'test' | 'live' =>
  env === 'live' ? 'live' : 'test';

/**
 * What happens to a verification, sent to its organisation's webhook endpoints. Callers do not
 * wait for it and it never throws, so the applicant is never held up. A payload carries the
 * verification's id, the organisation's own reference and outcomes only, never personal data
 * (the webhooks service drops anything else).
 */
@Injectable()
export class KycEvents {
  private readonly log = new Logger(KycEvents.name);
  /** session -> its organisation, reference and environment (none changes once the session exists) */
  private readonly owners = new Map<
    string,
    { tenant: string; reference: string | null; env: string | null }
  >();
  /** org -> its company name (for the heading in sheets / messages), cached briefly. */
  private readonly companies = new Map<string, string>();

  private integrations: IntegrationsService | null = null;
  private branding: BrandingService | null = null;
  private workflows: WorkflowsService | null = null;

  constructor(
    private readonly webhooks: WebhooksService,
    private readonly records: RecordsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** The integrations service, resolved lazily across modules (like the webhooks pattern). */
  private get apps(): IntegrationsService | null {
    try {
      this.integrations =
        this.integrations ?? this.moduleRef.get(IntegrationsService, { strict: false });
    } catch {
      this.integrations = null;
    }
    return this.integrations;
  }

  private get brandingSvc(): BrandingService | null {
    try {
      this.branding = this.branding ?? this.moduleRef.get(BrandingService, { strict: false });
    } catch {
      this.branding = null;
    }
    return this.branding;
  }

  private get workflowsSvc(): WorkflowsService | null {
    try {
      this.workflows = this.workflows ?? this.moduleRef.get(WorkflowsService, { strict: false });
    } catch {
      this.workflows = null;
    }
    return this.workflows;
  }

  /** The org's company name for integration headings; cached, falls back to "VeriSec". */
  private async companyOf(tenant: string): Promise<string> {
    const hit = this.companies.get(tenant);
    if (hit) return hit;
    let name = 'VeriSec';
    try {
      const b = await this.brandingSvc?.get(tenant);
      if (b?.companyName) name = b.companyName;
    } catch {
      /* ignore; the heading just falls back */
    }
    if (this.companies.size >= 2000) this.companies.clear();
    this.companies.set(tenant, name);
    return name;
  }

  emit(
    sessionId: string | undefined,
    type: WebhookEventType,
    data: Record<string, unknown> = {},
  ): void {
    if (!sessionId) return;
    void this.send(sessionId, type, data);
  }

  /** The decision: `verification.completed`, then the event for the verdict itself. */
  decided(sessionId: string | undefined, verdict: string, score: number): void {
    const v = VERDICT_EVENT[verdict];
    this.emit(sessionId, 'verification.completed', {
      status: 'completed',
      verdict: v?.code ?? verdict,
      score,
    });
    if (v) this.emit(sessionId, v.type, { verdict: v.code, score });
  }

  private async send(
    sessionId: string,
    type: WebhookEventType,
    data: Record<string, unknown>,
  ) {
    try {
      const owner = await this.ownerOf(sessionId);
      if (!owner) return;
      const payload = { id: sessionId, reference_id: owner.reference, ...data };
      await this.webhooks.emit(owner.tenant, type, payload, envOf(owner.env));
      // Integrations (Slack, Sheets, ...) get a few extra NON-confidential facts so their logs read like a
      // human record (company heading, ID type, country) instead of bare ids. These fill in during the flow,
      // so they are read fresh each time, not cached. Fire and forget; never holds up the applicant.
      const facts = (
        await this.records.query<{ document_type: string | null; country: string | null }>(
          'SELECT document_type, country FROM kyc_sessions WHERE id = $1',
          [sessionId],
        )
      )[0];
      let workflow: string | null = null;
      try {
        workflow = (await this.workflowsSvc?.forSession(sessionId))?.name ?? null;
      } catch {
        /* ignore; the Workflow column just stays blank */
      }
      const enriched = {
        ...payload,
        document_type: facts?.document_type ?? null,
        country: facts?.country ?? null,
        workflow,
        company: await this.companyOf(owner.tenant),
      };
      void this.apps?.onEvent(owner.tenant, type, enriched, sessionId)?.catch(() => undefined);
    } catch (e) {
      this.log.warn(
        `${type} for ${sessionId} not queued: ${(e as Error).message}`,
      );
    }
  }

  private async ownerOf(id: string) {
    const hit = this.owners.get(id);
    if (hit) return hit;
    const row = (
      await this.records.query<{
        tenant: string;
        reference: string | null;
        env: string | null;
      }>('SELECT tenant, reference, env FROM kyc_sessions WHERE id = $1', [id])
    )[0];
    if (!row) return null;
    if (this.owners.size >= 5000) this.owners.clear();
    this.owners.set(id, row);
    return row;
  }
}
