import { FinanceShell } from "@/components/finance/shell/finance-shell";
import { Team } from "@/components/team/team";
import { getTeam } from "@/lib/console";
import { getFinanceShell } from "@/lib/finance";

export const metadata = { title: "Team · Financial · VeriSec" };

/** One organisation, one team: the same members as the KYC console. */
export default async function FinanceTeamPage() {
  const [shell, data] = await Promise.all([getFinanceShell(), getTeam()]);
  return (
    <FinanceShell shell={shell}>
      <Team data={data} />
    </FinanceShell>
  );
}
