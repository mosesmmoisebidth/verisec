import Image from "next/image";
import { Asterisk } from "lucide-react";

import { integrations } from "@/config/home";
import { LogoMark } from "@/components/brand/logo";
import { Panel } from "@/components/layout/container";
import { CenteredHeading } from "@/components/layout/section-heading";

/* ------------------------------------------------------------------ *
 *  Wiring diagram geometry
 *
 *  Numbers below are lifted straight from the Figma "Section 06" frame
 *  (1392 x 1073) and re-based onto the diagram vector, which Figma places
 *  at (314, 404) with a size of 780 x 500. Re-basing means:
 *
 *    hub centre   (705, 655) -> (390, 250)   size 118
 *    tile centres  x 395 / 1014 -> 81 / 699  size 79
 *    rows          484/597/711/825 -> 80/193/307/421
 *
 *  Everything (SVG wires, HTML tiles, halo rings) is positioned from this
 *  one box, tiles as a percentage of it, so nothing can drift at any width.
 *
 *  Note the deliberate Figma relationship: the two middle rows (193, 307)
 *  sit exactly on the hub's top and bottom edges (250 -/+ 59).
 * ------------------------------------------------------------------ */
const BOX = { w: 780, h: 500 };
const HUB = { x: 390, y: 250, size: 118 };
const TILE = 79;
const ROWS = [80, 193, 307, 421] as const;
const LEFT_X = 81;
const RIGHT_X = BOX.w - LEFT_X;
/** x of the vertical trunk each side's wires merge onto before the hub. */
const TRUNK_L = 256;
const TRUNK_R = BOX.w - TRUNK_L;
const R = 24; // elbow corner radius

const hubEdge = HUB.size / 2;
const tileEdge = TILE / 2;

/**
 * Halo rings, centred on the hub. Figma draws these as lime STROKES with a
 * layer blur, not crisp borders - that blur is what makes them read as a soft
 * radar glow instead of stray arcs across the section. Diameters are in box
 * units; the outermost is wider than the panel on purpose and gets clipped.
 *
 *   Figma: 600 @ 27% blur 16 | 960 @ 8% blur 24 | 1440 @ 8% blur 40
 */
const RINGS = [
  { d: 600, border: 3, tone: "border-lime", blur: 7 },
  { d: 960, border: 4, tone: "border-lime/75", blur: 13 },
  { d: 1440, border: 5, tone: "border-lime/60", blur: 20 },
] as const;

/**
 * Elbow wire: horizontal out of the tile, rounded corner onto the shared
 * vertical trunk, rounded corner again onto the hub's centre line, then
 * horizontal into the hub. All four wires per side converge on that centre
 * line, so they visually merge exactly as they do in the Figma.
 */
function wire(side: "left" | "right", y: number) {
  const isLeft = side === "left";
  const startX = isLeft ? LEFT_X + tileEdge : RIGHT_X - tileEdge;
  const endX = isLeft ? HUB.x - hubEdge : HUB.x + hubEdge;
  const trunk = isLeft ? TRUNK_L : TRUNK_R;
  const dirX = isLeft ? 1 : -1; // travel direction toward the hub
  const dirY = HUB.y > y ? 1 : -1; // vertical travel toward the hub row

  if (y === HUB.y) return `M ${startX} ${y} H ${endX}`;

  return [
    `M ${startX} ${y}`,
    `H ${trunk - dirX * R}`,
    `Q ${trunk} ${y} ${trunk} ${y + dirY * R}`,
    `V ${HUB.y - dirY * R}`,
    `Q ${trunk} ${HUB.y} ${trunk + dirX * R} ${HUB.y}`,
    `H ${endX}`,
  ].join(" ");
}

/**
 * The eight tools, in Figma order. Assets are the client's own exports,
 * trimmed of transparent padding so their optical sizes match.
 */
const tiles = [
  { label: "Folder", src: "/brand/integrations/folder.png", side: "left", y: ROWS[0] },
  { label: "Google Drive", src: "/brand/integrations/google-drive.png", side: "left", y: ROWS[1] },
  { label: "Figma", src: "/brand/integrations/figma.png", side: "left", y: ROWS[2] },
  { label: "Slack", src: "/brand/integrations/slack.png", side: "left", y: ROWS[3] },
  { label: "Microsoft Teams", src: "/brand/integrations/microsoft-teams.svg", side: "right", y: ROWS[0] },
  { label: "Discord", src: "/brand/integrations/discord.svg", side: "right", y: ROWS[1] },
  { label: "Gmail", src: "/brand/integrations/gmail.svg", side: "right", y: ROWS[2] },
  { label: "Google Chat", src: "/brand/integrations/google-chat.svg", side: "right", y: ROWS[3] },
] as const;

/** % helpers so tiles sit on exactly the same grid as the wires. */
const pct = (v: number, total: number) => `${(v / total) * 100}%`;
const pctX = (x: number) => pct(x, BOX.w);
const pctY = (y: number) => pct(y, BOX.h);

