"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CircleSlash, Clock, CreditCard, Download, Receipt, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";

import { Legend, LineChart, ramp } from "@/components/charts/charts";
import { BarList, KpiCard, SegmentedBar } from "@/components/dashboard/pieces";
import { GhostButton, LimeLink, Loading, Notice, PageHeader, RetryButton, StatePanel, StatusChip } from "@/components/finance/parts";
import { OutcomeRing } from "@/components/finance/outcome-ring";
import { VolumeBars } from "@/components/finance/volume-bars";
import { Figure, Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { PaginatedDataTable } from "@/components/ui/paginated-table";
import { byNewest, finApi } from "@/lib/finance/api";
import { shortPan } from "@/lib/finance/card";
import { DASHBOARD, ISSUE_LABEL } from "@/lib/finance/content";
import { count, dayLabel, duration, percent, percentile, timeAgo } from "@/lib/finance/format";
import { chequeSummary, standardLabel } from "@/lib/finance/micr";
import type { CardStats, ChequeStats, ScanResponse, StatsHeadline } from "@/lib/finance/types";
import type { Kpi, Ramp, Segment, Slice, TableSpec } from "@/lib/console/types";

const WIDE_NARROW = "grid grid-cols-1 gap-col lg:grid-cols-[706.99fr_345.97fr]";
const THREE = "grid grid-cols-1 gap-col md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr]";
const EVEN_2 = "grid grid-cols-1 gap-col md:grid-cols-2";
const QUAD = "grid grid-cols-2 gap-col xl:grid-cols-4";

type Load =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "ready"; cheques: ChequeStats | null; cards: CardStats | null; recent: ScanResponse[]; at: number };

/**
 * The Financial dashboard. Every figure is computed from the MICR and Card
 * APIs' own stats (`/v2/cheques/stats`, `/v2/cards/stats`), including exact
 * latency percentiles across both services from their raw timings. Nothing
 * here is a sample.
 */
