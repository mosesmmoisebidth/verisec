import {
  BookUser,
  Camera,
  CarFront,
  Clock,
  Crop,
  FileBadge,
  FileText,
  House,
  IdCard,
  Mail,
  Nfc,
  Phone,
  ScanFace,
  ShieldCheck,
  Sun,
  SunDim,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { FlowIcon, Outcome } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

/**
 * Glyph for each slot the flow can name.
 *
 * The data layer carries a string key — a React component cannot travel in a
 * JSON payload — and this is the one place that turns it into something
 * drawable. Adding an icon means a key in `FlowIcon` and a row here. Same
 * arrangement as the console's `component-icon.tsx`; kept separate because the
 * two surfaces name different things and merging them would force one list to
 * carry the other's vocabulary.
 */
const GLYPHS: Record<FlowIcon, LucideIcon> = {
  "id-card": IdCard,
  passport: BookUser,
  licence: CarFront,
  "residence-permit": FileBadge,
  camera: Camera,
  selfie: ScanFace,
  nfc: Nfc,
  phone: Phone,
  email: Mail,
  home: House,
  file: FileText,
  shield: ShieldCheck,
  clock: Clock,
  light: Sun,
  glare: SunDim,
  crop: Crop,
};

export function FlowGlyph({
  icon,
  className,
  strokeWidth = 1.6,
}: {
  icon: FlowIcon;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = GLYPHS[icon];
  return <Icon aria-hidden className={cn("size-5 shrink-0", className)} strokeWidth={strokeWidth} />;
}

/* ----------------------------------------------------------------------------
   Solar glyphs, the capture screen's own icons (Desktop-5)

   The capture frame and its button are drawn in the Solar icon set, not lucide:
   a bolder, rounder camera than lucide's, and a camera-with-a-plus for the
   shutter that lucide has no equal for. Rebuilt from the exported vectors so
   they match the frame exactly and take `currentColor`; the viewBoxes are the
   glyphs' own, and a square container letterboxes them without distortion.
---------------------------------------------------------------------------- */

export function SolarCameraLinear({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 62.7083 56.8751"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M31.3542 40.1042C36.1867 40.1042 40.1042 36.1867 40.1042 31.3542C40.1042 26.5217 36.1867 22.6042 31.3542 22.6042C26.5218 22.6042 22.6042 26.5217 22.6042 31.3542C22.6042 36.1867 26.5218 40.1042 31.3542 40.1042Z"
        stroke="currentColor"
        strokeWidth="4.375"
      />
      <path
        d="M24.8733 54.6876H37.835C46.9379 54.6876 51.4908 54.6876 54.7604 52.5439C56.1716 51.6197 57.3867 50.4264 58.3362 49.0322C60.5208 45.8239 60.5208 41.3526 60.5208 32.416C60.5208 23.4793 60.5208 19.0081 58.3362 15.7997C57.3867 14.4055 56.1716 13.2122 54.7604 12.2881C52.6604 10.9085 50.0296 10.4156 46.0017 10.2406C44.0796 10.2406 42.4258 8.81139 42.0496 6.9593C41.762 5.60267 41.0149 4.38691 39.9346 3.51749C38.8542 2.64808 37.5067 2.17833 36.12 2.18764H26.5883C23.7067 2.18764 21.2246 4.18555 20.6588 6.9593C20.2825 8.81139 18.6288 10.2406 16.7067 10.2406C12.6817 10.4156 10.0508 10.9114 7.94792 12.2881C6.53782 13.2125 5.32372 14.4058 4.375 15.7997C2.1875 19.0081 2.1875 23.4764 2.1875 32.416C2.1875 41.3556 2.1875 45.821 4.37208 49.0322C5.31708 50.4206 6.53042 51.6135 7.94792 52.5439C11.2175 54.6876 15.7704 54.6876 24.8733 54.6876Z"
        stroke="currentColor"
        strokeWidth="4.375"
      />
      <path
        d="M51.7709 22.6042H48.8542"
        stroke="currentColor"
        strokeWidth="4.375"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SolarCameraAddLinear({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 17.9167 16.25"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.4583 8.95833H6.45825M8.95825 6.45833V11.4583"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M7.10667 15.625H10.81C13.4108 15.625 14.7117 15.625 15.6458 15.0125C16.049 14.7485 16.3962 14.4075 16.6675 14.0092C17.2917 13.0925 17.2917 11.815 17.2917 9.26171C17.2917 6.70837 17.2917 5.43087 16.6675 4.51421C16.3962 4.11587 16.049 3.77492 15.6458 3.51087C15.0458 3.11671 14.2942 2.97587 13.1433 2.92587C12.5942 2.92587 12.1217 2.51754 12.0142 1.98837C11.932 1.60076 11.7186 1.2534 11.4099 1.005C11.1012 0.756593 10.7162 0.622379 10.32 0.625039H7.59667C6.77333 0.625039 6.06417 1.19587 5.9025 1.98837C5.795 2.51754 5.3225 2.92587 4.77333 2.92587C3.62333 2.97587 2.87167 3.11754 2.27083 3.51087C1.86795 3.77501 1.52106 4.11595 1.25 4.51421C0.625 5.43087 0.625 6.70754 0.625 9.26171C0.625 11.8159 0.625 13.0917 1.24917 14.0092C1.51917 14.4059 1.86583 14.7467 2.27083 15.0125C3.205 15.625 4.50583 15.625 7.10667 15.625Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M14.7916 6.45833H13.9583"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The disc a glyph sits in on a checklist row or an option tile.
 *
 * `tone="brand"` is the lime disc the Desktop-2 checklist draws (a bright
 * `#bfeb58` circle with the pine glyph); `tone="muted"` is the pale pine disc
 * used where a lower-key marker is wanted.
 */
export function GlyphTile({
  icon,
  className,
  tone = "muted",
}: {
  icon: FlowIcon;
  className?: string;
  tone?: "muted" | "brand";
}) {
  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-pine",
        tone === "brand" ? "bg-lime" : "bg-pine/8",
        className,
      )}
    >
      <FlowGlyph icon={icon} />
    </span>
  );
}

/* ----------------------------------------------------------------------------
   Outcome marks
---------------------------------------------------------------------------- */

/**
 * Colour is never the only signal. Each outcome carries its own shape as well
 * as its own colour, and the text beside it names the result in words — so the
 * findings list reads the same to someone who cannot separate the amber from
 * the green, and survives being printed in black and white, which a compliance
 * record frequently is.
 */
const OUTCOME_STYLE: Record<Outcome, { ring: string; ink: string; glyph: string; label: string }> = {
  pass: { ring: "bg-ramp-3", ink: "text-ramp-2", glyph: "✓", label: "Passed" },
  attention: { ring: "bg-caution", ink: "text-caution", glyph: "!", label: "Needs a look" },
  fail: { ring: "bg-danger", ink: "text-danger", glyph: "✕", label: "Failed" },
};

export function OutcomeMark({ outcome }: { outcome: Outcome }) {
  const s = OUTCOME_STYLE[outcome];
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-pill text-[11px] leading-none font-bold text-white",
        s.ring,
      )}
    >
      <span aria-hidden>{s.glyph}</span>
      <span className="sr-only">{s.label}</span>
    </span>
  );
}

export function outcomeInk(outcome: Outcome) {
  return OUTCOME_STYLE[outcome].ink;
}

export function outcomeLabel(outcome: Outcome) {
  return OUTCOME_STYLE[outcome].label;
}
