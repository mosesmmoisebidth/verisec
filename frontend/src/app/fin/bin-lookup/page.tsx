import { BinLookup } from "@/components/finance/bin-lookup";
import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "BIN Lookup · Financial · VeriSec" };

export default async function FinanceBinPage() {
  const shell = await getFinanceShell();
  return (
    <FinanceShell shell={shell}>
      <BinLookup />
    </FinanceShell>
  );
}
