import type { Metadata } from "next";
import { Check, Lock, MousePointerClick, SlidersHorizontal } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Container, Panel } from "@/components/layout/container";
import { SiteFooter } from "@/components/layout/site-footer";
import { HeroShell } from "@/components/sections/hero";
import { BadgePill } from "@/components/layout/badge-pill";
import { PillButton } from "@/components/ui/pill-button";

/**
 * Public "Add VeriSec to Slack" landing page (verisec.dev/slack).
 *
 * This is the Installation Landing Page Slack's App Directory links to: a page
 * anyone can open (no sign-in) that says what the app does and starts the
 * install. The "Add to Slack" button sends a visitor to sign in and lands them
 * on Settings -> Notifications with `?connect=slack`, which opens Slack's own
 * sign-in through the connect flow (see connect-apps.tsx).
 *
 * Built from the site's real primitives (HeroShell, Panel, PillButton,
 * BadgePill, LogoMark) so it reads as one system with the rest of verisec.dev.
 */

export const metadata: Metadata = {
  title: "Add VeriSec to Slack",
  description:
    "Get identity verification alerts in Slack. The moment a check clears, needs review or flags a watchlist, VeriSec posts it to the channel your team already uses.",
  alternates: { canonical: "/slack/" },
};

/** Where "Add to Slack" goes: sign in, then land on Notifications and start the Slack connect. */
const INSTALL_HREF = `/login?next=${encodeURIComponent("/settings/notifications?connect=slack")}`;

/** The official Slack mark (four-colour), for the install button. */
function SlackGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 122.8 122.8" className={className} aria-hidden="true">
      <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9z" fill="#E01E5A" />
      <path d="M32.3 77.6c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A" />
      <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2z" fill="#36C5F0" />
      <path d="M45.2 32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36C5F0" />
      <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2z" fill="#2EB67D" />
      <path d="M90.5 45.2c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2EB67D" />
      <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9z" fill="#ECB22E" />
      <path d="M77.6 90.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ECB22E" />
    </svg>
  );
}

function AddToSlack({ className }: { className?: string }) {
  return (
    <PillButton href={INSTALL_HREF} variant="pine" className={className}>
      <SlackGlyph className="size-5" />
      Add to Slack
    </PillButton>
  );
}

