"use client";

import { MobileNav } from "@/components/shell/sidebar";
import Link from "next/link";
import { Bell, ChevronDown, Home, Lock, LogOut, UserRound } from "lucide-react";

import { AccountAvatar } from "@/components/shell/account-avatar";
import { PortalSwitcher } from "@/components/shell/portal-switcher";
import { useAccess } from "@/lib/access";
import { useNotifications } from "@/lib/console/notifications";
import { authApi } from "@/lib/auth-api";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import type { NotificationTone, ShellData } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/** The dot colour per notification tone. Inline values so a new tone is one
 *  line here and nowhere else. */
const TONE_DOT: Record<NotificationTone, string> = {
  info: "var(--color-ramp-4)",
  success: "var(--color-positive)",
  warning: "#d99a2b",
  danger: "var(--color-danger)",
};

/**
 * Figma frame 83 — 72 tall, on the content column's gutter.
 *
 * The Test/Live pill is chrome rather than a dashboard control: every screen
 * reads the same environment, so it lives here and not in a view. Its selected
 * value and both labels come from `ShellData`, so nothing about the environment
 * is decided in JSX.
 */
export function Topbar({ shell }: { shell: ShellData }) {
  const {
    account: demoAccount,
    env,
    envLabels,
    unread,
    notifications,
    notificationsLabel,
    notificationsEmpty,
    markAllReadLabel,
    viewAllLabel,
  } = shell;
  const { canOpen } = useAccess();
  // signed in: the person's real notifications (stacked, with counts); signed out: the frame's sample
  const bell = useNotifications();
  const notes = bell.live ? bell.items : notifications.map((n) => ({ ...n, count: 1 }));
  const unreadCount = bell.live ? bell.unread : unread;

  // Overlay the signed-in user onto the shell's demo account. While /me loads,
  // blank the identity instead of flashing the specimen; keep demo only if the
  // visitor is genuinely signed out.
  const { status, account: real } = useCurrentAccount();
  const account =
    status === "authed" && real
      ? {
          ...demoAccount,
          name: real.name,
          email: real.email,
          initials: real.initials,
          org: real.org ?? demoAccount.org,
        }
      : status === "loading"
        ? { ...demoAccount, name: "", email: "", initials: "", org: "" }
        : demoAccount;
  const avatar = status === "authed" ? (real?.avatar ?? null) : null;

  async function handleLogout() {
    await authApi.logout().catch(() => undefined);
    window.location.href = "/login";
  }

  return (
    <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-hairline px-gutter sm:gap-4">
      <MobileNav shell={shell} />
      <h2 className="m-0 min-w-0 truncate text-org font-normal text-pine">{account.org}</h2>

      <PortalSwitcher current="kyc" />

      <div
        className="hidden shrink-0 items-center gap-1 rounded-[20px] border border-hairline bg-panel p-1 sm:flex"
        role="group"
        aria-label="API environment"
      >
        <EnvOption label={envLabels.test} active={env === "test"} />
        <EnvOption label={envLabels.live} active={env === "live"} locked={shell.liveLocked} />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Notifications — a native <details> popover, same no-JS pattern as the
            account menu below. `summary` is the bell; the panel is its content. */}
        <details className="group/notif relative">
          <summary className="relative grid size-11 cursor-pointer list-none place-items-center rounded-2xl border border-hairline bg-panel transition-colors hover:bg-hover-panel [&::-webkit-details-marker]:hidden">
            <Bell aria-hidden className="size-[22px] text-pine" strokeWidth={1.5} />
            {unreadCount > 0 && (
              <span
                aria-hidden
                className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-danger ring-2 ring-panel"
              />
            )}
            <span className="sr-only">
              {unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            </span>
          </summary>

          <div className="absolute right-0 z-30 mt-2 w-[340px] rounded-card border border-hairline bg-page p-2 shadow-lg max-sm:fixed max-sm:inset-x-3 max-sm:top-[76px] max-sm:mt-0 max-sm:w-auto">
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="text-body font-medium text-pine">{notificationsLabel}</span>
              {unreadCount > 0 && (
                <span className="tnum rounded-pill bg-danger-tint px-2 py-0.5 text-micro font-medium text-danger">
                  {unreadCount} new
                </span>
              )}
            </div>

            {notes.length === 0 ? (
              <p className="m-0 px-2 py-8 text-center text-micro text-subtle">
                {notificationsEmpty}
              </p>
            ) : (
              <ul className="m-0 flex max-h-[360px] list-none flex-col overflow-y-auto p-0">
                {notes.map((n) => (
                  <li key={n.id}>
                    <a
                      href={n.href ?? "#"}
                      onClick={() => bell.live && bell.markRead(n.id)}
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
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 text-body font-medium break-words text-pine">{n.title}</span>
                          {/* the same notification again: one row, counted */}
                          {n.count > 1 ? (
                            <span className="tnum shrink-0 rounded-pill bg-well px-1.5 py-0.5 text-[11px] font-medium text-pine">
                              ×{n.count}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-micro leading-snug text-subtle">{n.body}</span>
                        <span className="text-[11px] text-muted">{n.time}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-1 flex items-center justify-between border-t border-rule px-2 pt-2">
              <button
                type="button"
                onClick={() => bell.live && bell.markAllRead()}
                disabled={unreadCount === 0}
                className="text-micro text-muted transition-colors hover:text-pine disabled:cursor-default disabled:opacity-50 disabled:hover:text-muted"
              >
                {markAllReadLabel}
              </button>
              {canOpen("/verifications") && (
                <Link
                  href="/verifications"
                  className="text-micro font-medium text-positive transition-colors hover:underline"
                >
                  {viewAllLabel}
                </Link>
              )}
            </div>
          </div>
        </details>

        {/* The account control is a native <details> popover: the only way OUT
            of the console, and it costs no JavaScript. `summary` is the button,
            the panel is its content, and Escape/click-through are the
            platform's. Settings is the one nav destination with no page yet, so
            it is not offered here either, a menu item that 404s is worse than
            one that is absent. */}
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-2xl border border-hairline bg-panel p-1.5 transition-colors hover:bg-hover-panel [&::-webkit-details-marker]:hidden">
            <AccountAvatar
              avatar={avatar}
              initials={account.initials}
              className="size-9 rounded-xl bg-pine text-[13px] font-semibold text-lime"
            />
            <ChevronDown
              aria-hidden
              className="size-4 text-pine transition-transform group-open:rotate-180"
              strokeWidth={1.8}
            />
            <span className="sr-only">Account menu for {account.name}</span>
          </summary>

          <div className="absolute right-0 z-30 mt-2 w-60 rounded-card border border-hairline bg-page p-2 shadow-lg">
            <div className="flex flex-col gap-0.5 border-b border-rule px-2 pb-2">
              <span className="truncate text-body font-medium text-pine">{account.name}</span>
              <span className="truncate text-micro text-slate">{account.email}</span>
            </div>
            <a
              href="/settings"
              className="mt-1 flex items-center gap-2 rounded-well px-2 py-2 text-body text-pine transition-colors hover:bg-hover-light"
            >
              <UserRound aria-hidden className="size-4" strokeWidth={1.7} />
              Profile &amp; settings
            </a>
            <a
              href="/"
              className="flex items-center gap-2 rounded-well px-2 py-2 text-body text-pine transition-colors hover:bg-hover-light"
            >
              <Home aria-hidden className="size-4" strokeWidth={1.7} />
              VeriSec home
            </a>
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

/** `locked`: the option is shown but cannot be chosen yet; the reason is its tooltip and description. */
function EnvOption({ label, active, locked }: { label: string; active: boolean; locked?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-disabled={locked ? true : undefined}
      title={locked}
      onClick={locked ? (e) => e.preventDefault() : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-[11px] px-2.5 py-0.5 text-body transition-colors",
        active
          ? "bg-lime text-pine shadow-[0_0_4px_var(--color-lime)]"
          : locked
            ? "cursor-not-allowed text-pine/45"
            : "text-pine/70 hover:text-pine",
      )}
    >
      {label}
      {locked ? (
        <>
          <Lock aria-hidden className="size-3" strokeWidth={2} />
          <span className="sr-only">{locked}</span>
        </>
      ) : null}
    </button>
  );
}
