import { ApiKeysScreen } from "@/components/api-keys/api-keys";
import { ConsoleShell } from "@/components/shell/console-shell";
import { getApiKeys, getConsoleData, IS_DEMO_DATA } from "@/lib/console";

export const metadata = { title: "API Keys & Playground · VeriSec" };

/** The keys tab. `/api-keys/keys` resolves here too, via `[tab]`. */
export default async function ApiKeysPage() {
  const [{ shell }, data] = await Promise.all([getConsoleData(), getApiKeys()]);
  return (
    <ConsoleShell shell={shell}>
      <ApiKeysScreen data={data} current="keys" isDemo={IS_DEMO_DATA} />
    </ConsoleShell>
  );
}
