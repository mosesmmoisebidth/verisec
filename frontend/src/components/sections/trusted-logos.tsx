import type { ReactNode } from "react";

import { trustedLogos, type TrustedCompany } from "@/config/home";
import { Container } from "@/components/layout/container";

/**
 * A quiet, continuously scrolling strip of the companies piloting VeriSec, with
 * both edges faded so the logos drift in and out of view. Pure CSS (the shared
 * `animate-marquee-x` keyframe), so it needs no client JS. The row is duplicated
 * once and the keyframe translates it -50%, which loops seamlessly; the second
 * copy is hidden from assistive tech so each name is announced only once.
 *
 * Each company shows its logo image (from config/home.ts), falling back to its
 * name as a wordmark when no logo is set. The heading matches the site's section
 * headings; the section carries no border and sits in the page's section rhythm.
 */
function LogoItem({ c, dup }: { c: TrustedCompany; dup: boolean }) {
  const hidden = dup || undefined;
  let node: ReactNode;
  if (c.logo) {
    node = (
      // eslint-disable-next-line @next/next/no-img-element -- local logo asset, no optimisation needed
      <img
        src={c.logo}
        alt={dup ? "" : c.name}
        aria-hidden={hidden}
        className="h-10 w-auto max-w-[180px] object-contain transition duration-300 group-hover:scale-110 sm:h-12"
      />
    );
  } else {
    node = (
      <span className="text-[26px] font-semibold tracking-tight whitespace-nowrap text-pine/40 transition-colors duration-300 group-hover:text-pine sm:text-[30px]">{c.name}</span>
    );
  }

  return c.href ? (
    <a
      href={c.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-hidden={hidden}
      tabIndex={dup ? -1 : undefined}
      className="inline-flex items-center"
    >
      {node}
    </a>
  ) : (
    <span className="inline-flex items-center" aria-hidden={hidden}>
      {node}
    </span>
  );
}

export function TrustedLogos() {
  const companies = trustedLogos.companies;
  const loop = [...companies, ...companies];

  return (
    <Container className="-mt-4 -mb-1 flex flex-col items-center gap-10 text-center lg:-mt-6 lg:-mb-2">
      <h2 className="m-0 max-w-4xl text-4xl leading-tight text-pine sm:text-5xl lg:text-[64px] lg:leading-[1.25]">
        {trustedLogos.heading}
      </h2>

      <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)]">
        <ul className="m-0 flex w-max list-none items-center gap-16 p-0 pr-16 animate-marquee-x hover:[animation-play-state:paused] sm:gap-20 sm:pr-20">
          {loop.map((c, i) => (
            <li key={`${c.name}-${i}`} className="group flex shrink-0 items-center">
              <LogoItem c={c} dup={i >= companies.length} />
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
