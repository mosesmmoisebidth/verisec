"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import type { FaceDrawing, FaceMark, Tone } from "@/lib/console/face-geometry";
import { cn } from "@/lib/utils";

/**
 * The answer of a face API drawn on the image that was sent: each face's box (turned by its tilt), its five landmarks,
 * a numbered badge and a short label, the way face SDK demos show a detection. Everything is drawn in the image's own
 * pixel space (an SVG with the image's size as its viewBox), so a box lands exactly where the API said, at any size.
 * Strokes and text are sized in screen pixels, so they read the same on a small photo and on a 12 MP one.
 */

const LIME = "#bfeb58";
const RED = "#ff7b6b";
const INK = "rgba(14,50,40,0.92)";
const stroke = (t?: Tone) => (t === "fail" ? RED : LIME);

type Layers = { boxes: boolean; points: boolean; labels: boolean };

/** A data URL for a base64 image the API returned (JPEG unless it says PNG). */
function b64Image(b64: string) {
  if (b64.startsWith("data:")) return b64;
  return `data:image/${b64.startsWith("iVBOR") ? "png" : "jpeg"};base64,${b64}`;
}

function useFileUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return file ? url : null;
}

export function FaceOverlay({ drawing, files }: { drawing: FaceDrawing; files: (File | null)[] }) {
  if (drawing.gallery) return <GalleryMatches drawing={drawing} files={files} />;
  return <FaceStages drawing={drawing} files={files} />;
}

const pctText = (s: number) => `${Math.round(s * 1000) / 10}%`;

/**
 * Face Search (1:N): the reference photo, then every gallery photo you sent, best match first, each marked
 * Match (lime) or No match (red) with its similarity. Files are in send order: the reference, then the gallery.
 */
function GalleryMatches({ drawing, files }: { drawing: FaceDrawing; files: (File | null)[] }) {
  const rows = drawing.gallery ?? [];
  const scored = new Set(rows.map((g) => g.index));
  const notCompared = files.slice(1).map((_, i) => i).filter((i) => !scored.has(i));
  return (
    <div className="flex flex-col gap-3 font-sans">
      {drawing.headline ? (
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium",
            drawing.headline.tone === "pass" ? "bg-lime/15 text-lime" : "bg-[#ff7b6b]/15 text-[#ff9d90]",
          )}
        >
          {drawing.headline.tone === "pass" ? <Check aria-hidden className="size-3.5" strokeWidth={2.6} /> : <X aria-hidden className="size-3.5" strokeWidth={2.6} />}
          {drawing.headline.text}
        </span>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <Thumb file={files[0] ?? null} title="Reference" tone="neutral" note="Searched for" />
        {rows.map((g) => (
          <Thumb
            key={`${g.index}-${g.id}`}
            file={files[1 + g.index] ?? null}
            title={g.id}
            tone={g.match ? "pass" : "fail"}
            note={`${g.match ? "Match" : "No match"}, ${pctText(g.similarity)}`}
          />
        ))}
        {notCompared.map((i) => (
          <Thumb key={`nc-${i}`} file={files[1 + i] ?? null} title={`Photo ${i + 1}`} tone="neutral" note="Not compared" />
        ))}
      </div>
    </div>
  );
}

function Thumb({ file, title, tone, note }: { file: File | null; title: string; tone: Tone; note: string }) {
  const url = useFileUrl(file);
  return (
    <figure
      className={cn(
        "m-0 flex min-w-0 flex-col overflow-hidden rounded-[12px] border-2 bg-white/[0.03]",
        tone === "pass" ? "border-lime" : tone === "fail" ? "border-[#ff7b6b]/70" : "border-white/20",
      )}
    >
      <div className="relative aspect-square bg-black/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={title} className="size-full object-cover" /> : null}
        {tone !== "neutral" ? (
          <span className={cn("absolute top-2 right-2 grid size-7 place-items-center rounded-pill shadow", tone === "pass" ? "bg-lime text-pine" : "bg-[#ff7b6b] text-pine")}>
            {tone === "pass" ? <Check aria-hidden className="size-4" strokeWidth={3} /> : <X aria-hidden className="size-4" strokeWidth={3} />}
          </span>
        ) : null}
      </div>
      <figcaption className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-[12px] font-medium text-code-ink">{title}</span>
        <span className={cn("tnum text-[12px] font-semibold", tone === "pass" ? "text-lime" : tone === "fail" ? "text-[#ff9d90]" : "text-code-ink/60")}>{note}</span>
      </figcaption>
    </figure>
  );
}

