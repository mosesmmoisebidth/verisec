import { notFound } from "next/navigation";

import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { SettingsScreen } from "@/components/settings/settings";
import { getFinanceSettings, getFinanceShell } from "@/lib/finance";

export async function generateStaticParams() {
  const data = await getFinanceSettings();
  return data.tabs.map((t) => ({ tab: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const data = await getFinanceSettings();
  const label = data.tabs.find((t) => t.id === tab)?.label;
  return { title: label ? `${label} · Settings · Financial · VeriSec` : "Settings · Financial · VeriSec" };
}

export default async function FinanceSettingsTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const [shell, data] = await Promise.all([getFinanceShell(), getFinanceSettings()]);
  const known = data.tabs.find((t) => t.id === tab);
  if (!known) notFound();
  return (
    <FinanceShell shell={shell}>
      <SettingsScreen data={data} current={known.id} basePath="/fin/settings" />
    </FinanceShell>
  );
}
