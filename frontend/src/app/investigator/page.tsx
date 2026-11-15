import { ConsoleShell } from "@/components/shell/console-shell";
import { InvestigatorConsole } from "@/components/investigator/console";
import { getConsoleData } from "@/lib/console";

export const metadata = { title: "Investigator · VeriSec" };

export default async function InvestigatorPage() {
  const { shell } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      <InvestigatorConsole />
    </ConsoleShell>
  );
}
