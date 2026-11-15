"use client";

import { useState } from "react";
import { Car, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

import type { AlprOut } from "@/lib/demo/client";
import { cn } from "@/lib/utils";

type Vehicle = AlprOut["vehicles"][number];

/** Vehicle cards per page. */
export const ALPR_PAGE_SIZE = 5;

/** Five clearly different colours that read on any photo; each box, its label and its card share one. */
const COLORS = [
  { stroke: "#B8F02C", fill: "rgba(184,240,44,0.12)", ink: "#0e3228" },
  { stroke: "#22D3EE", fill: "rgba(34,211,238,0.12)", ink: "#06262c" },
  { stroke: "#FBBF24", fill: "rgba(251,191,36,0.12)", ink: "#2a1c00" },
  { stroke: "#F472B6", fill: "rgba(244,114,182,0.12)", ink: "#34071d" },
  { stroke: "#A78BFA", fill: "rgba(167,139,250,0.12)", ink: "#1b1236" },
] as const;
const colorOf = (i: number) => COLORS[i % COLORS.length]!;

const pct = (n: number | null | undefined) => (typeof n === "number" ? `${Math.round(n)}%` : null);

/** The engine's box: 4 corners, x1,y1 .. x4,y4, in image pixels. */
const corners = (b: number[]) => {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0, x4 = 0, y4 = 0] = b;
  return { xs: [x1, x2, x3, x4], ys: [y1, y2, y3, y4] };
};
const points = (b: number[]) => {
  const { xs, ys } = corners(b);
  return xs.map((x, k) => `${x},${ys[k]}`).join(" ");
};
const bounds = (b: number[]) => {
  const { xs, ys } = corners(b);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
};

function place(v: Vehicle) {
  const c = v.plate?.country;
  return c ? [c.code || c.name, c.state].filter(Boolean).join(" · ") : null;
}

function details(v: Vehicle) {
  const mm = v.vehicle?.make_model[0];
  return [mm ? `${mm.make} ${mm.model}`.trim() : null, v.vehicle?.color[0]?.name, v.vehicle?.body_style[0]?.name].filter(Boolean).join(" · ") || null;
}

/**
 * The boxes and labels, laid over the photo already shown in the upload area (the photo is never drawn twice).
 * Corner points come straight from the engine, so a tilted plate is outlined exactly. Pointing at a vehicle
 * highlights it; clicking one opens the page of cards it is on.
 */
