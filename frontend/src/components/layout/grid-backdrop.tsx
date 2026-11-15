import { cn } from "@/lib/utils";

/**
 * Shared grid backdrop for hero sections and dark panels.
 *
 * Three layers, in order:
 *   1. the 72px rule grid, dissolved toward the edges by a radial mask so it
 *      reads as a fading plane rather than wallpaper stopping at a hard border
 *   2. cells that light up and fade on staggered, deliberately uneven cycles
 *   3. slowly drifting lime blooms, and a soft sweep crossing the grid
 *
 * Everything here is decorative and freezes under prefers-reduced-motion.
 *
 * CELL_COLUMNS/ROWS are grid indices, not pixels. The grid is anchored to this
 * element's top-left, so multiplying an index by 72 puts a cell exactly on a
 * grid square. The previous hand-placed cells used percentages, which landed
 * them off-grid at every width and made the grid look accidental.
 */
const CELL = 72;

type Cell = {
  /** grid column index from the left edge */
  col: number;
  /** grid row index from the top edge */
  row: number;
  /** how many squares wide/tall */
  span?: number;
  /** seconds, so neighbouring cells never pulse together */
  delay: number;
  /** seconds */
  duration: number;
  /** hide below lg, where the backdrop is much narrower */
  lgOnly?: boolean;
};

const CELLS: Cell[] = [
  { col: 2, row: 4, delay: -1.5, duration: 9 },
  { col: 3, row: 7, delay: -5.2, duration: 12 },
  { col: 5, row: 2, delay: -8.1, duration: 10 },
  { col: 1, row: 9, delay: -3.4, duration: 13, lgOnly: true },
  { col: 6, row: 6, delay: -6.8, duration: 15 },
  { col: 9, row: 1, delay: -2.2, duration: 11 },
  { col: 11, row: 8, delay: -9.5, duration: 10, lgOnly: true },
  { col: 13, row: 3, delay: -4.1, duration: 14, lgOnly: true },
  { col: 15, row: 6, delay: -7.3, duration: 12, lgOnly: true },
  { col: 16, row: 2, delay: -0.8, duration: 16, lgOnly: true },
  { col: 18, row: 9, delay: -10.4, duration: 11, lgOnly: true },
];

export function GridBackdrop({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const isDark = tone === "dark";

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {/* 1. rule grid, dissolving toward every edge */}
      <div
        className={cn(
          "mask-grid-edges absolute inset-0",
          isDark ? "bg-grid-dark" : "bg-grid",
        )}
      />

      {/* 2. cells lighting up on the grid */}
      <div className="mask-grid-edges absolute inset-0">
        {CELLS.map((cell) => (
          <div
            key={`${cell.col}-${cell.row}`}
            className={cn(
              // Weak base tints: the glow keyframe peaks at full opacity, so
              // anything heavier here reads as solid grey blocks, not lit cells.
              "animate-cell-glow absolute",
              isDark ? "bg-white/8" : "bg-pine/6",
              cell.lgOnly && "hidden lg:block",
            )}
            style={{
              left: cell.col * CELL,
              top: cell.row * CELL,
              width: (cell.span ?? 1) * CELL,
              height: (cell.span ?? 1) * CELL,
              animationDelay: `${cell.delay}s`,
              animationDuration: `${cell.duration}s`,
            }}
          />
        ))}
      </div>

      {/* 3a. drifting lime blooms */}
      <div
        className={cn(
          "animate-float absolute -top-40 -right-24 size-[560px] rounded-full blur-[130px]",
          isDark ? "bg-lime/15" : "bg-lime/25",
        )}
      />
      <div
        className={cn(
          "animate-float-late absolute -bottom-56 -left-32 size-[560px] rounded-full blur-[130px]",
          isDark ? "bg-lime/10" : "bg-lime/20",
        )}
      />

      {/*
        3b. Slow sweep, so the plane reads as live rather than painted.
        Kept deliberately weak: at via-lime/25 this band tinted the entire hero
        green and fought the drifting blooms. It should register as a passing
        highlight you notice on second look, not as a colour wash.
      */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={cn(
            "animate-grid-sweep absolute inset-y-0 w-[28%] blur-3xl",
            isDark
              ? "bg-gradient-to-r from-transparent via-lime/6 to-transparent"
              : "bg-gradient-to-r from-transparent via-lime/10 to-transparent",
          )}
        />
      </div>
    </div>
  );
}
