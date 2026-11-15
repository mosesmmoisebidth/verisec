/**
 * The dashboard's four chart types, as plain SVG.
 *
 * Hand-rolled rather than pulled from a chart library on purpose: the frame
 * specifies exact fills from the brand ramp, a fixed grid, and axis labels at
 * 11.28px, and every library then needs a theme layer plus overrides to be
 * talked out of its own defaults. Four small pure functions are less code than
 * that adapter, they render on the server with no client bundle, and there is
 * nothing to keep in sync when the ramp changes.
 *
 * Each chart draws into a fixed viewBox and scales with the card. Strokes use
 * `vector-effect="non-scaling-stroke"` so a line stays 1.5px whatever width the
 * container ends up at.
 */

import type { Axis, Ramp, Slice } from "@/lib/console/types";

const RAMP = [
  "var(--color-ramp-1)",
  "var(--color-ramp-2)",
  "var(--color-ramp-3)",
  "var(--color-ramp-4)",
  "var(--color-ramp-5)",
  "var(--color-ramp-6)",
  "var(--color-ramp-7)",
];

export function ramp(i: Ramp): string {
  // `Ramp` is 1..7 and RAMP has seven entries, but the compiler cannot see that
  // through an index, so the darkest shade is the floor rather than `!`.
  return RAMP[i - 1] ?? RAMP[0]!;
}

/* ----------------------------------------------------------------------------
   Shared plot frame
---------------------------------------------------------------------------- */

const PAD = { top: 10, right: 6, bottom: 24, left: 40 };

interface Frame {
  w: number;
  h: number;
  x0: number;
  y0: number;
  pw: number;
  ph: number;
}

function frame(w: number, h: number): Frame {
  return {
    w,
    h,
    x0: PAD.left,
    y0: PAD.top,
    pw: w - PAD.left - PAD.right,
    ph: h - PAD.top - PAD.bottom,
  };
}

/**
 * Scale helpers.
 *
 * A chart must never be forced to invent its own numbers, but it must also never
 * clip. The data layer pins `max`/`yTicks` to match the frame; when it leaves
 * them off — which is what live data should do — these derive a rounded ceiling
 * above the largest value, so serving 500 on a chart the frame drew at 400 grows
 * the axis instead of cutting the line off.
 */
export function niceMax(values: number[]): number {
  const peak = Math.max(...values, 1);
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  // Round up to 1/2/4/5/8/10 x the magnitude — the steps that divide into four
  // whole gridlines. `8` was missing, which left a gap: any peak between 5 and
  // 10 x the magnitude jumped straight to 10, so a chart peaking at 662 drew a
  // 1000 ceiling and wasted a third of its height. 8 x 100 gives the 0/200/400/
  // 600/800 axis the billing frame draws, from the data rather than from a
  // pinned number.
  for (const step of [1, 2, 4, 5, 8, 10]) {
    const candidate = step * magnitude;
    if (candidate >= peak) return candidate;
  }
  return 10 * magnitude;
}

/** Four evenly spaced gridlines, zero included. */
export function niceTicks(max: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => Math.round((max / 4) * i));
}

/** Label every nth x value when the data layer names none. */
function autoTicks(dates: string[]): string[] {
  const stride = Math.max(1, Math.ceil(dates.length / 7));
  return dates.filter((_, i) => i % stride === 0);
}

