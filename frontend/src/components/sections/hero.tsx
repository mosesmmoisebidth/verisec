import { Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { demoVideo, hero } from "@/config/home";
import { GridBackdrop } from "@/components/layout/grid-backdrop";
import { SiteHeader } from "@/components/layout/site-header";
import { Reveal } from "@/components/motion/reveal";
import { PillButton } from "@/components/ui/pill-button";
import { VideoButton } from "@/components/ui/video-lightbox";

/**
 * Decorative backdrop shared by every hero. Delegates to GridBackdrop so the
 * hero and the dark Products panel cannot drift apart.
 */
export function HeroBackdrop() {
  return <GridBackdrop tone="light" />;
}

/**
 * Full-bleed hero shell: spans the whole viewport width and melts into
 * the page background at the bottom for an immersive opening.
 */
export function HeroShell({
  activeHref,
  className,
  panel = false,
  children,
}: {
  activeHref: string;
  className?: string;
  /** Wrap the header + hero in a rounded, inset card (the Figma's top panel). */
  panel?: boolean;
  children: React.ReactNode;
}) {
  const section = (
    <section
      className={cn(
        "relative flex w-full flex-col bg-surface",
        panel && "overflow-hidden rounded-site-panel",
        className,
      )}
    >
      <HeroBackdrop />
      {/* Full-bleed heroes melt into the page background; the panelled hero is a
          self-contained rounded card, so it gets no melt. */}
      {!panel && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white"
        />
      )}
      <SiteHeader activeHref={activeHref} />
      {children}
    </section>
  );
  return panel ? (
    <div className="px-3 pt-3 sm:px-6 sm:pt-6">{section}</div>
  ) : (
    section
  );
}

export function Hero() {
  return (
    <HeroShell activeHref="/" panel className="min-h-[min(900px,100svh)]">
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
        <Reveal mode="mount">
          <h1 className="text-[clamp(2.75rem,6vw,5.375rem)] leading-[1.2] font-medium tracking-[-0.01em] whitespace-pre-line text-pine">
            {hero.headline}
          </h1>
        </Reveal>
        <Reveal mode="mount" delay={0.15}>
          <p className="max-w-3xl text-lg leading-relaxed text-ink-muted sm:text-xl">
            {hero.subline}
          </p>
        </Reveal>
        <Reveal mode="mount" delay={0.3}>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <PillButton href={hero.primaryCta.href} variant="lime" arrow>
              {hero.primaryCta.label}
            </PillButton>
            <VideoButton video={demoVideo} variant="white">
              <Play aria-hidden className="size-3.5 fill-current" />
              {hero.secondaryCta.label}
            </VideoButton>
          </div>
        </Reveal>
        <Reveal mode="mount" delay={0.4}>
          {/* Opens the public playground: pick a check, upload an image, get a live result. */}
          <PillButton href="/demo" variant="pine" size="sm" arrow>
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-lime" />
            Test a few of our Live Demos
          </PillButton>
        </Reveal>
      </div>
    </HeroShell>
  );
}
