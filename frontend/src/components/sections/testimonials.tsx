import { Star } from "lucide-react";

import { testimonials, type Testimonial } from "@/config/home";
import { Panel } from "@/components/layout/container";
import { BadgePill } from "@/components/layout/badge-pill";
import { PillButton } from "@/components/ui/pill-button";

function TestimonialCard({ item }: { item: Testimonial }) {
  const initials = item.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <figure className="flex flex-col gap-5 rounded-2xl bg-white px-8 py-6">
      <div aria-label="5 out of 5 stars" className="flex gap-1.5" role="img">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} aria-hidden className="size-6 fill-pine text-pine" />
        ))}
      </div>
      <blockquote className="text-xl leading-snug text-pine sm:text-2xl">
        {item.quote}
      </blockquote>
      <figcaption className="flex items-center gap-4">
        {item.logo ? (
          <span
            aria-hidden
            className="flex size-[54px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-2 ring-1 ring-pine/10"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.logo} alt="" className="max-h-full max-w-full object-contain" />
          </span>
        ) : (
          <span
            aria-hidden
            className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pine to-lime text-lg font-medium text-white"
          >
            {initials}
          </span>
        )}
        <span className="flex flex-col gap-0.5">
          <span className="text-xl text-pine">{item.name}</span>
          <span className="text-[15px] text-pine/75">{item.role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function Testimonials() {
  const loop = [...testimonials.items, ...testimonials.items];

  return (
    <Panel className="bg-lime">
      <div className="grid items-center gap-14 px-6 py-16 sm:px-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:px-14 lg:py-24">
        <div className="flex max-w-xl flex-col items-start gap-7">
          <BadgePill tint="white">{testimonials.badge}</BadgePill>
          <h2 className="text-4xl leading-tight text-black sm:text-5xl lg:text-[56px] lg:leading-[1.25]">
            {testimonials.heading}
          </h2>
          <p className="text-xl leading-relaxed text-pine">
            {testimonials.subline}
          </p>
          <PillButton href={testimonials.cta.href} variant="pine-lime" arrow>
            {testimonials.cta.label}
          </PillButton>
        </div>

        <div className="mask-fade-y relative h-[540px] overflow-hidden lg:h-[620px]">
          <div className="flex animate-marquee-y flex-col gap-8 hover:[animation-play-state:paused]">
            {loop.map((item, index) => (
              <TestimonialCard key={`${item.name}-${index}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
