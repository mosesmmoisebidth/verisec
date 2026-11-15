/** Display formatting shared by the Financial Portal's screens. */

/** 412 → "412 ms", 1432 → "1.4 s". */
export function duration(ms: number): string {
  if (!Number.isFinite(ms)) return "-";
  if (ms < 1) return "<1 ms";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** "2 min ago", "3 h ago", "Yesterday", "4 days ago". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

/** "2026-09-27 16:40", in the viewer's time zone. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "2026-09-27" (UTC day) → "Sep 27". */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function percent(part: number, whole: number, digits = 1): string {
  if (!whole) return "-";
  return `${((part / whole) * 100).toFixed(digits)}%`;
}

export function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** Exact percentile of raw values (nearest-rank on the sorted list). */
export function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((q / 100) * sorted.length) - 1));
  return sorted[rank] ?? 0;
}
