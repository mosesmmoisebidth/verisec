"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  CodeXml,
  Command,
  Landmark,
  LayoutGrid,
  ScanLine,
  ScanText,
  Search,
  Settings,
  Users,
  Wallet,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AccountAvatar } from "@/components/shell/account-avatar";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import { useAccess } from "@/lib/access";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import type { FinNavIcon, FinNavItem, FinShellData } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

/**
 * The Financial Portal's rail. Same measurements and classes as the console
 * rail (`components/shell/sidebar.tsx`) so both portals read as one product;
 * only the entries and their icons differ.
 *
 * Billing uses a wallet rather than the console's card glyph, because in this
 * portal a card icon means "payment card".
 */
const ICONS: Record<FinNavIcon, LucideIcon> = {
  dashboard: LayoutGrid,
  playground: ScanLine,
  scans: ScanText,
  bin: Landmark,
  "api-keys": CodeXml,
  webhooks: Webhook,
  billing: Wallet,
  team: Users,
  settings: Settings,
};

export function FinanceSidebar({ shell }: { shell: FinShellData }) {
  const pathname = usePathname() ?? "";
  // only what this person's team role may open (everything while the role loads)
  const { canOpen } = useAccess();
  const groups = shell.nav
    .map((group) => ({ ...group, items: group.items.filter((item) => canOpen(item.href)) }))
    .filter((group) => group.items.length > 0);
  // the entry just clicked stays lit while its page opens (a full page load), so the choice
  // shows at once; it counts only on the page it was clicked from, so once the page
  // changes the page itself decides again (no effect needed to reset it)
  const [clicked, setClicked] = useState<{ href: string; at: string } | null>(null);
  const picked = clicked && clicked.at === pathname ? clicked.href : null;
  // `/fin` on its own is the dashboard.
  const isActive = (href: string) =>
    picked
      ? picked === href
      : pathname === href ||
        pathname.startsWith(`${href}/`) ||
        (href === "/fin/dashboard" && (pathname === "/fin" || pathname === "/fin/"));

  return (
    <aside className="hidden w-rail shrink-0 flex-col gap-5 overflow-x-hidden overflow-y-auto border-r border-hairline bg-panel px-5 py-6 lg:flex">
      <Link href="/" aria-label="VeriSec home" className="block w-fit px-1">
        <Wordmark className="text-wordmark text-pine" markClassName="h-9 text-pine" />
      </Link>

      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="flex h-[56px] w-full shrink-0 items-center gap-2.5 rounded-pill border border-hairline bg-white px-4 transition-colors focus-within:border-pine/30 focus-within:ring-2 focus-within:ring-lime/40"
      >
        <Search aria-hidden className="size-[24px] shrink-0 text-[#7a7a7a]" strokeWidth={1.9} />
        <input
          type="search"
          aria-label={shell.searchPlaceholder}
          placeholder={shell.searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-[19px] font-normal text-pine outline-none placeholder:text-placeholder [&::-webkit-search-cancel-button]:appearance-none"
        />
        <span aria-hidden className="flex shrink-0 items-center gap-1.5 font-[system-ui,-apple-system,'Segoe_UI',sans-serif]">
          <Keycap>
            <Command aria-hidden className="size-3.5" strokeWidth={2} />
          </Keycap>
          <Keycap>K</Keycap>
        </span>
      </form>

      <nav className="flex shrink-0 flex-col gap-[18px]" aria-label="Financial Portal">
        {groups.map((group, gi) => (
          <div key={group.label} className="flex flex-col gap-4">
            {gi > 0 && <hr className="m-0 border-0 border-t border-hairline" aria-hidden />}
            <p className="m-0 text-nav font-medium text-pine">{group.label}</p>
            <ul className="m-0 flex list-none flex-col p-0">
              {group.items.map((item) => (
                <NavRow key={item.href} item={item} active={isActive(item.href)} onPick={() => setClicked({ href: item.href, at: pathname })} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <AccountCard shell={shell} />
    </aside>
  );
}

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-[27px] place-items-center rounded-[5px] border border-hairline bg-white text-[12px] font-semibold text-[#4d4d4d] shadow-[1.8px_1.8px_3.6px_rgba(0,0,0,0.07)]">
      {children}
    </span>
  );
}

function NavRow({ item, active, onPick }: { item: FinNavItem; active: boolean; onPick: () => void }) {
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
        <span className={cn("min-w-0 truncate text-body", active ? "font-medium" : "font-normal")}>{item.label}</span>
      </a>
    </li>
  );
}

function AccountCard({ shell }: { shell: FinShellData }) {
  const { upgrade, account: demo } = shell;
  const { status, account: real } = useCurrentAccount();
  const account =
    status === "authed" && real
      ? { ...demo, name: real.name, email: real.email, initials: real.initials }
      : status === "loading"
        ? { ...demo, name: "", email: "", initials: "" }
        : demo;
  const avatar = status === "authed" ? (real?.avatar ?? null) : null;

  return (
    <div className="mt-auto flex w-full flex-col gap-3 rounded-card border border-hairline bg-white p-2.5">
      {upgrade && (
        <div className="flex flex-col gap-4 rounded-[12px] bg-[image:var(--gradient-upgrade)] p-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-pine text-lime">
              <LogoMark className="h-[18px]" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-body font-medium text-pine">{upgrade.title}</span>
              <span className="truncate text-[11px] leading-tight text-pine/70">{upgrade.subtitle}</span>
            </span>
          </div>
          <a
            href={upgrade.href}
            className="grid h-[42px] w-full place-items-center rounded-lg bg-pine text-body font-light text-lime transition-[filter] hover:brightness-110"
          >
            {upgrade.cta}
          </a>
        </div>
      )}

      <a
        href={shell.settingsHref}
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
