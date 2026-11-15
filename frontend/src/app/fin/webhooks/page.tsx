import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { Webhooks } from "@/components/webhooks/webhooks";
import { WEBHOOKS } from "@/lib/finance/content";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "Webhooks · Financial · VeriSec" };

/** The console's Webhooks screen with the scanning events (cheque.read, cheque.failed, card.read, card.failed), live. */
export default async function FinanceWebhooksPage() {
  const shell = await getFinanceShell();
  return (
    <FinanceShell shell={shell}>
      <Webhooks data={WEBHOOKS} />
    </FinanceShell>
  );
}
