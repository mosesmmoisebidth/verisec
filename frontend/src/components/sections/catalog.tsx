import Link from "next/link";
import { ArrowRight, Box } from "lucide-react";

import { catalog } from "@/config/home";
import { AlprAccessButton } from "@/components/alpr/alpr-access";
import { GridBackdrop } from "@/components/layout/grid-backdrop";
import { Panel } from "@/components/layout/container";
import { SectionHeading } from "@/components/layout/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { Lottie } from "@/components/ui/lottie";

export function Catalog() {
  return (
    <Panel className="bg-pine" id="products">
      {/* Figma puts the same grid plane on this panel as on the heroes. It was
          missing entirely here: only blobs and three off-grid squares. */}
      <GridBackdrop tone="dark" />

      <div className="relative flex flex-col gap-12 px-6 py-16 sm:px-10 lg:px-14 lg:py-20">
        <SectionHeading
          badge={catalog.badge}
          badgeIcon={Box}
          badgeTint="white"
          heading={catalog.heading}
          cta={catalog.cta}
          dark
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.items.map((product, index) => {
            const cardClass =
              "flex h-full flex-col gap-6 rounded-site-card bg-white/9 p-8 backdrop-blur-xl transition-colors";
            const body = (
              <>
                <Lottie
                  name={product.lottie}
                  ariaLabel={product.title}
                  className="mx-auto h-40 w-full max-w-[300px]"
                />
                <div className="flex flex-col gap-2">
                  <h3 className="flex flex-wrap items-center gap-2.5 text-xl font-semibold text-white">
                    {product.title}
                  </h3>
                  <p className="text-base leading-relaxed text-white/75">
                    {product.description}
                  </p>
                </div>
              </>
            );
            // The offline-SDK product opens an access popup in place (not a jump to Contact),
            // plus a link into the live demo, so it is a card with its own actions, not a link.
            const isAccess = "access" in product && product.access;
            return (
              <Reveal key={product.id} delay={(index % 3) * 0.1} className="h-full">
                {isAccess ? (
                  <div className={cardClass}>
                    {body}
                    <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3">
                      <AlprAccessButton />
                      <Link
                        href="/demo"
                        className="inline-flex items-center gap-1.5 text-[15px] font-medium text-lime underline underline-offset-4 transition-opacity hover:opacity-80"
                      >
                        Try the live demo
                        <ArrowRight aria-hidden className="size-4" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <Link
                    href={product.href}
                    className={`group outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-lime/70 ${cardClass}`}
                  >
                    {body}
                  </Link>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
