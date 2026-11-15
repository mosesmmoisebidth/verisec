import { Clock, Server, ShieldCheck, UserCheck } from "lucide-react";
import type { ReactNode } from "react";

import { AreaChart, BarChart, Donut, Legend, LineChart } from "@/components/charts/charts";
import {
  BarList,
  Combobox,
  EmptyNote,
  GhostButton,
  KpiCard,
  LastSync,
  QueueTile,
  SegmentedBar,
} from "@/components/dashboard/pieces";
import { VerdictChip } from "@/components/ui/chip";
import { Eyebrow, Figure, Panel } from "@/components/ui/panel";
import { DataTable } from "@/components/ui/table";
import { PaginatedDataTable } from "@/components/ui/paginated-table";
import { NewSessionButton } from "@/components/verify/new-session-dialog";
import type { DashboardData, KpiIcon } from "@/lib/console/types";

/**
 * Figma frame Desktop-43.
 *
 * A pure function of `DashboardData` — every string, number, colour and axis
 * arrives as data. There is no copy in this file and no figure; relabelling a
 * panel, reordering a table's columns or pointing the screen at a live backend
 * are all changes in `src/lib/dashboard`, not here.
 *
 * The frame is a 1068px column of stacked rows with two recurring splits — an
 * even 2-up and a 2.04:1 wide/narrow — so both are named once below rather than
 * restated per row. The wide/narrow ratio is the frame's 706.99 : 345.97
 * exactly, so a card cannot drift a pixel from the one above it.
 */
const WIDE_NARROW = "grid grid-cols-1 gap-col lg:grid-cols-[706.99fr_345.97fr]";
const NARROW_WIDE = "grid grid-cols-1 gap-col lg:grid-cols-[345.97fr_706.99fr]";
const EVEN_2 = "grid grid-cols-1 gap-col md:grid-cols-2";
const QUAD = "grid grid-cols-2 gap-col xl:grid-cols-4";

/** The one thing that cannot travel as data: a React component. The payload
 *  carries a string key and this resolves it. */
const KPI_ICON: Record<KpiIcon, ReactNode> = {
  verifications: <UserCheck aria-hidden className="size-[15px]" strokeWidth={1.6} />,
  pass: <ShieldCheck aria-hidden className="size-[15px]" strokeWidth={1.6} />,
  latency: <Clock aria-hidden className="size-[15px]" strokeWidth={1.6} />,
  uptime: <Server aria-hidden className="size-[15px]" strokeWidth={1.6} />,
};

/** The live dashboard's header controls (omitted, the controls render as the frame draws them). */
export type DashboardControls = {
  range: string;
  onRange: (range: string) => void;
  onExport: () => void;
  exporting?: boolean;
  /** The workflow filter (by name; "All workflows" = none). */
  workflow?: string;
  onWorkflow?: (workflow: string) => void;
};

