"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { industries, industryHref } from "@/config/industries";
import { industryIcons } from "@/components/layout/industry-icons";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;
/** Keep the panel this far from the window edges (the hero panel clips anything past its rounded edge). */
const EDGE = 32;

const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.018, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
};

/**
 * The Industries mega-menu: the same panel and item style as the Solutions menu, wide enough (three columns) that
 * every industry shows at once with no scrolling. It fades and slides in, the items follow one after another, and
 * it stays put for people who prefer reduced motion. Opens on hover (desktop) or click, closes on outside-click /
 * Escape / navigation, and is keyboard-operable.
 */
export function IndustriesMenu({ active = false }: { active?: boolean }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Centred under the trigger, then nudged sideways if that would run past either edge of the window.
  useLayoutEffect(() => {
    if (!open) return;
    const el = panel.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = r.left - shift;
    const right = r.right - shift;
    let dx = 0;
    if (left < EDGE) dx = EDGE - left;
    else if (right > window.innerWidth - EDGE) dx = window.innerWidth - EDGE - right;
    if (dx !== shift) setShift(dx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      // Hover opens it for a mouse only. On a touch screen a tap also fires hover, which opened the menu and then the
      // tap's click closed it again at once; there a tap simply toggles it.
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-[45px] items-center gap-1 rounded-full px-4 text-[17px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/70 2xl:px-6 2xl:text-lg",
          active || open ? "bg-pine text-white" : "text-pine hover:bg-surface",
        )}
      >
        Industries
        <ChevronDown aria-hidden className={cn("size-4 opacity-80 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          // pt-3 (not mt-3) bridges the gap so hover doesn't drop between trigger and panel.
          <div
            key="industries-panel"
            ref={panel}
            className="absolute left-1/2 top-full z-40 w-[min(calc(100vw-4rem),64rem)] pt-3"
            style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          >
            <motion.div
              role="menu"
              aria-label="Industries"
              initial={reduce ? false : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985, transition: { duration: 0.14 } }}
              transition={{ duration: 0.26, ease: EASE }}
              style={{ transformOrigin: "top center" }}
              className="rounded-3xl border border-site-line bg-white p-3 shadow-xl"
            >
              <motion.div
                variants={list}
                initial={reduce ? false : "hidden"}
                animate="show"
                className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3"
              >
                {industries.map((it) => {
                  const Icon = industryIcons[it.icon];
                  return (
                    <motion.div key={it.slug} variants={reduce ? undefined : item}>
                      <Link
                        href={industryHref}
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-pine">
                          <Icon aria-hidden className="size-5" />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[15px] font-medium text-pine">{it.name}</span>
                          <span className="text-[13px] leading-snug text-ink-muted">{it.description}</span>
                        </span>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
              <Link
                href={industryHref}
                onClick={() => setOpen(false)}
                className="mt-1 flex items-center justify-center gap-1.5 rounded-2xl bg-pine px-4 py-3 text-[15px] text-lime transition-opacity hover:opacity-90"
              >
                Talk to us about your industry
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
