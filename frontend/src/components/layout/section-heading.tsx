import { cn } from "@/lib/utils";

import { BadgePill } from "./badge-pill";
import { PillButton } from "@/components/ui/pill-button";

/**
 * Left-aligned section header with optional right-side CTA and hairline,
 * as used by "Trust Problem", "3 Easy Steps" and the catalog panel.
 */
export function SectionHeading({
  badge,
  badgeTint = "lime",
  heading,
  cta,
  dark = false,
  className,
  badgeIcon,
}: {
  badge?: string;
  badgeTint?: "white" | "lime";
  heading: string;
  cta?: { label: string; href: string };
  dark?: boolean;
  className?: string;
  /** Override the badge glyph; defaults to the arrow used by most sections. */
  badgeIcon?: React.ComponentType<{
    className?: string;
    "aria-hidden"?: boolean;
  }>;
}) {
  return (
    <div className={cn("flex flex-col gap-8", className)}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-3xl flex-col items-start gap-3">
          {badge && (
            <BadgePill tint={badgeTint} icon={badgeIcon}>
              {badge}
            </BadgePill>
          )}
          <h2
            className={cn(
              "text-4xl leading-tight sm:text-5xl lg:text-[64px] lg:leading-[1.25]",
              dark ? "text-white" : "text-pine",
            )}
          >
            {heading}
          </h2>
        </div>
        {cta && (
          <PillButton
            href={cta.href}
            variant={dark ? "ghost-dark" : "pine"}
            size="sm"
            arrow
          >
            {cta.label}
          </PillButton>
        )}
      </div>
      <hr className={cn(dark ? "border-white/15" : "border-site-line")} />
    </div>
  );
}

/** Centered section header used by Features, Pricing and Integrations. */
export function CenteredHeading({
  badge,
  badgeTint = "lime",
  heading,
  subline,
  dark = false,
  className,
  sublineClassName,
  badgeIcon,
}: {
  badge?: string;
  badgeTint?: "white" | "lime";
  heading: string;
  subline?: string;
  dark?: boolean;
  className?: string;
  /** Figma pins some sublines narrower than the heading (Integrations: 616px). */
  sublineClassName?: string;
  /** Override the badge glyph; defaults to the arrow used by most sections. */
  badgeIcon?: React.ComponentType<{
    className?: string;
    "aria-hidden"?: boolean;
  }>;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-3xl flex-col items-center gap-4 text-center",
        className,
      )}
    >
      {badge && (
        <BadgePill tint={badgeTint} icon={badgeIcon}>
          {badge}
        </BadgePill>
      )}
      <h2
        className={cn(
          "text-4xl leading-tight sm:text-5xl lg:text-[64px] lg:leading-[1.25]",
          dark ? "text-white" : "text-pine",
        )}
      >
        {heading}
      </h2>
      {subline && (
        <p
          className={cn(
            "max-w-2xl text-xl leading-relaxed",
            dark ? "text-white/80" : "text-pine",
            sublineClassName,
          )}
        >
          {subline}
        </p>
      )}
    </div>
  );
}
