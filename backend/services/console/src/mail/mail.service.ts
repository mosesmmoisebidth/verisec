import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { LOGO_PNG_BASE64 } from './logo';

/**
 * Sends the VeriSec transactional emails via the configured Gmail SMTP.
 *
 * There are three, all rendered in one branded shell (pine header + the real
 * "VS" monogram, lime accents, the design's type + colours): the signup
 * **verify-email** code, the **password-reset** code, and a **sign-in alert**.
 * Zitadel still owns the codes and the accounts — this only delivers them in
 * our own design so the emails match the product, not a generic notifier.
 *
 * The logo travels as an inline CID attachment (a small PNG, base64 in
 * `logo.ts`), so it renders in every client without any external hosting.
 */

const LIME = '#bfeb58';
const PINE = '#0e3228';
const INK = '#3d5448'; // body text
const MUTE = '#8aa093'; // fine print
const GROUND = '#eef1ea'; // outer ground
const HAIR = '#e4eadf'; // card border
const CODE_BG = '#f2f7ea';
const CODE_BORDER = '#dce8c8';
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO =
  "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const LOGO_CID = 'verisec-logo';

/* -------------------------------------------------------------- time zones */
/*
 * The website's demo calendar lets a visitor pick a time in their own time
 * zone. For whoever reads the request, we turn that wall-clock pick into one
 * absolute instant and then show it again in our own zone(s), so the time is
 * read directly, with no mental conversion. Done with the built-in Intl data
 * (no library), DST included.
 */

/** A zone's offset from UTC, in milliseconds, at a given instant. */
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUTC - at.getTime();
}

/** The UTC instant for a wall-clock date and time read in a given zone. */
function zonedWallToUtc(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const off1 = tzOffsetMs(timeZone, new Date(guess));
  let utc = guess - off1;
  // A second pass settles the rare case where the guess and the real instant
  // fall on opposite sides of a daylight-saving change.
  const off2 = tzOffsetMs(timeZone, new Date(utc));
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

/** e.g. "Tue, 3 Nov 2026, 15:30 GMT+2" read in the given zone. */
function fmtInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(instant);
}

/** The city from an IANA id: "Africa/Kigali" -> "Kigali". */
function zoneCity(timeZone: string): string {
  const seg = timeZone.split('/').pop() ?? timeZone;
  return seg.replace(/_/g, ' ');
}

interface Section {
  preheader: string;
  heading: string;
  lede: string;
  body: string; // pre-rendered inner blocks (code box / details / button)
  footnote: string;
}

@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  /** The platform's own mailbox (it sends every email): website messages are delivered to it. */
  private readonly mailbox: string;
  private readonly appUrl: string;
  /**
   * Our own time zone(s). A demo request's chosen time is shown again in each of
   * these so the inbox reads it in our time. Set DEMO_OWNER_TZS (comma-separated
   * IANA zones) to change them; defaults to Princeton then Kigali.
   */
  private readonly ownerZones: string[];

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST') ?? 'smtp.gmail.com';
    const port = Number(config.get<string>('SMTP_PORT') ?? 587);
    // The address shown in From (our own domain, e.g. noreply@verisec.dev).
    const user = config.get<string>('EMAIL_ADDRESS') ?? '';
    const pass = config.get<string>('EMAIL_PASSWORD') ?? '';
    const fromName = config.get<string>('EMAIL_FROM_NAME') ?? 'VeriSec';
    // Relays like Brevo authenticate with their own login, not the From address;
    // Gmail uses the address itself. Default to EMAIL_ADDRESS so nothing breaks.
    const authUser = config.get<string>('SMTP_USER') ?? user;
    this.appUrl = (
      config.get<string>('APP_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    this.from = `${fromName} <${user}>`;
    // Website contact-form messages land here. With a no-reply sender, point this
    // at a real inbox (e.g. support@verisec.dev) via EMAIL_INBOX; else the sender.
    this.mailbox = config.get<string>('EMAIL_INBOX') ?? user;
    this.ownerZones = (
      config.get<string>('DEMO_OWNER_TZS') ??
      'America/New_York,Africa/Kigali'
    )
      .split(',')
      .map((s) => s.trim())
      .filter((tz) => {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      });
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: authUser, pass },
    });
  }

  /* ------------------------------------------------------------------ shell */

  /** Wrap a section's blocks in the branded card (table-based, Outlook-safe). */
  private shell(s: Section): string {
    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${s.heading}</title>
</head>
<body style="margin:0;padding:0;background:${GROUND};">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${s.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND};">
  <tr><td align="center" style="padding:34px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:564px;background:#ffffff;border:1px solid ${HAIR};border-radius:20px;overflow:hidden;">
      <tr><td style="background:${PINE};padding:24px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <img src="cid:${LOGO_CID}" width="42" height="42" alt="VeriSec" style="display:block;border-radius:11px;border:0;outline:none;text-decoration:none;">
          </td>
          <td style="vertical-align:middle;padding-left:13px;font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.3px;color:#ffffff;">VeriSec</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:36px 32px 6px;font-family:${FONT};">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;color:${PINE};">${s.heading}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.62;color:${INK};">${s.lede}</p>
        ${s.body}
      </td></tr>
      <tr><td style="padding:20px 32px 30px;border-top:1px solid ${GROUND};font-family:${FONT};">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTE};">${s.footnote}</p>
      </td></tr>
    </table>
    <p style="max-width:564px;margin:18px auto 0;font-family:${FONT};font-size:11px;line-height:1.6;color:#9aa89f;text-align:center;">
      VeriSec · Identity verification, done right.<br>This is an automated message — please don't reply.
    </p>
  </td></tr>
