import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { RecordsService } from './records.service';
import { factsOf } from './workflow-facts';
import {
  BLANK,
  cleanDefinition,
  isDynamic,
  normalized,
  planOf,
  policyOf,
  priceOf,
  priceRange,
  TEMPLATES,
  type ScorePolicy,
  type WorkflowDefinition,
  lockDocumentTypes,
} from './workflows';

type Row = {
  id: string;
  tenant: string;
  name: string;
  template: string | null;
  status: 'draft' | 'active' | 'archived' | 'deleted';
  version: number | null;
  draft: WorkflowDefinition;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

/** JSON with every object's keys in one order (Postgres keeps its own key order, so a stored copy reads back reordered). */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : x,
  );

/** The workflow a new session runs: pinned by id and version. */
export type Pinned = {
  id: string;
  version: number;
  name: string;
  definition: WorkflowDefinition;
};

/**
 * An organisation's workflows. Edits go to a draft; publishing copies the draft into a new
 * numbered version that never changes again. Sessions are pinned to a version, so a published
 * edit applies to new verifications only.
 */
@Injectable()
export class WorkflowsService {
  /** Published versions are immutable, so they are cached for good. */
  private readonly versions = new Map<
    string,
    { name: string; definition: WorkflowDefinition }
  >();
  /** Which workflow version each session runs (cached; it never changes for a session). */
  private readonly sessionPins = new Map<
    string,
    { id: string; version: number } | null
  >();

  constructor(private readonly records: RecordsService) {}

  /* ------------------------------------------------------------- operators -- */

  /** The organisation's own workflows: the ones it made, and the ones it has run. Nothing is added for it. */
  async list(tenant: string) {
    const rows = await this.records.query<Row>(
      `SELECT * FROM workflows WHERE tenant = $1 AND status NOT IN ('archived', 'deleted') ORDER BY updated_at DESC`,
      [tenant],
    );
    const uses = await this.usesOf(tenant);
    // the one a new verification runs when none is picked (same choice as forNewSession)
    const fallback = rows
      .filter((r) => r.status === 'active' && r.version)
      .sort(
        (a, b) =>
          Number(b.template === 'standard-kyc') -
            Number(a.template === 'standard-kyc') ||
          +new Date(a.created_at) - +new Date(b.created_at),
      )[0]?.id;
    const out = [];
    for (const r of rows) {
      const published = r.version ? await this.version(r.id, r.version) : null;
      const shown = published?.definition ?? normalized(r.draft);
      const used = uses.get(r.id);
      out.push({
        id: r.id,
        name: r.name,
        template: r.template,
        status: r.status,
        version: r.version,
        isDefault: r.id === fallback,
        unpublishedChanges:
          !!published &&
          JSON.stringify(published.definition) !==
            JSON.stringify(normalized(r.draft)),
        // runs exactly what its template does (picking that template again runs this one)
        matchesTemplate: !!published && this.intact(r, published.definition),
        checks: shown.checks.map((c) => c.id),
        price: priceOf(shown),
        priceRange: priceRange(shown),
        updatedAt: r.updated_at,
        uses: used?.n ?? 0,
        lastUsedAt: used?.last ?? null,
      });
    }
    // most recently used first; never-used ones after, newest change first
    return out.sort(
      (a, b) =>
        (b.lastUsedAt ? +new Date(b.lastUsedAt) : 0) -
          (a.lastUsedAt ? +new Date(a.lastUsedAt) : 0) ||
        +new Date(b.updatedAt) - +new Date(a.updatedAt),
    );
  }

  async get(tenant: string, id: string) {
    const r = await this.row(tenant, id);
    const versions = await this.records.query<{
      version: number;
      published_at: Date;
      published_by: string | null;
    }>(
      'SELECT version, published_at, published_by FROM workflow_versions WHERE workflow_id = $1 ORDER BY version DESC',
      [id],
    );
    const published = r.version ? await this.version(r.id, r.version) : null;
    return {
      id: r.id,
      name: r.name,
      template: r.template,
      status: r.status,
      version: r.version,
      draft: normalized(r.draft),
      published: published?.definition ?? null,
      unpublishedChanges:
        !!published &&
        JSON.stringify(published.definition) !==
          JSON.stringify(normalized(r.draft)),
      versions,
      uses: (await this.usesOf(tenant)).get(r.id)?.n ?? 0,
      updatedAt: r.updated_at,
    };
  }

