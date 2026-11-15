import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AccountService } from './account.service';
import { OperatorGuard } from './verifications.controller';
import { buildXlsx } from './xlsx';
import { clientIp } from './client-ip';

/**
 * Danger-zone account actions: deactivate, transfer ownership, soft-delete. The OperatorGuard makes sure
 * there is a valid signed-in session; AccountService re-reads it to resolve the person/org and enforces
 * that only an owner (and, for transfer, the right party) may act.
 */
@Controller('api/account')
@UseGuards(OperatorGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  private sid(req: Request): string {
    try {
      const s = JSON.parse((req.cookies?.['vs_session'] as string) ?? 'null') as { sessionId?: string } | null;
      if (s?.sessionId) return s.sessionId;
    } catch {}
    throw new UnauthorizedException('not signed in');
  }

  @Get('members')
  members(@Req() req: Request) {
    return this.account.members(this.sid(req));
  }

  /* ---- Security tab ---- */

  @Get('security')
  getSecurity(@Req() req: Request) {
    return this.account.getSecurity(this.sid(req));
  }

  @Patch('security')
  setSecurity(@Req() req: Request, @Body() body: { sessionTimeoutHours?: unknown; ipAllowlist?: unknown }) {
    return this.account.setSecurity(this.sid(req), body ?? {}, clientIp(req));
  }

  @Post('security/sso')
  configureSso(@Req() req: Request, @Body() body: { name?: unknown; metadataXml?: unknown }) {
    return this.account.configureSso(this.sid(req), body ?? {});
  }

  @Delete('security/sso')
  disableSso(@Req() req: Request) {
    return this.account.disableSso(this.sid(req));
  }

  @Get('audit')
  audit(@Req() req: Request, @Query('limit') limit?: string) {
    return this.account.auditLog(this.sid(req), Number(limit) || 100);
  }

  /** The audit log as an Excel workbook. */
  @Get('audit.xlsx')
  async auditXlsx(@Req() req: Request, @Res() res: Response) {
    const { entries } = await this.account.auditLog(this.sid(req), 5000);
    const headers = ['When (UTC)', 'Who', 'Action', 'Detail', 'IP'];
    const rows = entries.map((e) => [
      e.at.replace('T', ' ').slice(0, 19),
      e.actor,
      e.action,
      e.detail ?? '',
      e.ip ?? '',
    ]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="verisec-audit-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buildXlsx('Audit log', headers, rows));
  }

  @Post('deactivate')
  @HttpCode(200)
  deactivate(@Req() req: Request) {
    return this.account.deactivate(this.sid(req));
  }

  @Get('transfer')
  transferStatus(@Req() req: Request) {
    return this.account.transferStatus(this.sid(req));
  }

  @Post('transfer')
  @HttpCode(200)
  transferInitiate(@Req() req: Request, @Body() body: { toUserId?: unknown }) {
    return this.account.transferInitiate(this.sid(req), typeof body?.toUserId === 'string' ? body.toUserId : '');
  }

  @Post('transfer/accept')
  @HttpCode(200)
  transferAccept(@Req() req: Request) {
    return this.account.transferAccept(this.sid(req));
  }

  @Post('transfer/approve')
  @HttpCode(200)
  transferApprove(@Req() req: Request) {
    return this.account.transferApprove(this.sid(req));
  }

  @Post('transfer/cancel')
  @HttpCode(200)
  transferCancel(@Req() req: Request) {
    return this.account.transferCancel(this.sid(req));
  }

  @Post('delete/start')
  @HttpCode(200)
  deleteStart(@Req() req: Request) {
    return this.account.deleteStart(this.sid(req));
  }

  @Post('delete/confirm')
  @HttpCode(200)
  deleteConfirm(@Req() req: Request, @Body() body: { code?: unknown }) {
    return this.account.deleteConfirm(this.sid(req), typeof body?.code === 'string' ? body.code : '');
  }
}
