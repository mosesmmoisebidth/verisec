/**
 * The native connectors: the apps VeriSec runs itself, for free, with one-click OAuth.
 *
 * VeriSec registers ONE OAuth app per platform (its client id and secret live in the
 * environment, shared by every organisation). A customer then connects their own account
 * in one click: Connect -> the platform's own sign-in -> back to our callback. We store
 * only what that returns (an incoming-webhook URL, or an access token), encrypted per
 * organisation. Telegram has no OAuth, so it uses one shared bot the customer adds to
 * their chat; its "secret" is just the chat id.
 *
 * Sending never carries personal data: the automation's message is built from the event's
 * safe fields only (see webhook-events.ts `cleanData`).
 */

import { fileText, SHEET_HEADERS, sheetRow, statusColor, summarize } from './format';

const env = (k: string) => process.env[k] ?? '';

export interface ConnectResult {
  /** Stored encrypted (OpenBao). Shape is per provider. */
  secret: Record<string, unknown>;
  /** A human label for the connection (the channel name, the account). */
  alias: string | null;
}

export interface SendResult {
  ok: boolean;
  error: string | null;
  data?: unknown;
}

export interface NativeProvider {
  slug: string;
  /** OAuth providers send the person to `authorizeUrl`; non-OAuth (Telegram) do not. */
  oauth: boolean;
  configured(): boolean;
  authorizeUrl?(redirectUri: string, state: string): string;
  exchange?(code: string, redirectUri: string): Promise<ConnectResult>;
  send(action: string, secret: Record<string, unknown>, input: Record<string, unknown>): Promise<SendResult>;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

async function postForm(url: string, form: Record<string, string>, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  return res.json();
}

/* ------------------------------------------------------------------- Slack -- */

/* --------------------------------------------------- shared message building -- */

// Each event, in plain words with an icon, so a channel message reads at a glance.
const EVENT_LOOK: Record<string, { emoji: string; label: string }> = {
  'verification.created': { emoji: '🆕', label: 'Verification created' },
  'verification.started': { emoji: '▶️', label: 'Verification started' },
  'verification.step_completed': { emoji: '✔️', label: 'Verification step completed' },
  'verification.completed': { emoji: '✅', label: 'Verification completed' },
  'verification.approved': { emoji: '✅', label: 'Verification approved' },
  'verification.declined': { emoji: '⛔', label: 'Verification declined' },
  'verification.needs_review': { emoji: '🔎', label: 'Verification needs review' },
  'verification.updated': { emoji: '✏️', label: 'Verification updated' },
  'verification.redacted': { emoji: '🗑️', label: 'Verification redacted' },
  'face.match.completed': { emoji: '🙂', label: 'Face match completed' },
  'face.liveness.completed': { emoji: '👁️', label: 'Liveness check completed' },
  'aml.screening.completed': { emoji: '📋', label: 'AML screening completed' },
  'aml.hit': { emoji: '⚠️', label: 'AML hit' },
  'account.low_balance': { emoji: '💳', label: 'Low balance' },
  'account.payment_failed': { emoji: '❌', label: 'Payment failed' },
  'account.live_key': { emoji: '🔑', label: 'Live key changed' },
  'account.security_alert': { emoji: '🔒', label: 'Security alert' },
  'account.volume_anomaly': { emoji: '📈', label: 'Volume anomaly' },
};

/**
 * Build a readable summary of the event for a chat message: a title headed with the ORGANISATION'S name,
 * labelled rows of the non-confidential facts (reference, ID type, country, the stage reached, the status
 * and score), and one plain-text version. Deliberately no raw session/verification id (people can't read
 * those) and no personal data.
 */
function eventSummary(input: Record<string, unknown>): { title: string; rows: [string, string][]; text: string } {
  const type = String(input.__event_type ?? 'event');
  const ev = (input.__event && typeof input.__event === 'object' ? input.__event : {}) as Record<string, unknown>;
  const s = summarize(type, ev);
  const look = EVENT_LOOK[type] ?? { emoji: '🔔', label: type.replace(/[._]/g, ' ') };
  const title = `${look.emoji} ${s.company} — ${look.label}`;
  const rows: [string, string][] = [];
  if (s.reference) rows.push(['Reference', s.reference]);
  if (s.workflow) rows.push(['Workflow', s.workflow]);
  if (s.idType) rows.push(['ID type', s.idType]);
  if (s.country) rows.push(['Country', s.country]);
  rows.push(['Stage', s.stage]);
  rows.push(['Status', s.statusLabel]);
  if (s.score) rows.push(['Score', s.score]);
  rows.push(['Time', s.time + ' UTC']);
  // Plain text (no markdown), so it reads cleanly on every app; Slack adds its own rich blocks.
  const text = `${title}\n` + rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  return { title, rows, text };
}

/** A Slack Block Kit message (a titled card with the fields), plus a plain-text fallback. */
function slackMessage(input: Record<string, unknown>): Record<string, unknown> {
  const { title, rows, text } = eventSummary(input);
  return {
    text,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title.slice(0, 150), emoji: true } },
      { type: 'section', fields: rows.slice(0, 10).map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${v}` })) },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'VeriSec · identity verification' }] },
    ],
  };
}

const slack: NativeProvider = {
  slug: 'slack',
  oauth: true,
  configured: () => !!env('SLACK_CLIENT_ID') && !!env('SLACK_CLIENT_SECRET'),
  authorizeUrl(redirectUri, state) {
    const p = new URLSearchParams({
      client_id: env('SLACK_CLIENT_ID'),
      scope: 'incoming-webhook',
      redirect_uri: redirectUri,
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${p}`;
  },
  async exchange(code, redirectUri) {
    const r = await postForm('https://slack.com/api/oauth.v2.access', {
      client_id: env('SLACK_CLIENT_ID'),
      client_secret: env('SLACK_CLIENT_SECRET'),
      code,
      redirect_uri: redirectUri,
    });
    const hook = r?.incoming_webhook;
    if (!r?.ok || !hook?.url) throw new Error(r?.error || 'slack_oauth_failed');
    return { secret: { webhook_url: hook.url }, alias: hook.channel ?? null };
  },
  async send(_action, secret, input) {
    const url = String(secret.webhook_url ?? '');
    if (!url) return { ok: false, error: 'not_connected' };
    const res = await postJson(url, slackMessage(input));
    return res.ok ? { ok: true, error: null } : { ok: false, error: `slack_http_${res.status}` };
  },
};

