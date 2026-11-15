import Link from "next/link";

import { footerColumns, legalLinks, siteConfig } from "@/config/site";
import { Wordmark } from "@/components/brand/logo";
import { Container } from "@/components/layout/container";
import { FooterStatus } from "@/components/layout/footer-status";
import { PillButton } from "@/components/ui/pill-button";

export function SiteFooter() {
  return (
    <footer className="bg-gradient-to-b from-white to-lime">
      <Container className="flex flex-col gap-16 pt-10 pb-8 lg:gap-24">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div className="flex flex-col gap-3">
            <Wordmark label={siteConfig.legalName} />
            <p className="text-2xl text-pine">{siteConfig.tagline}</p>
          </div>
          <PillButton href="/contact" variant="pine" size="sm" arrow>
            Contact Us
          </PillButton>
        </div>

        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-12 gap-y-12 sm:grid-cols-3 sm:gap-x-16 lg:gap-x-28 lg:pl-8"
        >
          {footerColumns.map((column) => (
            <div key={column.heading} className="flex flex-col gap-6">
              <h3 className="text-2xl font-medium text-pine">
                {column.heading}
              </h3>
              <ul className="flex flex-col gap-5">
                {column.links.map((link) => {
                  const external = /^https?:\/\//.test(link.href);
                  // The status page is served outside the Next app (static,
                  // by Caddy), so it needs a full-page load, not client-side
                  // routing. The docs are their own site: open in a new tab.
                  const hardNav = external || link.href.startsWith("/status");
                  return (
                    <li key={link.label}>
                      {hardNav ? (
                        <a
                          href={link.href}
                          {...(external
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                          className="text-2xl text-pine/70 transition-colors hover:text-pine"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-2xl text-pine/70 transition-colors hover:text-pine"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-6">
          <hr className="border-pine/15" />
          <div className="flex flex-wrap items-center justify-between gap-6">
            <p className="text-lg text-pine/70">{siteConfig.copyright}</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <FooterStatus />
              {legalLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-lg text-pine/70 transition-colors hover:text-pine"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}
