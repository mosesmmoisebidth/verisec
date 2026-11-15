import { SettingsScreen } from "@/components/settings/settings";
import { ConsoleShell } from "@/components/shell/console-shell";
import { getConsoleData, getSettings } from "@/lib/console";

export const metadata = { title: "Settings · VeriSec" };

/** The Profile tab. `/settings/profile` resolves here too, via `[tab]`. */
export default async function SettingsPage() {
  const [{ shell }, data] = await Promise.all([getConsoleData(), getSettings()]);
  return (
    <ConsoleShell shell={shell}>
      <SettingsScreen data={data} current="profile" />
    </ConsoleShell>
  );
}