</table>
</body></html>`;
  }

  /** A big, tap-to-copy verification code panel. */
  private codeBlock(code: string): string {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
      <td align="center" style="background:${CODE_BG};border:1px solid ${CODE_BORDER};border-radius:14px;padding:22px;">
        <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:#6d8478;margin:0 0 10px;">Your code</div>
        <div style="font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:8px;color:${PINE};">${code}</div>
      </td></tr></table>`;
  }

  /** A lime pill CTA button. */
  private button(label: string, href: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 6px;"><tr>
      <td align="center" bgcolor="${LIME}" style="border-radius:999px;">
        <a href="${href}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:14px;font-weight:600;color:${PINE};text-decoration:none;border-radius:999px;">${label}</a>
      </td></tr></table>`;
  }

  private async send(
    to: string,
    subject: string,
    section: Section,
    replyTo?: string,
  ): Promise<void> {
    const html = this.shell(section);
    const text = `${section.heading}\n\n${section.lede.replace(/<[^>]+>/g, '')}\n\n${section.footnote.replace(/<[^>]+>/g, '')}`;
    await this.transporter.sendMail({
      from: this.from,
      to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      text,
      html,
      attachments: [
        {
          filename: 'verisec.png',
          content: Buffer.from(LOGO_PNG_BASE64, 'base64'),
          cid: LOGO_CID,
          contentType: 'image/png',
        },
      ],
    });
    this.log.log(`sent "${subject}" to ${to}`);
  }

  /* ---------------------------------------------------------------- senders */

  private esc(s: string): string {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  }

  /** Danger zone: confirm an account deletion with a code sent to the owner's real email. */
  async sendDeleteCode(to: string, code: string, orgName: string): Promise<void> {
    await this.send(to, 'Confirm account deletion · VeriSec', {
      preheader: `Your account-deletion code is ${code}`,
      heading: 'Confirm account deletion',
      lede: `Enter this code to close the <b>${this.esc(orgName)}</b> account on VeriSec. If you did not ask to delete it, ignore this email and nothing changes.`,
      body: this.codeBlock(code),
      footnote: 'This code expires shortly. Deleting the account signs everyone out and stops every verification link and API key.',
    });
  }

  /** Danger zone: the recipient of an ownership transfer is asked to accept it. */
  async sendOwnershipInvite(to: string, m: { orgName: string; inviterName: string; link: string }): Promise<void> {
    await this.send(to, `Take ownership of ${m.orgName} · VeriSec`, {
      preheader: `${m.inviterName} wants to transfer ownership of ${m.orgName} to you`,
      heading: 'Ownership transfer',
      lede: `<b>${this.esc(m.inviterName)}</b> has asked to transfer ownership of <b>${this.esc(m.orgName)}</b> to you. Open VeriSec to accept; the current owner then confirms, and ownership moves to you.`,
      body: this.button('Review in VeriSec', m.link),
      footnote: 'Nothing changes until you accept and the current owner confirms. If this is unexpected, you can ignore it.',
    });
  }

  /** Danger zone: a transfer moved a step (accepted by the recipient, completed, or cancelled). */
  async sendOwnershipUpdate(to: string, m: { orgName: string; heading: string; lede: string; link?: string }): Promise<void> {
    await this.send(to, `${m.heading} · VeriSec`, {
      preheader: m.lede.replace(/<[^>]+>/g, ''),
      heading: m.heading,
      lede: m.lede,
      body: m.link ? this.button('Open VeriSec', m.link) : '',
      footnote: `Ownership of ${this.esc(m.orgName)} on VeriSec.`,
    });
  }

  /** Signup: confirm the email address. */
  async sendVerifyCode(to: string, code: string): Promise<void> {
    await this.send(to, 'Confirm your email · VeriSec', {
      preheader: `Your VeriSec verification code is ${code}`,
      heading: 'Confirm your email',
      lede: 'Welcome to VeriSec. Enter this code on the verification screen to confirm your email and activate your account.',
      body: this.codeBlock(code),
      footnote:
        "This code expires shortly. If you didn't create a VeriSec account, you can safely ignore this email.",
    });
  }

  /** Website contact form: a visitor's message to the team; replying answers the visitor directly. */
  async sendContact(m: {
    fullName: string;
    workEmail: string;
    company: string;
    companySize: string;
    reason: string;
    message: string;
  }): Promise<void> {
    const esc = (v: string) =>
      v.replace(
        /[&<>"]/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
    const one = (v: string) => v.replace(/[\r\n]+/g, ' ');
    const row = (k: string, v: string) =>
      v
        ? `<div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#6d8478;margin:0 0 4px;">${k}</div>
           <div style="font-size:15px;color:${PINE};margin:0 0 14px;white-space:pre-wrap;word-break:break-word;">${esc(v)}</div>`
        : '';
    const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
      <td style="background:#f6f8f3;border:1px solid ${HAIR};border-radius:14px;padding:18px 20px;font-family:${FONT};">
        ${row('Name', m.fullName)}${row('Work email', m.workEmail)}${row('Company', m.company)}${row('Company size', m.companySize)}${row('Topic', m.reason)}${row('Message', m.message)}
      </td></tr></table>`;
    await this.send(
      this.mailbox,
      `Website message: ${one(m.reason || 'General')} from ${one(m.fullName)}`,
      {
        preheader: esc(
          `${one(m.fullName)} wrote through the website contact form.`,
        ),
        heading: 'New message from the website',
        lede: `${esc(m.fullName)}${m.company ? ` from ${esc(m.company)}` : ''} wrote through the contact form. Reply to this email to answer them.`,
        body,
        footnote:
          'Sent from the contact form on the VeriSec website, after its security check.',
      },
      m.workEmail,
    );
  }

  /**
   * Website sales chat ("Chat With Sales"): the products a visitor picked, a rough volume and a note, and the page
   * it was sent from. Labelled as a sales chat so it reads apart from a contact form message; replying answers the
   * visitor directly.
   */
  async sendSalesChat(m: {
    products: string[];
    volume: string;
    message: string;
    fullName: string;
    workEmail: string;
    company: string;
    page: string;
  }): Promise<void> {
    const esc = (v: string) =>
      v.replace(
        /[&<>"]/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
    const one = (v: string) => v.replace(/[\r\n]+/g, ' ');
    const row = (k: string, v: string) =>
      v
        ? `<div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#6d8478;margin:0 0 4px;">${k}</div>
           <div style="font-size:15px;color:${PINE};margin:0 0 14px;white-space:pre-wrap;word-break:break-word;">${esc(v)}</div>`
        : '';
    const products = m.products.join(', ');
    const who = `${one(m.fullName)}${m.company ? ` from ${one(m.company)}` : ''}`;
    const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
      <td style="background:#f6f8f3;border:1px solid ${HAIR};border-radius:14px;padding:18px 20px;font-family:${FONT};">
        ${row('Name', m.fullName)}${row('Work email', m.workEmail)}${row('Company', m.company)}${row('Interested in', products)}${row('Monthly volume', m.volume)}${row('Message', m.message)}${row('Sent from page', m.page)}
      </td></tr></table>`;
    await this.send(
      this.mailbox,
      `Sales chat: ${who}`,
      {
        preheader: esc(
          `${who} asked about ${one(products)} in the sales chat.`,
        ),
        heading: 'New sales chat from the website',
        lede: `${esc(who)} asked to talk to sales in the chat on the website. Reply to this email to answer them.`,
        body,
        footnote:
          'Sent from the sales chat on the VeriSec website, after its security check.',
      },
      m.workEmail,
    );
  }

  /**
   * Website demo calendar: send the requested time to the admin inbox; replying
   * reaches the visitor. The visitor picks a time in their own zone (timezoneId);
   * we convert it to one instant and show it in our own zone(s) first, then as
   * the visitor picked it, then UTC, so the time is easy to read either way.
   */
  async sendDemoBooking(m: {
    fullName: string;
    workEmail: string;
    date: string;
    slot: string;
    /** IANA zone the visitor picked the time in, e.g. "Europe/Madrid". */
    timezoneId: string;
    page: string;
  }): Promise<void> {
    const esc = (v: string) =>
      v.replace(
        /[&<>"]/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
    const one = (v: string) => v.replace(/[\r\n]+/g, ' ');
    const row = (k: string, v: string) =>
      v
        ? `<div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#6d8478;margin:0 0 4px;">${k}</div>
           <div style="font-size:15px;color:${PINE};margin:0 0 14px;white-space:pre-wrap;word-break:break-word;">${esc(v)}</div>`
        : '';
    const who = one(m.fullName);

    // Turn the visitor's wall-clock pick into one absolute instant, then read it
    // back in every zone we care about.
    const [y, mo, d] = m.date.split('-').map(Number);
    const [hh, mm] = m.slot.split(':').map(Number);
    let instant: Date | null = null;
    try {
      instant = zonedWallToUtc(y!, mo!, d!, hh!, mm!, m.timezoneId);
      if (Number.isNaN(instant.getTime())) instant = null;
    } catch {
      instant = null;
    }

    const yourTime = instant
      ? this.ownerZones
          .map((tz) => `${zoneCity(tz)}: ${fmtInZone(instant!, tz)}`)
          .join('\n')
      : '';
    const visitorTime = instant
      ? `${fmtInZone(instant, m.timezoneId)}  ·  ${zoneCity(m.timezoneId)}`
      : `${m.date} at ${m.slot} (${m.timezoneId})`;
    const utcTime = instant ? fmtInZone(instant, 'UTC') : '';
    const headlineTime = yourTime.split('\n')[0] || visitorTime;

    const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
      <td style="background:#f6f8f3;border:1px solid ${HAIR};border-radius:14px;padding:18px 20px;font-family:${FONT};">
        ${row('Name', m.fullName)}${row('Work email', m.workEmail)}${row('Your time', yourTime)}${row('As the visitor picked it', visitorTime)}${row('UTC', utcTime)}${row('Sent from page', m.page)}
      </td></tr></table>`;
    await this.send(
      'admin@verisec.dev',
      `Demo request: ${who} · ${headlineTime}`,
      {
        preheader: esc(
          `${who} requested a demo. Your time: ${headlineTime}.`,
        ),
        heading: 'New demo request from the website',
        lede: `${esc(who)} requested a demo. The time is shown in your own time zone below. Reply to this email to confirm it and send the invite.`,
        body,
        footnote:
          'This is a request, not a confirmed booking. Please contact the visitor to confirm the time and send the invite.',
      },
      m.workEmail,
    );
  }

  /** Forgot password: the reset code. */
  async sendResetCode(to: string, code: string): Promise<void> {
    await this.send(to, 'Reset your password · VeriSec', {
      preheader: `Your VeriSec password reset code is ${code}`,
      heading: 'Reset your password',
      lede: 'We received a request to reset your VeriSec password. Enter this code on the reset screen to choose a new one.',
      body: this.codeBlock(code),
      footnote:
        "This code expires shortly. Didn't ask to reset your password? Ignore this email and it stays unchanged.",
    });
  }

  /** Team: an invitation to join an organisation, with the link that sets the person's password. */
  async sendInvite(
    to: string,
    p: { orgName: string; inviter: string; roleName: string; link: string },
  ): Promise<void> {
    const esc = (v: string) =>
      v.replace(
        /[&<>"]/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
    await this.send(to, `You're invited to ${p.orgName} on VeriSec`, {
      preheader: `${p.inviter} invited you to join ${p.orgName} as ${p.roleName}.`,
      heading: `Join ${esc(p.orgName)}`,
      lede: `${esc(p.inviter)} invited you to join <strong>${esc(p.orgName)}</strong> on VeriSec as <strong>${esc(p.roleName)}</strong>. Choose your password to accept.`,
      body: this.button('Accept the invitation', p.link),
      footnote:
        "This invitation works once and expires after a while. Didn't expect it? You can ignore this email.",
    });
  }

  /** A verification's access code, sent to the applicant (never shown to the organisation that asked). */
  async sendAccessCode(
    to: string,
    p: { orgName: string; code: string; minutes: number },
  ): Promise<void> {
    const esc = (v: string) =>
      v.replace(
        /[&<>"]/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
    await this.send(to, `Your verification code for ${p.orgName}`, {
      preheader: `Your VeriSec verification code is ${p.code}`,
      heading: 'Your verification code',
      lede: `<strong>${esc(p.orgName)}</strong> asked you to verify your identity with VeriSec. When you open the verification link or scan its QR code, enter this code to continue on your device.`,
      body: this.codeBlock(p.code),
      footnote: `The code works once, with that link, for ${p.minutes} minutes. Didn't expect this? Ignore this email: nobody can open the verification without it.`,
    });
  }

  /** A verification's link, sent on by the organisation; its access code goes in a separate email. */
  async sendVerificationLink(
    to: string,
    p: { orgName: string; link: string; minutes: number },
  ): Promise<void> {
    const esc = (v: string) =>
      v.replace(
        /[&<>"]/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
    await this.send(to, `Continue your verification for ${p.orgName}`, {
      preheader: `${p.orgName} sent you a link to continue a verification with VeriSec.`,
      heading: 'Continue your verification',
      lede: `<strong>${esc(p.orgName)}</strong> sent you this link to continue a verification with VeriSec. It opens where the verification stopped. We sent your access code in a separate email: enter it when the link asks.`,
      body: this.button('Continue the verification', p.link),
      footnote: `The link works for ${p.minutes} minutes, only with the access code, and only on the first device that enters it. Didn't expect this? Ignore this email.`,
    });
  }

  /**
   * The applicant's copy of their verification result: what the result screen said, never the reasons. The privacy
   * line states only what is true today: the data serves this verification, is stored encrypted, and is not sold or
   * used for anything else.
   */
  async sendVerificationResult(
    to: string,
    p: { orgName: string; verdict: string; reference: string },
  ): Promise<void> {
    const esc = (v: string) =>
      v.replace(
        /[&<>"]/g,
        (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
    const org = esc(p.orgName);
    const c =
      p.verdict === 'Approved'
        ? {
            subject: `You're verified with ${p.orgName}`,
            heading: "You're verified",
            lede: `<strong>${org}</strong> asked you to verify your identity with VeriSec, and everything checked out. ${org} has been told the result. Nothing else is needed from you.`,
          }
        : p.verdict === 'Declined'
          ? {
              subject: `Your verification with ${p.orgName}`,
              heading: "We couldn't verify you",
              lede: `One or more checks didn't pass, so we couldn't confirm your identity from what was submitted. A poor photo is the most common cause. If you think this is wrong, contact <strong>${org}</strong>: they can send you a new link to try again.`,
            }
          : {
              subject: `Your verification with ${p.orgName} is being reviewed`,
              heading: 'We need a closer look',
              lede: `Most of your checks passed, but one needs a person to look at it. Someone at <strong>${org}</strong> will review it and contact you. You don't need to start again.`,
            };
    const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr>
      <td style="background:${CODE_BG};border:1px solid ${CODE_BORDER};border-radius:14px;padding:16px 18px;">
        <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:#6d8478;margin:0 0 6px;">Reference</div>
        <div style="font-family:${MONO};font-size:16px;font-weight:700;letter-spacing:1px;color:${PINE};">${esc(p.reference)}</div>
      </td></tr></table>`;
    const privacy = `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:22px;color:${INK};">Your information was used only for this verification. It is stored encrypted for ${org} and is never sold or used for anything else.</p>`;
    await this.send(to, c.subject, {
      preheader: `${c.heading}: your verification with ${p.orgName}.`,
      heading: c.heading,
      lede: c.lede,
      body: details + privacy,
      footnote: `This is a copy of the result you saw at the end of your verification. Did not verify with ${org}? You can ignore this email.`,
    });
  }

  /**
   * A purchase receipt, sent to the buyer once Polar confirms payment: what they paid, what it granted
   * (credits topped up, or a monthly verification plan), the order reference, and — when it's ready — a button
   * to the official invoice PDF, plus a link to manage billing. Polar is the merchant of record, so the invoice
   * itself is issued by Polar; this is our own branded confirmation on top of it.
   */
  async sendReceipt(
    to: string,
    p: {
      heading: string;
      lede: string;
      amountText: string;
      itemText: string;
      reference: string;
      manageUrl: string;
      invoiceUrl?: string;
    },
  ): Promise<void> {
    const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>
      <td style="background:${CODE_BG};border:1px solid ${CODE_BORDER};border-radius:14px;padding:18px 20px;font-family:${FONT};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:14px;line-height:1.5;color:${INK};padding:0 0 10px;">${this.esc(p.itemText)}</td>
            <td align="right" style="font-size:18px;font-weight:700;color:${PINE};padding:0 0 10px;white-space:nowrap;">${this.esc(p.amountText)}</td>
          </tr>
          <tr><td colspan="2" style="border-top:1px solid ${CODE_BORDER};padding-top:10px;font-size:12px;color:${MUTE};">Reference&nbsp;<span style="font-family:${MONO};color:${INK};">${this.esc(p.reference)}</span></td></tr>
        </table>
      </td></tr></table>`;
    const cta = p.invoiceUrl
      ? this.button('Download invoice (PDF)', p.invoiceUrl) +
        `<p style="margin:12px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;"><a href="${p.manageUrl}" style="color:${PINE};font-weight:600;text-decoration:none;">Manage billing &rarr;</a></p>`
      : this.button('View billing', p.manageUrl);
    await this.send(to, `${p.heading} · VeriSec`, {
      preheader: `${p.heading}: ${p.itemText} (${p.amountText}).`,
      heading: p.heading,
      lede: p.lede,
      body: details + cta,
      footnote:
        'VeriSec payments are processed by Polar, our merchant of record; your official invoice is issued by Polar and is also available from the billing page. Questions? Reply to support@verisec.dev.',
    });
  }

  /** Login: a heads-up that the account was just signed in to. */
  async sendSignInAlert(to: string, whenText: string): Promise<void> {
    const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
      <td style="background:#f6f8f3;border:1px solid ${HAIR};border-radius:14px;padding:18px 20px;font-family:${FONT};">
        <div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#6d8478;margin:0 0 6px;">When</div>
        <div style="font-size:15px;color:${PINE};font-weight:600;">${whenText}</div>
      </td></tr></table>
      ${this.button('This wasn’t me — secure my account', `${this.appUrl}/reset-password`)}`;
    await this.send(to, 'New sign-in to your VeriSec account', {
      preheader: 'A new sign-in to your VeriSec account was just detected.',
      heading: 'New sign-in to your account',
      lede: 'We noticed a new sign-in to your VeriSec account. If this was you, no action is needed.',
      body: details,
      footnote:
        "If you don't recognise this sign-in, reset your password now and enable two-factor authentication in Settings.",
    });
  }

  /**
   * Login from a device (browser/computer) we haven't seen before. This is a
   * heads-up, not a block — the sign-in already succeeded. We surface which
   * device it was so the owner can spot anything they didn't do.
   */
  async sendNewDeviceAlert(
    to: string,
    deviceText: string,
    whenText: string,
  ): Promise<void> {
    const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
      <td style="background:#f6f8f3;border:1px solid ${HAIR};border-radius:14px;padding:18px 20px;font-family:${FONT};">
        <div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#6d8478;margin:0 0 6px;">Device</div>
        <div style="font-size:15px;color:${PINE};font-weight:600;margin:0 0 14px;">${deviceText}</div>
        <div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#6d8478;margin:0 0 6px;">When</div>
        <div style="font-size:15px;color:${PINE};font-weight:600;">${whenText}</div>
      </td></tr></table>
      ${this.button('This wasn’t me — secure my account', `${this.appUrl}/reset-password`)}`;
    await this.send(to, 'A new device signed in to your VeriSec account', {
      preheader: `A new device (${deviceText}) just signed in to your VeriSec account.`,
      heading: 'New device signed in',
      lede: `Your VeriSec account was just signed in to from a device we haven't seen before. If this was you, no action is needed — we're only letting you know.`,
      body: details,
      footnote:
        "Didn't sign in from a new device? Reset your password now and review your recognised devices in Settings.",
    });
  }
}