/* ----------------------------------------------------------------- Discord -- */

const discord: NativeProvider = {
  slug: 'discord',
  oauth: true,
  configured: () => !!env('DISCORD_CLIENT_ID') && !!env('DISCORD_CLIENT_SECRET'),
  authorizeUrl(redirectUri, state) {
    const p = new URLSearchParams({
      client_id: env('DISCORD_CLIENT_ID'),
      response_type: 'code',
      scope: 'webhook.incoming',
      redirect_uri: redirectUri,
      state,
    });
    return `https://discord.com/api/oauth2/authorize?${p}`;
  },
  async exchange(code, redirectUri) {
    const r = await postForm('https://discord.com/api/oauth2/token', {
      client_id: env('DISCORD_CLIENT_ID'),
      client_secret: env('DISCORD_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const url = r?.webhook?.url;
    if (!url) throw new Error('discord_oauth_failed');
    return { secret: { webhook_url: url }, alias: r?.webhook?.name ?? null };
  },
  async send(_action, secret, input) {
    const url = String(secret.webhook_url ?? '');
    if (!url) return { ok: false, error: 'not_connected' };
    const res = await postJson(url, { content: eventSummary(input).text });
    return res.ok ? { ok: true, error: null } : { ok: false, error: `discord_http_${res.status}` };
  },
};

/* ------------------------------------------------------------------- Figma -- */

const figma: NativeProvider = {
  slug: 'figma',
  oauth: true,
  configured: () => !!env('FIGMA_CLIENT_ID') && !!env('FIGMA_CLIENT_SECRET'),
  authorizeUrl(redirectUri, state) {
    const p = new URLSearchParams({
      client_id: env('FIGMA_CLIENT_ID'),
      redirect_uri: redirectUri,
      scope: 'file_comments:write',
      state,
      response_type: 'code',
    });
    return `https://www.figma.com/oauth?${p}`;
  },
  async exchange(code, redirectUri) {
    const r = await postForm('https://api.figma.com/v1/oauth/token', {
      client_id: env('FIGMA_CLIENT_ID'),
      client_secret: env('FIGMA_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    });
    if (!r?.access_token) throw new Error('figma_oauth_failed');
    return {
      secret: { access_token: r.access_token, refresh_token: r.refresh_token ?? null },
      alias: null,
    };
  },
  async send(_action, secret, input) {
    const token = String(secret.access_token ?? '');
    const fileKey = String(input.file_key ?? '');
    if (!token) return { ok: false, error: 'not_connected' };
    if (!fileKey) return { ok: false, error: 'missing_file_key' };
    const res = await postJson(
      `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}/comments`,
      { message: String(input.message ?? '') },
      { Authorization: `Bearer ${token}` },
    );
    return res.ok ? { ok: true, error: null } : { ok: false, error: `figma_http_${res.status}` };
  },
};

/* ------------------------------------------------------------------ Google -- */

// The Google *integration* (Drive / Sheets / Gmail) is its OWN OAuth app, in a
// different Google Cloud project from the sign-in client (auth.service.ts uses
// ZITADEL_GOOGLE_CLIENT_ID). They must stay separate: a shared GOOGLE_CLIENT_ID
// once made sign-in use the integration's client and broke it with a
// redirect_uri_mismatch. Fall back to the old name only for a dev .env not yet split.
const googleClientId = () => env('GOOGLE_INTEGRATIONS_CLIENT_ID') || env('GOOGLE_CLIENT_ID');
const googleClientSecret = () => env('GOOGLE_INTEGRATIONS_CLIENT_SECRET') || env('GOOGLE_CLIENT_SECRET');

async function googleAccessToken(refreshToken: string): Promise<string | null> {
  const r = await postForm('https://oauth2.googleapis.com/token', {
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return r?.access_token ?? null;
}

/** One evolving, colour-coded row per session in the chosen spreadsheet (keyed by the session id). */
async function logToSheet(
  auth: Record<string, string>,
  spreadsheetId: string,
  eventType: string,
  event: Record<string, unknown>,
): Promise<SendResult> {
  const s = summarize(eventType, event);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const get = (url: string) => fetch(url, { headers: auth, signal: AbortSignal.timeout(15_000) });
  const put = (url: string, body: unknown) =>
    fetch(url, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const N = SHEET_HEADERS.length;
  // Column letters from the header count, so adding a column doesn't break any range (A, B, ... up to Z).
  const last = String.fromCharCode(65 + N - 1); // last data column = the Session (upsert-key) column

  // 1. the first tab's numeric id (for colouring) and name (for A1-style ranges).
  const metaRes = await get(`${base}?fields=sheets.properties(sheetId,title)`);
  if (!metaRes.ok) return { ok: false, error: `sheets_http_${metaRes.status}` };
  const meta = (await metaRes.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  const props = meta.sheets?.[0]?.properties ?? {};
  const sheetId = props.sheetId ?? 0;
  const tab = props.title ?? 'Sheet1';
  const vals = (r: string) => `${base}/values/${encodeURIComponent(`${tab}!${r}`)}`;

  // 2. a company title row + a header row, written once, bold + frozen.
  const headRes = await get(vals(`A1:${last}2`));
  const head = headRes.ok ? ((await headRes.json()) as { values?: string[][] }) : { values: [] };
  if ((head.values?.[1]?.[0] ?? '') !== SHEET_HEADERS[0]) {
    await put(`${vals(`A1:${last}2`)}?valueInputOption=RAW`, { values: [[`${s.company} — Verification log`], [...SHEET_HEADERS]] });
    await postJson(
      `${base}:batchUpdate`,
      {
        requests: [
          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: N }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties.frozenRowCount' } },
        ],
      },
      auth,
    ).catch(() => undefined);
  }

  // 3. find this session's existing row by the Session column (the last one); data starts at row 3.
  const colRes = await get(vals(`${last}3:${last}`));
  const col = colRes.ok ? ((await colRes.json()) as { values?: string[][] }) : { values: [] };
  const idx = (col.values ?? []).findIndex((r) => (r?.[0] ?? '') === s.session);
  const row = sheetRow(s);
  let rowNumber = 0;
  if (idx >= 0) {
    rowNumber = 3 + idx;
    const up = await put(`${vals(`A${rowNumber}:${last}${rowNumber}`)}?valueInputOption=USER_ENTERED`, { values: [row] });
    if (!up.ok) return { ok: false, error: `sheets_http_${up.status}` };
  } else {
    const ap = await postJson(`${vals(`A3:${last}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values: [row] }, auth);
    if (!ap.ok) return { ok: false, error: `sheets_http_${ap.status}` };
    const apData = (await ap.json()) as { updates?: { updatedRange?: string } };
    rowNumber = Number(/![A-Z]+(\d+):/.exec(apData.updates?.updatedRange ?? '')?.[1] ?? 0);
  }

  // 4. colour the whole row by status (green accepted / red declined / orange review / yellow in-progress / grey).
  if (rowNumber > 0) {
    await postJson(
      `${base}:batchUpdate`,
      { requests: [{ repeatCell: { range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: 0, endColumnIndex: N }, cell: { userEnteredFormat: { backgroundColor: statusColor(s.status) } }, fields: 'userEnteredFormat.backgroundColor' } }] },
      auth,
    ).catch(() => undefined);
  }
  return { ok: true, error: null };
}

/** One file per session in Drive: updates the session's existing file (by name) instead of creating a new one each event. */
async function upsertDriveFile(
  auth: Record<string, string>,
  eventType: string,
  event: Record<string, unknown>,
  folderId: string,
): Promise<SendResult> {
  const s = summarize(eventType, event);
  const name = `${s.company} - ${(s.reference || s.session).replace(/[\\/]/g, '-')}.txt`.slice(0, 180);
  const body = fileText(s);
  // Find an existing app-created file with this name (drive.file lists only files the app made or opened).
  const q = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and trashed = false`);
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, { headers: auth, signal: AbortSignal.timeout(15_000) });
  const list = listRes.ok ? ((await listRes.json()) as { files?: { id: string }[] }) : { files: [] };
  const existing = list.files?.[0]?.id;
  if (existing) {
    const up = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media`, { method: 'PATCH', headers: { ...auth, 'Content-Type': 'text/plain; charset=UTF-8' }, body, signal: AbortSignal.timeout(15_000) });
    return up.ok ? { ok: true, error: null } : { ok: false, error: `drive_http_${up.status}` };
  }
  const boundary = 'vs_' + Math.random().toString(36).slice(2);
  const metaBody = { name, mimeType: 'text/plain', ...(folderId ? { parents: [folderId] } : {}) };
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metaBody)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { ...auth, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart, signal: AbortSignal.timeout(15_000) });
  return res.ok ? { ok: true, error: null } : { ok: false, error: `drive_http_${res.status}` };
}

const google: NativeProvider = {
  slug: 'google',
  oauth: true,
  configured: () => !!googleClientId() && !!googleClientSecret(),
  authorizeUrl(redirectUri, state) {
    const p = new URLSearchParams({
      client_id: googleClientId(),
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      // drive.file only (non-sensitive): the user picks the exact sheet/folder via the Google Picker in the
      // console, which "opens" that file for this app, so we can write to it without the broad, sensitive
      // `spreadsheets` scope (which would force Google's verification + demo-video review).
      scope: 'https://www.googleapis.com/auth/drive.file',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },
  async exchange(code, redirectUri) {
    const r = await postForm('https://oauth2.googleapis.com/token', {
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (!r?.refresh_token) throw new Error('google_oauth_failed_no_refresh');
    return { secret: { refresh_token: r.refresh_token }, alias: null };
  },
  async send(action, secret, input) {
    const refresh = String(secret.refresh_token ?? '');
    if (!refresh) return { ok: false, error: 'not_connected' };
    const token = await googleAccessToken(refresh);
    if (!token) return { ok: false, error: 'google_token_refresh_failed' };
    const auth = { Authorization: `Bearer ${token}` };
    const ev = (input.__event && typeof input.__event === 'object' ? input.__event : {}) as Record<string, unknown>;
    const etype = String(input.__event_type ?? 'event');
    if (action === 'append_row') {
      // The chosen sheet keeps ONE colour-coded row per verification, headed with the company's name, and
      // updates that same row as the session moves on (keyed by the session id), so a paused verification
      // that resumes keeps writing to its own row instead of starting a new sheet or a new line.
      const id = String(input.spreadsheet_id ?? '');
      if (!id) return { ok: false, error: 'missing_spreadsheet_id' };
      return logToSheet(auth, id, etype, ev);
    }
    if (action === 'create_file') {
      // One human-readable text file per verification in the chosen folder, refreshed in place as the
      // session progresses (no new file per event).
      return upsertDriveFile(auth, etype, ev, String(input.folder_id ?? ''));
    }
    return { ok: false, error: 'unknown_action' };
  },
};

/* ---------------------------------------------------------------- Telegram -- */

const telegram: NativeProvider = {
  slug: 'telegram',
  oauth: false,
  configured: () => !!env('TELEGRAM_BOT_TOKEN'),
  // No OAuth: the customer adds the shared bot to their chat and we store the chat id.
  async send(_action, secret, input) {
    const token = env('TELEGRAM_BOT_TOKEN');
    const chatId = String(secret.chat_id ?? '');
    if (!token) return { ok: false, error: 'not_configured' };
    if (!chatId) return { ok: false, error: 'not_connected' };
    const res = await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: eventSummary(input).text,
    });
    return res.ok ? { ok: true, error: null } : { ok: false, error: `telegram_http_${res.status}` };
  },
};

/* ------------------------------------------------ Microsoft Teams (webhook) -- */

// No OAuth: the customer makes a Workflow / incoming-webhook URL in their own Teams
// channel or chat and pastes it. We POST an Adaptive Card message to that URL.
const msteams: NativeProvider = {
  slug: 'microsoft_teams',
  oauth: false,
  configured: () => true,
  async send(_action, secret, input) {
    const url = String(secret.webhook_url ?? '');
    if (!url) return { ok: false, error: 'not_connected' };
    const res = await postJson(url, {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            version: '1.4',
            body: [{ type: 'TextBlock', text: eventSummary(input).text, wrap: true }],
          },
        },
      ],
    });
    return res.ok ? { ok: true, error: null } : { ok: false, error: `teams_http_${res.status}` };
  },
};

/* -------------------------------------------------- Google Chat (webhook) -- */

// No OAuth: the customer makes an incoming-webhook URL in their Google Chat space and
// pastes it. We POST a plain-text message to that URL.
const googlechat: NativeProvider = {
  slug: 'googlechat',
  oauth: false,
  configured: () => true,
  async send(_action, secret, input) {
    const url = String(secret.webhook_url ?? '');
    if (!url) return { ok: false, error: 'not_connected' };
    const res = await postJson(url, { text: eventSummary(input).text });
    return res.ok ? { ok: true, error: null } : { ok: false, error: `googlechat_http_${res.status}` };
  },
};

const PROVIDERS: Record<string, NativeProvider> = {
  slack,
  discord,
  figma,
  google,
  telegram,
  microsoft_teams: msteams,
  googlechat,
};

/** The catalogue slug maps to a provider: Sheets and Drive both use the one Google OAuth app. */
export function providerFor(appSlug: string): NativeProvider | undefined {
  if (appSlug === 'googlesheets' || appSlug === 'googledrive' || appSlug === 'gmail') return PROVIDERS.google;
  return PROVIDERS[appSlug];
}
