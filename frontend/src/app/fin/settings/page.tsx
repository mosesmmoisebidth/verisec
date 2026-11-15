import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { SettingsScreen } from "@/components/settings/settings";
import { getFinanceSettings, getFinanceShell } from "@/lib/finance";

export const metadata = { title: "Settings · Financial · VeriSec" };

export default async function FinanceSettingsPage() {
  const [shell, data] = await Promise.all([getFinanceShell(), getFinanceSettings()]);
  return (
    <FinanceShell shell={shell}>
      <SettingsScreen data={data} current="profile" basePath="/fin/settings" />
    </FinanceShell>
  );
}
