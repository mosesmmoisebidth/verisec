import { Suspense } from "react";

import { ConsoleShell } from "@/components/shell/console-shell";
import { LiveVerificationDetail } from "@/components/verifications/live";
import { getConsoleData } from "@/lib/console";

export const metadata = { title: "Verification · VeriSec" };

/** One live verification record (/verifications/session?id=...&tab=...), loaded in the browser. */
export default async function LiveVerificationPage() {
  const { shell } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      <Suspense fallback={null}>
        <LiveVerificationDetail />
      </Suspense>
    </ConsoleShell>
  );
}
