import { FinPlayground } from "@/components/finance/playground";
import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "Playground · Financial · VeriSec" };

export default async function FinancePlaygroundPage() {
  const shell = await getFinanceShell();
  return (
    <FinanceShell shell={shell}>
      <FinPlayground />
    </FinanceShell>
  );
}
