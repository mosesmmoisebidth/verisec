import { ConsoleShell } from "@/components/shell/console-shell";
import { Webhooks } from "@/components/webhooks/webhooks";
import { getConsoleData, getWebhooks } from "@/lib/console";

export const metadata = { title: "Webhooks · VeriSec" };

export default async function WebhooksPage() {
  const [{ shell }, data] = await Promise.all([getConsoleData(), getWebhooks()]);
  return (
    <ConsoleShell shell={shell}>
      <Webhooks data={data} />
    </ConsoleShell>
  );
}
