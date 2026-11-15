import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Marketing pill button. Every CTA in the Figma file is a fully rounded
 * pill in one of six colorways; sizes map to the 50px / 45px buttons
 * used across sections and the navbar.
 */
const pillButtonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-full text-lg leading-none whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        lime: "bg-lime text-pine hover:bg-lime/85",
        pine: "bg-pine text-white hover:bg-pine/90",
        "pine-lime": "bg-pine text-lime hover:bg-pine/90",
        white:
          "border border-black/10 bg-white text-pine hover:bg-white/70 hover:border-black/20",
        "ghost-dark": "bg-white/8 text-white hover:bg-white/15",
        "lime-outline":
          "border border-lime bg-lime/15 text-lime hover:bg-lime/25",
      },
      size: {
        md: "h-[50px] px-10",
        sm: "h-[45px] px-8",
        wide: "h-[59px] w-full px-10 text-xl font-light",
      },
    },
    defaultVariants: {
      variant: "lime",
      size: "md",
    },
  },
);

type PillButtonProps = VariantProps<typeof pillButtonVariants> & {
  href?: string;
  arrow?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"button">, "className" | "children">;

export function PillButton({
  href,
  arrow = false,
  variant,
  size,
  className,
  children,
  ...props
}: PillButtonProps) {
  const classes = cn(pillButtonVariants({ variant, size }), className);
  const content = (
    <>
      {children}
      {arrow && <ArrowRight aria-hidden className="size-[19px]" />}
    </>
  );

  // Another site (the docs on docs.verisec.dev) opens in a new tab.
  if (href && /^https?:\/\//.test(href)) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {content}
    </button>
  );
}
