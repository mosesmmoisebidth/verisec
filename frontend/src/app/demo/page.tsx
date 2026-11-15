import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { DemoPlayground } from "@/components/demo/demo-playground";
import { HeroShell } from "@/components/sections/hero";
import { Reveal } from "@/components/motion/reveal";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  title: "Live demo",
  description:
    "Try our identity, cheque, card and face APIs on your own image, right in the browser. No account needed.",
  alternates: { canonical: "/demo/" },
};

export default function DemoPage() {
  return (
    <>
      <main className="flex flex-col gap-16 pb-20 lg:gap-20 lg:pb-28">
        <HeroShell activeHref="/demo">
          <Container className="relative z-10 flex flex-col items-center gap-5 pt-20 pb-12 text-center lg:pt-24">
            <Reveal mode="mount">
              <span className="inline-flex items-center gap-2 rounded-full bg-lime/25 px-4 py-1.5 text-sm font-medium text-pine">
                <span className="size-1.5 animate-pulse rounded-full bg-pine/70" />
                Live APIs, running now
              </span>
            </Reveal>
            <Reveal mode="mount" delay={0.1}>
              <h1 className="text-[clamp(2.5rem,5.5vw,4.5rem)] leading-[1.15] font-medium tracking-[-0.01em] text-pine">
                Try it on your own image
              </h1>
            </Reveal>
            <Reveal mode="mount" delay={0.2}>
              <p className="max-w-4xl text-lg leading-relaxed text-balance text-ink-muted sm:text-xl">
                Pick a check, add an image, and get the real result back in seconds. No account needed.
              </p>
            </Reveal>
          </Container>
        </HeroShell>

        <Reveal>
          <DemoPlayground />
        </Reveal>
      </main>
      <SiteFooter />
    </>
  );
}
