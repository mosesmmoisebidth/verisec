import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { Request } from 'express';

import { clientIp } from '../kyc/client-ip';
import { RateLimiter } from '../kyc/stores';
import { MailService } from '../mail/mail.service';
import { CaptchaService } from './captcha.service';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
// An IANA time-zone id: letters, digits and a few separators, e.g. "Europe/Madrid".
const TZ_ID = /^[A-Za-z0-9_+\-/]{1,64}$/;
/** True if the runtime recognises this as a real IANA time zone. */
const isValidTz = (id: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id });
    return true;
  } catch {
    return false;
  }
};
const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';
const line = (v: unknown, max: number) => text(v, max).replace(/\s+/g, ' ');
// the page the sales chat was sent from: a path on this site, printable characters only
const PAGE = /^\/[\x21-\x7e]{0,199}$/;

/**
 * The sales chat's request. Its shape and hard limits are checked here, before anything runs; the words for each
 * problem a person can fix are in the handler, as on the contact form.
 */
class SalesChatDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  products!: string[];
  @IsOptional() @IsString() @MaxLength(120) volume?: string;
  @IsOptional() @IsString() @MaxLength(8000) message?: string;
  @IsString() @MaxLength(200) fullName!: string;
  @IsString() @MaxLength(320) workEmail!: string;
  @IsOptional() @IsString() @MaxLength(240) company?: string;
  @IsOptional() @IsString() @MaxLength(400) page?: string;
}

class DemoBookingDto {
  @IsString() @MaxLength(80) fullName!: string;
  @IsString() @MaxLength(254) workEmail!: string;
  @IsString() @MaxLength(10) date!: string;
  @IsString() @MaxLength(5) slot!: string;
  /** IANA zone the visitor picked the time in, e.g. "Asia/Tokyo". */
  @IsString() @MaxLength(64) timezoneId!: string;
  /** Human label for the zone (display only); the id above is authoritative. */
  @IsOptional() @IsString() @MaxLength(120) timezone?: string;
  @IsOptional() @IsString() @MaxLength(400) page?: string;
}

/**
 * The website's contact form, sales chat and demo booking: a visitor's request, after the human check, goes to the
 * appropriate team inbox with the visitor as the reply-to address. Public, so all three share one per-address limit.
 */
@Controller('api/contact')
export class ContactController {
  private readonly limiter = new RateLimiter();
  private readonly demoSlots = new Set(['09:00', '10:30', '13:00', '15:30']);

  constructor(
    private readonly mail: MailService,
    private readonly captcha: CaptchaService,
  ) {}

