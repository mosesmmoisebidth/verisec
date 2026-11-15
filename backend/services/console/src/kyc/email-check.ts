import { promises as dns } from 'node:dns';
import * as net from 'node:net';
import { randomBytes } from 'node:crypto';

import { DISPOSABLE_DOMAINS } from './disposable-domains';

/**
 * "Does this email address exist?", answered before any code is sent.
 *
 *   1. syntax          (RFC 5321 shape and lengths)
 *   2. typo suggestion (gmial.com -> gmail.com)
 *   3. disposable      (temporary inbox services are refused)
 *   4. mail server     (the domain has MX, or an A record as implicit MX)
 *   5. mailbox probe   (ask the mail server whether it would accept mail for
 *                       the address: RCPT TO, never sending anything, then a
 *                       random address on the same domain to detect servers
 *                       that accept everything)
 *
 * Step 5 needs outbound port 25. Where that is blocked, or the server will not
 * say, the mailbox is "unverified" and the address is still allowed: the
 * one-time code the person types back proves the mailbox is real and theirs.
 */

export type Mailbox = 'exists' | 'missing' | 'catch_all' | 'unverified';

export interface EmailCheck {
  email: string;
  domain: string;
  syntaxOk: boolean;
  disposable: boolean;
  hasMailServer: boolean;
  /** The domain's mail servers, most preferred first (at most three). */
  mailServers?: string[];
  mailbox: Mailbox;
  /** yes = confirmed, no = refuse, unknown = allowed, the code will prove it. */
  deliverable: 'yes' | 'no' | 'unknown';
  freeProvider: boolean;
  suggestion?: string;
  /** Applicant-facing explanation when deliverable is "no". */
  reason?: string;
}

const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const FREE_PROVIDERS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'yahoo.co.uk', 'outlook.com', 'hotmail.com',
  'hotmail.fr', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  'yandex.com', 'yandex.ru', 'mail.com', 'gmx.com', 'gmx.de', 'zoho.com', 'mail.ru',
];

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** A likely intended provider for a mistyped domain (distance 1 to 2). */
function suggestDomain(domain: string): string | undefined {
  if (FREE_PROVIDERS.includes(domain)) return undefined;
  let best: { d: string; n: number } | undefined;
  for (const d of FREE_PROVIDERS) {
    const n = levenshtein(domain, d);
    if (n > 0 && n <= 2 && (!best || n < best.n)) best = { d, n };
  }
  return best?.d;
}

async function mailHosts(domain: string): Promise<string[]> {
  try {
    const mx = await dns.resolveMx(domain);
    // A null MX ("." per RFC 7505) means the domain accepts no mail.
    const hosts = mx
      .filter((r) => r.exchange && r.exchange !== '.')
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange);
    if (mx.length && !hosts.length) return [];
    if (hosts.length) return hosts;
  } catch {
    /* fall through to the implicit MX */
  }
  try {
    const a = await dns.resolve4(domain);
    return a.length ? [domain] : [];
  } catch {
    return [];
  }
}

/** Reads SMTP replies, joining multi-line ones ("250-..." then "250 ..."). */
function smtpSession(host: string, timeoutMs: number) {
  const sock = net.createConnection({ host, port: 25 });
  sock.setTimeout(timeoutMs);
  let buf = '';
  const waiters: ((r: { code: number; text: string }) => void)[] = [];
  const queue: { code: number; text: string }[] = [];
  let failed: Error | null = null;
  const rejecters: ((e: Error) => void)[] = [];

  const fail = (e: Error) => {
    failed = e;
    rejecters.splice(0).forEach((r) => r(e));
    sock.destroy();
  };
  sock.on('data', (d) => {
    buf += d.toString('latin1');
    let lines: string[] = [];
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const reply = { code: Number(line.slice(0, 3)), text: lines.join(' ') };
        lines = [];
        const w = waiters.shift();
        if (w) {
          rejecters.shift();
          w(reply);
        } else queue.push(reply);
      }
    }
  });
  sock.on('timeout', () => fail(new Error('timeout')));
  sock.on('error', (e) => fail(e));
  sock.on('close', () => fail(new Error('closed')));

  const read = () =>
    new Promise<{ code: number; text: string }>((resolve, reject) => {
      const q = queue.shift();
      if (q) return resolve(q);
      if (failed) return reject(failed);
      waiters.push(resolve);
      rejecters.push(reject);
    });
  const cmd = async (line: string) => {
    sock.write(line + '\r\n');
    return read();
  };
  return { read, cmd, close: () => sock.end('QUIT\r\n') };
}

