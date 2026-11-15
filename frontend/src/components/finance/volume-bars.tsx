import { niceMax, niceTicks, ramp } from "@/components/charts/charts";

/**
 * Daily scan volume as stacked bars: cheques at the base, cards above.
 *
 * Bars rather than the console's smoothed area chart because scanning volume
 * is often sparse (a quiet day is a real zero), and a smoothed curve through
 * zeros overshoots below the axis. Same frame, gridlines, type sizes and
 * ramp as the console charts, so it sits in the dashboard as one of them.
 * Each day carries a native tooltip with its exact counts.
 */
const W = 668;
const H = 244;
const PAD = { top: 10, right: 6, bottom: 24, left: 40 };

export function VolumeBars({
  points,
  label,
  labels,
}: {
  points: { date: string; cheques: number; cards: number }[];
  label: string;
  labels: { cheques: string; cards: string };
}) {
  const pw = W - PAD.left - PAD.right;
  const ph = H - PAD.top - PAD.bottom;
  const peak = Math.max(0, ...points.map((p) => p.cheques + p.cards));
  const { max, ticks } = scale(peak);
  const n = Math.max(points.length, 1);
  const slot = pw / n;
  const bar = Math.min(22, Math.max(3, slot * 0.6));
  const y = (v: number) => PAD.top + ph - (v / max) * ph;
  const stride = Math.max(1, Math.ceil(n / 7));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={PAD.left + pw}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--color-rule)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fill="var(--color-muted)" fontSize={9.5}>
            {t}
          </text>
        </g>
      ))}

      {points.map((p, i) => {
        const x = PAD.left + i * slot + (slot - bar) / 2;
        const total = p.cheques + p.cards;
        const r = Math.min(3, bar / 2);
        const chequeTop = y(p.cheques);
        const cardTop = y(total);
        return (
          <g key={p.date} className="transition-opacity hover:opacity-80">
            <title>{`${p.date}: ${p.cheques} ${labels.cheques.toLowerCase()}, ${p.cards} ${labels.cards.toLowerCase()}`}</title>
            {/* A full-height hit area so the tooltip works on short bars too. */}
            <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={ph} fill="transparent" />
            {p.cheques > 0 ? (
              <path
                d={p.cards > 0 ? rect(x, chequeTop, bar, y(0) - chequeTop) : topRounded(x, chequeTop, bar, y(0) - chequeTop, r)}
                fill={ramp(1)}
              />
            ) : null}
            {p.cards > 0 ? <path d={topRounded(x, cardTop, bar, chequeTop - cardTop, r)} fill={ramp(5)} /> : null}
          </g>
        );
      })}

      {points.map((p, i) =>
        i % stride === 0 ? (
          <text
            key={`x-${p.date}`}
            x={PAD.left + i * slot + slot / 2}
            y={PAD.top + ph + 15}
            textAnchor="middle"
            fill="var(--color-muted)"
            fontSize={9.5}
          >
            {p.date}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function scale(peak: number): { max: number; ticks: number[] } {
  if (peak <= 4) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  if (peak <= 8) return { max: 8, ticks: [0, 2, 4, 6, 8] };
  const max = niceMax([peak]);
  return { max, ticks: niceTicks(max) };
}

function rect(x: number, y: number, w: number, h: number): string {
  return `M${x},${y} h${w} v${h} h${-w} Z`;
}

/** A bar with rounded top corners and a square foot on the axis. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}
