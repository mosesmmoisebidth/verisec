"use client";

/**
 * The pieces every Explorer view is drawn from, in the console's Figma language (the verification detail and the
 * playground): one grey panel per result set holding white rows, term-above-detail facts, the underline tab strip,
 * the floating drawer. Each shape lives here once so the ten data sets read as one product.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronDown, Copy, Home, Landmark, Plane, Search, Ship, User, Users, Wallet, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type Tone = "danger" | "caution" | "approve" | "inert";

const TONE_PILL: Record<Tone, string> = {
  danger: "bg-danger-tint text-danger",
  caution: "bg-caution-tint text-caution",
  approve: "bg-approve-tint text-approve",
  inert: "bg-inert-tint text-inert",
};
const TONE_DOT: Record<Tone, string> = {
  danger: "bg-danger",
  caution: "bg-caution",
  approve: "bg-approve",
  inert: "bg-muted",
};

/** A risk or status tag. The dot repeats the colour as a shape, so the tag still reads where the hue does not. */
export function Tag({ tone = "inert", children, title, check }: { tone?: Tone; children: ReactNode; title?: string; check?: boolean }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-micro font-medium whitespace-nowrap", TONE_PILL[tone])}>
      {check ? <Check aria-hidden className="size-3" strokeWidth={2.6} /> : <span aria-hidden className={cn("size-1.5 rounded-full", TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

/** A plain value chip (aliases, programmes, networks): quiet, no status colour. */
export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex max-w-full items-center rounded-pill bg-well px-2 py-0.5 text-micro text-pine">
      <span className="truncate">{children}</span>
    </span>
  );
}

/** A copy button for a value shown beside it. */
export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <button type="button" onClick={copy} aria-label={copied ? "Copied" : `Copy ${value}`} title={copied ? "Copied" : "Copy"} className={cn("grid size-7 shrink-0 place-items-center rounded-well text-muted hover:bg-hover-light hover:text-pine", className)}>
      {copied ? <Check aria-hidden className="size-3.5 text-approve" strokeWidth={2.6} /> : <Copy aria-hidden className="size-3.5" strokeWidth={2} />}
    </button>
  );
}

/** An identifier (LEI, IMO, wallet, record id, list code). Monospaced because it is compared character by character, and
 *  copyable, so a reviewer can carry it into another system exactly. */
export function Ident({ children, title }: { children: ReactNode; title?: string }) {
  const [copied, setCopied] = useState(false);
  const value = typeof children === "string" || typeof children === "number" ? String(children) : null;
  const copy = () => {
    if (!value || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <span title={title} className="inline-flex max-w-full items-center gap-1 rounded-well border border-hairline bg-page py-0.5 pr-0.5 pl-1.5 font-mono text-[11.5px] leading-4 text-pine">
      <span className="[overflow-wrap:anywhere]">{children}</span>
      {value && (
        <button type="button" onClick={copy} aria-label={copied ? "Copied" : `Copy ${value}`} title={copied ? "Copied" : "Copy"} className="grid size-4 shrink-0 place-items-center rounded-[4px] text-muted hover:bg-hover-light hover:text-pine">
          {copied ? <Check aria-hidden className="size-3 text-approve" strokeWidth={2.6} /> : <Copy aria-hidden className="size-3" strokeWidth={2} />}
        </button>
      )}
    </span>
  );
}

/** The grey container one result set sits in (the frames' detail panel). */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex min-w-0 flex-col gap-4 rounded-shell border border-edge bg-panel p-5", className)}>{children}</section>;
}

/** A white tile inside a panel. */
export function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 rounded-box border border-hairline bg-page p-4", className)}>{children}</div>;
}

export function SectionTitle({ children, count, aside }: { children: ReactNode; count?: number; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="m-0 text-section font-medium text-pine">
        {children}
        {count !== undefined && <span className="tnum ml-1.5 text-body font-normal text-muted">{count.toLocaleString()}</span>}
      </h3>
      {aside}
    </div>
  );
}

export type Fact = { term: string; detail: ReactNode; wide?: boolean };

