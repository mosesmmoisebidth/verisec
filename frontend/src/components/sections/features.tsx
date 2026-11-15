import { Braces, IdCard, ScanFace } from "lucide-react";

import { cn } from "@/lib/utils";
import { features } from "@/config/home";
import { Panel } from "@/components/layout/container";
import { CenteredHeading } from "@/components/layout/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { PillButton } from "@/components/ui/pill-button";
import { Lottie } from "@/components/ui/lottie";

const featureIcons = {
  "id-card": IdCard,
  "scan-face": ScanFace,
  braces: Braces,
} as const;

export function Features() {
  return (
    <Panel className="bg-surface/30">
      <div className="flex flex-col gap-14 px-6 py-16 sm:px-10 lg:px-14 lg:py-20">
        <CenteredHeading
          heading={features.heading}
          subline={features.subline}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {features.cards.map((card, index) => {
            const Icon = featureIcons[card.icon];
            return (
              <Reveal key={card.id} delay={index * 0.12} className="h-full">
                <article
                  className={cn(
                    "relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-site-card p-6 pt-8 lg:min-h-[420px]",
                    card.highlighted
                      ? "bg-gradient-to-t from-lime to-white"
                      : "bg-surface",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex size-[41px] shrink-0 items-center justify-center rounded-full",
                        card.highlighted
                          ? "bg-white text-pine"
                          : "bg-gradient-to-br from-lime to-pine text-white",
                      )}
                    >
                      <Icon aria-hidden className="size-[22px]" />
                    </span>
                    <div className="flex flex-col gap-4">
                      <h3 className="text-xl leading-tight text-black">
                        {card.title}
                      </h3>
                      <p className="text-base leading-relaxed text-ink-muted">
                        {card.description}
                      </p>
                    </div>
                  </div>
                  <Lottie
                    name={card.lottie}
                    ariaLabel={card.title}
                    className="mt-auto h-40 w-full pt-6 lg:h-56"
                  />
                </article>
              </Reveal>
            );
          })}
        </div>
        <div className="flex justify-center">
          <span className="rounded-full bg-white/60 p-1.5">
            <PillButton href={features.cta.href} variant="lime" arrow>
              {features.cta.label}
            </PillButton>
          </span>
        </div>
      </div>
    </Panel>
  );
}
