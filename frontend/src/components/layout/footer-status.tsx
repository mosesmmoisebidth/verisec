"use client";

import { useEffect, useState } from "react";

/**
 * Live status pill for the site footer. Reads the status monitor's feed
 * (/status/status.json, served by Caddy) and shows an overall dot + label that
 * links to the full status page. Falls back to a plain "Status" link if the
 * feed can't be reached, so it never shows a misleading green.
 */
const MAP: Record<string, { color: string; text: string }> = {
  operational: { color: "#1faa59", text: "All systems operational" },
  degraded: { color: "#e8a73b", text: "Partial degradation" },
  down: { color: "#e2514a", text: "Service disruption" },
};

export function FooterStatus() {
  const [overall, setOverall] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/status/status.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setOverall(d?.overall ?? "operational"))
      .catch(() => alive && setOverall(null));
    return () => {
      alive = false;
    };
  }, []);

  const s = overall ? (MAP[overall] ?? MAP.operational) : null;
  const color = s?.color ?? "#5b6b60";

  return (
    <a
      href="/status/"
      className="inline-flex items-center gap-2 text-lg text-pine/70 transition-colors hover:text-pine"
    >
      <span className="relative flex size-2.5">
        {s && (
          <span
            className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
            style={{ background: color }}
          />
        )}
        <span
          className="relative inline-flex size-2.5 rounded-full"
          style={{ background: color }}
        />
      </span>
      {s ? s.text : "Status"}
    </a>
  );
}
