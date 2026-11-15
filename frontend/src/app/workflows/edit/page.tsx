import { Suspense } from "react";

import { ConsoleShell } from "@/components/shell/console-shell";
import { WorkflowEditor } from "@/components/workflows/workflow-editor";
import { getConsoleData } from "@/lib/console";
import { COUNTRIES } from "@/lib/countries";

export const metadata = { title: "Edit workflow · VeriSec" };

/**
 * One workflow, edited (`?id=`). Workflows are created by each organisation at run time, so the
 * static export cannot pre-render a page per workflow: the editor loads it in the browser.
 */
export default async function WorkflowEditPage() {
  const { shell } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      <Suspense fallback={null}>
        <WorkflowEditor countries={COUNTRIES} />
      </Suspense>
    </ConsoleShell>
  );
}