function FaceStages({ drawing, files }: { drawing: FaceDrawing; files: (File | null)[] }) {
  const [layers, setLayers] = useState<Layers>({ boxes: true, points: true, labels: true });
  const [showResult, setShowResult] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const two = drawing.images.length > 1 || (drawing.pairs?.length ?? 0) > 0;
  const faces = drawing.images.flatMap((i) => i.faces);
  const anyPoints = faces.some((f) => f.points?.length);
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="flex flex-col gap-3 font-sans">
      <div className="flex flex-wrap items-center gap-2">
        {drawing.headline ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium",
              drawing.headline.tone === "pass" ? "bg-lime/15 text-lime" : drawing.headline.tone === "fail" ? "bg-[#ff7b6b]/15 text-[#ff9d90]" : "bg-white/8 text-code-ink",
            )}
          >
            {drawing.headline.tone === "pass" ? <Check aria-hidden className="size-3.5" strokeWidth={2.6} /> : drawing.headline.tone === "fail" ? <X aria-hidden className="size-3.5" strokeWidth={2.6} /> : null}
            {drawing.headline.text}
          </span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="What to draw">
          <LayerChip on={layers.boxes} onClick={() => toggle("boxes")} label="Boxes" />
          {anyPoints ? <LayerChip on={layers.points} onClick={() => toggle("points")} label="Landmarks" /> : null}
          <LayerChip on={layers.labels} onClick={() => toggle("labels")} label="Labels" />
          {drawing.result ? (
            <span className="ml-1 flex items-center gap-0.5 rounded-pill bg-white/7 p-0.5">
              {[false, true].map((r) => (
                <button
                  key={String(r)}
                  type="button"
                  aria-pressed={showResult === r}
                  onClick={() => setShowResult(r)}
                  className={cn("rounded-pill px-2.5 py-0.5 text-[11.5px] font-medium transition-colors", showResult === r ? "bg-page text-pine" : "text-code-ink/70 hover:text-code-ink")}
                >
                  {r ? "Result" : "Original"}
                </button>
              ))}
            </span>
          ) : null}
        </span>
      </div>

      <div className={cn("grid gap-3", two && "sm:grid-cols-2")}>
        {(two ? [0, 1] : [0]).map((index) => {
          const marks = drawing.images.find((i) => i.image === index)?.faces ?? [];
          return (
            <Stage
              key={index}
              file={files[index] ?? null}
              result={index === 0 && showResult && drawing.result ? b64Image(drawing.result) : null}
              title={two ? `Image ${index + 1}` : undefined}
              marks={showResult ? [] : marks}
              layers={layers}
              active={active}
            />
          );
        })}
      </div>

      {drawing.pairs?.length ? (
        <div className="flex flex-col gap-1.5 rounded-[12px] border border-white/10 bg-white/[0.03] p-3">
          <span className="text-[11.5px] font-medium text-code-ink/60">Compared</span>
          {drawing.pairs.map((p) => (
            <button
              type="button"
              key={`${p.a}-${p.b}`}
              onMouseEnter={() => setActive(p.a)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(p.a)}
              onBlur={() => setActive(null)}
              className="flex w-full items-center gap-2 rounded-[8px] px-1 py-0.5 text-left text-[12.5px] text-code-ink transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-lime/60 focus-visible:outline-none"
            >
              <KeyBadge k={p.a} />
              <span className="text-code-ink/50">and</span>
              <KeyBadge k={p.b} />
              <span className="tnum ml-auto font-medium">{`${Math.round(p.similarity * 1000) / 10}% similar`}</span>
              <span className={cn("grid size-5 place-items-center rounded-pill", p.tone === "pass" ? "bg-lime/20 text-lime" : p.tone === "fail" ? "bg-[#ff7b6b]/20 text-[#ff9d90]" : "bg-white/10 text-code-ink/70")}>
                {p.tone === "fail" ? <X aria-hidden className="size-3" strokeWidth={2.8} /> : <Check aria-hidden className="size-3" strokeWidth={2.8} />}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {faces.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {faces.map((f) => (
            <FaceCard key={f.key} face={f} active={active === f.key} onHover={setActive} wide={faces.length === 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LayerChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-pill border px-2.5 text-[11.5px] font-medium transition-colors",
        on ? "border-lime/40 bg-lime/12 text-lime" : "border-white/12 text-code-ink/60 hover:text-code-ink",
      )}
    >
      <span aria-hidden className={cn("grid size-3.5 place-items-center rounded-[4px] border", on ? "border-lime bg-lime text-pine" : "border-white/30")}>
        {on ? <Check className="size-2.5" strokeWidth={3.2} /> : null}
      </span>
      {label}
    </button>
  );
}

function KeyBadge({ k, tone }: { k: string; tone?: Tone }) {
  return (
    <span className={cn("tnum inline-grid h-5 min-w-5 place-items-center rounded-pill px-1 text-[10.5px] font-bold", tone === "fail" ? "bg-[#ff7b6b] text-pine" : "bg-lime text-pine")}>
      {k}
    </span>
  );
}

function FaceCard({ face, active, onHover, wide }: { face: FaceMark; active: boolean; onHover: (k: string | null) => void; wide?: boolean }) {
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(face.key)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(face.key)}
      onBlur={() => onHover(null)}
      className={cn(
        "flex min-w-0 gap-3 rounded-[12px] border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-lime/60 focus-visible:outline-none",
        wide && "sm:col-span-2",
        active ? "border-lime/50 bg-lime/[0.06]" : "border-white/10 bg-white/[0.03]",
      )}
    >
      {face.crop ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b64Image(face.crop)} alt={`Face ${face.key}, cropped`} className="size-16 shrink-0 rounded-[8px] bg-black/30 object-cover" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-2 text-[12.5px] font-medium text-code-ink">
          <KeyBadge k={face.key} tone={face.tone} />
          {`Face ${face.key}`}
          {face.tag ? <span className="truncate font-normal text-code-ink/60">{face.tag}</span> : null}
        </span>
        <dl className={cn("m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11.5px] leading-[17px]", wide && "md:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-x-5")}>
          {face.facts.map((x, i) => (
            <div key={`${x.label}-${i}`} className="contents">
              <dt className="text-code-ink/50">{x.label}</dt>
              <dd className={cn("m-0 [overflow-wrap:anywhere]", x.tone === "fail" ? "text-[#ff9d90]" : x.tone === "pass" ? "text-lime" : "text-code-ink/90")}>{x.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </button>
  );
}

/** One image with its faces drawn on top, fitted to the panel's width (and at most 380 px tall). */
function Stage({
  file,
  result,
  title,
  marks,
  layers,
  active,
}: {
  file: File | null;
  result: string | null;
  title?: string;
  marks: FaceMark[];
  layers: Layers;
  active: string | null;
}) {
  const fileUrl = useFileUrl(file);
  const src = result ?? fileUrl;
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);

  // the picture's own size: the drawing's coordinate space
  useEffect(() => {
    if (!src) return;
    let live = true;
    const im = new Image();
    im.onload = () => {
      if (live) setNat({ w: im.naturalWidth, h: im.naturalHeight });
    };
    im.src = src;
    return () => {
      live = false;
    };
  }, [src]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = nat && width ? Math.min(width / nat.w, 380 / nat.h) : 0;
  const k = scale ? 1 / scale : 1; // image pixels per screen pixel
  const dw = nat ? Math.round(nat.w * scale) : 0;
  const dh = nat ? Math.round(nat.h * scale) : 0;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {title ? <span className="text-[11.5px] font-medium text-code-ink/60">{title}</span> : null}
      <div ref={host} className="grid min-h-[120px] w-full place-items-center overflow-hidden rounded-[12px] border border-white/10 bg-black/35 p-2">
        {src ? (
          <div className="relative" style={nat ? { width: dw, height: dh } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={title ?? "The image that was sent"}
              className="block h-full w-full select-none"
              style={nat ? undefined : { maxHeight: 380, maxWidth: "100%" }}
              draggable={false}
            />
            {nat && scale ? (
              <svg
                viewBox={`0 0 ${nat.w} ${nat.h}`}
                className="absolute inset-0 h-full w-full overflow-visible"
                role="img"
                aria-label={`${marks.length} face${marks.length === 1 ? "" : "s"} marked`}
              >
                {marks.map((m) => (
                  <Mark key={m.key} m={m} k={k} layers={layers} active={active === m.key} />
                ))}
              </svg>
            ) : null}
          </div>
        ) : (
          <p className="m-0 text-[12px] text-code-ink/55">{file === null ? "The image for this result is no longer in the form." : "Loading the image"}</p>
        )}
      </div>
    </div>
  );
}

function Mark({ m, k, layers, active }: { m: FaceMark; k: number; layers: Layers; active: boolean }) {
  const [x, y, w, h] = m.box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const color = stroke(m.tone);
  const turn = m.angle ? `rotate(${-m.angle} ${cx} ${cy})` : undefined;
  const r = 10 * k;
  // the label sits above the box, or inside its top edge when the box touches the top of the image
  const labelY = y - 9 * k > 14 * k ? y - 9 * k : y + 22 * k;
  return (
    <g>
      {layers.boxes ? (
        <g transform={turn}>
          <rect x={x} y={y} width={w} height={h} rx={6 * k} fill="none" stroke={INK} strokeWidth={5 * k} />
          <rect x={x} y={y} width={w} height={h} rx={6 * k} fill={active ? "rgba(191,235,88,0.14)" : "rgba(0,0,0,0.001)"} stroke={color} strokeWidth={(active ? 3.2 : 2.4) * k} />
        </g>
      ) : null}
      {layers.points
        ? (m.points ?? []).map(([px, py], i) => (
            <circle key={i} cx={px} cy={py} r={3.4 * k} fill={i < 2 ? LIME : "#ffffff"} stroke={INK} strokeWidth={1.4 * k} />
          ))
        : null}
      {layers.boxes || layers.labels ? (
        <g>
          <circle cx={x} cy={y} r={r} fill={color} stroke={INK} strokeWidth={1.6 * k} />
          <text x={x} y={y + 3.8 * k} textAnchor="middle" fontSize={m.key.length > 1 ? 9.5 * k : 11 * k} fontWeight={700} fill="#0e3228" fontFamily="inherit">
            {m.key}
          </text>
        </g>
      ) : null}
      {layers.labels && m.tag ? (
        <text
          x={x + 14 * k}
          y={labelY}
          fontSize={12.5 * k}
          fontWeight={600}
          fill={color}
          stroke={INK}
          strokeWidth={4 * k}
          paintOrder="stroke"
          strokeLinejoin="round"
          fontFamily="inherit"
        >
          {m.tag}
        </text>
      ) : null}
    </g>
  );
}
