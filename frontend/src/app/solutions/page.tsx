import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { solutions, solutionsHero } from "@/config/solutions";
import { SiteFooter } from "@/components/layout/site-footer";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/layout/container";
import { HeroShell } from "@/components/sections/hero";
import { Lottie } from "@/components/ui/lottie";
import { SolutionOpenLink } from "@/components/sections/solution-open-link";
import { AlprAccessButton } from "@/components/alpr/alpr-access";

export const metadata: Metadata = {
  title: "Solutions",
  description: solutionsHero.subline,
  alternates: { canonical: "/solutions/" },
};

export default function SolutionsPage() {
  return (
    <>
      <main className="flex flex-col pb-20 lg:pb-28">
        <HeroShell activeHref="/solutions">
          <Container className="relative z-10 flex flex-col gap-14 pt-24 pb-16 lg:pt-28">
            <div className="flex flex-col items-center gap-6 text-center">
              <Reveal mode="mount">
                <h1 className="max-w-5xl text-[clamp(2.75rem,6vw,5.375rem)] leading-[1.15] font-medium tracking-[-0.01em] text-pine">
                  {solutionsHero.heading}
                </h1>
              </Reveal>
              <Reveal mode="mount" delay={0.15}>
                <p className="max-w-3xl text-lg leading-relaxed text-ink-muted sm:text-xl">
                  {solutionsHero.subline}
                </p>
              </Reveal>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {solutions.map((solution, index) => {
                const isFlagship = solution.status === "flagship";
                return (
                  <Reveal
                    key={solution.slug}
                    delay={(index % 3) * 0.1}
                    className="h-full"
                  >
                    <article
                      id={solution.slug}
                      className={cn(
                        "flex h-full scroll-mt-28 flex-col gap-5 rounded-card p-8",
                        isFlagship
                          ? "bg-gradient-to-b from-white to-lime"
                          : "bg-white",
                      )}
                    >
                      <div
                        className={cn(
                          "grid h-36 place-items-center rounded-2xl",
                          isFlagship ? "bg-white/50" : "bg-surface/60",
                        )}
                      >
                        <Lottie
                          name={solution.lottie}
                          ariaLabel={solution.name}
                          className="h-full w-full p-2"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-2xl text-pine">{solution.name}</h2>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs",
                            isFlagship
                              ? "bg-pine text-lime"
                              : solution.status === "available"
                                ? "bg-pass-tint text-ramp-2"
                                : "bg-lime text-pine",
                          )}
                        >
                          {isFlagship ? "Flagship" : solution.status === "available" ? "Available" : "Coming Soon"}
                        </span>
                      </div>

                      <p className="text-base leading-relaxed text-pine/80">
                        {solution.description}
                      </p>

                      {solution.access === "alpr" ? (
                        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3">
                          <AlprAccessButton />
                          <Link
                            href="/demo"
                            className="inline-flex items-center gap-1.5 text-base text-pine underline underline-offset-4 transition-opacity hover:opacity-70"
                          >
                            Try the live demo
                            <ArrowRight aria-hidden className="size-4" />
                          </Link>
                        </div>
                      ) : solution.open ? (
                        <SolutionOpenLink
                          href={solution.open}
                          label="Try it"
                          className="mt-auto inline-flex items-center gap-1.5 text-base text-pine underline underline-offset-4 transition-opacity hover:opacity-70"
                        />
                      ) : solution.href ? (
                        <Link
                          href={solution.href}
                          className="mt-auto inline-flex items-center gap-1.5 text-base text-pine underline underline-offset-4 transition-opacity hover:opacity-70"
                        >
                          Explore
                          <ArrowRight aria-hidden className="size-4" />
                        </Link>
                      ) : (
                        <span className="mt-auto inline-flex items-center gap-1.5 text-base text-pine/50">
                          Explore
                          <ArrowRight aria-hidden className="size-4" />
                        </span>
                      )}
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </Container>
        </HeroShell>
      </main>
      <SiteFooter />
    </>
  );
}
