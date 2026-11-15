"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Clock, History, KeyRound, RotateCcw, Search, X } from "lucide-react";

import { EndpointRow } from "@/components/api-keys/playground-endpoint";
import type { Endpoint, RunRecord } from "@/components/api-keys/playground-endpoint";
import { GroupTile } from "@/components/api-keys/playground-parts";
import type { PlaygroundTab } from "@/lib/console/types";
import { fetchCatalog } from "@/lib/console/playground-run";
import { Select } from "@/components/ui/select";
import { billingApi, credits as fmtCredits } from "@/lib/console/billing-api";
import { keysApi, type KeyRow } from "@/lib/console/keys-api";
import type { PgGroup } from "@/lib/console/playground-run";
import { cn } from "@/lib/utils";

const PAGE = 10;

/**
 * The API Playground: every live sellable API, one row each, ten to a page. A row opens into a full request console:
 * the endpoint's typed parameters (the schema is the form), raw JSON, headers and authorisation on the left, and live
 * code plus the full response on the dark side. Runs are encrypted end to end: an image is sealed in this browser and
 * the console only ever passes on a token.
 */
export function Playground({ data }: { data: PlaygroundTab }) {
  const [groups, setGroups] = useState<PgGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const runKey = useRef(0);
  // the key every run is made with (remembered in this browser), what each API costs, and the credits left
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Map<string, string>>(() => new Map());
  const [left, setLeft] = useState<number | null>(null);
  const refreshCredits = () =>
    void billingApi.summary().then((r) => r.ok && setLeft(r.data.account.available));
  useEffect(() => {
    keysApi
      .list()
      .then((r) => {
        const active = r.keys.filter((k) => k.status === "active");
        setKeys(active);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem("verisec.playground.key");
        } catch {}
        setKeyId(active.find((k) => k.id === saved)?.id ?? active[0]?.id ?? null);
      })
      .catch(() => setKeys([]));
    keysApi
      .catalog()
      .then((c) => setPrices(new Map((c.apis ?? []).map((x) => [x.id, `${x.dynamic ? "up to " : ""}${fmtCredits(x.price)} credits`]))))
      .catch(() => undefined);
    refreshCredits();
  }, []);
  const chosen = keys?.find((k) => k.id === keyId) ?? null;
  const keyLabel = (k: KeyRow) => `${k.name} (${k.key})`;
  const pickKey = (label: string) => {
    const k = keys?.find((x) => keyLabel(x) === label);
    if (!k) return;
    setKeyId(k.id);
    try {
      localStorage.setItem("verisec.playground.key", k.id);
    } catch {}
  };

  useEffect(() => {
    let live = true;
    fetchCatalog()
      .then((g) => {
        if (!live) return;
        setGroups(g);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [attempt]);

  // a link can open the Playground on one product (?group=MRZ), e.g. from the Solutions page
  const linked = useRef(false);
  useEffect(() => {
    if (!groups || linked.current) return;
    linked.current = true;
    const g = new URLSearchParams(window.location.search).get("group");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (g && groups.some((x) => x.group === g)) setGroup(g);
  }, [groups]);

  // "/" jumps to search, as in most developer tools
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all = useMemo<Endpoint[]>(() => (groups ?? []).flatMap((g) => g.endpoints.map((e) => ({ ...e, group: g.group }))), [groups]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((e) => (group === "All" || e.group === group) && (!q || `${e.name} ${e.path} ${e.summary} ${e.id}`.toLowerCase().includes(q)));
  }, [all, group, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const onPage = useMemo(() => new Set(filtered.slice(current * PAGE, current * PAGE + PAGE).map((e) => e.id)), [filtered, current]);

  const toggle = (id: string) => {
    setOpenId((o) => (o === id ? null : id));
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)));
  };

  const openFromHistory = (id: string) => {
    setQuery("");
    setGroup("All");
    const idx = all.findIndex((e) => e.id === id);
    if (idx >= 0) setPage(Math.floor(idx / PAGE));
    setOpenId(id);
    setVisited((v) => new Set(v).add(id));
    setHistoryOpen(false);
    setTimeout(() => document.getElementById(`ep-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <section className="flex flex-col gap-4">
      {/* search, product filter, key, history */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative min-w-[240px] flex-1 sm:max-w-[440px]">
            <span className="sr-only">Search endpoints</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-search-glyph" strokeWidth={1.9} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={all.length ? `Search ${all.length} endpoints` : "Search endpoints"}
              className="h-11 w-full rounded-pill border border-edge bg-page pr-12 pl-10 text-[14px] text-pine outline-none transition-colors placeholder:text-placeholder hover:border-[#cbd3dd] focus:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/60"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-[6px] border border-edge bg-panel px-2 py-0.5 font-sans text-[11px] font-medium text-keycap-ink">/</kbd>
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-pass-tint px-3 text-[12px] font-medium text-ramp-2">
              <span aria-hidden className={cn("size-2 rounded-pill", groups ? "bg-ramp-3" : "bg-icon-soft")} />
              {groups ? "Live engines" : "Connecting"}
            </span>
            {left !== null ? (
              <span className="tnum inline-flex h-9 items-center rounded-pill border border-edge bg-page px-3 text-[12px] font-medium text-pine">
                {fmtCredits(left)} credits left
              </span>
            ) : null}
            {keys && keys.length ? (
              <span className="inline-flex h-9 items-center gap-1 rounded-pill border border-edge bg-page pr-1.5 pl-1">
                <Select
                  options={keys.map(keyLabel)}
                  value={chosen ? keyLabel(chosen) : ""}
                  onValueChange={pickKey}
                  label="API key the runs are made with"
                  icon={KeyRound}
                  menuAlign="end"
                  className="h-8 max-w-[260px] rounded-pill bg-transparent pr-8 pl-9 font-mono text-[12px] text-pine"
                />
                <a href={data.manageKeysHref} className="rounded-pill bg-well px-2.5 py-1 text-[11.5px] font-medium text-pine hover:bg-hover-panel">
                  {data.manageKeysLabel}
                </a>
              </span>
            ) : keys ? (
              <span className="inline-flex h-9 items-center gap-2 rounded-pill border border-edge bg-page pr-1.5 pl-3">
                <KeyRound aria-hidden className="size-4 shrink-0 text-slate" strokeWidth={1.8} />
                <span className="text-[12px] text-slate">No API key yet</span>
                <a href={data.manageKeysHref} className="rounded-pill bg-lime px-2.5 py-1 text-[11.5px] font-medium text-pine hover:brightness-95">
                  Create a key
                </a>
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-pill border border-edge bg-page px-3.5 text-[12.5px] font-medium text-pine transition-colors hover:bg-hover-light"
            >
              <History aria-hidden className="size-4" strokeWidth={1.9} />
              History
              <span className={cn("tnum rounded-pill px-1.5 py-px text-[10.5px] font-semibold", runs.length ? "bg-pine text-lime" : "bg-well text-slate")}>{runs.length}</span>
            </button>
          </div>
        </div>

        <div role="tablist" aria-label="Product" className="flex flex-wrap items-center gap-2">
          {["All", ...(groups ?? []).map((g) => g.group)].map((g) => {
            const active = g === group;
            const count = g === "All" ? all.length : all.filter((e) => e.group === g).length;
            return (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setGroup(g);
                  setPage(0);
                }}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-pill border pr-3 text-[13px] font-medium transition-colors",
                  g === "All" ? "pl-4" : "pl-1.5",
                  active ? "border-pine bg-pine text-lime" : "border-edge bg-page text-pine hover:border-pine/30",
                )}
              >
                {g !== "All" ? <GroupTile group={g} size="sm" /> : null}
                {g}
                <span className={cn("tnum rounded-pill px-1.5 py-px text-[11px]", active ? "bg-lime/20 text-lime" : "bg-well text-slate")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* the endpoints */}
      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-shell border border-danger/20 bg-danger-tint px-5 py-4">
          <p className="m-0 min-w-0 flex-1 text-[13.5px] text-danger">{error}</p>
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-page px-3.5 text-[12.5px] font-medium text-pine ring-1 ring-danger/20 hover:bg-hover-light">
            <RotateCcw aria-hidden className="size-3.5" strokeWidth={1.9} />
            Try again
          </button>
        </div>
      ) : null}

      {!groups && !error ? (
        <div className="overflow-hidden rounded-shell border border-edge bg-page" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3.5 border-b border-rule px-5 py-4 last:border-0">
              <span className="size-10 rounded-[12px] bg-well motion-safe:animate-pulse" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-3 w-48 rounded-[4px] bg-well motion-safe:animate-pulse" />
                <span className="h-2.5 w-64 rounded-[4px] bg-well motion-safe:animate-pulse" />
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {groups ? (
        <div className="overflow-hidden rounded-shell border border-edge bg-page shadow-flow">
          {all.map((ep) => (
            <EndpointRow
              key={ep.id}
              ep={ep}
              open={openId === ep.id}
              mounted={visited.has(ep.id)}
              hidden={!onPage.has(ep.id)}
              onToggle={() => toggle(ep.id)}
              onRun={(r) => {
                setRuns((old) => [{ ...r, key: ++runKey.current }, ...old].slice(0, 100));
                refreshCredits();
              }}
              recent={runs.filter((r) => r.id === ep.id).slice(0, 4)}
              apiKeyLabel={chosen ? chosen.key : "No key chosen"}
              manageKeysHref={data.manageKeysHref}
              keyId={keyId}
              keyState={keys === null ? "loading" : keys.length ? "some" : "none"}
              price={prices.get(ep.id)}
            />
          ))}
          {!filtered.length ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span className="grid size-12 place-items-center rounded-pill bg-well text-slate">
                <Search aria-hidden className="size-5" strokeWidth={1.8} />
              </span>
              <p className="m-0 text-[14px] font-medium text-pine">{`No endpoint matches “${query}”`}</p>
              <p className="m-0 text-[12.5px] text-slate">Try a product name, a path such as /v1/face, or what the API does.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setGroup("All");
                }}
                className="mt-1 h-9 rounded-pill border border-edge bg-page px-4 text-[12.5px] font-medium text-pine hover:bg-hover-light"
              >
                Clear the search
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {groups && filtered.length > PAGE ? (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
          <span className="tnum text-[12.5px] text-slate">{`Showing ${current * PAGE + 1} to ${Math.min(filtered.length, (current + 1) * PAGE)} of ${filtered.length}`}</span>
          <div className="flex items-center gap-1.5">
            <PagerButton disabled={current === 0} onClick={() => setPage(current - 1)} label="Previous page">
              <ChevronLeft aria-hidden className="size-4" strokeWidth={2.2} />
            </PagerButton>
            {Array.from({ length: pages }, (_, i) => i).map((i) => (
              <button
                key={i}
                type="button"
                aria-current={i === current ? "page" : undefined}
                onClick={() => setPage(i)}
                className={cn(
                  "tnum h-9 min-w-9 rounded-pill border px-3 text-[12.5px] font-semibold transition-colors",
                  i === current ? "border-pine bg-pine text-lime" : "border-edge bg-page text-pine hover:bg-hover-light",
                )}
              >
                {i + 1}
              </button>
            ))}
            <PagerButton disabled={current >= pages - 1} onClick={() => setPage(current + 1)} label="Next page">
              <ChevronRight aria-hidden className="size-4" strokeWidth={2.2} />
            </PagerButton>
          </div>
        </nav>
      ) : null}

      <HistoryDrawer open={historyOpen} runs={runs} onClose={() => setHistoryOpen(false)} onPick={openFromHistory} onClear={() => setRuns([])} />
    </section>
  );
}

function PagerButton({ children, label, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      {...rest}
      className="grid size-9 place-items-center rounded-pill border border-edge bg-page text-pine transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-page"
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------------------
   History: every run this session, newest first
---------------------------------------------------------------------------- */

function HistoryDrawer({ open, runs, onClose, onPick, onClear }: { open: boolean; runs: RunRecord[]; onClose: () => void; onPick: (id: string) => void; onClear: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close history" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-pine/10 backdrop-blur-[3px] duration-200 animate-in fade-in" />
      <aside
        role="dialog"
        aria-label="Run history"
        className="absolute top-4 right-4 bottom-4 flex w-[calc(100%-2rem)] max-w-[460px] flex-col overflow-hidden rounded-[22px] border border-edge bg-page shadow-[0_28px_70px_-16px_rgb(14_50_40/0.45)] duration-200 animate-in slide-in-from-right-4 fade-in"
      >
        <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
          <span className="grid size-9 place-items-center rounded-pill bg-lime-tint text-pine">
            <History aria-hidden className="size-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[17px] font-semibold text-pine">Run history</h2>
            <p className="m-0 text-[12px] text-slate">{runs.length ? `${runs.length} ${runs.length === 1 ? "run" : "runs"} this session` : "Nothing run yet"}</p>
          </div>
          {runs.length ? (
            <button type="button" onClick={onClear} className="h-8 rounded-pill border border-edge px-3 text-[12px] font-medium text-pine hover:bg-hover-light">
              Clear
            </button>
          ) : null}
          <button type="button" aria-label="Close history" onClick={onClose} className="grid size-9 place-items-center rounded-pill text-pine/60 hover:bg-hover-light hover:text-pine">
            <X aria-hidden className="size-5" strokeWidth={1.9} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {!runs.length ? (
            <div className="m-auto flex max-w-[300px] flex-col items-center gap-2 text-center">
              <span className="grid size-12 place-items-center rounded-pill bg-well text-slate">
                <Clock aria-hidden className="size-5" strokeWidth={1.8} />
              </span>
              <p className="m-0 text-[14px] font-medium text-pine">You have not run a request yet</p>
              <p className="m-0 text-[12.5px] text-slate">Open an endpoint and press Send. Each run appears here with its status and timing.</p>
            </div>
          ) : (
            runs.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onPick(r.id)}
                className="flex w-full items-center gap-3 rounded-[14px] border border-edge bg-page px-3.5 py-3 text-left transition-colors hover:border-pine/25 hover:bg-hover-light"
              >
                <GroupTile group={r.group} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-pine">{r.name}</span>
                  <span className="block truncate font-mono text-[11px] text-slate">{r.path}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-semibold", r.tone === "ok" ? "bg-pass-tint text-ramp-2" : r.tone === "warn" ? "bg-caution-tint text-caution" : "bg-danger-tint text-danger")}>
                    <span aria-hidden className={cn("size-1.5 rounded-pill", r.tone === "ok" ? "bg-ramp-3" : r.tone === "warn" ? "bg-caution" : "bg-danger")} />
                    {r.status}
                  </span>
                  <span className="tnum text-[11px] text-slate">{`${r.latency}  ${r.at}`}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
