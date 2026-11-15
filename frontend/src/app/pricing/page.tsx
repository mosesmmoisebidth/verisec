import type { Metadata } from "next";

import { addOns, billingFaq, pricingHero } from "@/config/pricing";
import { MapPin, Nfc, ScanFace, UserSearch } from "lucide-react";

import { Container } from "@/components/layout/container";
import { SiteFooter } from "@/components/layout/site-footer";
import { Reveal } from "@/components/motion/reveal";
import { HeroShell } from "@/components/sections/hero";
import { FaqSection } from "@/components/sections/faq-section";
import { PricingModels } from "@/components/sections/plan-cards";

export const metadata: Metadata = {
  title: "Pricing",
  description: pricingHero.subline,
  alternates: { canonical: "/pricing/" },
};

const addOnIcons = {
  nfc: Nfc,
  "user-search": UserSearch,
  "map-pin": MapPin,
  "scan-face": ScanFace,
} as const;

function AddOns() {
  return (
    <Container className="flex flex-col gap-9">
      <h2 className="text-[28px] font-medium text-pine">Add-ons</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {addOns.map((addOn) => {
          const Icon = addOnIcons[addOn.icon];
          return (
            <article
              key={addOn.id}
              className="flex items-start gap-3 rounded-card bg-gradient-to-b from-lime to-white p-6"
            >
              <span className="flex size-[41px] shrink-0 items-center justify-center rounded-full bg-white text-pine">
                <Icon aria-hidden className="size-[22px]" />
              </span>
              <div className="flex flex-col gap-1.5">
                <p className="text-base text-ink-muted">{addOn.name}</p>
                <p className="flex items-baseline gap-1 text-black">
                  <span className="text-[28px] leading-none">
                    {addOn.price}
                  </span>
                  <span className="text-xl">{addOn.unit}</span>
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </Container>
  );
}

export default function PricingPage() {
  return (
    <>
      <main className="flex flex-col gap-20 pb-20 lg:gap-28 lg:pb-28">
        <HeroShell activeHref="/pricing">
          <Container className="relative z-10 flex flex-col gap-14 pt-24 pb-16 lg:pt-32">
            <div className="flex flex-col items-center gap-6 text-center">
              <Reveal mode="mount">
                <h1 className="max-w-4xl text-[clamp(2.75rem,6vw,5.375rem)] leading-[1.15] font-medium tracking-[-0.01em] text-pine">
                  {pricingHero.heading}
                </h1>
              </Reveal>
              <Reveal mode="mount" delay={0.15}>
                <p className="max-w-2xl text-lg leading-relaxed text-ink-muted sm:text-xl">
                  {pricingHero.subline}
                </p>
              </Reveal>
            </div>
            <Reveal mode="mount" delay={0.3}>
              <PricingModels />
            </Reveal>
          </Container>
        </HeroShell>

        <AddOns />

        <FaqSection
          heading={billingFaq.heading}
          cta={billingFaq.cta}
          items={billingFaq.items}
          defaultOpen={billingFaq.defaultOpen}
        />
      </main>
      <SiteFooter />
    </>
  );
}
