import { notFound } from "next/navigation";

import { ApiKeysScreen } from "@/components/api-keys/api-keys";
import { ConsoleShell } from "@/components/shell/console-shell";
import { SignInRequired } from "@/components/shell/sign-in-required";
import { getApiKeys, getConsoleData, listApiTabs, IS_DEMO_DATA } from "@/lib/console";

/**
 * One page per tab.
 *
 * The list comes from the data layer, the same array the strip renders, so a
 * tab cannot be linked in the nav and missing from the export.
 */
export async function generateStaticParams() {
  const tabs = await listApiTabs();
  return tabs.map((tab) => ({ tab: tab.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const [data, tabs] = await Promise.all([getApiKeys(), listApiTabs()]);
  const label = tabs.find((t) => t.id === tab)?.label;
  if (!label) return { title: "API Keys & Playground · VeriSec" };
  return { title: `${label} · ${data.title} · VeriSec` };
}

export default async function ApiTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const [{ shell }, data, tabs] = await Promise.all([
    getConsoleData(),
    getApiKeys(),
    listApiTabs(),
  ]);
  const known = tabs.find((t) => t.id === tab);
  if (!known) notFound();

  const page = (
    <ConsoleShell shell={shell}>
      <ApiKeysScreen data={data} current={known.id} isDemo={IS_DEMO_DATA} />
    </ConsoleShell>
  );
  // the Playground runs real calls: a signed-out visitor is sent to sign-in instead
  return known.id === "playground" ? <SignInRequired>{page}</SignInRequired> : page;
}
