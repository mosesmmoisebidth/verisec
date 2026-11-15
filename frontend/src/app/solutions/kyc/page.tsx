import type { Metadata } from "next";
import Link from "next/link";
import {
  Bitcoin,
  Camera,
  ChevronRight,
  Eye,
  FileCheck,
  Landmark,
  MapPin,
  Nfc,
  PackageCheck,
  Phone,
  ScanFace,
  ShoppingCart,
  Smartphone,
  UserCheck,
  UserSearch,
} from "lucide-react";

import { kycPage } from "@/config/solutions";
import { Container, Panel } from "@/components/layout/container";
import { BadgePill } from "@/components/layout/badge-pill";
import { SiteFooter } from "@/components/layout/site-footer";
import { Reveal } from "@/components/motion/reveal";
import { HeroShell } from "@/components/sections/hero";
import { PillButton } from "@/components/ui/pill-button";

export const metadata: Metadata = {
  title: "KYC",
  description: kycPage.subline,
  alternates: { canonical: "/solutions/kyc/" },
};

const checkIcons = {
  "file-check": FileCheck,
  nfc: Nfc,
  "scan-face": ScanFace,
  eye: Eye,
  "user-search": UserSearch,
} as const;

const chipIcons = {
  "package-check": PackageCheck,
  phone: Phone,
  "map-pin": MapPin,
  camera: Camera,
  "user-check": UserCheck,
} as const;

const builtForIcons = {
  landmark: Landmark,
  smartphone: Smartphone,
  bitcoin: Bitcoin,
  "shopping-cart": ShoppingCart,
} as const;

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-lg">
      {kycPage.breadcrumb.map((crumb, index) => {
        const isLast = index === kycPage.breadcrumb.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {isLast ? (
              <span className="text-pine">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-pine/60 transition-colors hover:text-pine"
              >
                {crumb.label}
              </Link>
            )}
            {!isLast && (
              <ChevronRight aria-hidden className="size-5 text-pine/50" />
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Looping chip rail along the bottom of the Trust Seal panel. */
function ChipMarquee() {
  const loop = [
    ...kycPage.trustSeal.chips,
    ...kycPage.trustSeal.chips,
    ...kycPage.trustSeal.chips,
    ...kycPage.trustSeal.chips,
  ];
  return (
    <div
      aria-hidden
      className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] py-2"
    >
      <div className="flex w-max animate-marquee-x items-center gap-7 opacity-75">
        {loop.map((chip, index) => {
          const Icon = chipIcons[chip.icon];
          return (
            <span
              key={`${chip.label}-${index}`}
              className="flex shrink-0 items-center gap-2.5 rounded-full bg-white p-2.5 pr-5"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-pine text-lime">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="text-base whitespace-nowrap text-pine">
                {chip.label}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function KycPage() {
  return (
    <>
      <main className="flex flex-col gap-20 pb-20 lg:gap-24 lg:pb-28">
        <HeroShell activeHref="/solutions">
          <Container className="relative z-10 flex flex-col gap-14 pt-20 pb-16">
            <div className="flex flex-col gap-6">
              <Reveal mode="mount">
                <Breadcrumb />
              </Reveal>
              <Reveal mode="mount" delay={0.1}>
                <h1 className="max-w-4xl text-[clamp(2.5rem,5vw,4.2rem)] leading-[1.15] font-medium tracking-[-0.01em] text-pine">
                  {kycPage.heading}
                </h1>
              </Reveal>
              <Reveal mode="mount" delay={0.2}>
                <p className="max-w-3xl text-xl leading-relaxed text-ink-muted sm:text-2xl">
                  {kycPage.subline}
                </p>
              </Reveal>
              <Reveal mode="mount" delay={0.3}>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <PillButton
                    href={kycPage.primaryCta.href}
                    variant="lime"
                    arrow
                  >
                    {kycPage.primaryCta.label}
                  </PillButton>
                  <PillButton href={kycPage.secondaryCta.href} variant="white">
                    {kycPage.secondaryCta.label}
                  </PillButton>
                </div>
              </Reveal>
            </div>

            <div className="flex flex-col gap-6">
              <h2 className="text-[28px] font-medium text-pine">
                {kycPage.checksHeading}
              </h2>
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
                {kycPage.checks.map((check, index) => {
                  const Icon = checkIcons[check.icon];
                  return (
                    <Reveal
                      key={check.id}
                      delay={index * 0.08}
                      className="h-full"
                    >
                      <article className="flex h-full flex-col gap-3 rounded-[20px] bg-pine p-6">
                        <span className="flex size-[41px] items-center justify-center rounded-full bg-lime text-pine">
                          <Icon aria-hidden className="size-[22px]" />
                        </span>
                        <div className="flex flex-col gap-1.5">
                          <h3 className="text-base text-white">{check.name}</h3>
                          <p className="text-base text-white/70">
                            {check.detail}
                          </p>
                        </div>
                      </article>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </Container>
        </HeroShell>

        <Panel className="bg-lime">
          <div
            aria-hidden
            className="bg-grid pointer-events-none absolute inset-0 opacity-70"
          />
          <div className="relative flex flex-col gap-10 px-6 pt-16 pb-8 sm:px-10 lg:px-14 lg:pt-20">
            <Reveal className="flex max-w-2xl flex-col items-start gap-6">
              <BadgePill tint="white">{kycPage.trustSeal.badge}</BadgePill>
              <h2 className="text-4xl leading-tight text-black sm:text-5xl lg:text-[56px]">
                {kycPage.trustSeal.heading}
              </h2>
              <p className="text-xl leading-relaxed text-pine">
                {kycPage.trustSeal.body}
              </p>
              <PillButton
                href={kycPage.trustSeal.cta.href}
                variant="pine-lime"
                arrow
              >
                {kycPage.trustSeal.cta.label}
              </PillButton>
            </Reveal>
            <ChipMarquee />
          </div>
        </Panel>

        <Container className="flex flex-col gap-9">
          <h2 className="text-[28px] font-medium text-pine">
            {kycPage.builtForHeading}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kycPage.builtFor.map((segment, index) => {
              const Icon = builtForIcons[segment.icon];
              return (
                <Reveal key={segment.id} delay={index * 0.1} className="h-full">
                  <article className="flex h-full items-start gap-3 rounded-card bg-gradient-to-b from-lime to-white p-6">
                    <span className="flex size-[41px] shrink-0 items-center justify-center rounded-full bg-white text-pine">
                      <Icon aria-hidden className="size-[22px]" />
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-xl text-pine">{segment.name}</h3>
                      <p className="text-base leading-relaxed text-ink-muted">
                        {segment.description}
                      </p>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
