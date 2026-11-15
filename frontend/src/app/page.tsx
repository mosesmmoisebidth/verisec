import { faq } from "@/config/home";
import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd } from "@/config/structured-data";
import { SiteFooter } from "@/components/layout/site-footer";
import { Catalog } from "@/components/sections/catalog";
import { FaqSection } from "@/components/sections/faq-section";
import { Features } from "@/components/sections/features";
import { Hero } from "@/components/sections/hero";
import { Integrations } from "@/components/sections/integrations";
import { PricingSection } from "@/components/sections/plan-cards";
import { Steps } from "@/components/sections/steps";
import { TrustedLogos } from "@/components/sections/trusted-logos";
import { Testimonials } from "@/components/sections/testimonials";
import { TrustProblem } from "@/components/sections/trust-problem";

export default function HomePage() {
  return (
    <>
      <JsonLd data={faqJsonLd} />
      <main className="flex flex-col gap-20 pb-20 lg:gap-28 lg:pb-28">
        <Hero />
        <TrustProblem />
        <Features />
        <Steps />
        <TrustedLogos />
        <Testimonials />
        <PricingSection />
        <Integrations />
        <FaqSection
          badge={faq.badge}
          heading={faq.heading}
          cta={faq.cta}
          items={faq.items}
          defaultOpen={faq.defaultOpen}
        />
        <Catalog />
      </main>
      <SiteFooter />
    </>
  );
}
