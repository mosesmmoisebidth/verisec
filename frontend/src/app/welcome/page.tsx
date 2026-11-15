import { ArrowRight, Sparkles } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Lottie } from "@/components/ui/lottie";
import { ResumeGate } from "@/components/verify/resume-gate";
import { getLanding, getVerifyFlow } from "@/lib/verify";
import { cn } from "@/lib/utils";

export const metadata = { title: "VeriSec" };

/**
 * The opening screen — Figma Desktop-1.
 *
 * What an operator sees before they walk the flow themselves, so it lives at
 * `/` rather than behind the flow: it is the entry point, not a step of it. It
 * has no stepper, no Back and no position, which is why it reads `getLanding()`
 * rather than `getScreen()`.
 *
 * The frame is a 1257×876 glass card on the line field, split into a copy
 * column and a single dark slab rotated -4°. That slab holds no content in the
 * frame — it is where a screenshot or a loop of the flow goes — so it is drawn
 * as the empty, clearly-marked surface it is rather than filled with something
 * invented.
 */
export default async function LandingPage() {
  const { brand, badge, heading, body, cta, secondary, cards } = await getLanding();
  const { steps } = await getVerifyFlow();

  return (
    <div className="vs-ground relative min-h-screen">
      <div className="vs-backdrop" aria-hidden />
      <ResumeGate steps={steps.map((s) => ({ id: s.id, title: s.title, optional: s.optional }))} />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 lg:px-8">
        <main className="vs-card-in w-full max-w-flow-card rounded-[28px] bg-white/60 p-8 shadow-flow backdrop-blur-[14.9px] lg:rounded-flow lg:p-16">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,566px)_minmax(0,1fr)] lg:gap-16">
            {/* ---- copy column ------------------------------------------- */}
            <div className="flex flex-col gap-7">
              <span
                className="vs-in inline-flex w-fit items-center gap-2 rounded-pill border border-pine/11 bg-lime px-3 py-1 text-eyebrow font-medium text-pine"
                style={delay(80)}
              >
                <Sparkles aria-hidden className="size-3.5" strokeWidth={1.8} />
                {badge}
              </span>

              <h1
                className="vs-in m-0 max-w-[500px] text-[34px] leading-[1.06] font-medium tracking-[-0.8px] text-pine sm:text-[42px] lg:text-hero"
                style={delay(140)}
              >
                {heading}
              </h1>

              <p className="vs-in m-0 max-w-[52ch] text-body text-quiet lg:text-lead" style={delay(200)}>
                {body}
              </p>

              <a
                href={`/verify/${cta.to}`}
                className="group vs-in inline-flex h-11 w-fit items-center gap-2.5 rounded-pill bg-pine px-6 text-body font-medium text-white shadow-cta transition-[background-color,transform] hover:bg-pine/90 active:scale-[0.97]"
                style={delay(260)}
              >
                {cta.label}
                <ArrowRight
                  aria-hidden
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={1.8}
                />
              </a>

              {secondary ? (
                <a
                  href={secondary.href}
                  className="vs-in -mt-1 w-fit text-body text-quiet underline underline-offset-4 transition-colors hover:text-pine"
                  style={delay(300)}
                >
                  {secondary.label}
                </a>
              ) : null}

              <ul className="m-0 flex list-none flex-wrap gap-3 p-0 sm:flex-nowrap">
                {cards.map((card, i) => (
                  <li
                    key={card.index}
                    className={cn(
                      "vs-in flex min-w-[150px] flex-1 flex-col gap-1 rounded-slab p-4",
                      // The frame paints only the first card on the gradient —
                      // it is the step you are about to take.
                      i === 0
                        ? "bg-[image:var(--gradient-feature)]"
                        : "bg-white/80",
                    )}
                    style={delay(320 + i * 70)}
                  >
                    <span className="text-eyebrow font-medium text-pine/70">{card.index}</span>
                    <span className="text-body font-medium text-pine">{card.label}</span>
                  </li>
                ))}
              </ul>

              <span className="vs-in flex items-center gap-2 text-pine" style={delay(540)}>
                <LogoMark className="h-7" />
                <span className="text-mark leading-none font-bold tracking-tight">
                  {brand.wordmark}
                </span>
              </span>
            </div>

            {/* ---- the slab — the preview of the applicant flow ---------- */}
            <div className="vs-in hidden lg:block" style={delay(300)}>
              <div className="aspect-[472/358] w-full -rotate-4 rounded-[38px] bg-pine p-2 shadow-[0_32px_64px_-21px_rgb(15_23_42/0.35)]">
                <div className="grid h-full w-full place-items-center overflow-hidden rounded-[32px] border border-lime/20 bg-[image:var(--gradient-feature)]">
                  {/* lottie_19 is the Desktop-1 animation (user-supplied set).
                      Until the JSON lands in public/animation_files, the player
                      degrades to its quiet placeholder rather than a break. */}
                  <Lottie
                    name="lottie_19"
                    ariaLabel="A preview of the applicant verification flow"
                    className="h-full w-full [&_svg]:!h-full [&_svg]:!w-full [&_svg]:object-contain"
                  />
                </div>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

function delay(ms: number) {
  return { "--vs-d": `${ms}ms` } as React.CSSProperties;
}
