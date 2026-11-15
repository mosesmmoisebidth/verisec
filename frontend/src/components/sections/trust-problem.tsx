import { trustProblem } from "@/config/home";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "@/components/layout/section-heading";
import { TrustProblemVisual } from "@/components/sections/trust-problem-visual";

export function TrustProblem() {
  const items = trustProblem.items;
  const defaultOpenId = items[1]?.id ?? items[0]?.id ?? "";

  return (
    <Container className="flex flex-col gap-14" id="about">
      <SectionHeading
        badge={trustProblem.badge}
        badgeTint="lime"
        heading={trustProblem.heading}
        cta={trustProblem.cta}
      />
      <TrustProblemVisual items={items} defaultOpenId={defaultOpenId} />
    </Container>
  );
}