/**
 * A smooth path through the points, as cubic béziers (Catmull-Rom, tension 1/6).
 *
 * The updated volume and latency frames draw every trend as a flowing curve, not
 * the old segmented polyline — so the line and the area's top edge are both built
 * from this rather than straight `L` commands. Endpoints reuse their neighbour as
 * the phantom control point, so the curve starts and ends flush with the data.
 *
 * Each segment's control points are held between its two end values, so the curve
 * never overshoots: live data (a spike after a flat run) would otherwise draw a dip
 * below zero or a peak above the real one.
 */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) {
    return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  }
  let d = `M${pts[0]![0].toFixed(2)},${pts[0]![1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    // `noUncheckedIndexedAccess` types every `pts[k]` as possibly-undefined; the
    // loop bounds guarantee `i` and `i+1` are in range, and the neighbours fall
    // back to them, so the non-null assertions are safe.
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const hold = (v: number) => Math.min(hi, Math.max(lo, v));
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = hold(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = hold(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

/** Horizontal grid + y labels. Ticks are given bottom-to-top. */
function YAxis({ f, ticks, max }: { f: Frame; ticks: number[]; max: number }) {
  return (
    <g>
      {ticks.map((t) => {
        const y = f.y0 + f.ph - (t / max) * f.ph;
        return (
          <g key={t}>
            <line
              x1={f.x0}
              x2={f.x0 + f.pw}
              y1={y}
              y2={y}
              stroke="var(--color-rule)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={f.x0 - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--color-muted)"
              fontSize={9.5}
            >
              {t}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * X labels, placed at the position of the date they name rather than spread
 * evenly — the frame's ticks are not equidistant (…07-25, 07-30, 08-04), so
 * even spacing would put every label a few days off its own data point.
 */
function XAxis({ f, dates, ticks }: { f: Frame; dates: string[]; ticks: string[] }) {
  const step = dates.length > 1 ? f.pw / (dates.length - 1) : 0;
  return (
    <g>
      {ticks.map((t) => {
        const i = dates.indexOf(t);
        if (i < 0) return null;
        const x = f.x0 + i * step;
        return (
          <text
            key={t}
            x={x}
            y={f.y0 + f.ph + 15}
            textAnchor="middle"
            fill="var(--color-muted)"
            fontSize={9}
          >
            {t}
          </text>
        );
      })}
    </g>
  );
}

/* ----------------------------------------------------------------------------
   Stacked area, verification volume
---------------------------------------------------------------------------- */

export function AreaChart({
  points,
  axis = {},
  width = 668,
  height = 244,
}: {
  points: { date: string; total: number; approved: number }[];
  axis?: Axis;
  width?: number;
  height?: number;
}) {
  const f = frame(width, height);
  const dates = points.map((p) => p.date);
  const max = axis.max ?? niceMax(points.map((p) => p.total));
  const yTicks = axis.yTicks ?? niceTicks(max);
  const ticks = axis.xTicks ?? autoTicks(dates);
  const step = f.pw / (points.length - 1);
  const x = (i: number) => f.x0 + i * step;
  const y = (v: number) => f.y0 + f.ph - (v / max) * f.ph;

  // Curved top edges — the updated frame draws the bands as flowing areas.
  const curve = (get: (p: (typeof points)[number]) => number) =>
    smoothPath(points.map((p, i) => [x(i), y(get(p))]));

  const base = `L${x(points.length - 1).toFixed(2)},${y(0).toFixed(2)} L${x(0).toFixed(2)},${y(0).toFixed(2)} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Verification volume over the last 30 days"
    >
      <YAxis f={f} ticks={yTicks} max={max} />
      {/* Upper band drawn first and filled to zero, then the lower band paints
          over its bottom portion. Two fills, no clip paths, no seam. */}
      <path d={`${curve((p) => p.total)} ${base}`} fill="var(--color-ramp-1)" />
      <path d={`${curve((p) => p.approved)} ${base}`} fill="var(--color-ramp-5)" />
      <path
        d={curve((p) => p.total)}
        fill="none"
        stroke="var(--color-ramp-1)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <XAxis f={f} dates={dates} ticks={ticks} />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   Multi-line, latency percentiles
---------------------------------------------------------------------------- */