export function Dashboard({ data, controls }: { data: DashboardData; controls?: DashboardControls }) {
  const d = data;

  return (
    <>
      {/* 1 — heading + controls -------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{d.header.title}</h1>
          <LastSync label={d.header.lastSyncLabel} value={d.header.lastSync} />
        </div>
        <div className="flex flex-wrap items-center gap-tight">
          <Combobox
            label="Date range"
            options={d.header.ranges}
            value={controls?.range}
            onValueChange={controls?.onRange}
          />
          <Combobox label="Workflow" options={d.header.workflows} value={controls?.workflow} onValueChange={controls?.onWorkflow} />
          <GhostButton onClick={controls?.onExport} busy={controls?.exporting}>
            {d.header.exportLabel}
          </GhostButton>
          {/* Opens the New verification session dialog (Desktop-27/28/29 →
              Desktop-30): choose a mode, get the link + QR, then into the flow. */}
          <NewSessionButton label={d.header.newSessionLabel} />
        </div>
      </div>

      {/* 2 — KPI strip ----------------------------------------------------- */}
      <div className={QUAD}>
        {d.kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} icon={KPI_ICON[k.icon]} />
        ))}
      </div>

      {/* 3 — volume + outcome --------------------------------------------- */}
      <div className={WIDE_NARROW}>
        <Panel title={d.volume.title}>
          {d.volume.empty ? (
            <EmptyNote>{d.volume.empty}</EmptyNote>
          ) : (
            <AreaChart points={d.volume.points} axis={d.volume.axis} />
          )}
        </Panel>
        <Panel title={d.outcomes.title} bodyClassName="items-center gap-stack">
          {d.outcomes.empty ? (
            <EmptyNote>{d.outcomes.empty}</EmptyNote>
          ) : (
            <>
              <Donut
                slices={d.outcomes.slices}
                centerLabel={d.outcomes.centerLabel}
                centerValue={d.outcomes.centerValue}
              />
              <Legend items={d.outcomes.slices} />
            </>
          )}
        </Panel>
      </div>

      {/* 4 — failing checks + decline reasons ----------------------------- */}
      <div className={EVEN_2}>
        <Panel title={d.failingChecks.title}>
          {d.failingChecks.empty ? (
            <EmptyNote>{d.failingChecks.empty}</EmptyNote>
          ) : (
            <BarList items={d.failingChecks.items} />
          )}
        </Panel>
        <Panel title={d.declineReasons.title}>
          {d.declineReasons.empty ? (
            <EmptyNote>{d.declineReasons.empty}</EmptyNote>
          ) : (
            <BarList items={d.declineReasons.items} />
          )}
        </Panel>
      </div>

      {/* 5 — connection type + IP mismatch -------------------------------- */}
      <div className={WIDE_NARROW}>
        <Panel title={d.connections.title} bodyClassName="gap-stack">
          {d.connections.empty ? (
            <EmptyNote>{d.connections.empty}</EmptyNote>
          ) : (
            <>
              <SegmentedBar segments={d.connections.segments} />
              <Legend items={d.connections.segments} layout="row" />
            </>
          )}
        </Panel>
        <Panel title={d.ipMismatch.title}>
          <Figure size="lg" className="pt-2">
            {d.ipMismatch.value}
          </Figure>
          {d.ipMismatch.caption && (
            <p className="m-0 text-micro font-light text-subtle">{d.ipMismatch.caption}</p>
          )}
        </Panel>
      </div>

      {/* 6 — latency + error rate ----------------------------------------- */}
      <div className={EVEN_2}>
        <Panel title={d.latency.title} radius="panel">
          {d.latency.empty ? (
            <EmptyNote>{d.latency.empty}</EmptyNote>
          ) : (
            <LineChart points={d.latency.points} axis={d.latency.axis} />
          )}
        </Panel>
        <Panel title={d.errors.title} radius="panel">
          {d.errors.empty ? (
            <EmptyNote>{d.errors.empty}</EmptyNote>
          ) : (
            <BarChart points={d.errors.points} axis={d.errors.axis} />
          )}
        </Panel>
      </div>

      {/* 7 — uptime + webhooks -------------------------------------------- */}
      <div className={WIDE_NARROW}>
        <Panel title={d.uptime.title} radius="panel" bodyClassName="gap-stack">
          <Figure className="pt-1 font-normal text-ramp-2">{d.uptime.value}</Figure>
          {d.uptime.incidents.rows.length === 0 && d.uptime.incidents.empty ? (
            <EmptyNote>{d.uptime.incidents.empty}</EmptyNote>
          ) : (
            <DataTable spec={d.uptime.incidents} minWidth={420} />
          )}
        </Panel>
        <Panel title={d.webhooks.title} radius="panel" bodyClassName="items-center gap-stack">
          {d.webhooks.empty ? (
            <EmptyNote>{d.webhooks.empty}</EmptyNote>
          ) : (
            <>
              <Donut slices={d.webhooks.slices} />
              <Legend items={d.webhooks.slices} layout="row" />
            </>
          )}
        </Panel>
      </div>

      {/* 8 — calls by endpoint -------------------------------------------- */}
      <Panel title={d.endpoints.title} radius="panel">
        {d.endpoints.rows.length === 0 && d.endpoints.empty ? (
          <EmptyNote>{d.endpoints.empty}</EmptyNote>
        ) : (
          <PaginatedDataTable spec={d.endpoints} minWidth={760} pageSize={8} />
        )}
      </Panel>

      {/* 9 — queues ------------------------------------------------------- */}
      <div className={QUAD}>
        {d.queues.map((q) => (
          <QueueTile key={q.label} tile={q} />
        ))}
      </div>

      {/* 10 — workflow tracking ------------------------------------------- */}
      <Panel title={d.workflowTracking.title} radius="panel">
        {d.workflowTracking.rows.length === 0 && d.workflowTracking.empty ? (
          <EmptyNote>{d.workflowTracking.empty}</EmptyNote>
        ) : (
          <DataTable spec={d.workflowTracking} minWidth={720} />
        )}
      </Panel>

      {/* 11 — processing time + slowest checks ---------------------------- */}
      <div className={NARROW_WIDE}>
        <Panel title={d.processing.title} radius="panel" bodyClassName="gap-stack">
          <div className="grid grid-cols-3 gap-stack">
            {d.processing.tiles.map((t) => (
              <div
                key={t.label}
                className="flex flex-col items-center justify-center gap-0.5 rounded-[12px] border border-hairline bg-white py-2"
              >
                <span className="text-[10px] text-muted">{t.label}</span>
                <span className="tnum text-body font-medium text-pine">{t.value}</span>
              </div>
            ))}
          </div>
          <p className="m-0 rounded-well bg-well px-3 py-3.5 text-micro text-pine/90">
            {d.processing.note}
          </p>
        </Panel>
        <Panel title={d.slowestChecks.title} radius="panel">
          {d.slowestChecks.empty ? (
            <EmptyNote>{d.slowestChecks.empty}</EmptyNote>
          ) : (
            <BarList items={d.slowestChecks.items} />
          )}
        </Panel>
      </div>

      {/* 12 — recent activity --------------------------------------------- */}
      <Panel
        title={d.activity.title}
        radius="panel"
        action={<NewSessionButton label={d.activity.cta} compact />}
      >
        {d.activity.empty ? <EmptyNote>{d.activity.empty}</EmptyNote> : null}
        <ul className="m-0 flex list-none flex-col p-0">
          {d.activity.rows.map((a, i) => (
            <li key={a.ref} className={i > 0 ? "border-t border-rule" : undefined}>
              <a
                href={a.href}
                className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-black/[0.02]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-pill bg-pine text-[11px] font-semibold text-lime"
                  >
                    {initials(a.name)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body font-medium text-pine">{a.name}</span>
                    <span className="tnum truncate text-micro text-subtle">
                      {a.ref} · {a.workflow}
                    </span>
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-3">
                  <Eyebrow className="tnum text-muted normal-case tracking-normal">
                    Score {a.score ?? "-"}
                  </Eyebrow>
                  <VerdictChip verdict={a.verdict} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

/** First letter of the first two words — enough to fill a 36px avatar. The data
 *  layer supplies `initials` for the signed-in account, but activity rows carry
 *  only a display name, so this derives them. */
function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}