function Halo() {
  return (
    // Rings overflow this box on purpose; the Panel clips them, exactly as the
    // Figma frame clips its own 1440px circle.
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Faint lime wash behind the hub. Kept small and weak on purpose: the
          panel should read as near-white with a defined ring, not tinted green. */}
      <div
        className="animate-halo-breathe absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/12 blur-[70px]"
        style={{ width: pctX(380), left: pctX(HUB.x), top: pctY(HUB.y) }}
      />
      {RINGS.map((ring) => (
        <div
          key={ring.d}
          className={`absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full ${ring.tone}`}
          style={{
            width: pctX(ring.d),
            left: pctX(HUB.x),
            top: pctY(HUB.y),
            borderWidth: ring.border,
            filter: `blur(${ring.blur}px)`,
          }}
        />
      ))}
    </div>
  );
}

function WireDiagram() {
  return (
    <div
      className="relative mx-auto hidden w-full max-w-[780px] sm:block"
      style={{ aspectRatio: `${BOX.w} / ${BOX.h}` }}
    >
      <Halo />

      <svg
        aria-hidden
        viewBox={`0 0 ${BOX.w} ${BOX.h}`}
        className="absolute inset-0 size-full"
        fill="none"
      >
        {tiles.map((tile, index) => {
          const d = wire(tile.side, tile.y);
          // Staggered so the eight nodes never travel in lockstep.
          const delay = { animationDelay: `${index * 0.62}s` };
          return (
            <g key={tile.label}>
              <path
                d={d}
                stroke="currentColor"
                strokeWidth={1.25}
                className="text-pine/25"
              />
              {/*
                Travelling node. The small hollow circles in the Figma are a
                snapshot of these mid-flight, which is why they sit at
                arbitrary points and only on some wires.

                Built as two stacked round dash-caps rather than a <circle> on
                a motion path: a pine dot with a slightly smaller white dot
                over it reads as a hollow ring, follows the wire geometry
                exactly, and is driven by a CSS animation, so it honours
                prefers-reduced-motion like everything else on the site.
              */}
              <path
                d={d}
                strokeWidth={9}
                strokeLinecap="round"
                strokeDasharray="0.01 400"
                className="animate-wire stroke-pine/45"
                style={delay}
              />
              <path
                d={d}
                strokeWidth={6.5}
                strokeLinecap="round"
                strokeDasharray="0.01 400"
                className="animate-wire stroke-white"
                style={delay}
              />
            </g>
          );
        })}
      </svg>

      {/* Tool tiles */}
      {tiles.map((tile) => (
        <div
          key={tile.label}
          data-tile={tile.label}
          className="absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-[25%] border border-black/[0.04] bg-white shadow-[0_8px_24px_-10px_rgba(15,23,42,0.22)]"
          style={{
            width: pctX(TILE),
            left: pctX(tile.side === "left" ? LEFT_X : RIGHT_X),
            top: pctY(tile.y),
          }}
        >
          <Image
            src={tile.src}
            alt={tile.label}
            fill
            sizes="80px"
            className="object-contain p-[22%]"
          />
        </div>
      ))}

      {/* Hub: Figma uses a WHITE tile with the dark logo mark, not a pine tile. */}
      <div
        data-hub
        className="absolute flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[26%] bg-white shadow-[0_14px_40px_-12px_rgba(15,23,42,0.28)]"
        style={{
          width: pctX(HUB.size),
          left: pctX(HUB.x),
          top: pctY(HUB.y),
        }}
      >
        <LogoMark className="h-[38%] text-ink" />
      </div>
    </div>
  );
}

/** Mobile: the wiring is unreadable at phone widths, so show a plain grid. */
function IntegrationGrid() {
  return (
    <div className="flex flex-col items-center gap-8 sm:hidden">
      <div className="flex size-[72px] items-center justify-center rounded-[26%] bg-white shadow-[0_14px_40px_-12px_rgba(15,23,42,0.28)]">
        <LogoMark className="h-7 text-ink" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            data-tile-mobile={tile.label}
            className="relative size-16 rounded-[25%] border border-black/[0.04] bg-white shadow-sm"
          >
            <Image
              src={tile.src}
              alt={tile.label}
              fill
              sizes="64px"
              className="object-contain p-[22%]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Integrations() {
  return (
    <Panel className="overflow-hidden bg-site-panel" id="integrations">
      {/*
        Vertical rhythm is Figma's, in absolute px, because the diagram is
        pinned to the same 780px width as the frame:

          padding-top 63 | heading 214 | GAP 127 | diagram 500 | padding-bottom 169

        The 127px gap is the load-bearing number. At the old 48px the 600px
        halo ring, which reaches 50px above the diagram box, collided with the
        subline. gap-32 (128px) clears it by 78px, matching Figma's 73px.
      */}
      <div className="relative flex flex-col gap-12 px-6 py-16 sm:px-10 lg:gap-32 lg:px-14 lg:pt-16 lg:pb-40">
        <CenteredHeading
          badge={integrations.badge}
          badgeIcon={Asterisk}
          heading={integrations.heading}
          subline={integrations.subline}
          className="max-w-[860px]"
          sublineClassName="max-w-[616px]"
        />
        <WireDiagram />
        <IntegrationGrid />
      </div>
    </Panel>
  );
}
