"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Trash2, Waypoints } from "lucide-react";

import { Select } from "@/components/ui/select";
import { VerdictChip } from "@/components/ui/chip";
import { Checkbox } from "@/components/ui/checkbox";
import { BatchDeleteDialog, RowActions } from "@/components/verifications/row-actions";
import { useAccess } from "@/lib/access";
import { NewSessionButton } from "@/components/verify/new-session-dialog";
import type { VerificationRow, VerificationsListData } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * The verifications list — Figma Desktop-26.
 *
 * A client component so the search box, the three filters and the pager work
 * over the sample rows: everything filters and paginates in the browser. When
 * this is wired to a backend, `getVerifications()` takes the same query and the
 * list becomes server-paged — the controls already exist.
 */

/** Which row field each filter narrows. */
const FILTER_FIELD: Record<string, keyof VerificationRow> = {
  status: "verdict",
  document: "document",
  workflow: "workflow",
};

const ROWS_OPTIONS = ["10 rows", "20 rows", "50 rows"];

export function VerificationsList({
  data,
  rowHref,
}: {
  data: VerificationsListData;
  /** Where a row opens (live records use /verifications/session?id=). */
  rowHref?: (id: string) => string;
}) {
  // live records can be ticked and deleted together (only a role that may delete sees the boxes)
  const mayDelete = useAccess().can("settings.manage") && !!rowHref;
  const template = `${mayDelete ? "20px " : ""}${data.columns.map((c) => `${c.width}fr`).join(" ")}`;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const alignOf = (i: number) => data.columns[i]?.align ?? "left";

  const [query, setQuery] = useState("");
  // Each filter starts on its "All …" option (index 0 = no filter).
  const [filters, setFilters] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.filters.map((f) => [f.name, f.options[0] ?? ""])),
  );
  const [rowsLabel, setRowsLabel] = useState(ROWS_OPTIONS[0]!);
  const [page, setPage] = useState(1);

  const perPage = parseInt(rowsLabel, 10) || 10;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (q && !(`${row.reference} ${row.applicant}`.toLowerCase().includes(q))) return false;
      for (const f of data.filters) {
        const chosen = filters[f.name];
        // options[0] is the "All …" sentinel — no narrowing.
        if (chosen && chosen !== f.options[0]) {
          const field = FILTER_FIELD[f.name];
          if (field && String(row[field]) !== chosen) return false;
        }
      }
      return true;
    });
  }, [data.rows, data.filters, query, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * perPage, current * perPage);
  const pages = pageList(current, totalPages);

  // Any change to the query/filters/page-size lands you back on page 1.
  const reset = () => setPage(1);

  // what may be ticked: this page's live rows; a ticked row that has left the list is no longer counted
  const pickable = pageRows.filter((r) => !!r.status);
  const chosen = [...picked].filter((id) => data.rows.some((r) => r.id === id));
  const allPicked = pickable.length > 0 && pickable.every((r) => picked.has(r.id));
  const toggleAll = () =>
    setPicked((p) => {
      const next = new Set(p);
      if (allPicked) pickable.forEach((r) => next.delete(r.id));
      else pickable.forEach((r) => next.add(r.id));
      return next;
    });
  const toggleOne = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-row">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{data.title}</h1>
          <p className="m-0 flex items-center gap-1.5 text-micro text-crumb">
            <Waypoints aria-hidden className="size-3.5" strokeWidth={1.7} />
            {data.liveLabel}
            <span className="tnum font-medium text-pine">{data.liveCount}</span>
          </p>
        </div>
        <NewSessionButton label={data.newSessionLabel} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex h-9 min-w-[260px] flex-1 items-center">
          <span className="sr-only">{data.searchPlaceholder}</span>
          <input
            type="search"
            name="q"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            placeholder={data.searchPlaceholder}
            className="h-full w-full rounded-pill border border-hairline bg-page pr-10 pl-4 text-body text-pine placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
          />
          <Search aria-hidden className="pointer-events-none absolute right-3.5 size-4 text-icon-soft" strokeWidth={1.8} />
        </label>

        {data.filters.map((filter) => (
          <Select
            key={filter.name}
            id={`filter-${filter.name}`}
            name={filter.name}
            label={filter.options[0]}
            options={filter.options}
            value={filters[filter.name]}
            onValueChange={(v) => {
              setFilters((prev) => ({ ...prev, [filter.name]: v }));
              reset();
            }}
            className="h-9 rounded-pill border border-hairline bg-page py-0 pr-9 pl-3 text-body text-pine focus:border-pine/30"
          />
        ))}
      </div>

      {mayDelete && chosen.length > 0 ? (
        <div role="region" aria-label="Selected verifications" className="flex flex-wrap items-center gap-3 rounded-shell border border-hairline bg-panel px-4 py-2.5">
          <span className="text-body font-medium text-pine">{chosen.length} selected</span>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-danger/30 bg-page px-3.5 text-micro font-medium text-danger transition-colors hover:bg-danger/5"
          >
            <Trash2 aria-hidden className="size-3.5" strokeWidth={1.9} />
            Delete selected
          </button>
          <button type="button" onClick={() => setPicked(new Set())} className="h-8 rounded-pill px-3 text-micro text-slate hover:bg-hover-panel">
            Clear selection
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <BatchDeleteDialog ids={chosen} onClose={() => setConfirmDelete(false)} onDone={() => setPicked(new Set())} />
      ) : null}

      <section className="overflow-hidden rounded-shell border border-hairline bg-page">
        <div className="overflow-x-auto">
          <div role="table" style={{ minWidth: 1080 }}>
            <div
              role="row"
              className="grid items-center gap-x-3 border-b border-edge bg-panel px-5 py-3"
              style={{ gridTemplateColumns: template }}
            >
              {mayDelete ? (
                <span role="columnheader" className="flex items-center">
                  {pickable.length > 0 ? <Checkbox checked={allPicked} onCheckedChange={toggleAll} aria-label="Select every verification on this page" /> : null}
                </span>
              ) : null}
              {data.columns.map((col, i) => (
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
              {pageRows.length === 0 ? (
                <p className="m-0 px-5 py-12 text-center text-body text-slate">
                  {data.rows.length === 0
                    ? "No verifications yet. Completed and in-progress sessions will appear here."
                    : "No verifications match your search."}
                </p>
              ) : (
                pageRows.map((row) => (
                  <div
                    key={row.id}
                    role="row"
                    className="grid items-center gap-x-3 border-b border-edge px-5 py-3 transition-colors last:border-b-0 hover:bg-hover-light"
                    style={{ gridTemplateColumns: template }}
                  >
                    {mayDelete ? (
                      <div role="cell" className="flex items-center">
                        {row.status ? <Checkbox checked={picked.has(row.id)} onCheckedChange={() => toggleOne(row.id)} aria-label={`Select ${row.reference}`} /> : null}
                      </div>
                    ) : null}
                    {data.columns.map((col, i) => (
                      <div
                        key={col.key}
                        role="cell"
                        className={cn(
                          "tnum min-w-0 text-body text-pine",
                          alignOf(i) === "right" ? "text-right" : "text-left",
                        )}
                      >
                        <Cell row={row} column={col.key} href={rowHref ? rowHref(row.id) : `/verifications/${row.id}`} />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <nav
          aria-label="Pagination"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-6 pt-3 pb-4"
        >
          {/* Opens UPWARD so the menu stays inside the table's overflow-hidden
              box instead of being clipped below it. */}
          <Select
            id="rows-per-page"
            label="Rows per page"
            options={ROWS_OPTIONS}
            value={rowsLabel}
            onValueChange={(v) => {
              setRowsLabel(v);
              reset();
            }}
            menuPlacement="up"
            className="inline-flex h-11 items-center gap-1.5 rounded-[14px] bg-hover-sunken px-3 pr-9 text-body text-pine"
          />

          <ol className="m-0 flex list-none items-center gap-0.5 p-0">
            {pages.map((p, i) =>
              p === null ? (
                <li key={`gap-${i}`} aria-hidden className="grid size-10 place-items-center text-body text-muted">
                  …
                </li>
              ) : (
                <li key={p}>
                  <button
                    type="button"
                    aria-current={p === current ? "page" : undefined}
                    onClick={() => setPage(p)}
                    className={cn(
                      "tnum grid size-10 cursor-pointer place-items-center rounded-lg text-body transition-colors",
                      p === current ? "bg-lime font-medium text-pine" : "text-pine hover:bg-hover-light",
                    )}
                  >
                    {p}
                  </button>
                </li>
              ),
            )}
          </ol>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={current <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-2xl border border-edge bg-page px-3 text-body text-pine shadow-[0_1px_2px_0_rgb(10_13_18/0.05)] transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft aria-hidden className="size-4" strokeWidth={1.8} />
              {data.pagination.previousLabel}
            </button>
            <button
              type="button"
              disabled={current >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-2xl border border-edge bg-page px-3 text-body text-pine shadow-[0_1px_2px_0_rgb(10_13_18/0.05)] transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              {data.pagination.nextLabel}
              <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
            </button>
          </div>
        </nav>
      </section>
    </div>
  );
}

/** Compact page list with ellipsis gaps (null) — 1 … current-1 current current+1 … N. */
function pageList(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...keep].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

function Cell({ row, column, href }: { row: VerificationRow; column: string; href: string }) {
  switch (column) {
    case "reference":
      return (
        <Link
          href={href}
          className="inline-flex rounded-pill bg-pine px-2.5 py-1 text-micro font-medium text-lime transition-opacity hover:opacity-85"
        >
          {row.reference}
        </Link>
      );

    case "applicant":
      return (
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-pill bg-pine text-[10px] font-medium text-lime"
          >
            {row.initials}
          </span>
          <span className="min-w-0 truncate">{row.applicant}</span>
        </span>
      );

    case "workflow":
      // which workflow the session runs, and (while unfinished) where the applicant is in it
      return (
        <span className="flex min-w-0 flex-col">
          <span className="truncate" title={row.workflow}>
            {row.workflow}
          </span>
          {row.stage ? <span className="truncate text-micro text-muted">{row.stage}</span> : null}
        </span>
      );

    case "verdict":
      return <VerdictChip verdict={row.verdict} />;

    case "score":
      // an unfinished session has no Trust Seal yet: a dash, never a 0 that reads like a failed check
      return row.verdict === "In progress" || row.verdict === "Abandoned" || row.verdict === "Disabled" ? (
        <span className="text-muted" title="Not scored until the applicant finishes">
          -
        </span>
      ) : (
        <span className="block truncate">{row.score}</span>
      );

    case "actions":
      return (
        <span className="flex justify-end">
          <RowActions id={row.status ? row.id : undefined} status={row.status} viewHref={href} label={row.reference} />
        </span>
      );

    default: {
      const value = row[column as keyof VerificationRow];
      return <span className="block truncate">{value}</span>;
    }
  }
}
