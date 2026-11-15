import { steps } from "@/config/home";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "@/components/layout/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { Lottie } from "@/components/ui/lottie";

export function Steps() {
  return (
    <Container className="flex flex-col gap-14" id="how-it-works">
      <SectionHeading
        badge={steps.badge}
        badgeTint="lime"
        heading={steps.heading}
        cta={steps.cta}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {steps.items.map((step, index) => (
          <Reveal key={step.id} delay={index * 0.12} className="h-full">
            <article className="flex h-full flex-col gap-6 rounded-site-card bg-site-panel p-6 pb-10">
              <div className="h-[230px] overflow-hidden rounded-lg border border-site-line bg-white">
                <Lottie
                  name={step.lottie}
                  ariaLabel={step.title}
                  className="h-full w-full"
                />
              </div>
              <div className="mx-auto flex max-w-xs flex-col gap-2 text-center">
                <h3 className="text-xl font-semibold text-black">
                  {step.title}
                </h3>
                <p className="text-base leading-relaxed text-ink-muted">
                  {step.description}
                </p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}
