"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { DataTable } from "@/components/ui/table";
import type { TableSpec } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * A `DataTable` that shows one page of rows at a time, so a long list (e.g. the
 * dashboard's "calls by endpoint") can't stretch the panel and push the rest of
 * the page down. The pager only appears when there is more than one page, so a
 * short table looks exactly as before.
 */
export function PaginatedDataTable({
  spec,
  minWidth = 640,
  pageSize = 8,
}: {
  spec: TableSpec;
  minWidth?: number;
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const total = spec.rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const rows = spec.rows.slice((current - 1) * pageSize, current * pageSize);

  return (
    <div className="flex flex-col gap-3">
      <DataTable spec={{ ...spec, rows }} minWidth={minWidth} />
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
          <span className="tnum text-micro text-muted">
            {(current - 1) * pageSize + 1}&ndash;{Math.min(current * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <PagerBtn disabled={current <= 1} aria-label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft aria-hidden className="size-4" strokeWidth={1.8} />
            </PagerBtn>
            <span className="tnum text-micro text-pine">
              {current} / {totalPages}
            </span>
            <PagerBtn disabled={current >= totalPages} aria-label="Next page" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
            </PagerBtn>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PagerBtn({ className, ...rest }: React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border border-hairline bg-page text-pine transition-colors hover:bg-hover-light focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    />
  );
}
