import { Copy } from "lucide-react";

import { EnvChip, StatusChip } from "@/components/api-keys/parts";
import type { ApiKeyRow, ApiKeysTab } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * The keys table — Figma Desktop-44.
 *
 * A grid rather than a `<table>`, matching the verifications list: one column
 * template shared by the header and every row, so a column cannot be wide in
 * one and narrow in the other.
 *
 * TWO THINGS THE FRAME DRAWS THAT THIS DOES NOT:
 *
 *   · Copy is not wired, and cannot be from this screen. The frame puts a Copy
 *     button beside a masked key, which implies it hands over the whole secret
 *     — but a list endpoint must never return one (see `ApiKeyRow.key`), so
 *     there is nothing here to copy. It stays as a visible, unwired control
 *     rather than silently copying the mask, which would be worse than doing
 *     nothing: a developer would paste `sk_live_1aaa…ac16` into a config and
 *     spend an afternoon on it. When key creation is real, Copy belongs on the
 *     one-time reveal, not on the list.
 *   · Revoke is disabled on an already-revoked key. The frame draws all six
 *     rows identically, which is what a static mockup does; rendering a live
 *     destructive control for an action with no effect is how an operator ends
 *     up unsure whether the first click worked.
 */
export function KeysTable({ data }: { data: ApiKeysTab }) {
  const template = data.columns.map((c) => `${c.width}fr`).join(" ");
  const alignOf = (i: number) => data.columns[i]?.align ?? "left";

  return (
    <section className="overflow-hidden rounded-shell border border-hairline bg-page">
      <div className="overflow-x-auto">
        <div role="table" style={{ minWidth: 1044 }}>
          <div
            role="row"
            className="grid items-center gap-x-3 border-b border-edge bg-panel px-5 py-3"
            style={{ gridTemplateColumns: template }}
          >
            {data.columns.map((col, i) => (
              <span
                key={col.key}
                role="columnheader"
                className={cn(
                  "text-micro text-muted",
                  alignOf(i) === "right" ? "text-right" : "text-left",
                )}
              >
                {col.header}
              </span>
            ))}
          </div>

          <div role="rowgroup">
            {data.rows.map((row) => (
              <div
                key={row.id}
                role="row"
                className="grid items-center gap-x-3 border-b border-edge px-5 py-3 transition-colors last:border-b-0 hover:bg-hover-light"
                style={{ gridTemplateColumns: template }}
              >
                {data.columns.map((col, i) => (
                  <div
                    key={col.key}
                    role="cell"
                    className={cn(
                      "min-w-0",
                      alignOf(i) === "right" ? "text-right" : "text-left",
                    )}
                  >
                    <Cell column={col.key} row={row} data={data} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Cell({
  column,
  row,
  data,
}: {
  column: string;
  row: ApiKeyRow;
  data: ApiKeysTab;
}) {
  switch (column) {
    case "name":
      return <span className="block truncate text-body font-medium text-pine">{row.name}</span>;

    case "key":
      // Monospaced and tabular: this is an identifier to be compared character
      // by character, not a phrase to be read.
      return (
        <span className="tnum block truncate font-mono text-[12.5px] text-slate">{row.key}</span>
      );

    case "env":
      return <EnvChip env={row.env} />;

    case "scope":
      return <span className="block truncate text-body text-pine">{row.scope}</span>;

    case "rateLimit":
      return <span className="tnum text-body font-medium text-pine">{row.rateLimit}</span>;

    case "lastUsed":
      // `micro`, not `body`: a timestamp is scanned for a difference, never
      // read as prose, and at 14px it is the one cell that truncates — a date
      // ending in an ellipsis tells an operator nothing at all.
      return (
        <span className={cn("tnum block truncate text-micro", row.lastUsed ? "text-slate" : "text-muted")}>
          {row.lastUsed ?? data.neverUsedLabel}
          {row.lastUsed ? null : <span className="sr-only">Never used</span>}
        </span>
      );

    case "status":
      return <StatusChip status={row.status} />;

    case "actions": {
      const revoked = row.status === "revoked";
      return (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-lime px-2.5 text-micro font-medium text-pine transition-[filter] hover:brightness-95"
          >
            <Copy aria-hidden className="size-3" strokeWidth={2} />
            {data.copyLabel}
            <span className="sr-only"> {row.name} key</span>
          </button>
          <button
            type="button"
            disabled={revoked}
            className="inline-flex h-7 items-center rounded-pill border border-hairline bg-page px-2.5 text-micro text-pine transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-page"
          >
            {revoked ? data.revokedLabel : data.revokeLabel}
            <span className="sr-only"> {row.name}</span>
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}
