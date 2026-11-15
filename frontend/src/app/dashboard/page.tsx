import { LiveDashboard } from "@/components/dashboard/live-dashboard";
import { ConsoleShell } from "@/components/shell/console-shell";
import { getConsoleData } from "@/lib/console";

export const metadata = { title: "Dashboard · VeriSec" };

export default async function DashboardPage() {
  const { shell, dashboard } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      <LiveDashboard copy={dashboard} />
    </ConsoleShell>
  );
}
