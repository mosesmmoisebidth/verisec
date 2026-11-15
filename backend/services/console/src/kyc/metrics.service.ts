import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { performance } from 'node:perf_hooks';

import {
  DAY,
  dashboardOf,
  type CallRow,
  type ProbeRow,
} from './dashboard.view';
import { IntelClient } from './intel.client';
import { RecordsService } from './records.service';
import { SessionsService } from './sessions.service';
import { VaultService } from './vault.service';
import { WorkflowsService } from './workflows.service';
import type { ScorePolicy } from './workflows';
import { WebhooksService } from '../webhooks/webhooks.service';
import { KeyServiceClient } from './key-service.client';

type Call = {
  tenant: string | null;
  workflow: string | null;
  method: string;
  route: string;
  status: number;
  ms: number;
  at: Date;
};

/**
 * What the dashboard measures besides the records themselves:
 * - every API call's route, status and time (never its body or anything personal), filed under
 *   the organisation it was made for, kept 120 days;
 * - a health check of the platform every minute (records, key vault, verification engines,
 *   sign-in), which gives the uptime and its incidents. A minute without a check means the API
 *   itself was down.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Metrics');
  private readonly signIn: string;
  private buffer: Call[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly records: RecordsService,
    private readonly sessions: SessionsService,
    private readonly vault: VaultService,
    private readonly intel: IntelClient,
    private readonly workflows: WorkflowsService,
    private readonly keyService: KeyServiceClient,
    private readonly webhooks: WebhooksService,
    config: ConfigService,
  ) {
    this.signIn = (
      config.get<string>('ZITADEL_API_URL') ?? 'http://localhost:8088'
    ).replace(/\/$/, '');
  }

  onModuleInit() {
    const every = (ms: number, fn: () => Promise<void>) => {
      const t = setInterval(() => void fn(), ms);
      t.unref();
      this.timers.push(t);
    };
    every(3_000, () => this.flush());
    every(60_000, () => this.probe());
    every(6 * 3_600_000, () => this.prune());
    const first = setTimeout(() => void this.probe(), 10_000); // once everything is up
    first.unref();
    this.timers.push(first);
  }

  async onModuleDestroy() {
    for (const t of this.timers) clearInterval(t);
    await this.flush();
  }

  /** Express middleware: times each API call and files it under its organisation. */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const t0 = performance.now();
      res.on('finish', () => {
        // the matched route's template (e.g. /api/verifications/:id), never the raw URL
        const matched: unknown = Reflect.get(req, 'route');
        const route: unknown =
          matched && typeof matched === 'object'
            ? Reflect.get(matched, 'path')
            : undefined;
        // the verification API the applicant's browser calls; the team's own console pages are not API usage
        // (API-key calls are counted by the gateway, and read from the key service)
        if (
          typeof route !== 'string' ||
          !route.startsWith('/api/kyc/') ||
          req.method === 'OPTIONS'
        )
          return;
        // sign-in traffic and the dashboard reading itself are not API usage
        if (
          route.startsWith('/api/auth/') ||
          route.startsWith('/api/verifications/dashboard') ||
          route === '/api/verifications/export'
        )
          return;
        const ms = Math.round(performance.now() - t0);
        const at = new Date();
        const r = req as Request & { org?: string; kycSession?: string };
        void this.tenantOf(r).then(({ tenant, workflow }) => {
          if (this.buffer.length < 5_000)
            this.buffer.push({
              tenant,
              workflow,
              method: req.method,
              route,
              status: res.statusCode,
              ms,
              at,
            });
        });
      });
      next();
    };
  }

  private readonly sessionInfo = new Map<string, { tenant: string | null; workflow: string | null; exp: number }>();

  /** The call's organisation, and the workflow of the verification it served (cached a few minutes per session). */
  private async tenantOf(r: {
    org?: string;
    kycSession?: string;
  }): Promise<{ tenant: string | null; workflow: string | null }> {
    if (!r.kycSession) return { tenant: r.org ?? null, workflow: null };
    const hit = this.sessionInfo.get(r.kycSession);
    if (hit && hit.exp > Date.now()) return hit;
    const row = (
      await this.records
        .query<{ tenant: string | null; workflow_id: string | null }>('SELECT tenant, workflow_id FROM kyc_sessions WHERE id = $1', [r.kycSession])
        .catch(() => [])
    )[0];
    const info = {
      tenant: r.org ?? row?.tenant ?? (await this.sessions.tenantOf(r.kycSession).catch(() => null)),
      workflow: row?.workflow_id ?? null,
      exp: Date.now() + 5 * 60_000,
    };
    if (this.sessionInfo.size > 20_000) this.sessionInfo.clear();
    this.sessionInfo.set(r.kycSession, info);
    return info;
  }

  private async flush() {
    if (!this.buffer.length) return;
    const rows = this.buffer.splice(0, 500);
    const args: unknown[] = [];
    const values = rows.map((x, i) => {
      args.push(x.tenant, x.method, x.route, x.status, x.ms, x.at, x.workflow ?? null);
      const b = i * 7;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`;
    });
    await this.records
      .query(
        `INSERT INTO api_calls (tenant, method, route, status, ms, at, workflow_id) VALUES ${values.join(', ')}`,
        args,
      )
      .catch((e) =>
        this.log.warn(`call timings not kept: ${(e as Error).message}`),
      );
  }

  /** One health check of the platform; a failed part is named for the incident list. */
  private async probe() {
    const t0 = Date.now();
    const [db, vault, engines, signIn] = await Promise.all([
      this.records
        .query('SELECT 1 AS ok')
        .then((r) => r.length === 1)
        .catch(() => false),
      this.vault.healthy(),
      this.intel.reachable(),
      fetch(`${this.signIn}/debug/healthz`, {
        signal: AbortSignal.timeout(5_000),
      })
        .then((r) => r.ok)
        .catch(() => false),
    ]);
    if (!db) return; // nowhere to write it: the missing minute reads as downtime
    const down = [
      !vault && 'Key vault',
      !engines && 'Verification engines',
      !signIn && 'Sign-in',
    ]
      .filter(Boolean)
      .join(', ');
    await this.records
      .query('INSERT INTO platform_probes (ok, ms, down) VALUES ($1, $2, $3)', [
        !down,
        Date.now() - t0,
        down || null,
      ])
      .catch((e) =>
        this.log.warn(`health check not kept: ${(e as Error).message}`),
      );
  }

  private async prune() {
    await this.records
      .query(`DELETE FROM api_calls WHERE at < now() - interval '120 days'`)
      .catch(() => undefined);
    await this.records
      .query(
        `DELETE FROM platform_probes WHERE at < now() - interval '120 days'`,
      )
      .catch(() => undefined);
  }

  /** The dashboard for one organisation (every organisation on the local dev gate) over the last `days`. */
  async dashboard(org: string | undefined, days: number, workflow?: string) {
    const now = Date.now();
    const d = new Date(now);
    const start =
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      (days - 1) * DAY;
    const prevStart = start - days * DAY;
    const scoped = org !== undefined;
    const wf = workflow ?? null;
    const [all, prev, local, keyCalls, probes, webhooks, names] = await Promise.all([
      this.records.since(new Date(start), org),
      this.records.query<{ total: number; approved: number; decided: number }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE verdict = 'Approved')::int AS approved,
                count(*) FILTER (WHERE status = 'completed' AND verdict IN ('Approved', 'Needs review', 'Declined'))::int AS decided
           FROM kyc_sessions WHERE created_at >= $1 AND created_at < $2 AND ($3::text IS NULL OR tenant = $3) AND ($4::text IS NULL OR workflow_id = $4)`,
        [new Date(prevStart), new Date(start), scoped ? org : null, wf],
      ),
      // the verification API (applicants' calls) of this organisation and, when asked, this workflow
      this.records.query<CallRow & { workflow_id: string | null }>(
        `SELECT method, route, status, ms, at, workflow_id FROM api_calls
          WHERE at >= $1 AND route LIKE '/api/kyc/%' AND ($2::text IS NULL OR tenant = $2) AND ($3::text IS NULL OR workflow_id = $3)
          ORDER BY at LIMIT 200000`,
        [new Date(prevStart), scoped ? org : null, wf],
      ),
      // calls made with the organisation's API keys (not tied to one workflow)
      scoped && !wf ? this.keyService.calls(org, new Date(prevStart)) : Promise.resolve([]),
      this.records.query<ProbeRow>(
        'SELECT at, ok, ms, down FROM platform_probes WHERE at >= $1 ORDER BY at',
        [new Date(prevStart)],
      ),
      scoped ? this.webhooks.deliveryStats(org, new Date(start)).catch(() => null) : Promise.resolve(null),
      this.records.query<{ id: string; name: string }>(
        `SELECT id, name FROM workflows WHERE ($1::text IS NULL OR tenant = $1) AND status <> 'deleted' ORDER BY name`,
        [scoped ? org : null],
      ),
    ]);
    const current = wf ? all.filter((r) => r.meta.workflow_id === wf) : all;
    const calls: CallRow[] = [
      ...local.map((c) => ({ method: c.method, route: c.route, status: c.status, ms: c.ms, at: c.at, workflowId: c.workflow_id })),
      ...keyCalls.map((c) => ({ method: c.method, route: c.path, status: c.status, ms: c.ms, at: new Date(c.at), workflowId: null })),
    ].sort((a, b) => +a.at - +b.at);
    const otherPeople = await this.records.otherPeopleMany(
      current
        .filter((r) => r.meta.status === 'completed' || r.data.device)
        .map((r) => r.meta.id),
    );
    // each verification is judged under the workflow version it ran
    const policies = new Map<string, ScorePolicy>();
    for (const r of current) {
      if (!r.meta.workflow_id || !r.meta.workflow_version) continue;
      const p = await this.workflows.pinned(r.meta.workflow_id, r.meta.workflow_version);
      if (p) policies.set(r.meta.id, p.policy);
    }
    return dashboardOf({
      policies,
      days,
      now,
      start,
      current,
      otherPeople,
      prev: prev[0] ?? { total: 0, approved: 0, decided: 0 },
      calls,
      probes,
      webhooks,
      workflowNames: new Map(names.map((n) => [n.id, n.name])),
    });
  }

  /** The period's verifications as CSV: plain columns only (no names, no personal data). */
  async exportCsv(org: string | undefined, days: number): Promise<string> {
    const d = new Date();
    const start =
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      (days - 1) * DAY;
    const scoped = org !== undefined;
    const rows = await this.records.query<Record<string, unknown>>(
      `SELECT reference, created_at, status, verdict, score, document_type, country, completed_at
         FROM kyc_sessions WHERE created_at >= $1${scoped ? ' AND tenant = $2' : ''} ORDER BY created_at DESC LIMIT 50000`,
      scoped ? [new Date(start), org] : [new Date(start)],
    );
    const cell = (v: unknown) => {
      const s =
        v instanceof Date
          ? v.toISOString()
          : typeof v === 'string'
            ? v
            : typeof v === 'number' || typeof v === 'boolean'
              ? `${v}`
              : v === null || v === undefined
                ? ''
                : JSON.stringify(v);
      // quoted, and a leading formula character neutralised so a spreadsheet never runs it
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const head = [
      'reference',
      'created_at',
      'status',
      'verdict',
      'score',
      'document_type',
      'country',
      'completed_at',
    ];
    return (
      [
        head.join(','),
        ...rows.map((r) => head.map((h) => cell(r[h])).join(',')),
      ].join('\r\n') + '\r\n'
    );
  }
}
