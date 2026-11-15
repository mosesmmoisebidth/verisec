"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

/** Distinct, see-through colours for the text boxes, assigned in turn. */
const BOX_COLORS = ["#2563eb", "#db2777", "#0d9488", "#ea580c", "#7c3aed", "#4d7c0f", "#dc2626", "#0891b2", "#a16207", "#4f46e5"];
const MAIN_COLOR = "#0e3228";

/** One box drawn over the image, with an optional label and confidence (0..1). */
export interface StageRegion {
  /** Four corners, x1,y1 … x4,y4, in the pixel space of `size`. */
  box: number[];
  label?: string;
  confidence?: number;
}

/**
 * An image with boxes drawn over it, object-detection style: the engine's own
 * detection box (`box`, e.g. the MICR line) and, optionally, `regions` (e.g. every
 * text box on a cheque). Each box carries a label right above it: its words, then
 * its confidence. Regions on top of `box` are left out; `box` already marks them.
 *
 * Boxes arrive in the pixel space of the image the API processed (`size`). The
 * overlay's viewBox is that size, stretched over the displayed image; the API only
 * ever scales uniformly, so the boxes land exactly on the displayed pixels. Labels
 * are HTML placed in percentages, so their text stays crisp at any size.
 * The switch only hides or shows what is already drawn; nothing is fetched again.
 */
export function ImageStage({
  src,
  alt,
  size,
  box,
  boxLabel,
  boxConfidence,
  regions,
  showBoxLabel,
  missingLabel,
  className,
}: {
  src: string;
  alt: string;
  size: { width: number; height: number } | null;
  box: number[] | null | undefined;
  /** Label for `box`; without a label or confidence the box is drawn unlabelled. */
  boxLabel?: string;
  /** Confidence of `box`, 0..1. */
  boxConfidence?: number;
  regions?: StageRegion[];
  showBoxLabel: string;
  missingLabel: string;
  className?: string;
}) {
  const [show, setShow] = useState(true);
  // Tracks the src that failed, so a new image starts clean.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  const main = box && box.length >= 8 ? box : null;
  const plain = (regions ?? []).filter((r) => r.box.length >= 8 && !(main && centreInside(r.box, main)));
  const drawable = Boolean(size && !failed && (main || plain.length));
  const labels = [
    ...plain.map((r, i) => ({ ...r, color: BOX_COLORS[i % BOX_COLORS.length] })),
    ...(main ? [{ box: main, label: boxLabel, confidence: boxConfidence, color: MAIN_COLOR }] : []),
  ].filter((r) => r.label || r.confidence != null);

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="relative overflow-hidden rounded-[14px] border border-hairline bg-[#f4f4f2]">
        {failed ? (
          <div className="flex aspect-[16/9] flex-col items-center justify-center gap-2 text-micro text-slate">
            <ImageOff aria-hidden className="size-5" strokeWidth={1.6} />
            {missingLabel}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/no-noninteractive-element-interactions -- runtime API URL; onError is a load event, not a user interaction
          <img src={src} alt={alt} onError={() => setFailedSrc(src)} className="block h-auto w-full" />
        )}
        {drawable && show && size ? (
          <>
            <svg
              viewBox={`0 0 ${size.width} ${size.height}`}
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 size-full"
              aria-hidden
            >
              {plain.map((r, i) => {
                const color = BOX_COLORS[i % BOX_COLORS.length];
                return (
                  <polygon
                    key={`r-${i}`}
                    points={points(r.box)}
                    fill={color}
                    fillOpacity={0.18}
                    stroke={color}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {main ? <MainPolygon box={main} /> : null}
            </svg>
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              {labels.map((r, i) => {
                const { left, right, top } = corner(r.box, size);
                // Right above the box; inside it when the box touches the top edge. Boxes in
                // the right half hang their label from their right edge so it stays on the image.
                const x = left > 50 ? { right: `${right}%` } : { left: `${left}%` };
                return (
                  <span
                    key={`l-${i}`}
                    style={{ ...x, top: `${top}%`, backgroundColor: r.color }}
                    className={cn(
                      "absolute max-w-[60%] truncate rounded-t-[3px] px-1 text-[10px] leading-[13px] font-light tracking-[0.1px] whitespace-nowrap text-white",
                      top < 4 ? "translate-y-0" : "-translate-y-full",
                    )}
                  >
                    {r.label}
                    {r.confidence != null ? (
                      <span className="tnum opacity-90">
                        {r.label ? " " : ""}
                        {Math.round(r.confidence * 100)}%
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      {drawable ? (
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-micro text-slate select-none">
          <span className="relative inline-flex">
            <input
              type="checkbox"
              role="switch"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="peer absolute inset-0 size-full cursor-pointer opacity-0"
            />
            <span
              aria-hidden
              className="pointer-events-none flex h-5 w-9 items-center rounded-pill bg-well p-0.5 transition-colors peer-checked:bg-lime peer-checked:[&>span]:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2"
            >
              <span className="size-4 rounded-pill bg-page shadow-sm transition-transform" />
            </span>
          </span>
          {showBoxLabel}
        </label>
      ) : null}
    </div>
  );
}

function MainPolygon({ box }: { box: number[] }) {
  return (
    <>
      <polygon
        points={points(box)}
        fill="rgba(191,235,88,0.16)"
        stroke="rgba(14,50,40,0.55)"
        strokeWidth={5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <polygon points={points(box)} fill="none" stroke="#bfeb58" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </>
  );
}

function points(box: number[]): string {
  const out: string[] = [];
  for (let i = 0; i + 1 < box.length; i += 2) out.push(`${box[i] ?? 0},${box[i + 1] ?? 0}`);
  return out.join(" ");
}

/** True when the centre of box `a` lies inside the bounds of box `b`. */
function centreInside(a: number[], b: number[]): boolean {
  const ax = a.filter((_, i) => i % 2 === 0);
  const ay = a.filter((_, i) => i % 2 === 1);
  const bx = b.filter((_, i) => i % 2 === 0);
  const by = b.filter((_, i) => i % 2 === 1);
  const cx = ax.reduce((s, v) => s + v, 0) / ax.length;
  const cy = ay.reduce((s, v) => s + v, 0) / ay.length;
  return cx >= Math.min(...bx) && cx <= Math.max(...bx) && cy >= Math.min(...by) && cy <= Math.max(...by);
}

/** A box's left edge, right edge (from the image's right side) and top, as percentages of the image, clamped inside it. */
function corner(box: number[], size: { width: number; height: number }): { left: number; right: number; top: number } {
  const xs = box.filter((_, i) => i % 2 === 0);
  const ys = box.filter((_, i) => i % 2 === 1);
  const clamp = (v: number) => Math.min(Math.max(v, 0), 100);
  return {
    left: clamp((Math.min(...xs) / size.width) * 100),
    right: clamp(100 - (Math.max(...xs) / size.width) * 100),
    top: clamp((Math.min(...ys) / size.height) * 100),
  };
}
