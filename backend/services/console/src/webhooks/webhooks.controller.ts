import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  OperatorGuard,
  type OperatorRequest,
} from '../kyc/verifications.controller';
import type { WebhookPortal } from './webhook-events';
import { WebhooksService } from './webhooks.service';
import { Need, NeedGuard } from '../auth/roles';

/** The organisation the endpoints belong to (on the local dev gate: the signed-in one, or a shared dev space). */
const tenantOf = (req: OperatorRequest) =>
  req.org ?? req.homeOrg ?? 'local-dev';
const who = (req: OperatorRequest) => req.operator ?? 'unknown';
/** `?portal=fin` for the Financial portal; KYC otherwise. */
const portalOf = (p?: string): WebhookPortal => (p === 'fin' ? 'fin' : 'kyc');

/**
 * Webhook endpoints for the console (KYC and Financial portals). Signed-in operators only; every
 * route is scoped to the operator's organisation. A signing secret appears in exactly two answers
 * (create and rotate) and is never readable again.
 */
@Controller('api/webhooks')
@UseGuards(OperatorGuard, NeedGuard)
// what the person's role must allow (auth/roles.ts)
@Need('webhooks.manage')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  /** The events an endpoint in this portal can subscribe to. */
  @Get('event-types')
  eventTypes(@Query('portal') portal?: string) {
    return this.webhooks.catalog(portalOf(portal));
  }

  @Get('endpoints')
  list(@Req() req: OperatorRequest, @Query('portal') portal?: string) {
    return this.webhooks.list(tenantOf(req), portalOf(portal));
  }

  /** Answers with the endpoint and its signing secret (the only time it is shown). */
  @Post('endpoints')
  @HttpCode(201)
  create(
    @Req() req: OperatorRequest,
    @Body()
    body: {
      url?: unknown;
      description?: unknown;
      events?: unknown;
      env?: unknown;
      portal?: unknown;
    },
  ) {
    return this.webhooks.create(tenantOf(req), who(req), body ?? {});
  }

  /** Change the address, description or events, or turn the endpoint on or off (`enabled`). */
  @Patch('endpoints/:id')
  update(
    @Req() req: OperatorRequest,
    @Param('id') id: string,
    @Body()
    body: {
      url?: unknown;
      description?: unknown;
      events?: unknown;
      enabled?: unknown;
    },
  ) {
    return this.webhooks.update(tenantOf(req), id, body ?? {});
  }

  @Delete('endpoints/:id')
  @HttpCode(204)
  async remove(@Req() req: OperatorRequest, @Param('id') id: string) {
    await this.webhooks.remove(tenantOf(req), id);
  }

  /** A new signing secret, shown once; the previous one keeps working for 24 hours. */
  @Post('endpoints/:id/rotate')
  @HttpCode(200)
  rotate(@Req() req: OperatorRequest, @Param('id') id: string) {
    return this.webhooks.rotate(tenantOf(req), id);
  }

  @Post('endpoints/:id/test')
  @HttpCode(202)
  test(@Req() req: OperatorRequest, @Param('id') id: string) {
    return this.webhooks.test(tenantOf(req), id);
  }

  @Get('endpoints/:id/deliveries')
  deliveries(
    @Req() req: OperatorRequest,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.webhooks.deliveries(tenantOf(req), id, limit);
  }

  @Post('endpoints/:id/deliveries/:messageId/resend')
  @HttpCode(202)
  resend(
    @Req() req: OperatorRequest,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.webhooks.resend(tenantOf(req), id, messageId);
  }
}
