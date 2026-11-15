"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  ChevronRight,
  CodeXml,
  CreditCard,
  LayoutGrid,
  Menu,
  ScanSearch,
  Settings,
  Users,
  Webhook,
  X,
} from "lucide-react";
import type { ComponentType } from "react";

import { WorkflowGlyph } from "@/components/workflows/workflow-glyph";

import { AccountAvatar } from "@/components/shell/account-avatar";
import { ConsoleSearch } from "@/components/shell/console-search";
import { Wordmark } from "@/components/brand/logo";
import { useAccess } from "@/lib/access";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import type { NavIcon, NavItem, ShellData } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * The console rail — Figma frame 82: 332 wide, a 292 content column, labelled
 * groups separated by hairlines, and the upgrade + account card at the foot.
 *
 * Holds no content. Groups, labels, badges, the current path and the upgrade
 * copy all arrive as `ShellData`, so adding a nav entry or relabelling one is a
 * data change. The only thing mapped here is the icon, because a React
 * component cannot travel in a JSON payload — the data carries a string key and
 * ICONS resolves it.
 *
 * Two departures from the frame, which is a single 1440×3176 artboard and so
 * specifies neither:
 *
 *   overflow-y-auto — on a 900px laptop the groups plus the account card are
 *     taller than the rail, and without this the card is unreachable, sign-out
 *     with it.
 *   hidden / lg:flex — a fixed 332px rail leaves 43px of content on a 375px
 *     phone, so below lg the same rail opens as a drawer from the topbar's menu
 *     button (MobileNav): the same search, groups and account card, nothing new.
 */
const ICONS: Record<NavIcon, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  dashboard: LayoutGrid,
  workflows: WorkflowGlyph,
  verifications: BadgeCheck,
  explorer: ScanSearch,
  "api-keys": CodeXml,
  webhooks: Webhook,
  billing: CreditCard,
  team: Users,
  settings: Settings,
};

export function Sidebar({ shell }: { shell: ShellData }) {
  return (
    <aside className="hidden w-rail shrink-0 flex-col gap-5 overflow-x-hidden overflow-y-auto border-r border-hairline bg-panel px-5 py-6 lg:flex">
      <RailBody shell={shell} />
    </aside>
  );
}

/**
 * Phones and tablets: a menu button in the topbar opens the rail as a drawer from the left (a native modal
 * <dialog>: focus stays inside, Escape and the backdrop close it). Choosing a page or a search result closes it.
 */
export function MobileNav({ shell }: { shell: ShellData }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label="Open the menu"
        className="grid size-11 shrink-0 place-items-center rounded-2xl border border-hairline bg-panel text-pine transition-colors hover:bg-hover-panel lg:hidden"
      >
        <Menu aria-hidden className="size-[22px]" strokeWidth={1.6} />
      </button>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={ref}
        aria-label="Console menu"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="m-0 h-dvh max-h-dvh w-[min(332px,88vw)] max-w-none overflow-hidden border-0 border-r border-hairline bg-panel p-0 text-pine backdrop:bg-black/25 backdrop:backdrop-blur-[3px] lg:hidden"
      >
        <div className="flex h-full flex-col gap-5 overflow-x-hidden overflow-y-auto px-5 py-6">
          <button
            type="button"
            onClick={close}
            aria-label="Close the menu"
            className="absolute top-5 right-4 z-10 grid size-10 place-items-center rounded-pill text-pine transition-colors hover:bg-pine/8"
          >
            <X aria-hidden className="size-5" strokeWidth={1.7} />
          </button>
          <RailBody shell={shell} onNavigate={close} />
        </div>
      </dialog>
    </>
  );
}