  async create(
    tenant: string,
    by: string,
    input: { name?: string; template?: string },
  ) {
    const template =
      input.template === 'blank'
        ? BLANK
        : TEMPLATES.find((t) => t.id === (input.template ?? 'standard-kyc'));
    if (!template) throw new BadRequestException('Unknown template.');
    if (!template.available)
      throw new BadRequestException(`${template.name} is coming soon.`);
    const name = (input.name ?? '').trim().slice(0, 80) || template.name;
    const id = 'wf_' + randomBytes(9).toString('hex');
    await this.records.query(
      `INSERT INTO workflows (id, tenant, name, template, status, version, draft, created_by) VALUES ($1, $2, $3, $4, 'draft', NULL, $5, $6)`,
      [id, tenant, name, template.id, JSON.stringify(template.definition), by],
    );
    return this.get(tenant, id);
  }

  async saveDraft(
    tenant: string,
    id: string,
    input: { name?: unknown; definition?: unknown },
  ) {
    const r = await this.row(tenant, id);
    if (r.status === 'archived')
      throw new BadRequestException('This workflow is archived.');
    const clean = cleanDefinition(input.definition ?? r.draft);
    if (!clean.ok) throw new BadRequestException(clean.problems.join(' '));
    // a template built for some document kinds only (ID + Liveness + Face Match: national ID cards) keeps them
    clean.definition = lockDocumentTypes(clean.definition, r.template);
    const name =
      typeof input.name === 'string' && input.name.trim()
        ? input.name.trim().slice(0, 80)
        : r.name;
    await this.records.query(
      'UPDATE workflows SET name = $3, draft = $4, updated_at = now() WHERE tenant = $1 AND id = $2',
      [tenant, id, name, JSON.stringify(clean.definition)],
    );
    // published versions are cached with the workflow's name: a rename must show everywhere at once
    if (name !== r.name)
      for (const k of [...this.versions.keys()])
        if (k.startsWith(`${id}@`)) this.versions.delete(k);
    return this.get(tenant, id);
  }

  /** The draft becomes the next version; sessions created from now on run it. */
  async publish(tenant: string, id: string, by: string) {
    const r = await this.row(tenant, id);
    if (r.status === 'archived')
      throw new BadRequestException('This workflow is archived.');
    const clean = cleanDefinition(r.draft);
    if (!clean.ok) throw new BadRequestException(clean.problems.join(' '));
    clean.definition = lockDocumentTypes(clean.definition, r.template);
    const next = (r.version ?? 0) + 1;
    await this.records.query(
      'INSERT INTO workflow_versions (workflow_id, version, definition, published_by) VALUES ($1, $2, $3, $4)',
      [id, next, JSON.stringify(clean.definition), by],
    );
    await this.records.query(
      `UPDATE workflows SET status = 'active', version = $3, draft = $4, updated_at = now() WHERE tenant = $1 AND id = $2`,
      [tenant, id, next, JSON.stringify(clean.definition)],
    );
    return this.get(tenant, id);
  }

  /**
   * Archive: the workflow leaves the list (the list shows the workflows in use). Nothing else is blocked: its template
   * is still in the gallery to start again from, and with no active workflow left a new verification's default is
   * Standard KYC, made from its template on first use (see forNewSession).
   */
  async archive(tenant: string, id: string) {
    await this.row(tenant, id);
    await this.records.query(
      `UPDATE workflows SET status = 'archived', updated_at = now() WHERE tenant = $1 AND id = $2`,
      [tenant, id],
    );
    return { ok: true };
  }

  /** Archive several at once (see archive: every workflow may be archived, the gallery's templates stay). */
  async archiveMany(tenant: string, ids: string[]) {
    const want = [...new Set(ids)].slice(0, 100);
    if (!want.length) return { ok: true, archived: 0 };
    const done = await this.records.query<{ id: string }>(
      `UPDATE workflows SET status = 'archived', updated_at = now() WHERE tenant = $1 AND id = ANY($2::text[]) AND status IN ('active', 'draft') RETURNING id`,
      [tenant, want],
    );
    return { ok: true, archived: done.length };
  }

