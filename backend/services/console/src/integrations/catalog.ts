/**
 * The integrations catalogue: the 13 apps VeriSec connects to, and the actions each one can run.
 *
 * Two kinds of app:
 *  - `native`: VeriSec talks to the app directly, for free. The person connects it by pasting a
 *    free webhook URL or token (Slack, Teams, Discord, Telegram) or a key (Figma, Google). No
 *    third party, no per-call cost.
 *  - `composio`: reached through Composio, which has already been approved by the platform
 *    (Meta, TikTok, Google Ads, LinkedIn, WhatsApp). Only usable when a Composio key is set;
 *    otherwise the app is listed but cannot be connected.
 *
 * The screen in the console is generic: a person connects an app, then builds automations that
 * run an app action when a VeriSec event happens. Payloads never carry personal data (see
 * webhook-events.ts `cleanData`).
 */

import type { WebhookEventType } from '../webhooks/webhook-events';

/** A JSON Schema fragment describing an action's inputs, as the screen's form reads it. */
export type JsonSchema = {
  type?: string | string[];
  description?: string;
  title?: string;
  default?: unknown;
  enum?: unknown[];
  examples?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
};

/** How a native app is connected (what the person pastes). Composio apps use OAuth, handled by Composio. */
export type ConnectKind =
  | 'webhook_url' // Slack / Teams / Discord incoming webhook URL
  | 'bot_token' // Telegram bot token + chat id
  | 'service_account' // Google service-account JSON key
  | 'token' // Figma personal access token
  | 'oauth'; // reserved for a future native OAuth

export interface CatalogAction {
  slug: string;
  name: string;
  description: string;
  inputs?: JsonSchema;
}

export interface CatalogApp {
  slug: string;
  name: string;
  description: string;
  categories: string[];
  provider: 'native' | 'composio';
  /** `managed`: anyone can connect it; `own`: needs a value pasted in; `none`: nothing to connect. */
  auth: 'managed' | 'own' | 'none';
  /** Native only: how the person connects it. */
  connect?: ConnectKind;
  actions: CatalogAction[];
}

const text = (title: string, description = '', required = true): JsonSchema => ({
  type: 'string',
  title,
  description,
  ...(required ? {} : {}),
});

/** A single "send a message" action shared by the chat apps. The body is a short, templated line. */
const messageAction = (where: string): CatalogAction => ({
  slug: 'send_message',
  name: `Send a message to ${where}`,
  description: `Post a short message to ${where}. Use {{event.type}}, {{data.id}}, {{data.verdict}} and other event fields.`,
  inputs: {
    type: 'object',
    required: ['text'],
    properties: {
      text: text('Message', 'The message to post. Event fields can be inserted with {{data.field}}.'),
    },
  },
});

