import { LiveBilling } from "@/components/billing/live-billing";
import { ConsoleShell } from "@/components/shell/console-shell";
import { getConsoleData } from "@/lib/console";

export const metadata = { title: "Usage & Billing · VeriSec" };

export default async function BillingPage() {
  const { shell } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      <LiveBilling />
    </ConsoleShell>
  );
}
