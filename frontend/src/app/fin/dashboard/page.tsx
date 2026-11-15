import { FinDashboard } from "@/components/finance/dashboard";
import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "Dashboard · Financial · VeriSec" };

export default async function FinanceDashboardPage() {
  const shell = await getFinanceShell();
  return (
    <FinanceShell shell={shell}>
      <FinDashboard />
    </FinanceShell>
  );
}
