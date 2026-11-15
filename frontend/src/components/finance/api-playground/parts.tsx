"use client";

import { Check, CreditCard, LockKeyhole, Plus, Receipt, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { FinGroup } from "@/lib/finance/playground-catalog";
import type { HeaderRow } from "@/lib/finance/playground-run";
import { cn } from "@/lib/utils";

/** Each product's tile, in the KYC Playground's tile style. */
export const FIN_GROUP_META: Record<FinGroup, { icon: LucideIcon; tile: string }> = {
  MICR: { icon: Receipt, tile: "bg-lime-tint text-pine" },
  "Credit Card": { icon: CreditCard, tile: "bg-info-tint text-info" },
};

export function FinGroupTile({ group, size = "md" }: { group: FinGroup; size?: "sm" | "md" }) {
  const meta = FIN_GROUP_META[group];
  const Icon = meta.icon;
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center", meta.tile, size === "md" ? "size-10 rounded-[12px]" : "size-5 rounded-[6px]")}>
      <Icon className={size === "md" ? "size-[19px]" : "size-3"} strokeWidth={1.8} />
    </span>
  );
}

/**
 * The request's headers: the ones the request always carries (locked), then any
 * you add. Content-Type is the one this endpoint really sends (a multipart upload
 * for a photo, JSON for a typed check, none for a lookup).
 */
export function FinHeaderEditor({ rows, setRows, contentType }: { rows: HeaderRow[]; setRows: (fn: (r: HeaderRow[]) => HeaderRow[]) => void; contentType: string | null }) {
  const cell = "h-9 min-w-0 rounded-[9px] border border-edge bg-page px-2.5 font-mono text-[12px] text-pine outline-none hover:border-[#cbd3dd] focus:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/60";
  const locked: [string, string][] = [["Authorization", "Bearer YOUR_API_KEY"], ...(contentType ? ([["Content-Type", contentType]] as [string, string][]) : []), ["Accept", "application/json"]];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_32px] gap-2 px-0.5 text-[11px] font-medium text-slate">
        <span />
        <span>Header</span>
        <span>Value</span>
        <span />
      </div>
      {locked.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_32px] items-center gap-2">
          <span aria-hidden className="grid size-[18px] place-items-center rounded-[5px] bg-pine/40 text-page">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="flex h-9 items-center gap-1.5 rounded-[9px] bg-well px-2.5 font-mono text-[12px] text-slate">
            <LockKeyhole aria-hidden className="size-3.5" strokeWidth={1.8} />
            {k}
          </span>
          <span className="flex h-9 min-w-0 items-center truncate rounded-[9px] bg-well px-2.5 font-mono text-[12px] text-slate">{v}</span>
          <span />
        </div>
      ))}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_32px] items-center gap-2">
          <input
            type="checkbox"
            checked={r.on}
            aria-label={`Send ${r.name || "this header"}`}
            onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
            className="size-[18px] accent-pine"
          />
          <input
            value={r.name}
            placeholder="Header"
            onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            className={cell}
          />
          <input
            value={r.value}
            placeholder="Value"
            onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, value: e.target.value, on: x.on || !!e.target.value } : x)))}
            className={cell}
          />
          <button
            type="button"
            aria-label="Remove this header"
            onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
            className="grid size-8 place-items-center rounded-pill text-slate transition-colors hover:bg-danger-tint hover:text-danger"
          >
            <Trash2 aria-hidden className="size-4" strokeWidth={1.9} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((all) => [...all, { name: "", value: "", on: true }])}
        className="inline-flex h-9 w-fit items-center gap-1.5 rounded-pill border border-dashed border-edge px-3.5 text-[12.5px] font-medium text-pine transition-colors hover:border-pine/40 hover:bg-hover-light"
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={2.2} />
        Add a header
      </button>
    </div>
  );
}
