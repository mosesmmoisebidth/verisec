import { FinBilling } from "@/components/finance/billing";
import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "Usage & Billing · Financial · VeriSec" };

export default async function FinanceBillingPage() {
  const shell = await getFinanceShell();
  return (
    <FinanceShell shell={shell}>
      <FinBilling />
    </FinanceShell>
  );
}
