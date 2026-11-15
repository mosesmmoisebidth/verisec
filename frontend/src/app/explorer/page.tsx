import { ConsoleShell } from "@/components/shell/console-shell";
import { AmlExplorer } from "@/components/explorer/explorer";
import { getConsoleData } from "@/lib/console";

export const metadata = { title: "AML Explorer · VeriSec" };

export default async function ExplorerPage() {
  const { shell } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      {/* Signed-in operators only; every lookup goes through the Console API over mutual TLS. */}
      <AmlExplorer />
    </ConsoleShell>
  );
}
