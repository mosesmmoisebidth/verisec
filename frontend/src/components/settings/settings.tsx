import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { IconField, SettingsCard, ToggleRow } from "@/components/settings/parts";
import { ConnectApps } from "@/components/settings/connect-apps";
import { BrandingCard, BusinessCard, ProfileCard } from "@/components/settings/settings-forms";
import { SecurityPanel } from "@/components/settings/security-panel";
import { DangerZone, ExportDataButton } from "@/components/settings/account-actions";
import { RetentionField } from "@/components/settings/retention-field";
import type {
  DataSettings,
  NotificationSettings,
  SettingsData,
  SettingsTab,
  SettingsTabId,
} from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * Settings — built to the Figma frames (Desktop 35/37/50/39/40/41/49).
 *
 * The tabs are routes, not client state: each has its own URL, the back button
 * works, and the whole screen stays a server component. One soft card per tab,
 * icon-led fields, lime Save/Connect/Export. Every control is a real form
 * element and every one is unwired — there is no settings endpoint yet.
 */
export function SettingsScreen({
  data,
  current,
  basePath = "/settings",
}: {
  data: SettingsData;
  current: SettingsTabId;
  /** Where the tab links point. Another portal (e.g. `/fin/settings`) passes its own. */
  basePath?: string;
}) {
  return (
    // Fill the console content width like every other page — no narrower cap,
    // which read as "squeezed" next to the dashboard.
    <div className="flex w-full flex-col gap-6">
      <h1 className="m-0 text-[28px] font-semibold tracking-[-0.5px] text-pine">{data.title}</h1>
      <SettingsTabStrip tabs={data.tabs} current={current} basePath={basePath} />
      <Panel data={data} current={current} />
    </div>
  );
}

function Panel({ data, current }: { data: SettingsData; current: SettingsTabId }) {
  switch (current) {
    case "profile":
      return <ProfileCard data={data.profile} />;
    case "business":
      return <BusinessCard data={data.business} />;
    case "security":
      return <SecurityPanel data={data.security} />;
    case "data":
      return <DataPanel data={data.data} />;
    case "notifications":
      return <NotificationsPanel data={data.notifications} />;
    case "branding":
      return <BrandingCard data={data.branding} />;
    case "danger":
      return <DangerZone data={data.danger} />;
  }
}

/* ----------------------------------------------------------------------------
   Tab strip, underline style
---------------------------------------------------------------------------- */

function SettingsTabStrip({
  tabs,
  current,
  basePath,
}: {
  tabs: SettingsTab[];
  current: SettingsTabId;
  basePath: string;
}) {
  return (
    // `w-fit` so the strip hugs the tabs (the frame stops at "Danger zone",
    // it doesn't stretch across the page). Outer clips the active tab's corners
    // to the strip's radius; inner scrolls on a narrow viewport.
    <nav
      aria-label="Settings"
      className="w-fit max-w-full overflow-hidden rounded-[14px] bg-[#f4f4f2]"
    >
      <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = tab.id === current;
          return (
            <Link
              key={tab.id}
              href={tab.id === "profile" ? basePath : `${basePath}/${tab.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative shrink-0 px-5 py-3.5 text-[15px] whitespace-nowrap transition-colors",
                active
                  ? tab.danger
                    ? "bg-[linear-gradient(180deg,#ffffff_0%,#fbe0e0_100%)] font-semibold text-[#ef4444]"
                    : "bg-[image:var(--gradient-tab)] font-semibold text-pine"
                  : "font-normal text-[#9a9a9a] hover:text-pine",
              )}
            >
              {tab.label}
              {active ? (
                <span
                  aria-hidden
                  className={cn("absolute inset-x-0 bottom-0 h-1", tab.danger ? "bg-[#ef4444]" : "bg-lime")}
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ----------------------------------------------------------------------------
   Security
---------------------------------------------------------------------------- */

/* ----------------------------------------------------------------------------
   Data & Retention
---------------------------------------------------------------------------- */

function DataPanel({ data }: { data: DataSettings }) {
  return (
    <SettingsCard>
      <div className="flex flex-col gap-5">
        <ToggleRow label={data.enforce2fa.label} on={data.enforce2fa.on} name="dataEnforce2fa" />
        <RetentionField label={data.retention.label} />
        <IconField field={data.region} />
        <div className="rounded-[12px] border border-[#e6e6e3] bg-white px-4 py-3.5 text-[14px] text-pine/65">
          {data.note}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportDataButton label={data.exportData} />
        </div>
      </div>
    </SettingsCard>
  );
}

/* ----------------------------------------------------------------------------
   Notifications
---------------------------------------------------------------------------- */

function NotificationsPanel({ data }: { data: NotificationSettings }) {
  return (
    <div className="flex flex-col gap-4">
      <SettingsCard className="p-0">
        <div className="min-w-[560px] sm:min-w-0">
          <div className="grid grid-cols-[1fr_88px_88px] items-center gap-4 border-b border-[#ececea] px-6 py-4 text-[14px] text-pine/55">
            <span>{data.columns.event}</span>
            <span className="text-center">{data.columns.email}</span>
            <span className="text-center">{data.columns.inApp}</span>
          </div>
          {data.rows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_88px_88px] items-center gap-4 border-b border-[#f0f0ed] px-6 py-4 last:border-b-0"
            >
              <span className="text-[15px] text-pine">{row.label}</span>
              <span className="flex justify-center">
                <Switch on={row.email} name={`${row.key}-email`} label={`${row.label}, email`} />
              </span>
              <span className="flex justify-center">
                <Switch on={row.inApp} name={`${row.key}-inapp`} label={`${row.label}, in-app`} />
              </span>
            </div>
          ))}
        </div>
      </SettingsCard>

      <ConnectApps />
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Danger zone
---------------------------------------------------------------------------- */

