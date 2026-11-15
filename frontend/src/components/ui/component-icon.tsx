import {
  CalendarCheck,
  ClipboardList,
  Database,
  FileCheck,
  Globe,
  Mail,
  MapPin,
  Phone,
  Radio,
  ScanFace,
  ScanText,
  ShieldAlert,
  Smile,
  SmilePlus,
  UserSearch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ComponentIcon } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * Glyph for each verification component.
 *
 * The data layer carries a string key — a React component cannot travel in a
 * JSON payload — and this is the one place that turns it into something
 * drawable. Adding a check means a key in `ComponentIcon` and a row here.
 */
const GLYPHS: Record<ComponentIcon, LucideIcon> = {
  document: ScanText,
  authenticity: FileCheck,
  nfc: Radio,
  liveness: ScanFace,
  "face-match": Smile,
  "face-search": UserSearch,
  "face-attributes": SmilePlus,
  address: MapPin,
  email: Mail,
  phone: Phone,
  aml: ShieldAlert,
  "device-ip": Globe,
  database: Database,
  age: CalendarCheck,
  questionnaire: ClipboardList,
};

export function CheckGlyph({ icon, className }: { icon: ComponentIcon; className?: string }) {
  const Icon = GLYPHS[icon];
  return <Icon aria-hidden className={cn("size-4", className)} strokeWidth={1.7} />;
}

/** The pine disc a glyph sits in on a lime chip. */
export function CheckBadge({ icon, className }: { icon: ComponentIcon; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-pill bg-pine text-lime",
        className,
      )}
    >
      <CheckGlyph icon={icon} className="size-3.5" />
    </span>
  );
}