/** Term above detail, in columns. Empty details are left out rather than drawn as dashes. */
export function Facts({ facts, columns = 3 }: { facts: Fact[]; columns?: 2 | 3 | 4 }) {
  const shown = facts.filter((f) => f.detail !== null && f.detail !== undefined && f.detail !== "" && !(Array.isArray(f.detail) && !f.detail.length));
  if (!shown.length) return null;
  return (
    <dl
      className={cn(
        "m-0 grid gap-x-6 gap-y-4",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
      )}
    >
      {shown.map((f) => (
        <div key={f.term} className={cn("flex min-w-0 flex-col gap-0.5", f.wide && "sm:col-span-full")}>
          <dt className="text-micro text-muted">{f.term}</dt>
          <dd className="m-0 min-w-0 text-body break-words text-pine [overflow-wrap:anywhere]">{f.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ tables -- */

export type Col = { key: string; header: string; width: number; align?: "left" | "right" };

/** The dashboard table: one grid template shared by the header and every row, widths as ratios. */
export function Rows({ cols, rows, minWidth = 560, empty }: { cols: Col[]; rows: Record<string, ReactNode>[]; minWidth?: number; empty?: string }) {
  const template = cols.map((c) => `${c.width}fr`).join(" ");
  if (!rows.length) return empty ? <p className="m-0 py-3 text-body text-inert">{empty}</p> : null;
  return (
    <div className="min-w-0 overflow-x-auto">
      <div role="table" style={{ minWidth }}>
        <div role="row" className="grid items-center gap-x-4 pb-2" style={{ gridTemplateColumns: template }}>
          {cols.map((c) => (
            <span key={c.key} role="columnheader" className={cn("text-micro text-muted", c.align === "right" && "text-right")}>
              {c.header}
            </span>
          ))}
        </div>
        <div role="rowgroup">
          {rows.map((r, i) => (
            <div key={i} role="row" className="grid items-center gap-x-4 border-t border-rule py-2.5" style={{ gridTemplateColumns: template }}>
              {cols.map((c) => (
                <div key={c.key} role="cell" className={cn("tnum min-w-0 text-body break-words text-pine [overflow-wrap:anywhere]", c.align === "right" && "text-right")}>
                  {r[c.key] ?? <span className="text-muted">-</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tab strip -- */

/** The verification detail's strip: a white bar, the active tab washed lime with a lime rule under it. */
export function TabStrip<T extends string>({
  tabs,
  current,
  onSelect,
  label,
  className,
}: {
  tabs: { id: T; label: string; icon?: LucideIcon; count?: number | string }[];
  current: T;
  onSelect: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div role="tablist" aria-label={label} className="flex gap-0.5 overflow-x-auto rounded-tab border border-hairline bg-page p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(({ id, label: text, icon: Icon, count }) => {
          const active = id === current;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(id)}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 rounded-well px-3.5 py-2 text-body whitespace-nowrap transition-colors",
                active ? "bg-[image:var(--gradient-tab)] font-medium text-pine" : "text-slate hover:bg-hover-light hover:text-pine",
              )}
            >
              {Icon && <Icon aria-hidden className="size-4" strokeWidth={1.8} />}
              {text}
              {count !== undefined && <span className={cn("tnum text-micro", active ? "text-pine/70" : "text-muted")}>{count.toLocaleString()}</span>}
              {active && <span aria-hidden className="absolute inset-x-2.5 bottom-0.5 h-[3px] rounded-full bg-lime" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ entity glyph -- */

const GLYPH: Record<string, LucideIcon> = {
  Person: User,
  Company: Building2,
  Organization: Users,
  LegalEntity: Building2,
  PublicBody: Landmark,
  Vessel: Ship,
  Airplane: Plane,
  CryptoWallet: Wallet,
  RealEstate: Home,
};

/** What the record is, tinted by its gravest risk: the column an operator's eye runs down. */
export function EntityGlyph({ schema, tone = "inert", size = "md" }: { schema?: string; tone?: Tone; size?: "md" | "lg" }) {
  const Icon = GLYPH[String(schema)] ?? Building2;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-box",
        size === "md" ? "size-10" : "size-12",
        tone === "danger" && "bg-danger-tint text-danger",
        tone === "caution" && "bg-caution-tint text-caution",
        tone === "approve" && "bg-approve-tint text-approve",
        tone === "inert" && "bg-well text-pine",
      )}
    >
      <Icon className={size === "md" ? "size-[18px]" : "size-5"} strokeWidth={1.8} />
    </span>
  );
}

/* ------------------------------------------------------------------ filter menu -- */

export type Option = { value: string; label: string; count?: number };

/** A toolbar filter: a pill that opens a checklist with counts. Picking applies at once and leaves the list open. */
export function FilterMenu({
  label,
  options,
  selected,
  onToggle,
  disabled,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    findRef.current?.focus();
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  if (!options.length) return null;
  const shown = find ? options.filter((o) => o.label.toLowerCase().includes(find.toLowerCase())) : options;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-pill border px-3.5 text-micro transition-colors disabled:opacity-60",
          selected.length ? "border-pine/30 bg-lime-tint text-pine" : "border-edge bg-page text-pine hover:bg-hover-light",
        )}
      >
        {label}
        {selected.length > 0 && <span className="tnum grid min-w-4 place-items-center rounded-pill bg-pine px-1 text-[10px] leading-4 text-lime">{selected.length}</span>}
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-30 flex w-[300px] flex-col rounded-box border border-hairline bg-page p-1.5 shadow-[0_16px_40px_-12px_rgba(14,50,40,0.28)]">
          {options.length > 8 && (
            <label className="mb-1 flex items-center gap-2 rounded-well bg-panel px-2.5">
              <Search aria-hidden className="size-3.5 text-search-glyph" strokeWidth={2} />
              <input
                ref={findRef}
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder={`Find ${label.toLowerCase()}`}
                className="h-8 min-w-0 flex-1 bg-transparent text-micro text-pine outline-none placeholder:text-muted"
              />
            </label>
          )}
          <ul className="m-0 max-h-[300px] list-none overflow-y-auto p-0">
            {shown.map((o) => {
              const on = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(o.value)}
                    className="flex w-full items-center gap-2.5 rounded-well px-2.5 py-2 text-left text-micro text-pine hover:bg-hover-light disabled:opacity-60"
                  >
                    <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-[5px] border", on ? "border-pine bg-pine text-lime" : "border-edge bg-page")}>
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.count !== undefined && <span className="tnum shrink-0 text-muted">{o.count.toLocaleString()}</span>}
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="px-2.5 py-2 text-micro text-muted">Nothing matches.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A removable chip for an active filter. */
export function ActiveFilter({ children, onRemove, disabled }: { children: ReactNode; onRemove: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-pine py-1 pr-1 pl-2.5 text-micro text-lime">
      {children}
      <button type="button" disabled={disabled} onClick={onRemove} aria-label="Remove filter" className="grid size-4 place-items-center rounded-full hover:bg-white/15">
        <X aria-hidden className="size-3" strokeWidth={2.4} />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ drawer -- */

/** The playground's history drawer: a floating rounded panel over a frosted page. Escape or the backdrop closes it. */
export function Drawer({ open, onClose, label, header, children }: { open: boolean; onClose: () => void; label: string; header: ReactNode; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-pine/10 backdrop-blur-md duration-200 animate-in fade-in" />
      <aside
        role="dialog"
        aria-label={label}
        className="absolute top-4 right-4 bottom-4 flex w-[min(780px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[24px] border border-hairline bg-page shadow-[0_28px_70px_-16px_rgba(14,50,40,0.45)] duration-200 animate-in slide-in-from-right-4 fade-in"
      >
        <div className="flex items-start justify-between gap-4 border-b border-edge px-6 py-5">
          <div className="min-w-0 flex-1">{header}</div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full text-pine/60 transition-colors hover:bg-hover-light hover:text-pine"
          >
            <X aria-hidden className="size-5" strokeWidth={1.8} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ loading -- */

function Bone({ className, width }: { className?: string; width?: number }) {
  return <span aria-hidden style={width ? { width } : undefined} className={cn("block rounded-well bg-well", className)} />;
}

/** Placeholders in the shape of what is coming: a summary row, the filter bar and result rows. */
export function ListSkeleton({ rows = 5, summary = true }: { rows?: number; summary?: boolean }) {
  return (
    <Panel className="animate-pulse">
      <span className="sr-only" role="status">
        Please wait
      </span>
      <div className="flex items-center justify-between">
        <Bone className="h-6 w-56" />
        <Bone className="h-4 w-24" />
      </div>
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="flex items-center gap-3 rounded-box border border-hairline bg-page px-3 py-3">
              <Bone className="size-8 rounded-box" />
              <span className="flex flex-1 flex-col gap-1.5">
                <Bone className="h-3 w-16" />
                <Bone className="h-4 w-10" />
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {[88, 96, 80, 104].map((w) => (
          <Bone key={w} width={w} className="h-9 rounded-pill" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className="flex items-center gap-4 rounded-box border border-hairline bg-page p-4">
            <Bone className="size-10 rounded-box" />
            <span className="flex flex-1 flex-col gap-2">
              <Bone className="h-4" />
              <Bone className="h-3 w-1/3" />
            </span>
            <Bone className="hidden h-5 w-20 rounded-pill sm:block" />
            <Bone className="hidden h-5 w-14 rounded-pill sm:block" />
          </span>
        ))}
      </div>
    </Panel>
  );
}

/** Placeholders for a single record: a header, a grid of facts, a table. */
export function RecordSkeleton() {
  return (
    <Panel className="animate-pulse">
      <span className="sr-only" role="status">
        Please wait
      </span>
      <div className="flex items-center gap-4">
        <Bone className="size-12 rounded-box" />
        <span className="flex flex-1 flex-col gap-2">
          <Bone className="h-5 w-72" />
          <Bone className="h-3 w-40" />
        </span>
        <Bone className="h-6 w-24 rounded-pill" />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-box border border-hairline bg-page p-4 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="flex flex-col gap-1.5">
            <Bone className="h-3 w-20" />
            <Bone className="h-4 w-3/4" />
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-box border border-hairline bg-page p-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} className="h-4" />
        ))}
      </div>
    </Panel>
  );
}

/** Said in the panel's voice when there is nothing to show, with what to do next. */
export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <Panel className="items-center py-12 text-center">
      <span className="grid size-12 place-items-center rounded-box border border-hairline bg-page text-pine">
        <Icon aria-hidden className="size-5" strokeWidth={1.7} />
      </span>
      <p className="m-0 max-w-[52ch] text-body font-medium text-pine">{title}</p>
      {children}
    </Panel>
  );
}
