"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Car,
  ChevronDown,
  CreditCard,
  FileScan,
  IdCard,
  Nfc,
  Receipt,
  ScanFace,
  ScanLine,
  UserSearch,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { solutions } from "@/config/solutions";

const solutionIcons = {
  "id-card": IdCard,
  receipt: Receipt,
  "scan-line": ScanLine,
  nfc: Nfc,
  car: Car,
  "user-search": UserSearch,
  "credit-card": CreditCard,
  "file-scan": FileScan,
  "scan-face": ScanFace,
} as const;

const EASE = [0.21, 0.47, 0.32, 0.98] as const;
const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
};

/** Where a solution links: its detail page if it has one, else the index anchor. */
function solutionHref(slug: string, href?: string) {
  return href ?? `/solutions#${slug}`;
}

/**
 * The Solutions mega-menu. A products dropdown driven by `config/solutions`,
 * so it always matches the Solutions page and the catalog. Opens on hover
 * (desktop) or click, closes on outside-click / Escape / navigation, and is
 * keyboard-operable. It fades and slides in like the Industries menu, and stays
 * put for people who prefer reduced motion.
 */
export function SolutionsMenu({ active = false }: { active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
        Solutions
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 opacity-80 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          // pt-3 (not mt-3) bridges the gap so hover doesn't drop between trigger and panel.
          <div
            key="solutions-panel"
            className="absolute left-1/2 top-full z-40 w-[min(92vw,44rem)] -translate-x-1/2 pt-3"
          >
            <motion.div
              role="menu"
              aria-label="Solutions"
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
                className="grid gap-1 sm:grid-cols-2"
              >
                {solutions.map((s) => {
                  const Icon = solutionIcons[s.icon];
                  return (
                    <motion.div key={s.slug} variants={reduce ? undefined : item}>
                      <Link
                        href={solutionHref(s.slug, s.href)}
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-pine">
                          <Icon aria-hidden className="size-5" />
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-2 text-[15px] font-medium text-pine">
                            {s.name}
                            {s.status === "coming-soon" && (
                              <span className="rounded-full bg-lime px-1.5 py-0.5 text-[10px] leading-none text-pine">
                                Soon
                              </span>
                            )}
                          </span>
                          <span className="text-[13px] leading-snug text-ink-muted">
                            {s.description}
                          </span>
                        </span>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
              <Link
                href="/solutions"
                onClick={() => setOpen(false)}
                className="mt-1 flex items-center justify-center gap-1.5 rounded-2xl bg-pine px-4 py-3 text-[15px] text-lime transition-opacity hover:opacity-90"
              >
                View all solutions
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
