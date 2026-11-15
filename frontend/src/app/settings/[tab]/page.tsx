import { notFound } from "next/navigation";

import { SettingsScreen } from "@/components/settings/settings";
import { ConsoleShell } from "@/components/shell/console-shell";
import { getConsoleData, getSettings, listSettingsTabs } from "@/lib/console";

/**
 * One page per settings tab.
 *
 * The list comes from the data layer — the same array the strip renders — so a
 * tab cannot be linked in the nav and missing from the export.
 */
export async function generateStaticParams() {
  const tabs = await listSettingsTabs();
  return tabs.map((tab) => ({ tab: tab.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const tabs = await listSettingsTabs();
  const label = tabs.find((t) => t.id === tab)?.label;
  return { title: label ? `${label} · Settings · VeriSec` : "Settings · VeriSec" };
}

export default async function SettingsTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const [{ shell }, data, tabs] = await Promise.all([
    getConsoleData(),
    getSettings(),
    listSettingsTabs(),
  ]);
  const known = tabs.find((t) => t.id === tab);
  if (!known) notFound();

  return (
    <ConsoleShell shell={shell}>
      <SettingsScreen data={data} current={known.id} />
    </ConsoleShell>
  );
}
