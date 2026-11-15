import { notFound } from "next/navigation";

import { FinApiKeysScreen } from "@/components/finance/api-keys";
import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { SignInRequired } from "@/components/shell/sign-in-required";
import { API_KEYS } from "@/lib/finance/content";
import { getFinanceShell } from "@/lib/finance";

/** API Playground, Logs and SDKs. The keys tab is `/fin/api-keys` itself. */
export function generateStaticParams() {
  return API_KEYS.tabs.filter((t) => t.id !== "keys").map((t) => ({ tab: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const label = API_KEYS.tabs.find((t) => t.id === tab)?.label ?? "API Keys";
  return { title: `${label} · Financial · VeriSec` };
}

export default async function FinanceApiTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const known = API_KEYS.tabs.find((t) => t.id === tab && t.id !== "keys");
  if (!known) notFound();
  const shell = await getFinanceShell();
  const page = (
    <FinanceShell shell={shell}>
      <FinApiKeysScreen current={known.id} />
    </FinanceShell>
  );
  // the Playground runs real calls: a signed-out visitor is sent to sign-in instead
  return known.id === "playground" ? <SignInRequired>{page}</SignInRequired> : page;
}
