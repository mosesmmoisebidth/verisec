"use client";

import Link from "next/link";
import { Bell, ChevronDown, Home, LogOut, UserRound } from "lucide-react";

import { AccountAvatar } from "@/components/shell/account-avatar";
import { PortalSwitcher } from "@/components/shell/portal-switcher";
import { authApi } from "@/lib/auth-api";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import type { NotificationTone } from "@/lib/console/types";
import type { FinShellData } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<NotificationTone, string> = {
  info: "var(--color-ramp-4)",
  success: "var(--color-positive)",
  warning: "#d99a2b",
  danger: "var(--color-danger)",
};

/**
 * The Financial Portal's topbar: the console topbar's layout and controls,
 * plus a portal pill beside the org name. That pill is where the portal
 * switcher (KYC · Financial · ALPR) will open from; for now it names the
 * portal you are in. Links point at this portal's own pages.
 */
export function FinanceTopbar({ shell }: { shell: FinShellData }) {
  const { account: demoAccount, env, envLabels, notifications } = shell;
  const unread = notifications.filter((n) => n.unread).length;

  const { status, account: real } = useCurrentAccount();
  const account =
    status === "authed" && real
      ? { ...demoAccount, name: real.name, email: real.email, initials: real.initials, org: real.org ?? demoAccount.org }
      : status === "loading"
        ? { ...demoAccount, name: "", email: "", initials: "", org: "" }
        : demoAccount;
  const avatar = status === "authed" ? (real?.avatar ?? null) : null;

  async function handleLogout() {
    await authApi.logout().catch(() => undefined);
    window.location.href = "/login";
  }

  return (
    <header className="flex h-topbar shrink-0 items-center gap-4 border-b border-hairline px-gutter">
      <h2 className="m-0 truncate text-org font-normal text-pine">{account.org}</h2>

      <PortalSwitcher current="fin" />

      <div
        className="flex items-center gap-1 rounded-[20px] border border-hairline bg-panel p-1"
        role="group"
        aria-label="API environment"
      >
        <EnvOption label={envLabels.test} active={env === "test"} />
        <EnvOption label={envLabels.live} active={env === "live"} />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <details className="group/notif relative">
          <summary className="relative grid size-11 cursor-pointer list-none place-items-center rounded-2xl border border-hairline bg-panel transition-colors hover:bg-hover-panel [&::-webkit-details-marker]:hidden">
            <Bell aria-hidden className="size-[22px] text-pine" strokeWidth={1.5} />
            {unread > 0 && (
              <span aria-hidden className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-danger ring-2 ring-panel" />
            )}
            <span className="sr-only">{unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}</span>
          </summary>

          <div className="absolute right-0 z-30 mt-2 w-[340px] rounded-card border border-hairline bg-page p-2 shadow-lg">
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="text-body font-medium text-pine">{shell.notificationsLabel}</span>
              {unread > 0 && (
                <span className="tnum rounded-pill bg-danger-tint px-2 py-0.5 text-micro font-medium text-danger">
                  {unread} new
                </span>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="m-0 px-2 py-8 text-center text-micro text-subtle">{shell.notificationsEmpty}</p>
            ) : (
              <ul className="m-0 flex max-h-[360px] list-none flex-col overflow-y-auto p-0">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <a
                      href={n.href ?? shell.viewAllHref}
                      className={cn(
                        "flex gap-2.5 rounded-well px-2 py-2.5 transition-colors hover:bg-hover-light",
                        n.unread && "bg-hover-light/70",
                      )}
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 size-2 shrink-0 rounded-full"
                        style={{ background: TONE_DOT[n.tone ?? "info"] }}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-body font-medium text-pine">{n.title}</span>
                        <span className="text-micro leading-snug text-subtle">{n.body}</span>
                        <span className="text-[11px] text-muted">{n.time}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-rule px-2 pt-2">
              <button type="button" className="text-micro text-muted transition-colors hover:text-pine">
                {shell.markAllReadLabel}
              </button>
              <a href={shell.viewAllHref} className="text-micro font-medium text-positive transition-colors hover:underline">
                {shell.viewAllLabel}
              </a>
            </div>
          </div>
        </details>

        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-2xl border border-hairline bg-panel p-1.5 transition-colors hover:bg-hover-panel [&::-webkit-details-marker]:hidden">
            <AccountAvatar
              avatar={avatar}
              initials={account.initials}
              className="size-9 rounded-xl bg-pine text-[13px] font-semibold text-lime"
            />
            <ChevronDown aria-hidden className="size-4 text-pine transition-transform group-open:rotate-180" strokeWidth={1.8} />
            <span className="sr-only">Account menu for {account.name}</span>
          </summary>

          <div className="absolute right-0 z-30 mt-2 w-60 rounded-card border border-hairline bg-page p-2 shadow-lg">
            <div className="flex flex-col gap-0.5 border-b border-rule px-2 pb-2">
              <span className="truncate text-body font-medium text-pine">{account.name}</span>
              <span className="truncate text-micro text-slate">{account.email}</span>
            </div>
            <a
              href={shell.settingsHref}
              className="mt-1 flex items-center gap-2 rounded-well px-2 py-2 text-body text-pine transition-colors hover:bg-hover-light"
            >
              <UserRound aria-hidden className="size-4" strokeWidth={1.7} />
              Profile &amp; settings
            </a>
            <Link
              href="/"
              className="flex items-center gap-2 rounded-well px-2 py-2 text-body text-pine transition-colors hover:bg-hover-light"
            >
              <Home aria-hidden className="size-4" strokeWidth={1.7} />
              VeriSec home
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-well px-2 py-2 text-left text-body text-pine transition-colors hover:bg-hover-light"
            >
              <LogOut aria-hidden className="size-4" strokeWidth={1.7} />
              Log out
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}

function EnvOption({ label, active }: { label: string; active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "rounded-[11px] px-2.5 py-0.5 text-body transition-colors",
        active ? "bg-lime text-pine shadow-[0_0_4px_var(--color-lime)]" : "text-pine/70 hover:text-pine",
      )}
    >
      {label}
    </button>
  );
}
