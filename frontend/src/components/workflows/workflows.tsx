import { GitBranch } from "lucide-react";

import { TemplatePicker } from "@/components/workflows/template-picker";
import { WorkflowCard } from "@/components/workflows/workflow-card";
import type { WorkflowsData } from "@/lib/console/types";

/**
 * Figma frame Desktop-22 — the saved-workflow list.
 *
 * A pure function of `WorkflowsData`; the only interactive part is the template
 * dialog, which is its own client component.
 */
export function Workflows({ data }: { data: WorkflowsData }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{data.title}</h1>
          <p className="m-0 flex items-center gap-1.5 text-micro text-pine">
            <GitBranch aria-hidden className="size-[13px] text-muted" strokeWidth={1.6} />
            <span className="text-muted">{data.countLabel}</span>
            <span className="tnum font-medium">{data.count}</span>
          </p>
        </div>
        <TemplatePicker picker={data.picker} label={data.newLabel} />
      </div>

      {/* items-start, not stretch: a card's height is set by how many chips it
          carries, and the frame lets them differ. */}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        {data.cards.map((card) => (
          <WorkflowCard key={card.id} card={card} />
        ))}
      </div>
    </>
  );
}
