"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { LogsPanel } from "@/components/api-keys/logs-sdks";
import { GhostButton, Loading, Notice, RetryButton, StatePanel } from "@/components/finance/parts";
import { finApi } from "@/lib/finance/api";
import { LOGS } from "@/lib/finance/content";
import { duration, stamp, timeAgo } from "@/lib/finance/format";
import type { LogEntry } from "@/lib/finance/types";

type Load = { kind: "loading" } | { kind: "offline" } | { kind: "ready"; rows: LogEntry[]; partial: boolean };

/** Every call the MICR and Card APIs served, newest first, in the console's log table. */
export function LiveLogs() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  // Bumped by Refresh; the effect re-fetches on change.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([finApi.logs("micr", 100), finApi.logs("card", 100)]).then(([m, c]) => {
      if (!alive) return;
      const rows = [...(m.status === "fulfilled" ? m.value.data : []), ...(c.status === "fulfilled" ? c.value.data : [])];
      const failed = [m, c].filter((r) => r.status === "rejected").length;
      setLoad(
        failed === 2
          ? { kind: "offline" }
          : { kind: "ready", rows: rows.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 100), partial: failed === 1 },
      );
    });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const refresh = () => {
    setLoad({ kind: "loading" });
    setNonce((n) => n + 1);
  };

  if (load.kind === "loading") return <Loading label={LOGS.loading} />;
  if (load.kind === "offline") {
    return <StatePanel title={LOGS.offline} action={<RetryButton label={LOGS.refresh} onClick={refresh} />} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {load.partial ? <Notice tone="warning">{LOGS.partialOffline}</Notice> : <span />}
        <GhostButton icon={RefreshCw} onClick={refresh}>
          {LOGS.refresh}
        </GhostButton>
      </div>
      {load.rows.length === 0 ? (
        <StatePanel title={LOGS.empty} />
      ) : (
        <LogsPanel
          data={{
            columns: LOGS.columns,
            rows: load.rows.map((r) => ({
              method: r.method,
              path: r.path,
              status: r.status,
              latency: duration(r.ms),
              when: `${timeAgo(r.ts)} · ${stamp(r.ts).slice(11)}`,
            })),
          }}
        />
      )}
    </div>
  );
}
