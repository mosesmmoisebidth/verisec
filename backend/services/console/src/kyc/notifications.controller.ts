import { BadRequestException, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';

import { capabilitiesOf } from '../auth/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { OperatorGuard, type OperatorRequest } from './verifications.controller';

/** The bell: the signed-in person's notifications (theirs, and the team's their role may see), and marking them read. */
@Controller('api/notifications')
@UseGuards(OperatorGuard)
export class NotificationsController {
  constructor(private readonly notes: NotificationsService) {}

  private who(req: OperatorRequest) {
    const org = req.org ?? req.homeOrg;
    if (!org || !req.userId) throw new BadRequestException('Sign in to see your notifications.');
    return { org, user: req.userId, caps: req.caps ?? capabilitiesOf(req.role ?? 'viewer') };
  }

  @Get()
  list(@Req() req: OperatorRequest) {
    const w = this.who(req);
    return this.notes.list(w.org, w.user, w.caps);
  }

  @Post('read')
  @HttpCode(200)
  async readAll(@Req() req: OperatorRequest) {
    const w = this.who(req);
    await this.notes.read(w.org, w.user, w.caps);
    return { ok: true };
  }

  @Post(':id/read')
  @HttpCode(200)
  async readOne(@Req() req: OperatorRequest, @Param('id') id: string) {
    if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('No such notification.');
    const w = this.who(req);
    await this.notes.read(w.org, w.user, w.caps, id);
    return { ok: true };
  }
}
