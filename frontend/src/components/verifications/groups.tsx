import { AlertTriangle, Info, OctagonAlert } from "lucide-react";

import { JsonTree } from "@/components/verifications/json-tree";
import { Facts, OutcomeTag, SectionHeading } from "@/components/verifications/parts";
import type { CheckRow, DetailFlag, DetailGroup, FactPair } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/*
 * Live-record evidence blocks: flagged findings as badges, then titled groups of
 * facts, checks and raw data. Used by every tab that has more than its summary.
 */

const FLAG = {
  critical: { icon: OctagonAlert, cls: "border-danger/30 bg-danger-tint text-danger" },
  warn: { icon: AlertTriangle, cls: "border-caution/30 bg-caution-tint text-caution" },
  info: { icon: Info, cls: "border-hairline bg-page text-slate" },
} as const;

export function FlagBadges({ flags }: { flags?: DetailFlag[] }) {
  if (!flags) return null;
  if (!flags.length) {
    return <p className="m-0 text-body text-muted">No risks detected.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {flags.map((f) => {
        const { icon: Icon, cls } = FLAG[f.severity];
        return (
          <li key={f.label} className={cn("inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-micro font-medium", cls)}>
            <Icon aria-hidden className="size-3" strokeWidth={2.2} />
            {f.label}
          </li>
        );
      })}
    </ul>
  );
}

function CheckList({ checks, compact }: { checks: CheckRow[]; compact?: boolean }) {
  return (
    <ul className={cn("m-0 grid list-none gap-1.5 p-0", !compact && "sm:grid-cols-2")}>
      {checks.map((c, i) => (
        <li
          key={`${c.label}-${i}`}
          className="flex items-start justify-between gap-3 rounded-box border border-hairline bg-page px-2.5 py-2.5"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body text-pine">{c.label}</span>
            {c.note && <span className="text-micro break-words text-muted">{c.note}</span>}
          </span>
          <OutcomeTag outcome={c.outcome} />
        </li>
      ))}
    </ul>
  );
}

/** Label left, detail right, one entry per row: for long text (listings, reasons, links). */
function FactRows({ facts }: { facts: FactPair[] }) {
  return (
    <dl className="m-0 flex flex-col divide-y divide-hairline rounded-box border border-hairline bg-page">
      {facts.map((f) => (
        <div key={f.term} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-4">
          <dt className="text-micro font-medium break-words text-muted sm:text-body">{f.term}</dt>
          <dd
            className={cn(
              "m-0 min-w-0 text-body whitespace-pre-line text-pine [overflow-wrap:anywhere]",
              f.mono && "tnum font-mono text-[13px]",
            )}
          >
            {f.detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function GroupBody({ g, compact }: { g: DetailGroup; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {g.facts && g.facts.length > 0 &&
        (g.layout === "rows" ? <FactRows facts={g.facts} /> : <Facts facts={g.facts} columns={compact ? 2 : 3} />)}
      {g.checks && g.checks.length > 0 && <CheckList checks={g.checks} compact={compact} />}
      {g.raw && <JsonTree text={g.raw} />}
    </div>
  );
}

export function DetailGroups({ groups, compact }: { groups?: DetailGroup[]; compact?: boolean }) {
  if (!groups?.length) return null;
  return (
    <>
      {groups.map((g) => {
        const count = (g.facts?.length ?? 0) + (g.checks?.length ?? 0);
        return g.collapsed ? (
          <details key={g.title} className="group rounded-box border border-hairline px-3 py-2.5">
            <summary className="cursor-pointer text-body font-medium text-pine">
              {g.title}
              {count > 0 && <span className="ml-1.5 text-micro font-normal text-muted">({count})</span>}
            </summary>
            <div className="mt-3">
              <GroupBody g={g} compact={compact} />
            </div>
          </details>
        ) : (
          <section key={g.title} className="flex flex-col gap-3">
            <SectionHeading>{g.title}</SectionHeading>
            <GroupBody g={g} compact={compact} />
          </section>
        );
      })}
    </>
  );
}