export function FinDashboard() {
  const [days, setDays] = useState(30);
  const [productLabel, setProductLabel] = useState<string>(DASHBOARD.products[0]);
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  // Bumped by Refresh / Try again; the effect re-fetches on change.
  const [nonce, setNonce] = useState(0);

  // Changing the range keeps the current numbers on screen until the new ones land.
  useEffect(() => {
    let alive = true;
    Promise.allSettled([finApi.chequeStats(days), finApi.cardStats(days), finApi.listCheques(6), finApi.listCards(6)]).then(
      ([cs, ks, cl, kl]) => {
        if (!alive) return;
        const cheques = cs.status === "fulfilled" ? cs.value : null;
        const cards = ks.status === "fulfilled" ? ks.value : null;
        if (!cheques && !cards) {
          setLoad({ kind: "offline" });
          return;
        }
        const recent = [...(cl.status === "fulfilled" ? cl.value.data : []), ...(kl.status === "fulfilled" ? kl.value.data : [])]
          .sort(byNewest)
          .slice(0, 6);
        setLoad({ kind: "ready", cheques, cards, recent, at: Date.now() });
      },
    );
    return () => {
      alive = false;
    };
  }, [days, nonce]);

  const refresh = () => setNonce((n) => n + 1);

  const product = productLabel === DASHBOARD.products[1] ? "cheque" : productLabel === DASHBOARD.products[2] ? "card" : "all";

  const header = (
    <PageHeader
      title={DASHBOARD.title}
      subtitle={
        load.kind === "ready" ? (
          <span className="inline-flex items-center gap-1.5">
            {DASHBOARD.updatedLabel}
            <span className="font-medium text-pine">{new Date(load.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </span>
        ) : undefined
      }
      actions={
        <>
          <Select
            id="fin-range"
            label="Date range"
            options={DASHBOARD.ranges.map((r) => r.label)}
            value={DASHBOARD.ranges.find((r) => r.days === days)?.label}
            onValueChange={(label) => setDays(DASHBOARD.ranges.find((r) => r.label === label)?.days ?? 30)}
            className="h-[34px] rounded-pill border border-hairline bg-panel pr-8 pl-3 text-micro text-pine"
          />
          <Select
            id="fin-product"
            label="Product"
            options={DASHBOARD.products}
            value={productLabel}
            onValueChange={setProductLabel}
            className="h-[34px] rounded-pill border border-hairline bg-panel pr-8 pl-3 text-micro text-pine"
          />
          <GhostButton icon={RefreshCw} aria-label="Refresh" onClick={refresh} className="px-2.5">
            <span className="sr-only">Refresh</span>
          </GhostButton>
          <GhostButton
            icon={Download}
            disabled={load.kind !== "ready"}
            onClick={() => load.kind === "ready" && exportCsv(load.cheques, load.cards, days)}
          >
            {DASHBOARD.exportLabel}
          </GhostButton>
          <LimeLink href="/fin/playground" icon={ScanLine}>
            {DASHBOARD.playgroundLabel}
          </LimeLink>
        </>
      }
    />
  );

  if (load.kind === "loading") {
    return (
      <>
        {header}
        <Loading label={DASHBOARD.loading} />
      </>
    );
  }
  if (load.kind === "offline") {
    return (
      <>
        {header}
        <StatePanel
          title={DASHBOARD.offlineTitle}
          body={DASHBOARD.offlineBody}
          action={
            <RetryButton
              label={DASHBOARD.retryLabel}
              onClick={() => {
                setLoad({ kind: "loading" });
                refresh();
              }}
            />
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      {!load.cheques || !load.cards ? <Notice tone="warning">{DASHBOARD.partialOffline}</Notice> : null}
      <Body cheques={product === "card" ? null : load.cheques} cards={product === "cheque" ? null : load.cards} recent={load.recent.filter((r) => product === "all" || r.object === product)} />
    </>
  );
}

/* ----------------------------------------------------------------------------
   The panels
---------------------------------------------------------------------------- */

function Body({ cheques, cards, recent }: { cheques: ChequeStats | null; cards: CardStats | null; recent: ScanResponse[] }) {
  const m = useMemo(() => metrics(cheques, cards), [cheques, cards]);

  // Nothing earlier to compare with: every card says so, rather than an arrow and a dash.
  const first = m.total > 0 && m.prevTotal === 0;
  const fresh = { delta: DASHBOARD.newLabel, trend: "up", tone: "positive" } as const;

  const kpis: { kpi: Kpi; icon: ReactNode }[] = [
    {
      kpi: { icon: "verifications", label: DASHBOARD.kpi.scans, value: count(m.total), ...(first ? fresh : delta(m.total, m.prevTotal, "count")), feature: true },
      icon: <ScanLine aria-hidden className="size-[15px]" strokeWidth={1.6} />,
    },
    {
      kpi: { icon: "pass", label: DASHBOARD.kpi.readRate, value: percent(m.read, m.total), ...(first ? fresh : delta(rate(m.read, m.total), rate(m.prevRead, m.prevTotal), "pts", m.total > 0 && m.prevTotal > 0)) },
      icon: <ShieldCheck aria-hidden className="size-[15px]" strokeWidth={1.6} />,
    },
    {
      kpi: { icon: "latency", label: DASHBOARD.kpi.median, value: m.total ? duration(m.p50) : "-", ...(first ? fresh : delta(m.p50, m.prevP50, "ms", m.total > 0 && m.prevTotal > 0)) },
      icon: <Clock aria-hidden className="size-[15px]" strokeWidth={1.6} />,
    },
    {
      kpi: { icon: "uptime", label: DASHBOARD.kpi.failed, value: count(m.unreadable), ...(first ? { ...fresh, tone: "pine" as const } : delta(m.unreadable, m.prevUnreadable, "abs")) },
      icon: <CircleSlash aria-hidden className="size-[15px]" strokeWidth={1.6} />,
    },
  ];

  return (
    <>
      <div className={QUAD}>
        {kpis.map((k) => (
          <KpiCard key={k.kpi.label} kpi={k.kpi} icon={k.icon} />
        ))}
      </div>

      {m.total === 0 ? (
        <StatePanel
          icon={ScanLine}
          title={DASHBOARD.emptyStartTitle}
          body={DASHBOARD.emptyStartBody}
          action={
            <LimeLink href="/fin/playground" icon={ScanLine}>
              {DASHBOARD.playgroundLabel}
            </LimeLink>
          }
        />
      ) : (
        <>
          <div className={WIDE_NARROW}>
            <Panel title={DASHBOARD.volumeTitle} bodyClassName="gap-stack">
              <VolumeBars points={m.volume} label={DASHBOARD.volumeTitle} labels={DASHBOARD.legend} />
              <Legend items={m.volumeLegend} layout="row" />
            </Panel>
            <Panel title={DASHBOARD.outcomesTitle} bodyClassName="items-center gap-stack">
              <OutcomeRing slices={m.outcomes} centerLabel={DASHBOARD.outcomesCenter} centerValue={count(m.total)} />
              <Legend items={m.outcomes} />
            </Panel>
          </div>

          {cards ? (
            <div className={EVEN_2}>
              <Panel title={DASHBOARD.networksTitle}>
                <RankedList items={cards.networks.map((n) => ({ label: n.name, value: n.count }))} />
              </Panel>
              <Panel title={DASHBOARD.issuersTitle}>
                <RankedList items={cards.issuers.map((n) => ({ label: n.name, value: n.count }))} />
              </Panel>
            </div>
          ) : null}

          <div className={cheques ? THREE : "grid grid-cols-1"}>
            <Panel title={DASHBOARD.failuresTitle}>
              {m.failures.length ? (
                <RankedList items={m.failures} />
              ) : (
                <p className="m-0 py-6 text-center text-micro text-subtle">{DASHBOARD.noFailures}</p>
              )}
            </Panel>
            {cheques ? (
              <>
                <Panel title={DASHBOARD.layoutsTitle} bodyClassName="gap-stack">
                  {m.layouts.length ? (
                    <>
                      <SegmentedBar segments={m.layouts} />
                      <Legend items={m.layouts} layout="row" />
                    </>
                  ) : (
                    <p className="m-0 py-3 text-micro text-subtle">{DASHBOARD.emptyList}</p>
                  )}
                </Panel>
                <Panel title={DASHBOARD.routingTitle}>
                  <Figure className="pt-1">{percent(cheques.routing.passed, cheques.routing.checked)}</Figure>
                  <p className="m-0 text-micro font-light text-subtle">
                    {DASHBOARD.routingCaption}
                    {cheques.routing.checked ? ` (${cheques.routing.passed} of ${cheques.routing.checked})` : ""}
                  </p>
                </Panel>
              </>
            ) : null}
          </div>

          <div className={EVEN_2}>
            <Panel title={DASHBOARD.latencyTitle} radius="panel" bodyClassName="gap-stack">
              <div className="grid grid-cols-3 gap-stack">
                {(
                  [
                    ["p50", m.p50],
                    ["p95", m.p95],
                    ["p99", m.p99],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className="flex flex-col items-center justify-center gap-0.5 rounded-[12px] border border-hairline bg-white py-2">
                    <span className="text-[10px] text-muted">{label}</span>
                    <span className="tnum text-body font-medium text-pine">{duration(v)}</span>
                  </div>
                ))}
              </div>
              {m.latency.length >= 2 ? (
                <>
                  <LineChart points={m.latency} />
                  <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
                    {(
                      [
                        ["p50", 1],
                        ["p95", 3],
                        ["p99", 5],
                      ] as const
                    ).map(([label, r]) => (
                      <li key={label} className="flex items-center gap-1.5 text-micro text-pine">
                        <span aria-hidden className="h-0.5 w-3.5 rounded-pill" style={{ background: ramp(r) }} />
                        {label}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="m-0 rounded-well bg-well px-3 py-3 text-micro text-pine/80">{DASHBOARD.latencyNeedsDays}</p>
              )}
            </Panel>
            <Panel title={DASHBOARD.endpointsTitle} radius="panel">
              {m.endpoints.rows.length ? (
                <PaginatedDataTable spec={m.endpoints} minWidth={440} pageSize={8} />
              ) : (
                <p className="m-0 py-6 text-center text-micro text-subtle">{DASHBOARD.emptyList}</p>
              )}
            </Panel>
          </div>
        </>
      )}

      <Panel title={DASHBOARD.recentTitle} radius="panel" action={<LimeLink href="/fin/scans">{DASHBOARD.recentCta}</LimeLink>}>
        {recent.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {recent.map((r, i) => (
              <li key={r.id} className={i > 0 ? "border-t border-rule" : undefined}>
                <a
                  href={`/fin/scans/view?id=${encodeURIComponent(r.id)}`}
                  className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-black/[0.02]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-pill bg-pine text-lime">
                      {r.object === "cheque" ? <Receipt className="size-4" strokeWidth={1.8} /> : <CreditCard className="size-4" strokeWidth={1.8} />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="tnum truncate font-mono text-[13px] font-medium text-pine">{summary(r)}</span>
                      <span className="truncate font-mono text-[11px] text-subtle">{r.id}</span>
                    </span>
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-3">
                    <span className="text-micro text-muted">{timeAgo(r.created_at)}</span>
                    <StatusChip status={r.status} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 py-6 text-center text-micro text-subtle">{DASHBOARD.emptyList}</p>
        )}
      </Panel>
    </>
  );
}

function RankedList({ items }: { items: { label: string; value: number }[] }) {
  if (!items.length) return <p className="m-0 py-6 text-center text-micro text-subtle">{DASHBOARD.emptyList}</p>;
  return <BarList items={items.map((i) => ({ label: i.label, value: i.value, display: count(i.value) }))} />;
}

/* ----------------------------------------------------------------------------
   Maths
---------------------------------------------------------------------------- */

function metrics(cheques: ChequeStats | null, cards: CardStats | null) {
  const parts = [cheques, cards].filter(Boolean) as (ChequeStats | CardStats)[];
  const sum = (f: (h: StatsHeadline) => number, which: "current" | "previous") => parts.reduce((s, p) => s + f(p[which]), 0);

  const total = sum((h) => h.total, "current");
  const read = sum((h) => h.by_status.read, "current");
  const partial = sum((h) => h.by_status.partial, "current");
  const unreadable = sum((h) => h.by_status.unreadable, "current");
  const lat = parts.flatMap((p) => p.current.latencies_ms);
  const prevLat = parts.flatMap((p) => p.previous.latencies_ms);

  // Volume: cheques + cards per day; the lower band is cards.
  const days = new Map<string, { cheques: number; cards: number; lat: number[] }>();
  for (const d of cheques?.series ?? []) days.set(d.date, { cheques: d.total, cards: 0, lat: [...d.latencies_ms] });
  for (const d of cards?.series ?? []) {
    const e = days.get(d.date) ?? { cheques: 0, cards: 0, lat: [] };
    e.cards = d.total;
    e.lat.push(...d.latencies_ms);
    days.set(d.date, e);
  }
  const ordered = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  const volume = ordered.map(([date, v]) => ({
    date: dayLabel(date),
    cheques: cheques ? v.cheques : 0,
    cards: cards ? v.cards : 0,
  }));
  const latency = ordered
    .filter(([, v]) => v.lat.length)
    .map(([date, v]) => ({ date: dayLabel(date), p50: percentile(v.lat, 50), p95: percentile(v.lat, 95), p99: percentile(v.lat, 99) }));

  const chequeTotal = cheques?.current.total ?? 0;
  const cardTotal = cards?.current.total ?? 0;
  const volumeLegend: Slice[] = [
    ...(cheques ? [{ label: DASHBOARD.legend.cheques, percent: round(pctOf(chequeTotal, total)), ramp: 1 as Ramp }] : []),
    ...(cards ? [{ label: DASHBOARD.legend.cards, percent: round(pctOf(cardTotal, total)), ramp: 5 as Ramp }] : []),
  ];

  const outcomes: Slice[] = [
    { label: "Read", percent: round(pctOf(read, total)), ramp: 1 },
    { label: "Partial", percent: round(pctOf(partial, total)), ramp: 4 },
    { label: "Couldn't read", percent: round(pctOf(unreadable, total)), ramp: 6 },
  ];

  const issueCounts = new Map<string, number>();
  for (const p of parts) for (const i of p.issues) issueCounts.set(i.code, (issueCounts.get(i.code) ?? 0) + i.count);
  if (cards?.expired) issueCounts.set("expired", cards.expired);
  const failures = [...issueCounts.entries()]
    .map(([code, n]) => ({ label: ISSUE_LABEL[code] ?? code.replace(/_/g, " "), value: n }))
    .sort((a, b) => b.value - a.value);

  const layoutTotal = Object.values(cheques?.standards ?? {}).reduce((s, n) => s + n, 0);
  const layoutRamp: Record<string, Ramp> = { us_business: 1, us_personal: 2, ca_cpa_006: 3, in_cts_2010: 4, br_cmc7: 5, fr_cmc7: 6 };
  const layouts: Segment[] = Object.entries(cheques?.standards ?? {})
    .sort(([, a], [, b]) => b - a)
    .map(([k, n]) => ({
      label: standardLabel(k),
      percent: round(pctOf(n, layoutTotal)),
      ramp: layoutRamp[k] ?? 7,
      inline: true,
    }));

  const endpoints: TableSpec = {
    title: DASHBOARD.endpointsTitle,
    columns: [
      { key: "endpoint", header: DASHBOARD.endpointColumns.endpoint, width: 250, emphasis: true },
      { key: "calls", header: DASHBOARD.endpointColumns.calls, width: 70 },
      { key: "p50", header: DASHBOARD.endpointColumns.p50, width: 70 },
      { key: "p95", header: DASHBOARD.endpointColumns.p95, width: 70 },
      { key: "errors", header: DASHBOARD.endpointColumns.errors, width: 70 },
    ],
    rows: parts
      .flatMap((p) => p.endpoints)
      .sort((a, b) => b.calls - a.calls)
      .map((e) => ({
        endpoint: `${e.method} ${e.path}`,
        calls: count(e.calls),
        p50: duration(e.p50_ms),
        p95: duration(e.p95_ms),
        errors: e.error_rate > 0 ? { tag: `${e.error_rate}%`, tone: e.error_rate >= 5 ? ("danger" as const) : ("caution" as const) } : "0%",
      })),
  };

  return {
    total,
    prevTotal: sum((h) => h.total, "previous"),
    read,
    prevRead: sum((h) => h.by_status.read, "previous"),
    unreadable,
    prevUnreadable: sum((h) => h.by_status.unreadable, "previous"),
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    p99: percentile(lat, 99),
    prevP50: percentile(prevLat, 50),
    volume,
    volumeLegend,
    outcomes,
    failures,
    layouts,
    latency,
    endpoints,
  };
}

function pctOf(part: number, whole: number) {
  return whole ? (part / whole) * 100 : 0;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function rate(part: number, whole: number) {
  return whole ? (part / whole) * 100 : 0;
}

/**
 * The KPI delta line. Tones follow the console: `positive` for good news,
 * `pine` for neutral. A metric with no previous period reads "New".
 */
function delta(
  now: number,
  before: number,
  unit: "count" | "pts" | "ms" | "abs",
  comparable = true,
): Pick<Kpi, "delta" | "trend" | "tone"> {
  if (!comparable || (unit !== "pts" && before === 0 && now === 0)) return { delta: "-", trend: "up", tone: "pine" };
  if (unit === "count" && before === 0) return { delta: DASHBOARD.newLabel, trend: "up", tone: "positive" };
  const diff = now - before;
  const trend = diff >= 0 ? "up" : "down";
  switch (unit) {
    case "count":
      return { delta: `${diff >= 0 ? "+" : ""}${((diff / before) * 100).toFixed(1)}%`, trend, tone: diff >= 0 ? "positive" : "pine" };
    case "pts":
      return { delta: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pts`, trend, tone: diff >= 0 ? "positive" : "pine" };
    case "ms":
      return { delta: `${diff >= 0 ? "+" : "-"}${duration(Math.abs(diff))}`, trend, tone: diff <= 0 ? "positive" : "pine" };
    case "abs":
      return { delta: `${diff >= 0 ? "+" : ""}${diff}`, trend, tone: diff <= 0 ? "positive" : "pine" };
  }
}

function summary(r: ScanResponse): string {
  if (r.status === "unreadable") return r.issue_code ? (ISSUE_LABEL[r.issue_code] ?? r.issue_code) : "Couldn't read";
  if (r.object === "cheque") return `${r.micr?.font ?? ""} · ${chequeSummary(r)}`;
  return `${r.bin?.network ?? "Card"} ${r.card ? shortPan(r.card) : ""}`;
}

/* ----------------------------------------------------------------------------
   Export
---------------------------------------------------------------------------- */

function exportCsv(cheques: ChequeStats | null, cards: CardStats | null, days: number) {
  const byDate = new Map<string, { cheques: number; chequesRead: number; cards: number; cardsRead: number }>();
  for (const d of cheques?.series ?? []) byDate.set(d.date, { cheques: d.total, chequesRead: d.read, cards: 0, cardsRead: 0 });
  for (const d of cards?.series ?? []) {
    const e = byDate.get(d.date) ?? { cheques: 0, chequesRead: 0, cards: 0, cardsRead: 0 };
    e.cards = d.total;
    e.cardsRead = d.read;
    byDate.set(d.date, e);
  }
  const lines = ["date,cheques,cheques_read,cards,cards_read,total"];
  for (const [date, v] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push([date, v.cheques, v.chequesRead, v.cards, v.cardsRead, v.cheques + v.cards].join(","));
  }
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `verisec-scans-${days}d.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

