import { cn } from "@/lib/utils";

/**
 * Layout primitives matching the Figma grid: a 1440px page, full-bleed
 * rounded "panels" inset 24px from it (1392px, as the Figma frames are),
 * and one shared 1280px content column inside both.
 *
 * Container and Panel MUST land their content on the same left/right edges,
 * or unpanelled sections look indented against panelled ones. At >=1440px:
 *
 *   Panel      page inset 24 + section padding 56 = 80
 *   Container  padding 80                          = 80
 *
 * Container was previously max-w-7xl (1280px) PLUS 80px padding, which put
 * its content 160px from the edge: double the panels, and the "Inner Content
 * has Much Padding From the Borders" problem Moses flagged across every page.
 */

export function Container({
  className,
  children,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        // Width is viewport-proportional (95vw) so the side margin stays ~2.5%
        // at any zoom level instead of ballooning past a fixed cap; capped at
        // 1800px for ultra-wide readability. px matches a Panel's page inset +
        // section padding at each breakpoint (12+24=36, 24+40=64, 24+56=80).
        "mx-auto w-full max-w-[min(95vw,1800px)] px-9 sm:px-16 lg:px-20",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Rounded full-bleed section panel (30px radius, 24px page inset). */
export function Panel({
  className,
  children,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mx-auto w-full max-w-[min(95vw,1800px)] px-3 sm:px-6">
      <div className={cn("relative overflow-hidden rounded-site-panel", className)}>
        {children}
      </div>
    </section>
  );
}