  /** The organisation's archived workflows (newest first), for the Archived panel. */
  async listArchived(tenant: string) {
    const rows = await this.records.query<Row>(
      `SELECT * FROM workflows WHERE tenant = $1 AND status = 'archived' ORDER BY updated_at DESC`,
      [tenant],
    );
    const uses = await this.usesOf(tenant);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      template: r.template,
      archivedAt: new Date(r.updated_at).toISOString(),
      verifications: uses.get(r.id)?.n ?? 0,
      lastUsed: uses.get(r.id)?.last ? new Date(uses.get(r.id)!.last).toISOString() : null,
    }));
  }

  /** Back from the archive: a published workflow runs verifications again, a never-published one is a draft again. */
  async restore(tenant: string, id: string) {
    const r = await this.row(tenant, id);
    if (r.status !== 'archived') throw new BadRequestException('This workflow is not archived.');
    const status = r.version ? 'active' : 'draft';
    await this.records.query(`UPDATE workflows SET status = $3, updated_at = now() WHERE tenant = $1 AND id = $2`, [tenant, id, status]);
    return { ok: true, status };
  }

  /**
   * Delete an archived workflow: it leaves every list and can never be picked again. Its published versions stay
   * behind (never shown) only because the verifications that already ran on it are decided and displayed with them.
   * The template it came from is untouched: it is still offered when creating a workflow.
   */
  async remove(tenant: string, id: string) {
    const r = await this.row(tenant, id);
    if (r.status !== 'archived') throw new BadRequestException('Archive a workflow before deleting it.');
    await this.records.query(`UPDATE workflows SET status = 'deleted', updated_at = now() WHERE tenant = $1 AND id = $2`, [tenant, id]);
    return { ok: true, deleted: true };
  }

  /* -------------------------------------------------------------- sessions -- */

  /**
   * The workflow a new session runs: the one asked for, a template, or the organisation's default.
   * A template becomes one of the organisation's workflows the first time a session runs it, and an
   * organisation with no published workflow runs Standard KYC the same way.
   */
  async forNewSession(
    tenant: string,
    pick: { workflowId?: string; template?: string; by?: string } = {},
  ): Promise<Pinned> {
    let rows: Row[];
    if (pick.workflowId)
      rows = await this.records.query<Row>(
        `SELECT * FROM workflows WHERE tenant = $1 AND id = $2 AND status <> 'deleted'`,
        [tenant, pick.workflowId],
      );
    else if (pick.template)
      rows = [await this.fromTemplate(tenant, pick.template, pick.by)];
    else {
      rows = await this.records.query<Row>(
        `SELECT * FROM workflows WHERE tenant = $1 AND status = 'active' ORDER BY (template = 'standard-kyc') DESC, created_at ASC LIMIT 1`,
        [tenant],
      );
      if (!rows[0])
        rows = [await this.fromTemplate(tenant, 'standard-kyc', pick.by)];
    }
    const r = rows[0];
    if (!r) throw new NotFoundException('That workflow was not found.');
    if (r.status !== 'active' || !r.version)
      throw new BadRequestException(
        'Publish this workflow before using it for verifications.',
      );
    const v = (await this.version(r.id, r.version))!;
    return {
      id: r.id,
      version: r.version,
      name: r.name,
      definition: v.definition,
    };
  }

  /** The workflow version a session runs, or null for a session without one (it runs every check). */
  async forSession(
    sessionId: string | undefined,
  ): Promise<(Pinned & { policy: ScorePolicy }) | null> {
    if (!sessionId) return null;
    let pin = this.sessionPins.get(sessionId);
    if (pin === undefined) {
      const rows = await this.records.query<{
        workflow_id: string | null;
        workflow_version: number | null;
      }>(
        'SELECT workflow_id, workflow_version FROM kyc_sessions WHERE id = $1',
        [sessionId],
      );
      const r = rows[0];
      pin =
        r?.workflow_id && r.workflow_version
          ? { id: r.workflow_id, version: r.workflow_version }
          : null;
      if (r) this.sessionPins.set(sessionId, pin);
    }
    if (!pin) return null;
    return this.pinned(pin.id, pin.version);
  }

  /** A pinned version with its scoring policy (for records that carry their pin in `meta`). */
  async pinned(
    id: string,
    version: number,
  ): Promise<(Pinned & { policy: ScorePolicy }) | null> {
    const v = await this.version(id, version);
    if (!v) return null;
    return {
      id,
      version,
      name: v.name,
      definition: v.definition,
      policy: policyOf(v.definition, `${v.name} v${version}`),
    };
  }

  /** What the applicant's browser needs to run the flow (rules that add steps read the record as it stands). */
  async planFor(sessionId: string | undefined) {
    const w = await this.forSession(sessionId);
    if (!w) return planOf(null, null);
    let facts = null;
    if (isDynamic(w.definition) && sessionId) {
      const rec = await this.records.get(sessionId);
      if (rec)
        facts = factsOf(
          rec.data,
          await this.records.otherPeopleOnDevice(sessionId),
        );
    }
    return planOf(w.definition, `${w.name} v${w.version}`, facts);
  }

  /* ----------------------------------------------------------------- inside -- */

  private async row(tenant: string, id: string): Promise<Row> {
    const r = (
      await this.records.query<Row>(
        'SELECT * FROM workflows WHERE tenant = $1 AND id = $2',
        [tenant, id],
      )
    )[0];
    // a deleted workflow is gone for every operator action (its versions stay only for verifications that ran on it)
    if (!r || r.status === 'deleted') throw new NotFoundException('That workflow was not found.');
    return r;
  }

  private async version(id: string, version: number) {
    const key = `${id}@${version}`;
    const hit = this.versions.get(key);
    if (hit) return hit;
    const r = (
      await this.records.query<{
        definition: WorkflowDefinition;
        name: string;
      }>(
        'SELECT v.definition, w.name FROM workflow_versions v JOIN workflows w ON w.id = v.workflow_id WHERE v.workflow_id = $1 AND v.version = $2',
        [id, version],
      )
    )[0];
    if (!r) return null;
    const value = { name: r.name, definition: normalized(r.definition) };
    this.versions.set(key, value);
    return value;
  }

  private async usesOf(tenant: string) {
    const rows = await this.records.query<{
      workflow_id: string;
      n: number;
      last: Date;
    }>(
      'SELECT workflow_id, count(*)::int AS n, max(created_at) AS last FROM kyc_sessions WHERE tenant = $1 AND workflow_id IS NOT NULL GROUP BY workflow_id',
      [tenant],
    );
    return new Map(rows.map((r) => [r.workflow_id, { n: r.n, last: r.last }]));
  }

  /** A published workflow that still runs exactly its template's definition, under the template's name. */
  private intact(r: Row, published: WorkflowDefinition): boolean {
    const t = TEMPLATES.find((x) => x.id === r.template);
    return (
      !!t &&
      r.name === t.name &&
      canonical(published) === canonical(normalized(t.definition))
    );
  }

  /**
   * The organisation's workflow for a template, made and published the first time a session runs it;
   * later picks of the same template run that one again. One at a time per organisation and template
   * (two first sessions must not make two copies).
   */
  private fromTemplate(
    tenant: string,
    template: string,
    by?: string,
  ): Promise<Row> {
    const key = `${tenant}|${template}`;
    const running = this.adopting.get(key);
    if (running) return running;
    const p = (async () => {
      const t = TEMPLATES.find((x) => x.id === template);
      if (!t) throw new BadRequestException('Unknown template.');
      const mine = await this.records.query<Row>(
        `SELECT * FROM workflows WHERE tenant = $1 AND template = $2 AND status = 'active' AND version IS NOT NULL ORDER BY created_at ASC`,
        [tenant, template],
      );
      for (const r of mine) {
        const v = await this.version(r.id, r.version!);
        if (v && this.intact(r, v.definition)) return r;
      }
      const made = await this.create(tenant, by || 'first-use', { template });
      await this.publish(tenant, made.id, by || 'first-use');
      return this.row(tenant, made.id);
    })().finally(() => this.adopting.delete(key));
    this.adopting.set(key, p);
    return p;
  }
  private readonly adopting = new Map<string, Promise<Row>>();
}