/** One Slack message, as it arrives in a channel. Decorative, so hidden from the reader's tree. */
function SlackMessage({
  time,
  title,
  meta,
  tone,
  label,
}: {
  time: string;
  title: string;
  meta: string;
  tone: "approved" | "review" | "declined";
  label: string;
}) {
  const bar = { approved: "#41b05f", review: "#e0a32e", declined: "#d1483a" }[tone];
  const pill = {
    approved: "bg-[#e7f6ec] text-[#1b7a3a]",
    review: "bg-[#fbf0d8] text-[#9a6c10]",
    declined: "bg-[#fbe7e4] text-[#b23227]",
  }[tone];
  return (
    <div className="rounded-[18px] border border-black/[0.06] bg-white p-5 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)]">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-[11px] bg-pine">
          <LogoMark className="h-5 text-lime" />
        </span>
        <span className="text-[15px] font-bold text-[#1d1c1d]">VeriSec</span>
        <span className="rounded bg-[#e8e8e8] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-[#616061]">APP</span>
        <span className="ml-auto text-[13px] text-[#9a9a9a]">{time}</span>
      </div>
      <div className="mt-3">
        <p className="m-0 flex items-center gap-2 text-[17px] font-bold text-[#1d1c1d]">
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: bar }}
          />
          {title}
        </p>
        <p className="m-0 mt-1.5 text-[14px] leading-relaxed text-[#616061]">{meta}</p>
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-[12px] font-bold ${pill}`}>{label}</span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Add to Slack",
    body: "Sign in on Slack's own page and pick a channel. No webhooks, no tokens to paste.",
  },
  {
    icon: SlidersHorizontal,
    title: "Choose events",
    body: "Tick the outcomes each channel should receive, from approvals to watchlist hits.",
  },
  {
    icon: Check,
    title: "You're live",
    body: "Alerts arrive the moment a verification finishes. Disconnect anytime, in one click.",
  },
] as const;

const EVENTS = [
  { label: "Verification created", tone: "#0e3228" },
  { label: "Verification started", tone: "#0e3228" },
  { label: "Approved", tone: "#41b05f" },
  { label: "Needs review", tone: "#e0a32e" },
  { label: "Declined", tone: "#d1483a" },
  { label: "Liveness completed", tone: "#41b05f" },
  { label: "Face match completed", tone: "#41b05f" },
  { label: "AML screening completed", tone: "#0e3228" },
  { label: "AML possible match", tone: "#d1483a" },
] as const;

const PRIVACY = ["No personal data in messages", "You control every event", "Disconnect anytime"] as const;

export default function SlackLandingPage() {
  return (
    <>
      <main className="flex flex-col gap-20 pb-20 lg:gap-28 lg:pb-28">
        {/* Hero ------------------------------------------------------------- */}
        <HeroShell activeHref="" panel>
          <Container className="relative z-10 grid items-center gap-14 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-20 lg:py-24">
            <div className="flex flex-col items-start gap-6">
              <BadgePill tint="lime">VeriSec for Slack</BadgePill>
              <h1 className="text-4xl leading-[1.1] font-medium tracking-[-0.01em] text-pine sm:text-5xl lg:text-[64px] lg:leading-[1.08]">
                Identity checks,
                <br />
                answered in Slack
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-ink-muted sm:text-xl">
                The moment a verification clears, needs review or flags a watchlist, VeriSec posts it to the
                Slack channel your team already lives in. No personal data ever leaves the console.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <AddToSlack />
                <PillButton href="#how" variant="white">
                  See how it works
                </PillButton>
              </div>
              <p className="text-sm text-ink-soft">Free to connect. No webhooks or code. Disconnect anytime.</p>
            </div>

            <div className="relative flex flex-col gap-4">
              <div aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-lime/15 blur-[90px]" />
              <SlackMessage
                time="9:41 AM"
                title="Verification approved"
                meta="Ref VS-4821 · Government ID + Liveness · completed in 48s"
                tone="approved"
                label="Approved"
              />
              <div className="lg:translate-x-6">
                <SlackMessage
                  time="9:44 AM"
                  title="Verification needs review"
                  meta="Ref VS-4830 · Document and selfie did not match confidently"
                  tone="review"
                  label="Needs review"
                />
              </div>
            </div>
          </Container>
        </HeroShell>

        {/* How it works ---------------------------------------------------- */}
        <Container id="how" className="flex flex-col gap-12">
          <div className="flex max-w-3xl flex-col items-start gap-3">
            <BadgePill tint="lime">Set up in under a minute</BadgePill>
            <h2 className="text-3xl leading-tight text-pine sm:text-4xl lg:text-5xl">Connect in one click. No code.</h2>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex flex-col gap-4 rounded-site-card border border-site-line bg-white p-8">
                <div className="flex items-center justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-lime text-pine">
                    <step.icon aria-hidden className="size-6" strokeWidth={2} />
                  </span>
                  <span className="text-5xl font-medium text-pine/10">{i + 1}</span>
                </div>
                <h3 className="text-xl font-medium text-pine">{step.title}</h3>
                <p className="text-base leading-relaxed text-ink-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </Container>

        {/* Privacy --------------------------------------------------------- */}
        <Panel className="bg-pine">
          <div className="relative grid items-center gap-12 px-6 py-16 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:gap-16 lg:px-16 lg:py-24">
            <div aria-hidden className="pointer-events-none absolute -top-10 right-10 size-[420px] rounded-full bg-lime/10 blur-[120px]" />
            <div className="relative flex flex-col items-start gap-6">
              <BadgePill tint="white">Privacy by design</BadgePill>
              <h2 className="text-3xl leading-tight text-white sm:text-4xl lg:text-[52px] lg:leading-[1.1]">
                A reference and an outcome. <span className="text-lime">Nothing more.</span>
              </h2>
              <p className="max-w-xl text-lg leading-relaxed text-white/75">
                Every alert says which check it was and how it ended. It never carries a person's name, document or
                photo, so sharing a channel never shares their identity.
              </p>
              <div className="flex flex-wrap gap-3">
                {PRIVACY.map((item) => (
                  <span key={item} className="inline-flex items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-4 py-2 text-[15px] font-medium text-lime">
                    <span className="size-2 rounded-full bg-lime" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative flex justify-center">
              <div className="relative flex size-60 items-center justify-center rounded-[44px] border-2 border-lime/40 bg-white/5">
                <LogoMark className="h-28 text-lime" />
                <span className="absolute -right-3 -bottom-2 flex size-16 items-center justify-center rounded-full bg-lime text-pine shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
                  <Lock aria-hidden className="size-7" strokeWidth={2.2} />
                </span>
              </div>
            </div>
          </div>
        </Panel>

        {/* What Slack receives --------------------------------------------- */}
        <Container className="flex flex-col items-center gap-10 text-center">
          <div className="flex max-w-2xl flex-col items-center gap-3">
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-7 text-ink" />
              <span className="text-2xl font-bold tracking-tight text-pine">VeriSec</span>
            </div>
            <h2 className="text-3xl leading-tight text-pine sm:text-4xl lg:text-5xl">One app. Every verification event.</h2>
            <p className="max-w-xl text-lg leading-relaxed text-ink-muted">
              Slack stays in step with the whole VeriSec platform, from the first document scan to the final
              sanctions screen.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {EVENTS.map((ev) => (
              <span key={ev.label} className="inline-flex items-center gap-2.5 rounded-xl border border-site-line bg-white px-5 py-3 text-base font-medium text-pine shadow-[0_8px_20px_-14px_rgba(15,23,42,0.4)]">
                <span className="size-2.5 rounded-full" style={{ background: ev.tone }} />
                {ev.label}
              </span>
            ))}
          </div>
        </Container>

        {/* Final CTA ------------------------------------------------------- */}
        <Container>
          <div className="relative overflow-hidden rounded-site-panel bg-pine px-6 py-14 text-center sm:px-10 lg:py-20">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 size-[520px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-lime/15 blur-[120px]" />
            <div className="relative flex flex-col items-center gap-6">
              <h2 className="max-w-2xl text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
                Put verification alerts where your team already works.
              </h2>
              <AddToSlack />
              <p className="text-sm text-white/55">
                Questions? <a href="/contact" className="text-lime underline underline-offset-4">Contact us</a> ·{" "}
                <a href="/privacy" className="text-lime underline underline-offset-4">Privacy Policy</a>
              </p>
            </div>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
