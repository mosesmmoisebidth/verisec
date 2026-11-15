"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, ScanLine, ScanText, Search } from "lucide-react";

import { GhostButton, LimeLink, Loading, Notice, PageHeader, ProductChip, RetryButton, StatePanel, StatusChip } from "@/components/finance/parts";
import { Select } from "@/components/ui/select";
import { byNewest, finApi } from "@/lib/finance/api";
import { shortPan } from "@/lib/finance/card";
import { ISSUE_LABEL, PRODUCT_LABEL, SCANS, SOURCE_LABEL, STATUS_LABEL } from "@/lib/finance/content";
import { count, duration, stamp, timeAgo } from "@/lib/finance/format";
import { chequeSummary, micrField, micrNamedFields } from "@/lib/finance/micr";
import type { ScanResponse } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type Load =
  | { kind: "loading" }
  | { kind: "ready"; rows: ScanResponse[]; total: number; missing: ("micr" | "card")[] }
  | { kind: "offline" };

/**
 * Scans: every read from both services, merged newest first.
 *
 * Search, the three filters and the pager run in the browser over the most
 * recent 200 reads of each service. Rows open `/fin/scans/view?id=…`, one
 * client page for any id, because ids are created after the site is built.
 */
export function ScansList() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<string>(SCANS.filters.product[0]);
  const [status, setStatus] = useState<string>(SCANS.filters.status[0]);
  const [source, setSource] = useState<string>(SCANS.filters.source[0]);
  const [rowsLabel, setRowsLabel] = useState<string>(SCANS.rowsOptions[0]);
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());

  // Bumped by Refresh / Try again; the effect re-fetches on change.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([finApi.listCheques(200), finApi.listCards(200)]).then(([cheques, cards]) => {
      if (!alive) return;
      const rows: ScanResponse[] = [];
      let total = 0;
      const missing: ("micr" | "card")[] = [];
      if (cheques.status === "fulfilled") {
        rows.push(...cheques.value.data);
        total += cheques.value.total;
      } else missing.push("micr");
      if (cards.status === "fulfilled") {
        rows.push(...cards.value.data);
        total += cards.value.total;
      } else missing.push("card");
      setNow(Date.now());
      setLoad(missing.length === 2 ? { kind: "offline" } : { kind: "ready", rows: rows.sort(byNewest), total, missing });
    });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const rows = useMemo(() => (load.kind === "ready" ? load.rows : []), [load]);
  const refresh = () => {
    setLoad({ kind: "loading" });
    setNonce((n) => n + 1);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (product !== SCANS.filters.product[0] && PRODUCT_LABEL[r.object] !== product) return false;
      if (status !== SCANS.filters.status[0] && STATUS_LABEL[r.status] !== status) return false;
      if (source !== SCANS.filters.source[0] && SOURCE_LABEL[r.source] !== source) return false;
      if (!q) return true;
      return haystack(r).includes(q);
    });
  }, [rows, query, product, status, source]);

  const perPage = parseInt(rowsLabel, 10) || 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * perPage, current * perPage);
  const template = SCANS.columns.map((c) => `${c.width}fr`).join(" ");
  const reset = () => setPage(1);

  return (
    <div className="flex flex-col gap-row">
      <PageHeader
        title={SCANS.title}
        subtitle={
          load.kind === "ready" ? (
            <span className="inline-flex items-center gap-1.5">
              <ScanText aria-hidden className="size-3.5" strokeWidth={1.7} />
              {SCANS.totalLabel} <span className="tnum font-medium text-pine">{count(load.total)}</span>
            </span>
          ) : (
            SCANS.subtitle
          )
        }
        actions={
          <>
            <GhostButton icon={RefreshCw} onClick={refresh} disabled={load.kind === "loading"}>
              {SCANS.refreshLabel}
            </GhostButton>
            <LimeLink href="/fin/playground" icon={ScanLine}>
              {SCANS.playgroundLabel}
            </LimeLink>
          </>
        }
      />

      {load.kind === "ready" && load.missing.length === 1 ? <Notice tone="warning">{SCANS.partialOffline}</Notice> : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex h-9 min-w-[260px] flex-1 items-center">
          <span className="sr-only">{SCANS.searchPlaceholder}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            placeholder={SCANS.searchPlaceholder}
            className="h-full w-full rounded-pill border border-hairline bg-page pr-10 pl-4 text-body text-pine placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
          />
          <Search aria-hidden className="pointer-events-none absolute right-3.5 size-4 text-icon-soft" strokeWidth={1.8} />
        </label>
        {(
          [
            ["product", SCANS.filters.product, product, setProduct],
            ["status", SCANS.filters.status, status, setStatus],
            ["source", SCANS.filters.source, source, setSource],
          ] as const
        ).map(([name, options, value, set]) => (
          <Select
            key={name}
            id={`fin-filter-${name}`}
            label={options[0]}
            options={options}
            value={value}
            onValueChange={(v) => {
              set(v);
              reset();
            }}
            className="h-9 rounded-pill border border-hairline bg-page py-0 pr-9 pl-3 text-body text-pine focus:border-pine/30"
          />
        ))}
      </div>

      {load.kind === "loading" ? (
        <section className="rounded-shell border border-hairline bg-page">
          <Loading label={SCANS.loading} />
        </section>
      ) : load.kind === "offline" ? (
        <StatePanel title={SCANS.offlineTitle} body={SCANS.offlineBody} action={<RetryButton label={SCANS.retryLabel} onClick={refresh} />} />
      ) : rows.length === 0 ? (
        <StatePanel
          icon={ScanLine}
          title={SCANS.emptyTitle}
          body={SCANS.emptyBody}
          action={
            <LimeLink href="/fin/playground" icon={ScanLine}>
              {SCANS.playgroundLabel}
            </LimeLink>
          }
        />
      ) : (
        <section className="overflow-hidden rounded-shell border border-hairline bg-page">
          <div className="overflow-x-auto">
            <div role="table" style={{ minWidth: 1080 }}>
              <div role="row" className="grid items-center gap-x-3 border-b border-edge bg-panel px-5 py-3" style={{ gridTemplateColumns: template }}>
                {SCANS.columns.map((col) => (
                  <span
                    key={col.key}
                    role="columnheader"
                    className={cn(
                      "text-micro text-muted",
                      "align" in col && col.align === "right" ? "text-right" : "text-left",
                      "gap" in col && col.gap && "pl-5",
                    )}
                  >
                    {col.header}
                  </span>
                ))}
              </div>
              <div role="rowgroup">
                {pageRows.length === 0 ? (
                  <p className="m-0 px-5 py-12 text-center text-body text-slate">{SCANS.emptyFiltered}</p>
                ) : (
                  pageRows.map((r) => (
                    <a
                      key={r.id}
                      role="row"
                      href={`/fin/scans/view?id=${encodeURIComponent(r.id)}`}
                      className="grid items-center gap-x-3 border-b border-edge px-5 py-3 transition-colors last:border-b-0 hover:bg-hover-light"
                      style={{ gridTemplateColumns: template }}
                    >
                      <Cells r={r} now={now} />
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>

          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-6 pt-3 pb-4">
            <Select
              id="fin-rows"
              label="Rows per page"
              options={SCANS.rowsOptions}
              value={rowsLabel}
              onValueChange={(v) => {
                setRowsLabel(v);
                reset();
              }}
              menuPlacement="up"
              className="inline-flex h-11 items-center gap-1.5 rounded-[14px] bg-hover-sunken px-3 pr-9 text-body text-pine"
            />
            <ol className="m-0 flex list-none items-center gap-0.5 p-0">
              {pageList(current, totalPages).map((p, i) =>
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
              <PagerButton disabled={current <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft aria-hidden className="size-4" strokeWidth={1.8} />
                {SCANS.previousLabel}
              </PagerButton>
              <PagerButton disabled={current >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                {SCANS.nextLabel}
                <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
              </PagerButton>
            </div>
          </nav>
        </section>
      )}
    </div>
  );
}

function PagerButton({ children, ...rest }: React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-2xl border border-edge bg-page px-3 text-body text-pine shadow-[0_1px_2px_0_rgb(10_13_18/0.05)] transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-40"
      {...rest}
    >
      {children}
    </button>
  );
}

function Cells({ r, now }: { r: ScanResponse; now: number }) {
  // Confidence should be a number, but some records arrive with it as a string;
  // coerce so a non-number value can never crash `.toFixed` (which broke the
  // whole list the moment you paged to the row that carried one).
  const rawConfidence = r.object === "cheque" ? r.micr?.confidence : r.card?.confidence;
  const confidence =
    typeof rawConfidence === "number"
      ? rawConfidence
      : rawConfidence != null && rawConfidence !== "" && !Number.isNaN(Number(rawConfidence))
        ? Number(rawConfidence)
        : null;
  return (
    <>
      <span role="cell" className="min-w-0">
        <span className="inline-flex max-w-full truncate rounded-pill bg-pine px-2.5 py-1 font-mono text-[11.5px] font-medium text-lime">{r.id}</span>
      </span>
      <span role="cell">
        <ProductChip product={r.object} />
      </span>
      <span role="cell" className="flex min-w-0 flex-col">
        <ResultCell r={r} />
      </span>
      <span role="cell">
        <StatusChip status={r.status} />
      </span>
      <span role="cell" className="tnum text-right text-body text-pine">
        {confidence != null ? `${confidence.toFixed(1)}%` : "-"}
      </span>
      <span role="cell" className="truncate pl-5 text-body text-pine">
        {SOURCE_LABEL[r.source]}
        {r.env === "live" ? <span className="ml-1.5 text-micro text-ramp-2">live</span> : null}
      </span>
      <span role="cell" className="tnum text-right text-body text-pine">
        {duration(r.processing_ms)}
      </span>
      <span role="cell" className="flex min-w-0 flex-col pl-5" title={stamp(r.created_at)}>
        <span className="truncate text-body text-pine">{timeAgo(r.created_at, now)}</span>
      </span>
      <span role="cell" className="flex justify-end text-pine/40">
        <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
      </span>
    </>
  );
}

function ResultCell({ r }: { r: ScanResponse }) {
  if (r.status === "unreadable") {
    const label = (r.issue_code && ISSUE_LABEL[r.issue_code]) || r.issue || "-";
    return (
      <span className="truncate text-body text-slate" title={r.issue ?? undefined}>
        {label}
      </span>
    );
  }
  if (r.object === "cheque") {
    const account = micrField(r.micr, "Account", "Short Account Number");
    return (
      <>
        <span className="tnum truncate font-mono text-[13px] text-pine">{chequeSummary(r)}</span>
        <span className="truncate text-micro text-slate">
          {r.micr?.font}
          {account ? ` · acct ••${account.slice(-4)}` : ""}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="tnum truncate font-mono text-[13px] text-pine">{r.card ? shortPan(r.card) : "-"}</span>
      <span className="truncate text-micro text-slate">{[r.bin?.network, r.bin?.issuer].filter(Boolean).join(" · ") || "BIN not in table"}</span>
    </>
  );
}

function haystack(r: ScanResponse): string {
  const parts = [r.id, r.issue ?? ""];
  if (r.object === "cheque") parts.push(...micrNamedFields(r.micr).map((f) => f.value), r.micr?.font ?? "");
  else parts.push(r.card?.last4 ?? "", r.card?.first6 ?? "", r.bin?.issuer ?? "", r.bin?.network ?? "");
  return parts.join(" ").toLowerCase();
}

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
