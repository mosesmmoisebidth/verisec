"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, RotateCw, ScrollText } from "lucide-react";

import { LogsPanel, StatusPill } from "@/components/api-keys/logs-sdks";
import { Segmented, SegmentedOption } from "@/components/api-keys/parts";
import { Select } from "@/components/ui/select";
import { keysApi, type KeyCallsPage, type KeyRow } from "@/lib/console/keys-api";
import { sinceLabel } from "@/lib/console/team-api";
import type { LogsTab } from "@/lib/console/types";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import { cn } from "@/lib/utils";

const SIZE = 25;
const ALL_KEYS = "All keys";
type Outcome = "all" | "ok" | "error";

const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)} s` : `${v} ms`);

/**
 * Logs, Desktop-46, live: every call made with the organisation's API keys, and every Playground run made on a key's
 * behalf, as the API gateway saw it (refused calls too: a 403 or a 429 is exactly what a developer comes here for).
 * Newest first, refreshed every 15 seconds while the page is open. Signed out (the local preview) the frame's sample
 * rows stay.
 */
export function LiveLogs({ demo }: { demo: LogsTab }) {
  const { status } = useCurrentAccount();
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [keyId, setKeyId] = useState<string | null>(null);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [data, setData] = useState<KeyCallsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await keysApi.logs({ page, size: SIZE, keyId: keyId ?? undefined, outcome: outcome === "all" ? undefined : outcome });
      setData(r);
      setError(null);
      setAt(Date.now());
    } catch (e) {
      setError((e as Error).message || "The logs could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, [page, keyId, outcome]);

  useEffect(() => {
    if (status !== "authed") return;
    // the rows arrive after the request: the state is set then, not during the effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    return () => window.clearInterval(t);
  }, [status, load]);

  useEffect(() => {
    if (status !== "authed") return;
    keysApi
      .list()
      .then((r) => setKeys(r.keys))
      .catch(() => undefined);
  }, [status]);

  if (status === "anon") return <LogsPanel data={demo} />;

  const name = (id: string) => keys.find((k) => k.id === id)?.name ?? id;
  const keyLabel = (k: KeyRow) => `${k.name} (${k.key})`;
  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;
  const from = data && data.total ? (data.page - 1) * SIZE + 1 : 0;
  const to = data ? Math.min(data.total, data.page * SIZE) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-panel p-1">
            <Segmented>
              {(
                [
                  ["all", "All"],
                  ["ok", "Successful"],
                  ["error", "Errors"],
                ] as const
              ).map(([id, label]) => (
                <SegmentedOption
                  key={id}
                  active={outcome === id}
                  onClick={() => {
                    setOutcome(id);
                    setPage(1);
                  }}
                >
                  {label}
                </SegmentedOption>
              ))}
            </Segmented>
          </span>
          {keys.length ? (
            <Select
              options={[ALL_KEYS, ...keys.map(keyLabel)]}
              value={keyId ? keyLabel(keys.find((k) => k.id === keyId) ?? keys[0]!) : ALL_KEYS}
              onValueChange={(v) => {
                setKeyId(v === ALL_KEYS ? null : (keys.find((k) => keyLabel(k) === v)?.id ?? null));
                setPage(1);
              }}
              label="Show the calls of one key"
              icon={KeyRound}
              className="h-9 max-w-[280px] rounded-pill border border-edge bg-page pr-8 pl-9 font-mono text-[12px] text-pine"
            />
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-slate">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-ramp-2" />
            Live{at ? `, updated ${sinceLabel(new Date(at).toISOString())?.toLowerCase()}` : ""}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            aria-label="Refresh the logs"
            className="grid size-9 place-items-center rounded-pill border border-edge bg-page text-pine transition-colors hover:bg-hover-light disabled:opacity-50"
          >
            <RotateCw aria-hidden className={cn("size-4", busy && "animate-spin")} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-shell border border-hairline bg-panel">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[1fr_120px_120px_160px] items-center gap-4 border-b border-edge bg-well px-5 py-3 text-eyebrow font-medium tracking-[0.3px] text-slate uppercase">
              <span>{demo.columns.endpoint}</span>
              <span>{demo.columns.status}</span>
              <span>{demo.columns.latency}</span>
              <span>{demo.columns.when}</span>
            </div>

            {!data && !error ? (
              <p className="m-0 flex items-center justify-center gap-2 px-5 py-14 text-body text-slate">
                <Loader2 aria-hidden className="size-4 animate-spin" /> Loading your API calls
              </p>
            ) : error && !data ? (
              <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                <p className="m-0 text-body text-slate">{error}</p>
                <button type="button" onClick={() => void load()} className="rounded-pill bg-lime px-4 py-2 text-micro font-medium text-pine">
                  Try again
                </button>
              </div>
            ) : data && data.calls.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                <span aria-hidden className="grid size-12 place-items-center rounded-pill bg-well text-slate">
                  <ScrollText className="size-5" strokeWidth={1.8} />
                </span>
                <p className="m-0 text-body font-medium text-pine">
                  {outcome === "all" && !keyId ? "No API calls yet" : "No calls match these filters"}
                </p>
                <p className="m-0 max-w-[440px] text-body text-slate">
                  Calls made with your API keys, and runs from the Playground, show here a few seconds after they happen.
                </p>
                <Link href="/api-keys/playground/" className="rounded-pill bg-lime px-4 py-2 text-micro font-medium text-pine">
                  Open the Playground
                </Link>
              </div>
            ) : (
              data?.calls.map((c, i) => (
                <div
                  key={`${c.at}-${i}`}
                  className="grid grid-cols-[1fr_120px_120px_160px] items-center gap-4 border-b border-edge px-5 py-3.5 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-mono text-[13.5px] break-all text-pine">
                      <span className="text-pine/55">{c.method}</span> {c.path}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate">
                      <KeyRound aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
                      {name(c.key_id)}
                      {c.source === "playground" ? (
                        <span className="rounded-pill bg-lime-tint px-2 py-0.5 text-[11px] font-medium text-pine">Playground</span>
                      ) : null}
                    </span>
                  </span>
                  <span>
                    <StatusPill status={c.status} />
                  </span>
                  <span className="tnum text-body font-medium text-pine">{ms(c.ms)}</span>
                  <span className="text-body text-slate" title={new Date(c.at).toLocaleString()}>
                    {sinceLabel(c.at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {data && data.total > SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-5 py-3 text-[12.5px] text-slate">
            <span className="tnum">
              {from}-{to} of {data.total.toLocaleString()} calls
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-pill border border-edge bg-page px-3 py-1.5 text-pine hover:bg-hover-light disabled:opacity-40"
              >
                Newer
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="rounded-pill border border-edge bg-page px-3 py-1.5 text-pine hover:bg-hover-light disabled:opacity-40"
              >
                Older
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
