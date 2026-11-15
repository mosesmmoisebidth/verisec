import Link from "next/link";

import type { LegalDoc } from "@/config/legal";
import { Container } from "@/components/layout/container";
import { SiteHeader } from "@/components/layout/site-header";
import { Reveal } from "@/components/motion/reveal";

/**
 * Shared shell for the Privacy Policy and Terms of Service pages.
 *
 * Figma geometry (1440 frame, 1280 content column):
 *   title        94.61px Medium, centred, with a 24px "Last updated" beneath
 *   body card    847px wide, white, radius 19, padding 53/40
 *   aside        384px wide, pine, radius 19, padding 26/28 (49px gutter)
 *   body text    15px on a 32px line height
 *   headings     24px Medium
 *   section      32px top padding, 16px gap; lists inset 20px with a 10px gap
 *
 * The table of contents is generated from the same `sections` array that
 * renders the body, so numbering and anchors cannot drift apart.
 */

/**
 * Page-wide backdrop. Unlike the marketing sections, Figma tiles the grid down
 * the ENTIRE legal page (a 1207px-tall vector repeated five times) and keeps
 * the lime blooms up near the masthead, so the grid is full-height here while
 * the blooms are confined to the top band.
 */
function LegalBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* full-height grid, faded left and right so it never ends on a hard edge */}
      <div className="bg-grid absolute inset-0 [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]" />

      {/* Figma's Rectangle 5 / 6: 508px lime blooms at 19%, blur 200 */}
      <div className="animate-float absolute -top-32 -right-24 size-[508px] rounded-full bg-lime/20 blur-[130px]" />
      <div className="animate-float-late absolute top-[560px] -left-32 size-[508px] rounded-full bg-lime/20 blur-[130px]" />

      {/* Figma's Rectangle 10 / 11 / 12: three lit cells behind the masthead */}
      {[
        { left: 691, top: 176, delay: -2.1, duration: 11 },
        { left: 469, top: 249, delay: -6.4, duration: 13 },
        { left: 985, top: 252, delay: -9.2, duration: 10 },
      ].map((cell) => (
        <div
          key={`${cell.left}-${cell.top}`}
          className="animate-cell-glow absolute hidden size-[72px] bg-pine/6 lg:block"
          style={{
            left: cell.left,
            top: cell.top,
            animationDelay: `${cell.delay}s`,
            animationDuration: `${cell.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

function TableOfContents({ doc }: { doc: LegalDoc }) {
  return (
    <aside className="rounded-[19px] bg-pine px-[26px] py-7 lg:sticky lg:top-8">
      <h2 className="text-xs font-bold tracking-[0.02em] text-white">
        Table of contents
      </h2>
      <ol className="mt-5 flex flex-col gap-2.5">
        {doc.sections.map((section, index) => (
          <li key={section.id} className="flex gap-2 text-sm leading-6">
            <span className="shrink-0 text-[#d1d1d1]">{index + 1}.</span>
            <Link
              href={`#${section.id}`}
              className="text-lime underline-offset-4 transition-colors hover:underline"
            >
              {section.title}
            </Link>
          </li>
        ))}
      </ol>
      <hr className="mt-5 border-white/15" />
      <Link
        href="#top"
        className="mt-5 inline-block text-sm leading-5 text-lime underline-offset-4 hover:underline"
      >
        Back to top ↑
      </Link>
    </aside>
  );
}

export function LegalPage({
  doc,
  /**
   * Legal pages sit outside the primary nav, so nothing should read as the
   * current section. Defaulting to "/" wrongly lit up the Home pill.
   */
  activeHref = "",
}: {
  doc: LegalDoc;
  activeHref?: string;
}) {
  return (
    <main id="top" className="relative flex flex-col bg-surface pb-24">
      <LegalBackdrop />

      <div className="relative z-10 flex flex-col">
        <SiteHeader activeHref={activeHref} />

        <Container className="flex flex-col gap-10 pt-20 pb-12 lg:pt-28">
          <Reveal mode="mount" className="flex flex-col items-center gap-3">
            <h1 className="text-center text-[clamp(2.5rem,7vw,94px)] leading-[1.25] font-medium tracking-[-0.01em] text-pine">
              {doc.title}
            </h1>
            <p className="text-center text-2xl text-[#5d5d5d]">{doc.updated}</p>
          </Reveal>
        </Container>

        <Container className="grid gap-12 lg:grid-cols-[minmax(0,847fr)_minmax(0,384fr)] lg:items-start">
          {/* Body card */}
          <div className="rounded-[19px] bg-white px-6 py-10 sm:px-10 lg:px-[53px]">
            {/*
              Figma sets legal body copy to #6a6a6a on a 32px line height.
              The Terms frame used #5b6472 for the same role; normalized to the
              Privacy value so the two pages cannot read as different systems.
            */}
            <div className="flex flex-col gap-4 text-[15px] leading-8 text-[#6a6a6a]">
              {doc.intro.map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </div>

            {doc.sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="flex scroll-mt-28 flex-col gap-4 pt-8"
              >
                <h2 className="text-2xl leading-8 font-medium text-pine">
                  {index + 1}. {section.title}
                </h2>

                {section.body && (
                  <div className="flex flex-col gap-4 text-[15px] leading-8 text-[#6a6a6a]">
                    {section.body.map((paragraph) => (
                      <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                    ))}
                  </div>
                )}

                {section.items && (
                  <ul className="flex list-disc flex-col gap-2.5 pl-5 text-[15px] leading-8 text-[#6a6a6a]">
                    {section.items.map((item) => (
                      <li key={item.slice(0, 40)}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <TableOfContents doc={doc} />
        </Container>
      </div>
    </main>
  );
}