export const CATALOG: CatalogApp[] = [
  // ---- native chat: paste a free incoming webhook URL ----
  {
    slug: 'slack',
    name: 'Slack',
    description: 'Post verification alerts to a Slack channel.',
    categories: ['Messaging', 'Alerts'],
    provider: 'native',
    auth: 'managed',
    // One-click "Add to Slack": the OAuth connector (SLACK_CLIENT_ID/SECRET) fetches the
    // channel's incoming-webhook for the person, so they never paste a URL (unlike Teams/Chat).
    connect: 'oauth',
    actions: [messageAction('a Slack channel')],
  },
  {
    slug: 'microsoft_teams',
    name: 'Microsoft Teams',
    description: 'Post verification alerts to a Microsoft Teams channel or chat.',
    categories: ['Messaging', 'Alerts'],
    provider: 'native',
    auth: 'managed',
    connect: 'webhook_url',
    actions: [messageAction('a Microsoft Teams channel')],
  },
  {
    slug: 'googlechat',
    name: 'Google Chat',
    description: 'Post verification alerts to a Google Chat space.',
    categories: ['Messaging', 'Alerts'],
    provider: 'native',
    auth: 'managed',
    connect: 'webhook_url',
    actions: [messageAction('a Google Chat space')],
  },
  {
    slug: 'discord',
    name: 'Discord',
    description: 'Post verification alerts to a Discord channel.',
    categories: ['Messaging', 'Alerts'],
    provider: 'native',
    auth: 'managed',
    // One-click "Add to Discord": the OAuth connector (DISCORD_CLIENT_ID/SECRET, webhook.incoming scope)
    // returns the channel's webhook for the person, so they never paste a URL (unlike Teams/Chat).
    connect: 'oauth',
    actions: [messageAction('a Discord channel')],
  },
  // ---- native Google / email: reuse the console mail service or a service account ----
  {
    slug: 'gmail',
    name: 'Gmail',
    description: 'Email verification alerts.',
    categories: ['Email'],
    provider: 'native',
    auth: 'managed',
    connect: 'service_account',
    actions: [
      {
        slug: 'send_email',
        name: 'Send an email',
        description: 'Send an email when a VeriSec event happens.',
        inputs: {
          type: 'object',
          required: ['to', 'subject', 'body'],
          properties: {
            to: text('To', 'Who receives the email.'),
            subject: text('Subject'),
            body: text('Body', 'Event fields can be inserted with {{data.field}}.'),
          },
        },
      },
    ],
  },
  {
    slug: 'googlesheets',
    name: 'Google Sheets',
    description: 'Append a row to a sheet for every verification (an audit log).',
    categories: ['Records'],
    provider: 'native',
    auth: 'managed',
    connect: 'service_account',
    actions: [
      {
        slug: 'append_row',
        name: 'Append a row',
        description: 'Add one row per event to a spreadsheet.',
        inputs: {
          type: 'object',
          required: ['spreadsheet_id'],
          properties: {
            spreadsheet_id: text('Spreadsheet ID', 'From the sheet URL.'),
            range: text('Tab', 'The sheet tab, e.g. Sheet1.', false),
          },
        },
      },
    ],
  },
  {
    slug: 'googledrive',
    name: 'Google Drive',
    description: 'Save a verification summary file to a Drive folder.',
    categories: ['Records', 'Files'],
    provider: 'native',
    auth: 'managed',
    connect: 'service_account',
    actions: [
      {
        slug: 'create_file',
        name: 'Create a file',
        description: 'Write a summary file to Drive (My Drive, or a folder you choose).',
        inputs: {
          type: 'object',
          required: [],
          properties: {
            name: text('File name', 'Event fields can be inserted with {{data.field}}. Left blank, a descriptive name is used.', false),
            text: text('File contents', 'What to write in the file. Event fields can be inserted with {{data.field}}. Left blank, a summary of the event is written.', false),
            folder_id: text('Folder ID', 'Optional. From the folder URL. Left blank, the file goes to My Drive.', false),
          },
        },
      },
    ],
  },
  {
    slug: 'figma',
    name: 'Figma',
    description: 'Post a comment to a Figma file.',
    categories: ['Design'],
    provider: 'native',
    auth: 'managed',
    connect: 'token',
    actions: [
      {
        slug: 'post_comment',
        name: 'Comment on a file',
        description: 'Add a comment to a Figma file.',
        inputs: {
          type: 'object',
          required: ['file_key', 'message'],
          properties: {
            file_key: text('File key', 'From the Figma file URL.'),
            message: text('Comment'),
          },
        },
      },
    ],
  },
];

const BY_SLUG = new Map(CATALOG.map((a) => [a.slug, a]));
export const catalogApp = (slug: string) => BY_SLUG.get(slug);
export const nativeApps = () => CATALOG.filter((a) => a.provider === 'native');
export const composioApps = () => CATALOG.filter((a) => a.provider === 'composio');

/** Friendly titles for the VeriSec events an automation can start on (from the webhook catalogue). */
export const EVENT_TITLES: Partial<Record<WebhookEventType, string>> = {
  'verification.created': 'Verification created',
  'verification.started': 'Verification started',
  'verification.completed': 'Verification completed',
  'verification.approved': 'Verification approved',
  'verification.needs_review': 'Verification needs review',
  'verification.declined': 'Verification declined',
  'verification.updated': 'Verification updated',
  'face.liveness.completed': 'Liveness check completed',
  'face.match.completed': 'Face match completed',
  'aml.screening.completed': 'AML screening completed',
  'aml.hit': 'AML possible match',
};
