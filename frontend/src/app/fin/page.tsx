import { FinDashboard } from "@/components/finance/dashboard";
import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "Dashboard · Financial · VeriSec" };

/** `/fin` lands on the dashboard (the rail highlights Dashboard for it too). */
export default async function FinancePage() {
  const shell = await getFinanceShell();
  return (
    <FinanceShell shell={shell}>
      <FinDashboard />
    </FinanceShell>
  );
}