const USER_UNKNOWN = /5\.1\.1|5\.1\.0|user unknown|unknown user|no such user|does not exist|doesn't exist|not exist|mailbox unavailable|mailbox not found|invalid recipient|recipient not found|address rejected|no mailbox/i;

/**
 * The server's answer to one RCPT TO, each in its own session. Some servers (Microsoft 365 among them) take only one
 * recipient per session from a stranger and answer the next with "452 Too many recipients", which says nothing about
 * that address; asking twice on one connection read that 452 as a refusal and called made-up addresses real.
 */
async function rcpt(mx: string, address: string, helo: string, mailFrom: string, timeoutMs: number): Promise<{ code: number; text: string } | null> {
  const s = smtpSession(mx, timeoutMs);
  try {
    if ((await s.read()).code !== 220) return null;
    let r = await s.cmd(`EHLO ${helo}`);
    if (r.code !== 250) r = await s.cmd(`HELO ${helo}`);
    if (r.code !== 250) return null;
    if ((await s.cmd(`MAIL FROM:<${mailFrom}>`)).code !== 250) return null;
    const reply = await s.cmd(`RCPT TO:<${address}>`);
    s.close();
    return reply;
  } catch {
    return null;
  }
}

async function probeMailbox(
  mx: string,
  email: string,
  domain: string,
  helo: string,
  mailFrom: string,
  timeoutMs: number,
): Promise<Mailbox> {
  const ok = (c: number) => c >= 250 && c < 260;
  const target = await rcpt(mx, email, helo, mailFrom, timeoutMs);
  if (!target) return 'unverified';
  if (target.code >= 500 && USER_UNKNOWN.test(target.text)) return 'missing';
  if (!ok(target.code)) return 'unverified'; // 4xx greylisting, policy blocks of our IP, etc.
  // Accepted. That proves the mailbox only if the same server refuses a made-up address on the same domain as unknown;
  // a server that accepts the made-up one too accepts everything and has told us nothing.
  const random = await rcpt(mx, `${randomBytes(9).toString('hex')}@${domain}`, helo, mailFrom, timeoutMs);
  if (!random) return 'unverified';
  if (ok(random.code)) return 'catch_all';
  if (random.code >= 500 && USER_UNKNOWN.test(random.text)) return 'exists';
  return 'unverified';
}

export interface EmailCheckOptions {
  probe: boolean;
  heloHost: string;
  mailFrom: string;
  timeoutMs?: number;
}

export async function checkEmail(raw: string, opts: EmailCheckOptions): Promise<EmailCheck> {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  const domain = at > 0 ? email.slice(at + 1) : '';
  const base: EmailCheck = {
    email,
    domain,
    syntaxOk: false,
    disposable: false,
    hasMailServer: false,
    mailbox: 'unverified',
    deliverable: 'no',
    freeProvider: FREE_PROVIDERS.includes(domain),
  };

  if (!EMAIL_RE.test(email) || email.length > 254 || at > 64) {
    return { ...base, reason: "That doesn't look like a valid email address. Please check it." };
  }
  base.syntaxOk = true;
  const suggestion = suggestDomain(domain);
  if (suggestion) base.suggestion = email.slice(0, at + 1) + suggestion;

  if (DISPOSABLE_DOMAINS.has(domain) || DISPOSABLE_DOMAINS.has(domain.split('.').slice(-2).join('.'))) {
    return {
      ...base,
      disposable: true,
      // A typo of a real provider reads better as a correction than a refusal.
      reason: base.suggestion
        ? `Did you mean ${base.suggestion}?`
        : 'Temporary email addresses are not accepted. Please use a permanent email address.',
    };
  }

  const hosts = await mailHosts(domain);
  if (!hosts.length) {
    return {
      ...base,
      reason: base.suggestion
        ? `We couldn't find a mail server for ${domain}. Did you mean ${base.suggestion}?`
        : `We couldn't find a mail server for ${domain}. Please check the address.`,
    };
  }
  base.hasMailServer = true;
  base.mailServers = hosts.slice(0, 3);

  let mailbox: Mailbox = 'unverified';
  if (opts.probe) {
    for (const mx of hosts.slice(0, 2)) {
      mailbox = await probeMailbox(mx, email, domain, opts.heloHost, opts.mailFrom, opts.timeoutMs ?? 7000);
      if (mailbox !== 'unverified') break;
    }
  }
  if (mailbox === 'missing') {
    return {
      ...base,
      mailbox,
      reason: base.suggestion
        ? `This email address doesn't seem to exist. Did you mean ${base.suggestion}?`
        : "This email address doesn't seem to exist. Please check it for typos.",
    };
  }
  return { ...base, mailbox, deliverable: mailbox === 'exists' ? 'yes' : 'unknown' };
}
