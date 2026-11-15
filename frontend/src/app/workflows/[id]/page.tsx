import { notFound } from "next/navigation";

import { ConsoleShell } from "@/components/shell/console-shell";
import { WorkflowBuilder } from "@/components/workflows/builder";
import { getConsoleData, getWorkflow, listWorkflowIds } from "@/lib/console";

/** Enumerated so `output: export` pre-renders a file per workflow. */
export async function generateStaticParams() {
  const ids = await listWorkflowIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const workflow = await getWorkflow((await params).id);
  return { title: workflow ? `${workflow.name} · VeriSec` : "Workflow · VeriSec" };
}

export default async function WorkflowBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ shell }, workflow] = await Promise.all([getConsoleData(), getWorkflow(id)]);
  if (!workflow) notFound();

  return (
    <ConsoleShell shell={shell}>
      <WorkflowBuilder data={workflow} />
    </ConsoleShell>
  );
}
