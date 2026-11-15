import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Section eyebrow badge: pill with a small pine icon-circle and a 15px
 * label. Two tints in Figma: white (on tinted panels) and lime (on
 * white sections).
 */
export function BadgePill({
  children,
  tint = "white",
  icon: Icon = ArrowUpRight,
  className,
}: {
  children: React.ReactNode;
  tint?: "white" | "lime";
  /**
   * Glyph inside the pine circle. Most Figma sections use the arrow; the
   * Integrations eyebrow uses an asterisk instead.
   */
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border border-black/10 py-1 pr-3 pl-1",
        tint === "white" ? "bg-white" : "bg-lime",
        className,
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-pine">
        <Icon aria-hidden className="size-4 text-lime" />
      </span>
      <span className="text-[15px] text-pine">{children}</span>
    </span>
  );
}