function RailBody({ shell, onNavigate }: { shell: ShellData; onNavigate?: () => void }) {
  // `shell.currentPath` is the server-render fallback; the live pathname wins
  // once mounted, so a new page highlights its nav entry with no wiring. Prefix
  // match so /workflows/standard-kyc still lights up "Workflows".
  const pathname = usePathname() ?? shell.currentPath;
  // the entry just clicked stays lit while its page opens (a full page load), so the choice shows at once; it only
  // counts on the page it was clicked on, so once the page changes the page itself decides again
  const [picked, setPicked] = useState<{ href: string; at: string } | null>(null);
  const clicked = picked && picked.at === pathname ? picked.href : null;
  const isActive = (href: string) =>
    clicked ? clicked === href : pathname === href || pathname.startsWith(`${href}/`);
  // only the pages the person's team role includes (a group left empty goes too)
  const { canOpen } = useAccess();
  const nav = shell.nav
    .map((group) => ({ ...group, items: group.items.filter((item) => canOpen(item.href)) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {/* Clickable wordmark → the marketing home, so you can pop out of the
          console and back. Plain <a> (hard nav), static export, no RSC. */}
      <a href="/" aria-label="VeriSec home" className="block w-fit px-1">
        <Wordmark className="text-wordmark text-pine" markClassName="h-9 text-pine" />
      </a>

      <ConsoleSearch placeholder={shell.searchPlaceholder} onGo={onNavigate} />

      <nav className="flex shrink-0 flex-col gap-[18px]" aria-label="Console">
        {nav.map((group, gi) => (
          <div key={group.label} className="flex flex-col gap-4">
            {gi > 0 && <hr className="m-0 border-0 border-t border-hairline" aria-hidden />}
            <p className="m-0 text-nav font-medium text-pine">{group.label}</p>
            <ul className="m-0 flex list-none flex-col p-0">
              {group.items.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  onPick={() => {
                    setPicked({ href: item.href, at: pathname });
                    onNavigate?.();
                  }}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <AccountCard shell={shell} />
    </>
  );
}

function NavRow({ item, active, onPick }: { item: NavItem; active: boolean; onPick: () => void }) {
  const Icon = ICONS[item.icon];
  return (
    <li>
      <a
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onPick}
        className={cn(
          "flex h-[51px] w-full items-center gap-3 rounded-pill px-4 transition-colors",
          // the page you are on (or the one you just clicked, while it opens) is the platform's lime
          active
            ? "border border-lime bg-lime text-pine"
            : "border border-transparent text-pine/75 hover:bg-lime-tint hover:text-pine",
        )}
      >
        <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.6} />
        <span className={cn("min-w-0 truncate text-body", active ? "font-medium" : "font-normal")}>
          {item.label}
        </span>
        {item.badge !== undefined && (
          <span className="tnum ml-auto grid size-[18px] shrink-0 place-items-center rounded-pill bg-danger text-[10px] font-semibold text-white">
            {item.badge}
          </span>
        )}
      </a>
    </li>
  );
}

/** mt-auto pins this to the rail's foot at any height, rather than relying on
 *  the 3176px the frame happens to be. */
function AccountCard({ shell }: { shell: ShellData }) {
  const { account: demo } = shell;
  const { status, account: real } = useCurrentAccount();
  // Show the signed-in user; while /me is in flight, blank the identity rather
  // than flash the demo one; if genuinely signed out, the demo stays as-is.
  const account =
    status === "authed" && real
      ? { ...demo, name: real.name, email: real.email, initials: real.initials }
      : status === "loading"
        ? { ...demo, name: "", email: "", initials: "" }
        : demo;
  const avatar = status === "authed" ? (real?.avatar ?? null) : null;
  return (
    <div className="mt-auto flex w-full flex-col gap-3 rounded-card border border-hairline bg-white p-2.5">
      <a
        href="/settings"
        className="flex items-center gap-2 rounded-[12px] px-1 py-1.5 text-left transition-colors hover:bg-black/[0.03]"
      >
        <AccountAvatar
          avatar={avatar}
          initials={account.initials}
          className="size-11 shrink-0 rounded-pill bg-pine text-body font-semibold text-lime"
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body font-medium text-pine">{account.name}</span>
          <span className="truncate text-[11px] leading-tight text-subtle">{account.email}</span>
        </span>
        <ChevronRight aria-hidden className="ml-auto size-5 shrink-0 text-pine" strokeWidth={1.6} />
      </a>
    </div>
  );
}
