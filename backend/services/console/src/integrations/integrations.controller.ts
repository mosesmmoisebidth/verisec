import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { Need, NeedGuard } from '../auth/roles';
import {
  OperatorGuard,
  type OperatorRequest,
} from '../kyc/verifications.controller';
import { IntegrationsService } from './integrations.service';

/** The organisation the integrations belong to (same rule as webhooks). */
const tenantOf = (req: OperatorRequest) => req.org ?? req.homeOrg ?? 'local-dev';

const publicOrigin = () =>
  (process.env.KYC_PUBLIC_ORIGIN ?? 'https://verisec.dev').replace(/\/$/, '');

/**
 * Integrations for the console. Signed-in operators only, scoped to their organisation.
 * Connecting an app is one click: the browser is sent to the app's own sign-in and comes
 * back to the callback below. Secrets are stored encrypted and never returned.
 */
@Controller('api/integrations')
@UseGuards(OperatorGuard, NeedGuard)
@Need('webhooks.manage')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get()
  overview(@Req() req: OperatorRequest) {
    return this.svc.overview(tenantOf(req));
  }

  @Post('sources')
  @HttpCode(201)
  createSource(@Req() req: OperatorRequest) {
    return this.svc.createSource(tenantOf(req));
  }

  @Put('sources/:id/secret')
  setSourceSecret(
    @Req() req: OperatorRequest,
    @Param('id') id: string,
    @Body() body: { secret?: unknown },
  ) {
    return this.svc.setSourceSecret(tenantOf(req), id, String(body?.secret ?? ''));
  }

  @Delete('sources/:id')
  @HttpCode(204)
  async removeSource(@Req() req: OperatorRequest, @Param('id') id: string) {
    await this.svc.removeSource(tenantOf(req), id);
  }

  @Get('apps')
  apps(@Query('search') search?: string, @Query('cursor') cursor?: string) {
    return this.svc.apps(search, cursor);
  }

  @Get('apps/:slug')
  app(@Param('slug') slug: string) {
    return this.svc.app(slug);
  }

  @Get('apps/:slug/actions')
  actions(@Param('slug') slug: string, @Query('query') query?: string) {
    return this.svc.actions(slug, query);
  }

  @Get('actions/:slug')
  action(@Param('slug') slug: string) {
    return this.svc.action(slug);
  }

  @Post('connections')
  connect(@Req() req: OperatorRequest, @Body() body: { app?: unknown }) {
    return this.svc.connect(tenantOf(req), String(body?.app ?? ''));
  }

  /** Connect an app that is set up by pasting a value (Teams / Google Chat webhook URL). */
  @Post('connections/manual')
  connectManual(@Req() req: OperatorRequest, @Body() body: { app?: unknown; value?: unknown }) {
    return this.svc.connectManual(tenantOf(req), String(body?.app ?? ''), String(body?.value ?? ''));
  }

  @Delete('connections/:id')
  @HttpCode(204)
  async disconnect(@Req() req: OperatorRequest, @Param('id') id: string) {
    await this.svc.disconnect(tenantOf(req), id);
  }

  @Post('automations')
  createAutomation(
    @Req() req: OperatorRequest,
    @Body() body: { name?: string; trigger: any; action: any },
  ) {
    return this.svc.createAutomation(tenantOf(req), body);
  }

  @Patch('automations/:id')
  updateAutomation(
    @Req() req: OperatorRequest,
    @Param('id') id: string,
    @Body()
    body: { name?: string; enabled?: boolean; events?: string[]; arguments?: Record<string, unknown> },
  ) {
    return this.svc.updateAutomation(tenantOf(req), id, body ?? {});
  }

  @Delete('automations/:id')
  @HttpCode(204)
  async removeAutomation(@Req() req: OperatorRequest, @Param('id') id: string) {
    await this.svc.removeAutomation(tenantOf(req), id);
  }

  @Post('automations/:id/test')
  @HttpCode(200)
  testAutomation(@Req() req: OperatorRequest, @Param('id') id: string) {
    return this.svc.testAutomation(tenantOf(req), id);
  }

  @Get('automations/:id/runs')
  runs(
    @Req() req: OperatorRequest,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.runs(tenantOf(req), id, limit ? Number(limit) : 25);
  }
}

/**
 * The OAuth callback. The app's sign-in redirects the browser here; the random `state`
 * (stored server-side with its organisation) is what identifies the connection, so this
 * route does not need the operator session. It stores the connection and sends the person
 * back to the Integrations screen.
 */
@Controller('api/integrations/callback')
export class IntegrationsCallbackController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get(':app')
  async callback(
    @Param('app') app: string,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    const origin = publicOrigin();
    try {
      if (!code || !state) throw new Error('missing_params');
      const slug = await this.svc.completeOAuth(app, String(code), String(state));
      res.redirect(`${origin}/settings/notifications?connected=${encodeURIComponent(slug)}`);
    } catch {
      res.redirect(`${origin}/settings/notifications?connect_error=${encodeURIComponent(app)}`);
    }
  }
}
