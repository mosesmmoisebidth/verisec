import { CreditCard } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A card network's mark, small enough to sit beside a BIN: the overlapping
 * circles for Mastercard and Maestro, the name set in type for the others.
 * Always decorative: the network's name is written next to it or in the
 * element's label.
 */
type NetworkId = "visa" | "mastercard" | "maestro" | "amex" | "discover" | "unionpay" | "jcb" | "diners";

function networkId(name: string | null | undefined): NetworkId | null {
  const n = (name ?? "").toLowerCase();
  if (!n) return null;
  if (n.includes("visa")) return "visa";
  if (n.includes("maestro")) return "maestro";
  if (n.includes("master")) return "mastercard";
  if (n.includes("american express") || n.includes("amex")) return "amex";
  if (n.includes("discover")) return "discover";
  if (n.includes("union")) return "unionpay";
  if (n.includes("jcb")) return "jcb";
  if (n.includes("diners")) return "diners";
  return null;
}

const CIRCLES: Partial<Record<NetworkId, [string, string, string]>> = {
  mastercard: ["#eb001b", "#f79e1b", "#ff5f00"],
  maestro: ["#eb001b", "#00a2e5", "#7375cf"],
};

/** Short names, in each network's own ink, for the networks drawn as type. */
const TYPESET: Partial<Record<NetworkId, { text: string; ink: string }>> = {
  discover: { text: "DISC", ink: "#c2410c" },
  unionpay: { text: "UP", ink: "#c8102e" },
  jcb: { text: "JCB", ink: "#0e4c96" },
  diners: { text: "DC", ink: "#0079be" },
};

function Circles({ colors, className }: { colors: [string, string, string]; className?: string }) {
  const [left, right, overlap] = colors;
  return (
    <svg viewBox="0 0 24 16" aria-hidden className={className}>
      <circle cx="8" cy="8" r="7" fill={left} />
      <circle cx="16" cy="8" r="7" fill={right} />
      <path d="M12 2.255A7 7 0 0 1 12 13.745A7 7 0 0 1 12 2.255Z" fill={overlap} />
    </svg>
  );
}

/** The mark on a small white plate, like the badges at a checkout. */
export function NetworkMark({
  network,
  size = "sm",
  className,
}: {
  network: string | null | undefined;
  size?: "xs" | "sm";
  className?: string;
}) {
  const id = networkId(network);
  const plate = cn(
    "grid shrink-0 place-items-center overflow-hidden ring-1 ring-black/10",
    size === "xs" ? "h-[17px] w-[26px] rounded-[4px]" : "h-[22px] w-[34px] rounded-[5px]",
    className,
  );
  const circles = id ? CIRCLES[id] : undefined;
  const typeset = id ? TYPESET[id] : undefined;

  if (!id) {
    return (
      <span aria-hidden className={cn(plate, "bg-well text-slate")}>
        <CreditCard className={size === "xs" ? "size-3" : "size-3.5"} strokeWidth={1.8} />
      </span>
    );
  }
  if (circles) {
    return (
      <span aria-hidden className={cn(plate, "bg-white")}>
        <Circles colors={circles} className={size === "xs" ? "h-[11px]" : "h-[14px]"} />
      </span>
    );
  }
  if (id === "amex") {
    return (
      <span aria-hidden className={cn(plate, "bg-[#1f72cd] font-bold tracking-[0.04em] text-white", size === "xs" ? "text-[6.5px]" : "text-[8px]")}>
        AMEX
      </span>
    );
  }
  if (id === "visa") {
    return (
      <span
        aria-hidden
        className={cn(plate, "bg-white font-extrabold tracking-[-0.01em] text-[#1a1f71] italic", size === "xs" ? "text-[8px]" : "text-[10.5px]")}
      >
        VISA
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(plate, "bg-white font-bold tracking-[0.02em]", size === "xs" ? "text-[6.5px]" : "text-[8px]")}
      style={{ color: typeset?.ink }}
    >
      {typeset?.text}
    </span>
  );
}
