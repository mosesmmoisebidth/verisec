import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';

import { FatfService } from './fatf.service';
import { OperatorGuard, type OperatorRequest } from './verifications.controller';

/**
 * The FATF high-risk / monitored country list: what is in force, and any update waiting for a person to confirm.
 * Operator-only. Approving applies the change to every workflow and the builder preset at once; dismissing declines
 * it. See FatfService: changes are never applied unattended.
 */
@Controller('api/fatf')
@UseGuards(OperatorGuard)
export class FatfController {
  constructor(private readonly fatf: FatfService) {}

  @Get()
  current() {
    return this.fatf.current();
  }

  @Post('approve')
  @HttpCode(200)
  approve(@Req() req: OperatorRequest) {
    return this.fatf.approve(req.operator ?? 'unknown');
  }

  @Post('dismiss')
  @HttpCode(200)
  dismiss(@Req() req: OperatorRequest) {
    return this.fatf.dismiss(req.operator ?? 'unknown');
  }

  /** Check the mirror now instead of waiting for the weekly job, then return the current state. */
  @Post('check')
  @HttpCode(200)
  async check(@Req() _req: OperatorRequest) {
    await this.fatf.check();
    return this.fatf.current();
  }
}
