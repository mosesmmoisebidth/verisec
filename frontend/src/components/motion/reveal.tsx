"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

/**
 * Scroll-in (or mount) reveal used across sections. Falls back to a
 * static render when the user prefers reduced motion.
 *
 * mode "view" (default) animates when scrolled into view, once.
 * mode "mount" animates immediately (hero content).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  mode = "view",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  mode?: "view" | "mount";
}) {
  const reduceMotion = useReducedMotion();

  /**
   * min-w-0 matters: a Reveal is almost always a grid or flex child, and those
   * default to min-width:auto, meaning they refuse to shrink below their
   * content's intrinsic width. A Reveal wrapping a code block therefore blew
   * the whole page out to 713px on a 390px viewport, because the wrapper grew
   * to fit an unwrapped <pre> instead of letting it scroll internally.
   */
  const base = "min-w-0";

  if (reduceMotion) {
    return <div className={cn(base, className)}>{children}</div>;
  }

  const target = { opacity: 1, y: 0 };
  const transition = { duration: 0.7, delay, ease: EASE };

  return (
    <motion.div
      className={cn(base, className)}
      initial={{ opacity: 0, y }}
      {...(mode === "mount"
        ? { animate: target, transition }
        : {
            whileInView: target,
            viewport: { once: true, margin: "-80px" },
            transition,
          })}
    >
      {children}
    </motion.div>
  );
}
