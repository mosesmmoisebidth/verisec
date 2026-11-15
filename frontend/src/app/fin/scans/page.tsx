import { ScansList } from "@/components/finance/scans-list";
import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "Scans · Financial · VeriSec" };

export default async function FinanceScansPage() {
  const shell = await getFinanceShell();
  return (
    <FinanceShell shell={shell}>
      <ScansList />
    </FinanceShell>
  );
}