  @Post()
  @HttpCode(200)
  async send(@Req() req: Request, @Body() b: Record<string, unknown>) {
    const ip = clientIp(req);
    if (!this.limiter.take(`contact:${ip}`, 5, 60 * 60_000))
      throw new HttpException(
        {
          code: 'too_many',
          message:
            'You have sent several messages already. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await this.captcha.check(req.headers['x-captcha-token'], 'contact', ip);
    const m = {
      fullName: text(b.fullName, 80),
      workEmail: text(b.workEmail, 254).toLowerCase(),
      company: text(b.company, 120),
      companySize: text(b.companySize, 40),
      reason: text(b.reason, 60),
      message: text(b.message, 4000),
    };
    if (m.fullName.length < 2)
      throw new BadRequestException({
        code: 'invalid',
        field: 'fullName',
        message: 'Enter your name.',
      });
    if (!EMAIL.test(m.workEmail))
      throw new BadRequestException({
        code: 'invalid',
        field: 'workEmail',
        message: 'Enter a valid work email.',
      });
    if (m.message.length < 10)
      throw new BadRequestException({
        code: 'invalid',
        field: 'message',
        message: 'Tell us a little more (at least 10 characters).',
      });
    try {
      await this.mail.sendContact(m);
    } catch {
      throw new HttpException(
        {
          code: 'not_sent',
          message:
            'Your message could not be sent. Please try again in a moment.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { ok: true };
  }

  /** A demo request from the Contact page's calendar; the visitor receives a reply after the team confirms it. */
  @Post('book-demo')
  @HttpCode(200)
  async bookDemo(@Req() req: Request, @Body() b: DemoBookingDto) {
    const ip = clientIp(req);
    if (!this.limiter.take(`contact:${ip}`, 5, 60 * 60_000))
      throw new HttpException(
        {
          code: 'too_many',
          message:
            'You have sent several messages already. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await this.captcha.check(req.headers['x-captcha-token'], 'book_demo', ip);

    const m = {
      fullName: line(b.fullName, 80),
      workEmail: text(b.workEmail, 254).toLowerCase(),
      date: line(b.date, 10),
      slot: line(b.slot, 5),
      timezoneId: line(b.timezoneId, 64),
      page: line(b.page, 200),
    };
    if (m.fullName.length < 2)
      throw new BadRequestException({
        code: 'invalid',
        field: 'fullName',
        message: 'Enter your name.',
      });
    if (!EMAIL.test(m.workEmail))
      throw new BadRequestException({
        code: 'invalid',
        field: 'workEmail',
        message: 'Enter a valid work email.',
      });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(m.date)
      ? new Date(`${m.date}T00:00:00.000Z`)
      : null;
    const today = new Date().toISOString().slice(0, 10);
    if (
      !date ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== m.date ||
      m.date <= today ||
      [0, 6].includes(date.getUTCDay())
    )
      throw new BadRequestException({
        code: 'invalid',
        field: 'date',
        message: 'Choose a future weekday for the demo.',
      });
    if (!this.demoSlots.has(m.slot))
      throw new BadRequestException({
        code: 'invalid',
        field: 'slot',
        message: 'Choose one of the listed demo times.',
      });
    if (!TZ_ID.test(m.timezoneId) || !isValidTz(m.timezoneId))
      throw new BadRequestException({
        code: 'invalid',
        field: 'timezone',
        message: 'Choose a valid time zone.',
      });

    try {
      await this.mail.sendDemoBooking({
        fullName: m.fullName,
        workEmail: m.workEmail,
        date: m.date,
        slot: m.slot,
        timezoneId: m.timezoneId,
        page: PAGE.test(m.page) ? m.page : '',
      });
    } catch {
      throw new HttpException(
        {
          code: 'not_sent',
          message:
            'Your demo request could not be sent. Please try again in a moment.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { ok: true };
  }

  /**
   * The "Chat With Sales" panel: the products a visitor picked, a rough monthly volume and a note (both optional),
   * how to reach them, and the page they sent it from. The same checks as the contact form, and the same mailbox,
   * labelled as a sales chat for whoever reads it.
   */
  @Post('sales-chat')
  @HttpCode(200)
  async salesChat(@Req() req: Request, @Body() b: SalesChatDto) {
    const ip = clientIp(req);
    if (!this.limiter.take(`contact:${ip}`, 5, 60 * 60_000))
      throw new HttpException(
        {
          code: 'too_many',
          message:
            'You have sent several messages already. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await this.captcha.check(req.headers['x-captcha-token'], 'sales_chat', ip);
    const page = line(b.page, 200);
    const m = {
      products: [
        ...new Set(b.products.map((p) => line(p, 80)).filter(Boolean)),
      ],
      volume: line(b.volume, 60),
      message: text(b.message, 4000),
      fullName: line(b.fullName, 80),
      workEmail: text(b.workEmail, 254).toLowerCase(),
      company: line(b.company, 120),
      page: PAGE.test(page) ? page : '',
    };
    if (!m.products.length)
      throw new BadRequestException({
        code: 'invalid',
        field: 'products',
        message: 'Pick at least one product.',
      });
    if (m.fullName.length < 2)
      throw new BadRequestException({
        code: 'invalid',
        field: 'fullName',
        message: 'Enter your name.',
      });
    if (!EMAIL.test(m.workEmail))
      throw new BadRequestException({
        code: 'invalid',
        field: 'workEmail',
        message: 'Enter a valid work email.',
      });
    try {
      await this.mail.sendSalesChat(m);
    } catch {
      throw new HttpException(
        {
          code: 'not_sent',
          message:
            'Your request could not be sent. Please try again in a moment.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { ok: true };
  }
}
