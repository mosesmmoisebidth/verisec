import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { CreditsService, MICRO, toMicro } from './credits.service';
import {
  OperatorGuard,
  type OperatorRequest,
} from './verifications.controller';
import { CHECKS, priceRange, TEMPLATES } from './workflows';
import { WorkflowsService } from './workflows.service';
import { KeyServiceClient } from './key-service.client';
import { PolarService, type PolarProduct } from './polar.service';
import { EntitlementsService } from './entitlements.service';
import { Need, NeedGuard } from '../auth/roles';

const tenantOf = (req: OperatorRequest) =>
  req.org ?? req.homeOrg ?? 'local-dev';

/** Usage & Billing for the console: the organisation's credits, what used them, and its monthly budget. */
@Controller('api/billing')
@UseGuards(OperatorGuard, NeedGuard)
export class BillingController {
  constructor(
    private readonly credits: CreditsService,
    private readonly workflows: WorkflowsService,
    private readonly keys: KeyServiceClient,
    private readonly polar: PolarService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Need('billing.view')
  @Get('summary')
  async summary(@Req() req: OperatorRequest) {
    const org = tenantOf(req);
    const [account, usage, activity, estimate, plan] = await Promise.all([
      this.credits.account(org),
      this.credits.usage(org),
      this.credits.activity(org, 1, 10),
      this.estimate(org),
      this.entitlements.status(org).catch(() => null),
    ]);
    // the rate card is the same list the charges are taken from
    const rates = CHECKS.filter((c) => c.price > 0).map((c) => ({
      id: c.id,
      name: c.name,
      price: toMicro(c.price),
      available: c.available,
    }));
    // every API's price per call (the gateway's own list), with its product: kyc, micr, scan2pay
    const apis = await this.keys
      .apis({ org, actor: req.operator ?? 'console', role: 'viewer', mfa: false })
      .then((l) => l.map((a) => ({ id: a.id, name: a.label, product: a.product, price: a.price, upTo: a.dynamic })))
      .catch(() => []);
    return { unit: MICRO, account, usage, activity, estimate, rates, apis, plan, checkout: this.polar.canCheckout, invoices: [] };
  }

  /** The things an organisation can buy (credit packs and monthly plans), read live from Polar. */
  @Need('billing.view')
  @Get('catalog')
  async catalog() {
    const products = await this.polar.catalog().catch(() => []);
    return { enabled: this.polar.canCheckout, products };
  }

  /** Open a hosted checkout for one product; the answer is the URL to send the buyer to. */
  @Need('billing.manage')
  @Post('checkout')
  async checkout(@Req() req: OperatorRequest, @Body() body: { productId?: unknown; returnTo?: unknown }) {
    if (!this.polar.canCheckout)
      throw new BadRequestException('Payments are not configured yet. Please try again later.');
    const productId = typeof body?.productId === 'string' ? body.productId.trim() : '';
    if (!productId) throw new BadRequestException('Choose something to buy.');
    const products = await this.polar.catalog().catch((): PolarProduct[] => []);
    if (!products.some((p) => p.id === productId))
      throw new BadRequestException('That item is not for sale.');
    // Which billing page to come back to after paying; the service only honours its own allow-list.
    const returnTo = typeof body?.returnTo === 'string' ? body.returnTo : undefined;
    const { url } = await this.polar.createCheckout(tenantOf(req), productId, returnTo);
    return { url };
  }

  @Need('billing.view')
  @Get('activity')
  activity(
    @Req() req: OperatorRequest,
    @Query('page') page = '1',
    @Query('size') size = '10',
  ) {
    const n = Math.min(Math.max(Number(size) || 10, 1), 50);
    return this.credits.activity(
      tenantOf(req),
      Math.max(Number(page) || 1, 1),
      n,
    );
  }

  /** A monthly budget in credits (null removes it) and whether reaching it stops spending. */
  @Need('billing.manage')
  @Put('budget')
  async budget(
    @Req() req: OperatorRequest,
    @Body() body: { budget?: unknown; hardStop?: unknown },
  ) {
    const raw = body?.budget;
    let budget: number | null = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 10_000_000)
        throw new BadRequestException(
          'The budget is a number of credits from 0 to 10,000,000.',
        );
      budget = toMicro(n);
    }
    return this.credits.setBudget(
      tenantOf(req),
      budget,
      body?.hardStop === true,
      req.operator ?? 'unknown',
    );
  }

  /** What one verification is expected to cost: the default workflow's price (Standard KYC when there is none yet). */
  private async estimate(org: string) {
    let list: Awaited<ReturnType<WorkflowsService['list']>> = [];
    try {
      list = await this.workflows.list(org);
    } catch {
      /* no workflows to read: priced as Standard KYC */
    }
    const d = list.find((w) => w.isDefault);
    if (d)
      return {
        workflow: d.name,
        min: toMicro(d.priceRange.min),
        max: toMicro(d.priceRange.max),
      };
    const t = TEMPLATES.find((x) => x.id === 'standard-kyc');
    if (!t) return null;
    const p = priceRange(t.definition);
    return { workflow: t.name, min: toMicro(p.min), max: toMicro(p.max) };
  }
}