export function AlprOverlay({
  alpr,
  hover,
  setHover,
  onPick,
}: {
  alpr: AlprOut;
  hover: number | null;
  setHover: (i: number | null) => void;
  onPick: (i: number) => void;
}) {
  if (!alpr.image) return null;
  const W = alpr.image.width;
  const H = alpr.image.height;
  // a busy photo keeps one line per label (plate + confidence), inside its own box; pointing at a vehicle opens its full label
  const dense = alpr.vehicles.length > 3;
  return (
    <div className="absolute inset-0" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
        {alpr.vehicles.map((v, i) => {
          const c = colorOf(i);
          const dim = hover !== null && hover !== i;
          return (
            <g
              key={v.id}
              opacity={dim ? 0.22 : 1}
              style={{ transition: "opacity 140ms", cursor: "pointer" }}
              onMouseEnter={() => setHover(i)}
              onClick={() => onPick(i)}
            >
              {v.vehicle?.box ? (
                <>
                  <polygon points={points(v.vehicle.box)} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                  <polygon points={points(v.vehicle.box)} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </>
              ) : null}
              {v.plate?.box ? (
                <>
                  <polygon points={points(v.plate.box)} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                  <polygon points={points(v.plate.box)} fill="rgba(255,255,255,0.06)" stroke={c.stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </>
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* one label per vehicle, pinned to its box; HTML so the text stays sharp at any size */}
      {alpr.vehicles.map((v, i) => {
        const b = v.vehicle?.box ?? v.plate?.box;
        if (!b) return null;
        const { minX, minY, maxX } = bounds(b);
        const c = colorOf(i);
        // every label sits inside the top of its own box: upper-left for a box on the left half of the photo,
        // upper-right for one on the right half (so labels of neighbouring boxes lean away from each other)
        const right = (minX + maxX) / 2 / W > 0.5;
        const dim = hover !== null && hover !== i;
        const full = !dense || hover === i;
        const where = full ? place(v) : null;
        const more = full ? details(v) : null;
        return (
          <div
            key={v.id}
            onMouseEnter={() => setHover(i)}
            onClick={() => onPick(i)}
            className={cn("absolute max-w-[92%] cursor-pointer transition-opacity", dim ? "opacity-25" : "opacity-100", hover === i ? "z-20" : "z-10")}
            style={{
              ...(right ? { right: `${((W - maxX) / W) * 100}%` } : { left: `${(minX / W) * 100}%` }),
              top: `${(minY / H) * 100}%`,
              transform: "translateY(3px)",
              ...(right ? { marginRight: "3px" } : { marginLeft: "3px" }),
            }}
          >
            <div
              className={cn(
                "rounded-[6px] font-semibold whitespace-nowrap shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)]",
                full ? "px-1.5 py-0.5 text-[11px] leading-[1.3]" : "px-1 py-px text-[10px] leading-[1.25]",
              )}
              style={{ background: c.stroke, color: c.ink }}
            >
              <div className="flex items-center gap-1">
                <span className="opacity-60">#{v.id}</span>
                {v.plate ? <span className="font-mono tracking-wide">{v.plate.text}</span> : <span>No plate</span>}
                {pct(v.plate?.confidence) ? <span className="tnum opacity-80">{pct(v.plate?.confidence)}</span> : null}
              </div>
              {where ? (
                <div className="font-medium">
                  {where} <span className="tnum opacity-70">{pct(v.plate?.country?.confidence)}</span>
                </div>
              ) : null}
              {more ? <div className="font-medium">{more}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The plate itself, cut from the same uploaded photo with CSS (no second image is loaded or decoded). */
function Crop({ imageUrl, box, W, H, height = 54, maxWidth = 230 }: { imageUrl: string; box: number[]; W: number; H: number; height?: number; maxWidth?: number }) {
  const { minX, minY, maxX, maxY } = bounds(box);
  const x0 = Math.max(0, minX - 2);
  const y0 = Math.max(0, minY - 2);
  const bw = Math.max(1, Math.min(W, maxX + 2) - x0);
  const bh = Math.max(1, Math.min(H, maxY + 2) - y0);
  const scale = Math.min(height / bh, maxWidth / bw);
  return (
    <span
      role="img"
      aria-label="Plate as found in the photo"
      className="block shrink-0 rounded-[6px] bg-well ring-1 ring-pine/15"
      style={{
        width: Math.round(bw * scale),
        height: Math.round(bh * scale),
        backgroundImage: `url(${imageUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${W * scale}px ${H * scale}px`,
        backgroundPosition: `${-x0 * scale}px ${-y0 * scale}px`,
      }}
    />
  );
}

type Alt = { name: string; confidence: number };

/** One category of the spec sheet: the category name in bold, the value with its confidence, and (on View more) every alternative. */
function Spec({ label, value, confidence, alts, open }: { label: string; value: string; confidence?: number | null; alts?: Alt[]; open: boolean }) {
  return (
    <>
      <dt className="pt-px text-[13px] font-bold text-pine">{label}</dt>
      <dd className="m-0 min-w-0 text-[14px] text-pine">
        <span className="break-words">{value}</span>
        {pct(confidence) ? <span className="tnum ml-1.5 text-[12.5px] text-slate">{pct(confidence)}</span> : null}
        {open && alts?.length ? (
          <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
            {alts.map((a, k) => (
              <li key={k} className="flex items-baseline gap-2 text-[12.5px] text-slate">
                <span aria-hidden className="size-1 shrink-0 translate-y-[-2px] rounded-pill bg-pine/30" />
                <span className="break-words">{a.name}</span>
                <span className="tnum">{pct(a.confidence)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </dd>
    </>
  );
}

function VehicleCard({
  v,
  i,
  hover,
  setHover,
  imageUrl,
  image,
}: {
  v: Vehicle;
  i: number;
  hover: number | null;
  setHover: (i: number | null) => void;
  imageUrl: string | null;
  image: AlprOut["image"];
}) {
  const [open, setOpen] = useState(false);
  const c = colorOf(i);
  const cropBox = v.plate?.box ?? v.vehicle?.box ?? null;
  const country = v.plate?.country ?? null;
  const mm = v.vehicle?.make_model ?? [];
  const top = mm[0];
  const colours = v.vehicle?.color ?? [];
  const bodies = v.vehicle?.body_style ?? [];

  // every other candidate the engine ranked, per category
  // each other country once (its states are listed under State / region)
  const countryAlts: Alt[] = [];
  for (const a of country?.alternatives ?? []) {
    if (a.name && a.name !== country?.name && !countryAlts.some((x) => x.name === a.name)) countryAlts.push({ name: a.name, confidence: a.confidence });
  }
  const stateAlts: Alt[] = (country?.alternatives ?? []).filter((a) => a.state).map((a) => ({ name: `${a.state} (${a.code || a.name})`, confidence: a.confidence }));
  const brandAlts: Alt[] = [];
  for (const m of mm.slice(1)) if (m.make && m.make !== top?.make && !brandAlts.some((b) => b.name === m.make)) brandAlts.push({ name: m.make, confidence: m.confidence });
  const modelAlts: Alt[] = mm.slice(1).map((m) => ({ name: `${m.make} ${m.model}`.trim(), confidence: m.confidence }));
  const colourAlts: Alt[] = colours.slice(1);
  const bodyAlts: Alt[] = bodies.slice(1);
  const hasMore = [countryAlts, stateAlts, brandAlts, modelAlts, colourAlts, bodyAlts].some((a) => a.length > 0);

  return (
    <li
      onMouseEnter={() => setHover(i)}
      onMouseLeave={() => setHover(null)}
      className={cn("flex flex-col gap-3 rounded-[14px] border bg-white p-3.5 transition-shadow", hover === i ? "border-pine/30 shadow-[0_10px_30px_-18px_rgba(14,50,40,0.45)]" : "border-edge")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="h-10 w-1.5 shrink-0 rounded-pill" style={{ background: c.stroke }} />
        {imageUrl && image && cropBox ? <Crop imageUrl={imageUrl} box={cropBox} W={image.width} H={image.height} height={v.plate ? 66 : 72} maxWidth={280} /> : null}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[12.5px] font-bold text-pine">Vehicle #{v.id}</span>
          <div className="flex flex-wrap items-center gap-2">
            {v.plate ? (
              <span className="rounded-[6px] border border-pine/15 bg-well px-2 py-0.5 font-mono text-[16px] font-semibold tracking-wider text-pine">{v.plate.text}</span>
            ) : (
              <span className="text-[13.5px] text-slate">No readable plate</span>
            )}
            {pct(v.plate?.confidence) ? (
              <span className="tnum rounded-pill bg-pass-tint px-2 py-0.5 text-[11.5px] font-semibold text-ramp-2">Read {pct(v.plate?.confidence)}</span>
            ) : null}
            {pct(v.plate?.detection_confidence) ? (
              <span className="tnum rounded-pill bg-well px-2 py-0.5 text-[11.5px] font-semibold text-slate">Plate found {pct(v.plate?.detection_confidence)}</span>
            ) : null}
          </div>
        </div>
      </div>

      {v.plate?.characters.length ? (
        <div className="flex flex-wrap gap-1">
          {v.plate.characters.map((ch, k) => (
            <span key={k} className="flex min-w-[30px] flex-col items-center rounded-[6px] bg-well px-1.5 py-0.5">
              <span className="font-mono text-[13px] font-semibold text-pine">{ch.char}</span>
              <span className="tnum text-[10px] text-slate">{pct(ch.confidence)}</span>
            </span>
          ))}
        </div>
      ) : null}

      <dl className="m-0 grid grid-cols-[minmax(108px,max-content)_minmax(0,1fr)] items-start gap-x-5 gap-y-2 border-t border-rule pt-3">
        {country ? <Spec label="Country" value={country.name} confidence={country.confidence} alts={countryAlts} open={open} /> : null}
        {country?.state ? <Spec label="State / region" value={country.state} alts={stateAlts} open={open} /> : null}
        {top?.make ? <Spec label="Brand" value={top.make} alts={brandAlts} open={open} /> : null}
        {top?.model ? <Spec label="Model" value={top.model} confidence={top.confidence} alts={modelAlts} open={open} /> : null}
        {colours[0] ? <Spec label="Colour" value={colours[0].name} confidence={colours[0].confidence} alts={colourAlts} open={open} /> : null}
        {bodies[0] ? <Spec label="Body style" value={bodies[0].name} confidence={bodies[0].confidence} alts={bodyAlts} open={open} /> : null}
        {pct(v.vehicle?.confidence) ? <Spec label="Vehicle detected" value="Yes" confidence={v.vehicle?.confidence} open={open} /> : null}
      </dl>

      {hasMore ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex h-8 items-center gap-1.5 self-start rounded-pill border border-pine/15 bg-white px-3 text-[12.5px] font-semibold text-pine transition-colors hover:bg-well"
        >
          {open ? <ChevronUp aria-hidden className="size-3.5" /> : <ChevronDown aria-hidden className="size-3.5" />}
          {open ? "Collapse" : "View more"}
        </button>
      ) : null}
    </li>
  );
}

/** Page numbers with the first, last and neighbouring pages, gaps shown as an ellipsis. */
function pageList(count: number, current: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, k) => k);
  const keep = new Set([0, count - 1, current - 1, current, current + 1].filter((p) => p >= 0 && p < count));
  const out: (number | "gap")[] = [];
  let last = -1;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - last > 1) out.push("gap");
    out.push(p);
    last = p;
  }
  return out;
}

/** Page numbers for the vehicles (used above and below the cards, and on the JSON view). */
export function Pager({ total, page, setPage, label = "Vehicle pages" }: { total: number; page: number; setPage: (p: number) => void; label?: string }) {
  const count = Math.max(1, Math.ceil(total / ALPR_PAGE_SIZE));
  if (count <= 1) return null;
  const current = Math.min(page, count - 1);
  const start = current * ALPR_PAGE_SIZE;
  const end = Math.min(total, start + ALPR_PAGE_SIZE);
  const btn = "grid h-8 min-w-8 place-items-center rounded-pill px-2 text-[13px] font-semibold transition-colors";
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3">
      <span className="tnum text-[12.5px] text-slate">
        Showing {start + 1} to {end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
          className={cn(btn, "text-pine hover:bg-well disabled:cursor-not-allowed disabled:opacity-35")}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        {pageList(count, current).map((p, k) =>
          p === "gap" ? (
            <span key={"gap-" + k} className="px-1 text-[13px] text-slate">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={"Page " + (p + 1)}
              aria-current={p === current ? "page" : undefined}
              onClick={() => setPage(p)}
              className={cn(btn, p === current ? "bg-pine text-lime" : "text-pine hover:bg-well")}
            >
              {p + 1}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={current === count - 1}
          onClick={() => setPage(current + 1)}
          className={cn(btn, "text-pine hover:bg-well disabled:cursor-not-allowed disabled:opacity-35")}
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
    </nav>
  );
}

/** The ALPR / ANPR result: one card per vehicle (its plate cut from the photo, every field), page by page. */
export function AlprResult({
  alpr,
  imageUrl,
  hover,
  setHover,
  page,
  setPage,
}: {
  alpr: AlprOut;
  imageUrl: string | null;
  hover: number | null;
  setHover: (i: number | null) => void;
  page: number;
  setPage: (p: number) => void;
}) {
  const count = Math.max(1, Math.ceil(alpr.vehicles.length / ALPR_PAGE_SIZE));
  const current = Math.min(page, count - 1);
  const start = current * ALPR_PAGE_SIZE;
  const shown = alpr.vehicles.slice(start, start + ALPR_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate">
        <Car aria-hidden className="size-4" strokeWidth={1.8} />
        {alpr.vehicles_found} vehicle{alpr.vehicles_found === 1 ? "" : "s"} found, {alpr.plates_read} plate{alpr.plates_read === 1 ? "" : "s"} read
        <span className="text-slate/80">· boxes are drawn on your photo; point at one to highlight it</span>
      </div>

      <Pager total={alpr.vehicles.length} page={current} setPage={setPage} label="Vehicle pages (top)" />

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {shown.map((v, k) => (
          <VehicleCard key={v.id} v={v} i={start + k} hover={hover} setHover={setHover} imageUrl={imageUrl} image={alpr.image} />
        ))}
      </ul>

      <Pager total={alpr.vehicles.length} page={current} setPage={setPage} />
    </div>
  );
}
