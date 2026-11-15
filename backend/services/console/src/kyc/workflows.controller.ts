import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  OperatorGuard,
  type OperatorRequest,
} from './verifications.controller';
import {
  CATEGORIES,
  CHECKS,
  STAGE,
  DOCUMENT_TYPES,
  fatfPreset,
  FIELDS,
  INDUSTRIES,
  priceRange,
  ruleText,
  TEMPLATES,
} from './workflows';
import { WorkflowsService } from './workflows.service';
import { Need, NeedGuard } from '../auth/roles';

/** The organisation a workflow belongs to (on the local dev gate: the signed-in one, or a shared dev space). */
const tenantOf = (req: OperatorRequest) =>
  req.org ?? req.homeOrg ?? 'local-dev';
const who = (req: OperatorRequest) => req.operator ?? 'unknown';

/** Verification workflows for the console: the catalogue, templates, drafts, versions. */
@Controller('api/workflows')
@UseGuards(OperatorGuard, NeedGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  /** Everything the builder and the template gallery offer: checks, rule fields, templates by category and industry. */
  @Need('workflows.view')
  @Get('catalogue')
  catalogue() {
    return {
      checks: CHECKS.map((c) => ({ ...c, stage: STAGE[c.id] ?? 0 })),
      documentTypes: DOCUMENT_TYPES,
      fields: FIELDS,
      presets: { highRisk: fatfPreset() },
      categories: CATEGORIES,
      industries: INDUSTRIES,
      templates: TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        summary: t.summary,
        category: t.category,
        industries: t.industries,
        recommended: !!t.recommended,
        available: t.available,
        definition: t.definition,
        // the document kinds a workflow from this template keeps (its editor offers only these)
        fixedDocumentTypes: t.fixedDocumentTypes ?? null,
        rules: t.definition.rules.map(ruleText),
        price: priceRange(t.definition),
      })),
    };
  }

  @Need('workflows.view')
  @Get()
  async list(@Req() req: OperatorRequest) {
    return { workflows: await this.workflows.list(tenantOf(req)) };
  }

  @Need('workflows.manage')
  @Post()
  @HttpCode(201)
  create(
    @Req() req: OperatorRequest,
    @Body() body: { name?: unknown; template?: unknown },
  ) {
    return this.workflows.create(tenantOf(req), who(req), {
      name: typeof body?.name === 'string' ? body.name : undefined,
      template: typeof body?.template === 'string' ? body.template : undefined,
    });
  }

  /** The organisation's archived workflows (the Archived panel). Declared before ':id' so it is not read as an id. */
  @Need('workflows.view')
  @Get('archived')
  async archived(@Req() req: OperatorRequest) {
    return { workflows: await this.workflows.listArchived(tenantOf(req)) };
  }

  /** Archive several workflows at once (the list's batch action). */
  @Need('workflows.manage')
  @Post('archive')
  @HttpCode(200)
  archiveMany(@Req() req: OperatorRequest, @Body() body: { ids?: unknown }) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && /^wf_[0-9a-f]{6,40}$/.test(x)) : [];
    return this.workflows.archiveMany(tenantOf(req), ids);
  }

  @Need('workflows.manage')
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Req() req: OperatorRequest, @Param('id') id: string) {
    return this.workflows.restore(tenantOf(req), id);
  }

  /** Delete an archived workflow (its template stays available when creating a workflow). */
  @Need('workflows.manage')
  @Delete(':id')
  @HttpCode(200)
  remove(@Req() req: OperatorRequest, @Param('id') id: string) {
    return this.workflows.remove(tenantOf(req), id);
  }

  @Need('workflows.view')
  @Get(':id')
  get(@Req() req: OperatorRequest, @Param('id') id: string) {
    return this.workflows.get(tenantOf(req), id);
  }

  /** Save the draft (published versions are never edited). */
  @Need('workflows.manage')
  @Put(':id')
  save(
    @Req() req: OperatorRequest,
    @Param('id') id: string,
    @Body() body: { name?: unknown; definition?: unknown },
  ) {
    return this.workflows.saveDraft(tenantOf(req), id, {
      name: body?.name,
      definition: body?.definition,
    });
  }

  @Need('workflows.manage')
  @Post(':id/publish')
  @HttpCode(200)
  publish(@Req() req: OperatorRequest, @Param('id') id: string) {
    return this.workflows.publish(tenantOf(req), id, who(req));
  }

  @Need('workflows.manage')
  @Post(':id/archive')
  @HttpCode(200)
  archive(@Req() req: OperatorRequest, @Param('id') id: string) {
    return this.workflows.archive(tenantOf(req), id);
  }
}