export function LineChart({
  points,
  axis = {},
  width = 487,
  height = 207,
}: {
  points: { date: string; p50: number; p95: number; p99: number }[];
  axis?: Axis;
  width?: number;
  height?: number;
}) {
  const f = frame(width, height);
  const dates = points.map((p) => p.date);
  const max = axis.max ?? niceMax(points.map((p) => p.p99));
  const yTicks = axis.yTicks ?? niceTicks(max);
  const ticks = axis.xTicks ?? autoTicks(dates);
  const step = f.pw / (points.length - 1);
  const x = (i: number) => f.x0 + i * step;
  const y = (v: number) => f.y0 + f.ph - (v / max) * f.ph;

  const series: { key: "p99" | "p95" | "p50"; color: string }[] = [
    { key: "p99", color: "var(--color-ramp-5)" },
    { key: "p95", color: "var(--color-ramp-3)" },
    { key: "p50", color: "var(--color-ramp-1)" },
  ];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Latency at the 50th, 95th and 99th percentile"
    >
      <YAxis f={f} ticks={yTicks} max={max} />
      {series.map(({ key, color }) => (
        <path
          key={key}
          d={smoothPath(points.map((p, i) => [x(i), y(p[key])]))}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <XAxis f={f} dates={dates} ticks={ticks} />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   Stacked bars, error rate
---------------------------------------------------------------------------- */

export function BarChart({
  points,
  axis = {},
  width = 487,
  height = 207,
}: {
  points: { date: string; c4xx: number; c5xx: number }[];
  axis?: Axis;
  width?: number;
  height?: number;
}) {
  const f = frame(width, height);
  const dates = points.map((p) => p.date);
  const max = axis.max ?? niceMax(points.map((p) => p.c4xx + p.c5xx));
  const yTicks = axis.yTicks ?? niceTicks(max);
  const ticks = axis.xTicks ?? autoTicks(dates);
  const slot = f.pw / points.length;
  const bar = Math.max(3, slot * 0.62);
  const y = (v: number) => f.y0 + f.ph - (v / max) * f.ph;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="4xx and 5xx error counts per day"
    >
      <YAxis f={f} ticks={yTicks} max={max} />
      {points.map((p, i) => {
        const cx = f.x0 + i * slot + slot / 2 - bar / 2;
        const h4 = f.ph * (p.c4xx / max);
        const h5 = f.ph * (p.c5xx / max);
        return (
          <g key={p.date}>
            <rect x={cx} y={y(p.c4xx)} width={bar} height={Math.max(0, h4)} fill="var(--color-ramp-2)" />
            <rect
              x={cx}
              y={y(p.c4xx + p.c5xx)}
              width={bar}
              height={Math.max(0, h5)}
              fill="var(--color-ramp-5)"
            />
          </g>
        );
      })}
      <XAxis f={f} dates={dates} ticks={ticks} />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   Donut
---------------------------------------------------------------------------- */

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const a = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(a(from));
  const y1 = cy + r * Math.sin(a(from));
  const x2 = cx + r * Math.cos(a(to));
  const y2 = cy + r * Math.sin(a(to));
  const large = to - from > 180 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

/**
 * Ring chart.
 *
 * The frame's percentages do not sum to 100 (outcomes read 45/18/17/10 = 90)
 * yet it draws a closed ring, so the arcs are normalised to their own total
 * while the printed legend keeps the designed numbers. When these become real
 * measurements the normalisation should go with the sample data.
 */
export function Donut({
  slices,
  centerLabel,
  centerValue,
  size = 210,
  thickness = 34,
}: {
  slices: Slice[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  thickness?: number;
}) {
  const total = slices.reduce((s, x) => s + x.percent, 0) || 1;
  const c = size / 2;
  const r = c - thickness / 2;
  // Round-capped segments with a CLEAR gap between them, like the frame. The
  // round cap fattens each end, so a too-small gap reads as a continuous ring —
  // the visible separation is roughly `2*inset` minus the cap's own reach, so
  // the inset has to be a good bit larger than the cap radius to show daylight.
  const inset = 13; // degrees trimmed from each end of every segment (bigger ⇒ wider gaps)

  // Cumulative boundary angles resolved BEFORE the JSX — a running total mutated
  // inside a render callback is exactly what the compiler may memoize, and a
  // memoized accumulator is a stale one.
  const bounds = slices.reduce<number[]>(
    (acc, s) => [...acc, acc[acc.length - 1]! + (s.percent / total) * 360],
    [0],
  );
  const arcs = slices.map((s, i) => ({
    label: s.label,
    ramp: s.ramp,
    from: bounds[i]! + inset,
    to: bounds[i + 1]! - inset,
  }));

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-auto w-full max-w-[210px]"
      role="img"
      aria-label={slices.map((s) => `${s.label} ${s.percent}%`).join(", ")}
    >
      {arcs.map((a) =>
        a.to <= a.from ? null : (
          <path
            key={a.label}
            d={arc(c, c, r, a.from, a.to)}
            fill="none"
            stroke={ramp(a.ramp)}
            strokeWidth={thickness}
            strokeLinecap="round"
          />
        ),
      )}
      {centerLabel && (
        <text x={c} y={c - 7} textAnchor="middle" fill="var(--color-subtle)" fontSize={8.5}>
          {centerLabel}
        </text>
      )}
      {centerValue && (
        <text
          x={c}
          y={c + 13}
          textAnchor="middle"
          fill="var(--color-pine)"
          fontSize={22}
          fontWeight={500}
        >
          {centerValue}
        </text>
      )}
    </svg>
  );
}

/**
 * Dot + label + percent.
 *
 * Two layouts, because the frame uses both. `grid` is the two-up block under
 * the outcome donut, where equal columns line the percentages up. `row` is the
 * single wrapping line under the connection bar and the webhook donut, where
 * items must size to their own content — a fixed column count there squeezes
 * "Delivered" into an ellipsis.
 */
export function Legend({
  items,
  layout = "grid",
  columns = 2,
}: {
  items: Slice[];
  layout?: "grid" | "row";
  columns?: 1 | 2 | 3;
}) {
  if (layout === "row") {
    return (
      <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1.5 p-0">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-pill"
              style={{ background: ramp(i.ramp) }}
            />
            <span className="text-micro text-pine">{i.label}</span>
            <span className="tnum text-micro text-muted">{i.percent}%</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul
      className="m-0 grid w-full list-none gap-x-4 gap-y-2 p-0"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {items.map((i) => (
        <li key={i.label} className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-pill"
            style={{ background: ramp(i.ramp) }}
          />
          <span className="truncate text-micro text-pine">{i.label}</span>
          <span className="tnum ml-auto text-micro text-muted">{i.percent}%</span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------------------
   Columns, usage by component
---------------------------------------------------------------------------- */

/**
 * Split a label into at most two balanced lines.
 *
 * "Document Authenticity & Recognition" is 35 characters against a ~130px slot;
 * unwrapped it either overlaps its neighbours or shrinks the type past reading
 * size. Balanced rather than greedy so the two lines are close in length, which
 * is what the frame draws.
 */
function wrap(label: string): string[] {
  const words = label.split(" ");
  if (words.length < 3) return [label];
  // Resolved before any JSX. Picking the split point inside a render callback
  // would be an accumulator in a memoizable closure — the
  // `react-hooks/immutability` trap the Donut hit.
  let best = 1;
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    if (Math.abs(a - b) < bestGap) {
      bestGap = Math.abs(a - b);
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * Vertical bars against a category axis — Figma Desktop-34.
 *
 * A separate chart from `BarChart`, which stacks two series against a DATE
 * axis and labels every nth point. This one has one series, one bar per
 * category, and every bar must be labelled because the categories are the
 * whole subject. Merging them would be a component with two layouts chosen by
 * a flag.
 *
 * Its own padding rather than the shared `frame()`: two lines of rotated label
 * need roughly three times the bottom gutter a date needs.
 */
export function ColumnChart({
  points,
  axis = {},
  width = 1028,
  height = 220,
  label,
}: {
  points: { label: string; value: number }[];
  axis?: Axis;
  width?: number;
  height?: number;
  label: string;
}) {
  const pad = { top: 10, right: 8, bottom: 62, left: 40 };
  const f: Frame = {
    w: width,
    h: height,
    x0: pad.left,
    y0: pad.top,
    pw: width - pad.left - pad.right,
    ph: height - pad.top - pad.bottom,
  };
  const max = axis.max ?? niceMax(points.map((p) => p.value));
  const yTicks = axis.yTicks ?? niceTicks(max);
  const slot = f.pw / points.length;
  const bar = Math.min(150, slot * 0.72);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        {/* Lime at the head fading down the column, so a tall bar reads as one
            shape rather than a slab. Both stops are brand tokens. */}
        <linearGradient id="vs-column" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-lime)" />
          <stop offset="100%" stopColor="var(--color-lime-wash)" />
        </linearGradient>
      </defs>

      <YAxis f={f} ticks={yTicks} max={max} />

      {points.map((p, i) => {
        const h = f.ph * (p.value / max);
        const cx = f.x0 + i * slot + slot / 2;
        const lines = wrap(p.label);
        return (
          <g key={p.label}>
            <rect
              x={cx - bar / 2}
              y={f.y0 + f.ph - h}
              width={bar}
              height={Math.max(0, h)}
              fill="url(#vs-column)"
              stroke="var(--color-lime)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <g transform={`translate(${cx.toFixed(1)} ${f.y0 + f.ph + 14}) rotate(-18)`}>
              {lines.map((line, li) => (
                <text
                  key={line}
                  x={0}
                  y={li * 11}
                  textAnchor="middle"
                  fill="var(--color-muted)"
                  fontSize={9}
                >
                  {line}
                </text>
              ))}
            </g>
          </g>
        );
      })}
    </svg>
  );
}
