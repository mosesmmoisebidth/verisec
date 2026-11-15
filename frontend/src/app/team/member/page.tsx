import { ConsoleShell } from "@/components/shell/console-shell";
import { MemberPage } from "@/components/team/member-page";
import { getConsoleData } from "@/lib/console";

export const metadata = { title: "Team member · VeriSec" };

/** One member of the team (the static export cannot pre-render people: the page reads ?id= in the browser). */
export default async function TeamMemberPage() {
  const { shell } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      <MemberPage />
    </ConsoleShell>
  );
}
