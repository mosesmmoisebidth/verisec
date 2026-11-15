import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Need, NeedGuard } from '../auth/roles';
import { BrandingService } from './branding.service';
import { OperatorGuard, type OperatorRequest } from './verifications.controller';

const IMG = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/**
 * Branding — the white-label layer applicants see on the hosted verification screens (company name,
 * logo, and the URL they return to). Reading is open to any member; changing it is owner/admin only.
 * The applicant flow reads the same values through the public `/api/kyc/brand` endpoint.
 */
@Controller('api/branding')
@UseGuards(OperatorGuard, NeedGuard)
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  private tenantOf(req: OperatorRequest): string {
    return req.org ?? req.homeOrg ?? '';
  }

  private assertCanEdit(req: OperatorRequest) {
    if (req.role !== 'owner' && req.role !== 'admin')
      throw new ForbiddenException('Only an owner or admin can change branding.');
  }

  @Need('verifications.summary')
  @Get()
  async read(@Req() req: OperatorRequest) {
    const b = await this.branding.get(this.tenantOf(req));
    // The logo can be large; send only whether one is set, plus the data for preview.
    return { companyName: b.companyName, returnUrl: b.returnUrl, logo: b.logo, hasLogo: !!b.logo };
  }

  @Need('verifications.summary')
  @Patch()
  async update(@Req() req: OperatorRequest, @Body() body: { companyName?: unknown; returnUrl?: unknown }) {
    this.assertCanEdit(req);
    const patch: { companyName?: string | null; returnUrl?: string | null } = {};
    if (body?.companyName !== undefined) {
      const n = String(body.companyName ?? '').trim();
      if (n.length > 80) throw new BadRequestException('The company name can be up to 80 characters.');
      patch.companyName = n || null;
    }
    if (body?.returnUrl !== undefined) {
      const u = String(body.returnUrl ?? '').trim();
      if (u && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(u))
        throw new BadRequestException('The return URL must be a full https:// address.');
      patch.returnUrl = u || null;
    }
    const b = await this.branding.set(this.tenantOf(req), patch);
    return { companyName: b.companyName, returnUrl: b.returnUrl, hasLogo: !!b.logo };
  }

  @Need('verifications.summary')
  @Post('logo')
  @HttpCode(200)
  async setLogo(@Req() req: OperatorRequest, @Body() body: { image?: unknown }) {
    this.assertCanEdit(req);
    const v = String(body?.image ?? '').trim();
    if (!IMG.test(v)) throw new BadRequestException('That image could not be read. Use a PNG, JPEG, WebP or SVG.');
    if (v.length > 400 * 1024) throw new BadRequestException('That logo is too large. It is resized automatically — try again.');
    const b = await this.branding.setLogo(this.tenantOf(req), v);
    return { hasLogo: !!b.logo, logo: b.logo };
  }

  @Need('verifications.summary')
  @Delete('logo')
  @HttpCode(200)
  async clearLogo(@Req() req: OperatorRequest) {
    this.assertCanEdit(req);
    await this.branding.setLogo(this.tenantOf(req), null);
    return { hasLogo: false };
  }
}
