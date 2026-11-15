/**
 * The KYC console's Webhooks screen: Figma Desktop-23 (list) and Desktop-25
 * (the Add endpoint dialog).
 *
 * ONLY THE WORDS LIVE HERE. Endpoints, the event catalogue, the delivery log,
 * test events and secrets are live: the screen loads them in the browser from
 * the console API (/api/webhooks, see `webhooks-api.ts`), scoped to the
 * signed-in organisation. The name `DEMO_WEBHOOKS` is kept so `getWebhooks()`
 * in `index.ts` keeps working unchanged; there are no sample endpoints any more.
 *
 * The Financial portal shows the same screen with its own words and its own
 * events (`WEBHOOKS` in `lib/finance/content.ts`).
 */

import type { WebhooksData } from "./types";

export const DEMO_WEBHOOKS: WebhooksData = {
  portal: "kyc",
  title: "Webhooks",
  addLabel: "Add endpoint",
  labels: {
    events: "Events",
    secret: "Signing secret",
    rotate: "Rotate",
    test: "Test",
    log: "Delivery log",
    logColumns: ["Event", "Status", "Response", "When"],
    resend: "Resend",
    refresh: "Refresh",
    remove: "Delete endpoint",
  },
  empty: {
    title: "No endpoints yet",
    body: "Add an endpoint to receive verification events on your server as they happen. Each request is signed so you can check it came from VeriSec.",
  },
  add: {
    title: "Add webhook endpoint",
    urlLabel: "URL",
    urlPlaceholder: "https://…",
    envLabel: "Environment",
    envOptions: ["Test", "Live"],
    liveHint: "Live endpoints must use https://. Verifications run in Test for now, so a Live endpoint gets events once Live opens.",
    eventsLabel: "Events",
    submitLabel: "Add",
    closeLabel: "Close",
  },
};
