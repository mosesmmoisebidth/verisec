import { ConsoleShell } from "@/components/shell/console-shell";
import { TemplateGallery } from "@/components/workflows/template-gallery";
import { getConsoleData } from "@/lib/console";

export const metadata = { title: "Workflow templates · VeriSec" };

/** Every ready-made workflow, with the pages each one shows applicants. */
export default async function WorkflowTemplatesPage() {
  const { shell } = await getConsoleData();
  return (
    <ConsoleShell shell={shell}>
      <TemplateGallery />
    </ConsoleShell>
  );
}
