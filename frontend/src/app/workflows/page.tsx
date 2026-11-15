import { ConsoleShell } from "@/components/shell/console-shell";
import { LiveWorkflows } from "@/components/workflows/live-workflows";
import { getConsoleData } from "@/lib/console";

export const metadata = { title: "Workflows · VeriSec" };

export default async function WorkflowsPage() {
  const { shell, workflows } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      <LiveWorkflows copy={workflows} />
    </ConsoleShell>
  );
}
