import { ramp } from "@/components/charts/charts";
import type { Slice } from "@/lib/console/types";

/**
 * The outcome ring: the console donut's look (34px round-capped arcs with a
 * clear gap, big figure in the middle) with one difference that matters here.
 *
 * The console donut trims a fixed 13° from both ends of every arc, so any
 * slice under ~7% vanishes and one just over it shrinks to a dot. On a
 * scanning dashboard the small slices ARE the story ("couldn't read" at 3%),
 * so every non-zero outcome gets at least `MIN_SWEEP` of ring, borrowed from
 * the largest. The legend beside it keeps the exact percentages.
 */
const SIZE = 210;
const THICK = 34;
const C = SIZE / 2;
const R = C - THICK / 2;
const INSET = 13;
const MIN_SWEEP = 40;

export function OutcomeRing({ slices, centerLabel, centerValue }: { slices: Slice[]; centerLabel: string; centerValue: string }) {
  const nz = slices.filter((s) => s.percent > 0);
  const total = nz.reduce((s, x) => s + x.percent, 0) || 1;

  let sweeps = nz.map((s) => (s.percent / total) * 360);
  if (nz.length > 1) {
    const deficit = sweeps.reduce((d, v) => d + Math.max(0, MIN_SWEEP - v), 0);
    const roomy = sweeps.reduce((d, v) => d + (v > MIN_SWEEP ? v - MIN_SWEEP : 0), 0) || 1;
    sweeps = sweeps.map((v) => (v < MIN_SWEEP ? MIN_SWEEP : v - ((v - MIN_SWEEP) / roomy) * deficit));
  }
  const bounds = sweeps.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], [0]);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-auto w-full max-w-[210px]"
      role="img"
      aria-label={slices.map((s) => `${s.label} ${s.percent}%`).join(", ")}
    >
      {nz.length === 1 ? (
        <circle cx={C} cy={C} r={R} fill="none" stroke={ramp(nz[0]!.ramp)} strokeWidth={THICK} />
      ) : (
        nz.map((s, i) => (
          <path
            key={s.label}
            d={arc((bounds[i] ?? 0) + INSET, (bounds[i + 1] ?? 0) - INSET)}
            fill="none"
            stroke={ramp(s.ramp)}
            strokeWidth={THICK}
            strokeLinecap="round"
          />
        ))
      )}
      <text x={C} y={C - 7} textAnchor="middle" fill="var(--color-subtle)" fontSize={8.5}>
        {centerLabel}
      </text>
      <text x={C} y={C + 13} textAnchor="middle" fill="var(--color-pine)" fontSize={22} fontWeight={500}>
        {centerValue}
      </text>
    </svg>
  );
}

function arc(from: number, to: number): string {
  const a = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = C + R * Math.cos(a(from));
  const y1 = C + R * Math.sin(a(from));
  const x2 = C + R * Math.cos(a(to));
  const y2 = C + R * Math.sin(a(to));
  const large = to - from > 180 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}
