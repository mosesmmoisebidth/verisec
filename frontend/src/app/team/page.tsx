import { ConsoleShell } from "@/components/shell/console-shell";
import { Team } from "@/components/team/team";
import { getConsoleData, getTeam } from "@/lib/console";

export const metadata = { title: "Team · VeriSec" };

export default async function TeamPage() {
  const [{ shell }, data] = await Promise.all([getConsoleData(), getTeam()]);
  return (
    <ConsoleShell shell={shell}>
      <Team data={data} />
    </ConsoleShell>
  );
}
