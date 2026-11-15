import { FinApiKeysScreen } from "@/components/finance/api-keys";
import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "API Keys · Financial · VeriSec" };

export default async function FinanceApiKeysPage() {
  const shell = await getFinanceShell();
  return (
    <FinanceShell shell={shell}>
      <FinApiKeysScreen current="keys" />
    </FinanceShell>
  );
}
