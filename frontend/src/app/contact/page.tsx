import type { Metadata } from "next";
import Image from "next/image";
import { LifeBuoy, Mail, Newspaper, Shield } from "lucide-react";

import {
  contactFaq,
  contactForm,
  contactHero,
  contactTeams,
} from "@/config/contact";
import { ContactForm } from "@/components/contact/contact-form";
import { SalesChat, SalesChatWidget } from "@/components/contact/sales-chat";
import { Container } from "@/components/layout/container";
import { SiteFooter } from "@/components/layout/site-footer";
import { Reveal } from "@/components/motion/reveal";
import { FaqAccordion } from "@/components/sections/card-accordion";
import { DemoBooking } from "@/components/sections/demo-booking";
import { HeroShell } from "@/components/sections/hero";
import { PillButton } from "@/components/ui/pill-button";

export const metadata: Metadata = {
  title: "Contact",
  description: contactHero.subline,
  alternates: { canonical: "/contact/" },
};

const teamIcons = {
  mail: Mail,
  "life-buoy": LifeBuoy,
  shield: Shield,
  newspaper: Newspaper,
} as const;

function TeamCards() {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {contactTeams.map((team, index) => {
        const Icon = teamIcons[team.icon];
        return (
          <Reveal key={team.id} delay={index * 0.1} className="h-full">
            <article className="flex h-full flex-col gap-3 rounded-[20px] bg-pine p-6">
              <span className="flex size-[41px] items-center justify-center rounded-full bg-lime text-pine">
                <Icon aria-hidden className="size-[22px]" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-base text-white">{team.name}</h2>
                <p className="text-base leading-relaxed text-white/70">
                  {team.description}
                </p>
              </div>
              <a
                href={`mailto:${team.email}`}
                className="mt-auto text-base text-white underline underline-offset-4 transition-opacity hover:opacity-80"
              >
                {team.email}
              </a>
            </article>
          </Reveal>
        );
      })}
    </div>
  );
}

function MessageForm() {
  return (
    <section className="flex flex-col gap-2 rounded-3xl border border-[#f1f5f9] bg-gradient-to-b from-white to-lime p-8 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.1)]">
      <p className="text-[11px] font-bold tracking-wide text-[#5b6472] uppercase">
        {contactForm.eyebrow}
      </p>
      <h2 className="text-2xl font-medium text-pine">{contactForm.heading}</h2>

      {/* sends for real, after the security check (the team's mailbox, reply-to the visitor) */}
      <ContactForm />
    </section>
  );
}

export default function ContactPage() {
  return (
    <>
      <main className="flex flex-col gap-20 pb-20 lg:gap-28 lg:pb-28">
        <HeroShell activeHref="/contact">
          <Container className="relative z-10 flex flex-col items-center gap-6 pt-24 pb-16 text-center lg:pt-28">
            <Reveal mode="mount">
              <h1 className="text-[clamp(2.75rem,6vw,5.375rem)] leading-[1.15] font-medium tracking-[-0.01em] text-pine">
                {contactHero.heading}
              </h1>
            </Reveal>
            <Reveal mode="mount" delay={0.15}>
              <p className="max-w-3xl text-lg leading-relaxed text-ink-muted sm:text-xl">
                {contactHero.subline}
              </p>
            </Reveal>
            <Reveal mode="mount" delay={0.3}>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <PillButton
                  href={contactHero.primaryCta.href}
                  variant="lime"
                  arrow
                >
                  {contactHero.primaryCta.label}
                </PillButton>
                {/* opens the sales chat at the lower right; the page stays in view */}
                <SalesChat label={contactHero.secondaryCta.label} />
              </div>
            </Reveal>
            <div className="mt-10 w-full text-left">
              <TeamCards />
            </div>
          </Container>
        </HeroShell>

        <Container className="grid items-start gap-6 lg:grid-cols-2">
          <Reveal>
            <MessageForm />
          </Reveal>
          <Reveal delay={0.12}>
            <DemoBooking />
          </Reveal>
        </Container>

        <Container className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <Reveal className="flex flex-col gap-4">
            <h2 className="text-4xl leading-tight whitespace-pre-line text-pine sm:text-5xl lg:text-[64px] lg:leading-[1.25]">
              {contactFaq.heading}
            </h2>
            <p className="max-w-sm text-xl leading-relaxed text-ink-muted">
              {contactFaq.subline}
            </p>
            {/* Fills the empty space under this column beside the accordion. */}
            <Image
              src="/illustrations/customer-care.png"
              alt=""
              width={1315}
              height={940}
              sizes="(min-width: 1024px) 420px, 80vw"
              className="mt-4 hidden h-auto w-full max-w-[420px] lg:block"
            />
          </Reveal>
          <Reveal delay={0.12}>
            <FaqAccordion
              items={contactFaq.items}
              defaultOpen={contactFaq.defaultOpen}
            />
          </Reveal>
        </Container>
      </main>
      <SiteFooter />
      {/* the sales chat, always within reach at the lower right (opens on click, and from "Chat With Sales") */}
      <SalesChatWidget />
    </>
  );
}
