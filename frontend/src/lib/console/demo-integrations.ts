import type { IntegrationsData } from "./types";

/** The Integrations screen's words. Everything it lists comes from /api/integrations. */
export const DEMO_INTEGRATIONS: IntegrationsData = {
  title: "Integrations",
  intro: "Connect the apps your team works in, then decide what happens in them when something happens in VeriSec.",
  privacy:
    "Apps get the outcome, scores and a link back to the console. Names, document numbers, dates of birth and photos never leave VeriSec.",
  notConfigured: "Integrations are not switched on for this console yet: the integrations service needs its Composio key.",
  apps: {
    title: "Connected apps",
    body: "Sign in once per app, on the app's own page. More than a thousand apps are available.",
    connect: "Connect an app",
    empty: "No app connected yet. Start with one of these, or browse them all.",
    suggested: [
      { slug: "slack", name: "Slack" },
      { slug: "gmail", name: "Gmail" },
      { slug: "googledrive", name: "Google Drive" },
      { slug: "googlesheets", name: "Google Sheets" },
      { slug: "microsoft_teams", name: "Microsoft Teams" },
      { slug: "figma", name: "Figma" },
      { slug: "instagram", name: "Instagram" },
      { slug: "tiktok", name: "TikTok" },
      { slug: "googleads", name: "Google Ads" },
    ],
  },
  automations: {
    title: "Automations",
    body: "When something happens in VeriSec or in a connected app, do something in another app.",
    add: "New automation",
    empty: "No automation yet. Start from one of these:",
  },
  feed: {
    title: "VeriSec events",
    body: "Automations that start on VeriSec events need these on. Each switch adds a webhook endpoint for the integrations, signed like every other; it shows on the Webhooks screen.",
    live: "Live events",
    test: "Test events",
    needsAutomation: "Create an automation that starts on VeriSec events first.",
  },
  labels: {
    test: "Test now",
    runs: "Recent runs",
    runColumns: ["Event", "Status", "The app's answer", "When"],
    refresh: "Refresh",
    remove: "Delete automation",
    save: "Save changes",
  },
};
