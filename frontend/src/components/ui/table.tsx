import { Tag } from "@/components/ui/chip";
import type { Cell, TableSpec } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * The frame's Table / Header→Row / Body / Row / Cell structure, driven entirely
 * by a `TableSpec`.
 *
 * Columns are declared once and shared by the header and every row as one grid
 * template, so a column cannot be wide in the header and narrow in the body —
 * the failure mode of laying each row out independently. Widths arrive as the
 * frame's px values and become `fr` units, which keeps the designed ratio at any
 * container width.
 *
 * Adding a column, renaming a header, changing an alignment or turning a cell
 * into a tag are all data changes in `lib/dashboard`. Nothing here needs editing.
 */
export function DataTable({ spec, minWidth = 640 }: { spec: TableSpec; minWidth?: number }) {
  const template = spec.columns.map((c) => `${c.width}fr`).join(" ");
  const alignOf = (i: number) => spec.columns[i]?.align ?? (i === 0 ? "left" : "right");

  return (
    <div className="min-w-0 overflow-x-auto">
      <div role="table" style={{ minWidth }}>
        <div
          role="row"
          className="grid items-center gap-x-3 py-tight"
          style={{ gridTemplateColumns: template }}
        >
          {spec.columns.map((col, i) => (
            <span
              key={col.key}
              role="columnheader"
              className={cn("text-micro text-muted", alignOf(i) === "right" ? "text-right" : "text-left")}
            >
              {col.header}
            </span>
          ))}
        </div>

        <div role="rowgroup">
          {spec.rows.map((row, r) => (
            <div
              key={r}
              role="row"
              className="grid items-center gap-x-3 border-t border-rule py-2.5"
              style={{ gridTemplateColumns: template }}
            >
              {spec.columns.map((col, i) => (
                <div
                  key={col.key}
                  role="cell"
                  className={cn(
                    "tnum min-w-0 text-micro",
                    alignOf(i) === "right" ? "text-right" : "text-left",
                    col.emphasis && "font-medium",
                    col.muted ? "text-subtle" : "text-pine",
                  )}
                >
                  {renderCell(row[col.key] ?? null)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A bare value renders as text; the object form renders a tag. */
function renderCell(cell: Cell) {
  if (cell === null || cell === undefined) return "-";
  if (typeof cell === "object") return <Tag tone={cell.tone}>{cell.tag}</Tag>;
  return cell;
}
