"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { mainNav } from "@/config/site";
import { industries, industryHref } from "@/config/industries";
import { industryIcons } from "@/components/layout/industry-icons";
import { Wordmark } from "@/components/brand/logo";
import { SolutionsMenu } from "@/components/layout/solutions-menu";
import { IndustriesMenu } from "@/components/layout/industries-menu";
import { useCurrentAccount } from "@/lib/console/use-current-account";

/**
 * Floating header rendered inside the home hero panel: wordmark left, white
 * pill nav right, auth actions after it.
 *
 * Log in / Get started came back when `/login` and `/signup` did — this header
 * is now the front door of one app rather than of a marketing site that led
 * nowhere.
 */
export function SiteHeader({ activeHref = "/" }: { activeHref?: string }) {
  const [open, setOpen] = useState(false);
  const [industriesOpen, setIndustriesOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  // The open mobile menu is a sheet pinned to the window (so no rounded hero panel can clip it); the page behind
  // it holds still until it closes.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  // When a persisted session is present, the two auth actions collapse to a
  // single "Dashboard" button — you're already in, so the front door says so.
  const { status } = useCurrentAccount();
  const authed = status === "authed";

  return (
    <header className="relative z-20 flex items-center justify-between gap-3 px-6 pt-8 sm:px-10 lg:pt-10 xl:px-14">
      <Link href="/" aria-label="VeriSec home" className="shrink-0">
        <Wordmark />
      </Link>

      {/* Desktop pill nav */}
      <nav
        aria-label="Main"
        className="hidden items-center gap-1 rounded-full bg-white p-1.5 xl:flex"
      >
        {mainNav.map((item) => {
          const active = item.href === activeHref;
          if (item.menu === "solutions") {
            return <SolutionsMenu key={item.label} active={active} />;
          }
          if (item.menu === "industries") {
            return <IndustriesMenu key={item.label} active={active} />;
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-[45px] items-center rounded-full px-4 text-[17px] whitespace-nowrap transition-colors 2xl:px-6 2xl:text-lg",
                active ? "bg-pine text-white" : "text-pine hover:bg-surface",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Auth actions — one white pill. Signed out: Login + Start Free. Signed
          in: a single Dashboard button (the design's right-hand capsule). */}
      <div className="hidden shrink-0 items-center rounded-full bg-white p-1.5 xl:flex">
        {authed ? (
          <a
            href="/dashboard"
            className="flex h-[45px] items-center gap-1.5 rounded-full bg-pine px-5 text-[17px] whitespace-nowrap text-lime transition-opacity hover:opacity-90 2xl:px-6 2xl:text-lg"
          >
            Dashboard
            <ArrowRight aria-hidden className="size-4" />
          </a>
        ) : (
          <>
            <a
              href="/login"
              className="flex h-[45px] items-center rounded-full px-5 text-[17px] whitespace-nowrap text-pine transition-colors hover:bg-surface 2xl:px-6 2xl:text-lg"
            >
              Login
            </a>
            <a
              href="/signup"
              className="flex h-[45px] items-center gap-1.5 rounded-full bg-pine px-5 text-[17px] whitespace-nowrap text-lime transition-opacity hover:opacity-90 2xl:px-6 2xl:text-lg"
            >
              Start Free
              <ArrowRight aria-hidden className="size-4" />
            </a>
          </>
        )}
      </div>

      {/* Mobile menu */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="relative z-50 flex size-11 items-center justify-center rounded-full bg-white text-pine xl:hidden"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open && (
        // a tap anywhere outside the sheet closes the menu
        <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-pine/20 xl:hidden" />
      )}
      {open && (
        <div className="fixed inset-x-4 top-[6.5rem] z-50 flex max-h-[calc(100dvh-7.5rem)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-3xl bg-white p-3 shadow-xl [scrollbar-width:none] sm:inset-x-8 xl:hidden [&::-webkit-scrollbar]:hidden">
          {mainNav.map((item) =>
            item.menu === "industries" ? (
              <div key={item.label} className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={industriesOpen}
                  onClick={() => setIndustriesOpen((v) => !v)}
                  className={cn(
                    "flex items-center justify-between rounded-full px-5 py-3 text-left text-lg transition-colors",
                    industriesOpen ? "bg-surface text-pine" : "text-pine hover:bg-surface",
                  )}
                >
                  {item.label}
                  <ChevronDown aria-hidden className={cn("size-5 opacity-80 transition-transform", industriesOpen && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {industriesOpen && (
                    <motion.div
                      key="mobile-industries"
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.26, ease: [0.21, 0.47, 0.32, 0.98] }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 gap-0.5 px-1 pt-1 pb-2 sm:grid-cols-2 sm:gap-1">
                        {industries.map((it) => {
                          const Icon = industryIcons[it.icon];
                          return (
                            <Link
                              key={it.slug}
                              href={industryHref}
                              onClick={() => setOpen(false)}
                              className="flex items-center gap-2.5 rounded-2xl p-2 transition-colors hover:bg-surface sm:items-start sm:gap-3 sm:p-2.5"
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface text-pine sm:size-9">
                                <Icon aria-hidden className="size-4 sm:size-[18px]" />
                              </span>
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-[15px] leading-tight font-medium text-pine">{it.name}</span>
                                <span className="hidden text-[12.5px] leading-snug text-ink-muted sm:block">{it.description}</span>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-full px-5 py-3 text-lg",
                  item.href === activeHref
                    ? "bg-pine text-white"
                    : "text-pine hover:bg-surface",
                )}
              >
                {item.label}
              </Link>
            ),
          )}
          {authed ? (
            <a
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="rounded-full bg-pine px-5 py-3 text-center text-lg text-lime"
            >
              Dashboard
            </a>
          ) : (
            <>
              <a
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-full px-5 py-3 text-lg text-pine hover:bg-surface"
              >
                Login
              </a>
              <a
                href="/signup"
                onClick={() => setOpen(false)}
                className="rounded-full bg-pine px-5 py-3 text-center text-lg text-lime"
              >
                Start Free
              </a>
            </>
          )}
        </div>
      )}
    </header>
  );
}
