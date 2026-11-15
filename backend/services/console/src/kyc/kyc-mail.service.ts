import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { LOGO_PNG_BASE64 } from '../mail/logo';

const LOGO_CID = 'verisec-logo';

/**
 * Sends the applicant's email one-time code, kept separate from the console's
 * own auth mail so a change here can never break sign-in or reset emails.
 *
 * Primary: the Resend API (KYC_RESEND_API_KEY), sending from the verified
 * taskbees.net domain over HTTPS. Fallback: the KYC SMTP account (KYC_SMTP_*).
 */
@Injectable()
export class KycMailService {
  private readonly log = new Logger('KycMail');
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly resendKey: string;
  readonly address: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('KYC_SMTP_HOST') ?? config.get<string>('SMTP_HOST') ?? '';
    const port = Number(config.get<string>('KYC_SMTP_PORT') ?? config.get<string>('SMTP_PORT') ?? 465);
    this.address = config.get<string>('KYC_EMAIL_ADDRESS') ?? config.get<string>('EMAIL_ADDRESS') ?? '';
    const pass = config.get<string>('KYC_EMAIL_PASSWORD') ?? config.get<string>('EMAIL_PASSWORD') ?? '';
    const name = config.get<string>('KYC_EMAIL_FROM_NAME') ?? 'VeriSec';
    this.from = `${name} <${this.address}>`;
    this.resendKey = config.get<string>('KYC_RESEND_API_KEY') ?? '';
    // A relay like Brevo authenticates with its own login, separate from the From address.
    const authUser = config.get<string>('KYC_SMTP_USER') ?? config.get<string>('SMTP_USER') ?? this.address;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: authUser, pass },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
  }

  async sendCode(to: string, code: string, minutes: number): Promise<void> {
    const spaced = code.split('').join(' ');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your verification code</title></head>
<body style="margin:0;padding:0;background:#f4f5f0;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f0;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e6dc;border-radius:18px;overflow:hidden;">
<tr><td style="background:#16392a;padding:18px 28px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><img src="cid:${LOGO_CID}" width="34" height="34" alt="VeriSec" style="display:block;border-radius:9px;border:0;outline:none;text-decoration:none;"></td>
<td style="vertical-align:middle;padding-left:11px;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:-0.2px;">VeriSec</td>
</tr></table></td></tr>
<tr><td style="padding:28px;color:#16392a;font-size:15px;line-height:1.55;">
<p style="margin:0 0 14px;font-size:17px;font-weight:bold;">Verify your email</p>
<p style="margin:0 0 14px;">Use this code to confirm your email address and continue your identity verification.</p>
<p style="margin:0 0 18px;font-size:32px;font-weight:bold;letter-spacing:6px;background:#eef6d9;border-radius:12px;padding:14px 0;text-align:center;">${spaced}</p>
<p style="margin:0 0 8px;">The code expires in ${minutes} minutes.</p>
<p style="margin:0;color:#5b6b60;font-size:13px;">If you did not start a verification, you can ignore this email. Never share this code with anyone.</p>
</td></tr></table></td></tr></table></body></html>`;
    const text = `Your verification code is ${code}. It expires in ${minutes} minutes. If you did not start a verification, ignore this email. Never share this code.`;
    const subject = `${code} is your verification code`;
    if (this.resendKey) {
      try {
        await this.viaResend(to, subject, html, text);
        this.log.log('verification code email sent (resend)');
        return;
      } catch (e) {
        this.log.warn(`resend failed, trying SMTP: ${(e as Error).message}`);
      }
    }
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
      attachments: [
        { filename: 'verisec.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), cid: LOGO_CID, contentType: 'image/png' },
      ],
    });
    this.log.log('verification code email sent (smtp)');
  }

  private async viaResend(to: string, subject: string, html: string, text: string): Promise<void> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [to], subject, html, text }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(`HTTP ${res.status} ${body.message ?? ''}`.trim());
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
