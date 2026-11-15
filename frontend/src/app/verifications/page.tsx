import { ConsoleShell } from "@/components/shell/console-shell";
import { LiveVerificationsList } from "@/components/verifications/live";
import { getConsoleData } from "@/lib/console";

export const metadata = { title: "Verifications · VeriSec" };

export default async function VerificationsPage() {
  const { shell } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      {/* Live records from the encrypted store (signed-in operators only). */}
      <LiveVerificationsList />
    </ConsoleShell>
  );
}
