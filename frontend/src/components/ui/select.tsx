"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The viewport offset of the nearest ancestor that acts as the containing block
 * for a `position: fixed` descendant. A `transform` (even an identity matrix left
 * by an animation), `perspective`, `filter`, `backdrop-filter`, `will-change` of
 * those, or `contain: paint/layout` all make an element the containing block, so
 * a fixed child's `top`/`left` are then measured from that box, NOT the viewport.
 * We subtract this from the viewport coordinates so the menu lands where the
 * trigger actually is. Returns {0,0} when nothing intervenes (the plain case).
 */
function fixedContainingOffset(from: HTMLElement): { left: number; top: number } {
  let el: HTMLElement | null = from.parentElement;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    const backdrop =
      cs.getPropertyValue("backdrop-filter") || cs.getPropertyValue("-webkit-backdrop-filter");
    const contains = cs.contain.split(/\s+/);
    if (
      cs.transform !== "none" ||
      cs.perspective !== "none" ||
      (cs.filter && cs.filter !== "none") ||
      (backdrop && backdrop !== "none") ||
      cs.willChange.includes("transform") ||
      cs.willChange.includes("filter") ||
      cs.willChange.includes("perspective") ||
      contains.some((c) => c === "paint" || c === "layout" || c === "strict" || c === "content")
    ) {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    }
    el = el.parentElement;
  }
  return { left: 0, top: 0 };
}

/**
 * The platform's dropdown — a styled, keyboard-accessible replacement for the
 * native `<select>`, used everywhere inside the console (not the marketing
 * site). A native select cannot be styled to match the frames — its popup is
 * the OS's — so this renders its own trigger + menu while keeping the important
 * parts of `<select>`'s behaviour: it is a real focusable control, it is
 * operable by keyboard (↑/↓/Home/End/Enter/Esc, type-ahead), it closes on
 * outside-click and Escape, and for form use it writes a hidden input so the
 * value still submits under `name`.
 *
 * The TRIGGER keeps each call site's own classes (`className`) so a pill filter,
 * a dialog field and a bare inline control all look right where they sit; only
 * the popup menu is shared. An optional leading `icon` is drawn where the site's
 * left padding reserves room for it.
 */
export function Select({
  options,
  defaultValue,
  value: controlled,
  onValueChange,
  label,
  name,
  id,
  icon: Icon,
  className,
  menuAlign = "start",
  menuPlacement = "down",
  menuFixed = false,
  block,
  disabled,
  sections,
}: {
  options: readonly string[];
  /** Initial value when uncontrolled. Defaults to the first option. */
  defaultValue?: string;
  /** Controlled value. Provide with `onValueChange`. */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Accessible name for the control. */
  label?: string;
  /** Renders a hidden input so the value submits inside a form. */
  name?: string;
  id?: string;
  icon?: LucideIcon;
  /** Trigger classes — match the surrounding control. */
  className?: string;
  /** Which edge the menu aligns to. */
  menuAlign?: "start" | "end";
  /** Open the menu upward (for a trigger near the bottom of a clipped box). */
  menuPlacement?: "down" | "up";
  /**
   * Render the menu with `position: fixed` instead of absolute, so it escapes an
   * ancestor's `overflow`/`max-height` clipping — needed inside a `<dialog>` or a
   * scroll container where an absolute menu would be cut off.
   */
  menuFixed?: boolean;
  /** Fill the container width (form fields) instead of sizing to content. */
  block?: boolean;
  disabled?: boolean;
  /** Headings in the menu: each sits above the option at `start` (an index into `options`). */
  sections?: readonly { label: string; start: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? options[0] ?? "");
  const value = controlled ?? internal;

  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeahead = useRef<{ term: string; at: number }>({ term: "", at: 0 });

  const selectedIndex = Math.max(0, options.indexOf(value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [fixedPos, setFixedPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;

  const commit = (v: string) => {
    if (controlled === undefined) setInternal(v);
    onValueChange?.(v);
    setOpen(false);
  };

  // Focus the active option as it changes so screen readers and the eye track
  // together, and the menu scrolls it into view.
  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  // Opening starts from the current selection, not wherever the cursor last was.
  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // When fixed, anchor the menu to the trigger's viewport rect so `overflow`
  // clipping (a <dialog>, a scroll container) can't cut it off. The trigger rect
  // is in viewport coordinates, but a `position: fixed` menu is placed relative
  // to its containing block, which a transformed / backdrop-filtered ancestor
  // (the animated flow card) can hijack — so we subtract that box's offset, and
  // clamp to the viewport so the menu never runs off an edge.
  useEffect(() => {
    if (!open || !menuFixed) return;
    const place = () => {
      const root = rootRef.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      const off = fixedContainingOffset(root);
      const margin = 8;
      const width = r.width;
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      const vLeft = Math.min(Math.max(margin, r.left), maxLeft);
      setFixedPos({ top: r.bottom + 6 - off.top, left: vLeft - off.left, width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, menuFixed]);

  const move = (delta: number) =>
    setActiveIndex((i) => Math.min(options.length - 1, Math.max(0, i + delta)));

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        open ? move(1) : setOpen(true);
        break;
      case "ArrowUp":
        e.preventDefault();
        open ? move(-1) : setOpen(true);
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        open ? commit(options[activeIndex]!) : setOpen(true);
        break;
      case "Escape":
        // closes this menu only, not the dialog it sits in
        if (open) {
          e.preventDefault();
          e.stopPropagation();
        }
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        // Type-ahead: jump to the next option starting with the typed run.
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const now = Date.now();
          const term = (now - typeahead.current.at < 600 ? typeahead.current.term : "") + e.key.toLowerCase();
          typeahead.current = { term, at: now };
          const found = options.findIndex((o) => o.toLowerCase().startsWith(term));
          if (found >= 0) {
            if (!open) setOpen(true);
            setActiveIndex(found);
          }
        }
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", block ? "flex w-full" : "inline-flex")}>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={cn(
          "relative inline-flex cursor-pointer items-center text-left outline-none focus-visible:ring-2 focus-visible:ring-lime disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {Icon ? (
          <Icon
            aria-hidden
            className="pointer-events-none absolute left-3 size-[15px] text-slate"
            strokeWidth={1.7}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{value}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "pointer-events-none absolute right-3 size-[15px] text-pine transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={1.6}
        />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="listbox"
          id={listboxId}
          aria-label={label}
          aria-activedescendant={`${listboxId}-${activeIndex}`}
          className={cn(
            "z-[80] max-h-[min(280px,60vh)] overflow-y-auto rounded-2xl border border-hairline bg-page p-1 shadow-lg",
            menuFixed ? "fixed" : "absolute min-w-full",
            !menuFixed && (menuPlacement === "up" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"),
            !menuFixed && (menuAlign === "end" ? "right-0" : "left-0"),
          )}
          style={
            menuFixed
              ? fixedPos
                ? { top: fixedPos.top, left: fixedPos.left, width: fixedPos.width }
                : { visibility: "hidden" }
              : undefined
          }
        >
          {options.map((option, i) => {
            const isSelected = option === value;
            const isActive = i === activeIndex;
            const heading = sections?.find((s) => s.start === i);
            return (
              <div key={option} role="presentation">
              {heading ? (
                <div
                  role="presentation"
                  className={cn("px-3 pt-2 pb-1 text-[11.5px] font-medium text-slate", i > 0 && "mt-1 border-t border-hairline pt-2.5")}
                >
                  {heading.label}
                </div>
              ) : null}
              <button
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                type="button"
                role="option"
                id={`${listboxId}-${i}`}
                aria-selected={isSelected}
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(option)}
                onKeyDown={onKeyDown}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-micro whitespace-nowrap text-pine outline-none transition-colors",
                  isActive ? "bg-hover-light" : "hover:bg-hover-light",
                  isSelected && "font-medium",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option}</span>
                {isSelected ? (
                  <Check aria-hidden className="size-4 shrink-0 text-pine" strokeWidth={2} />
                ) : null}
              </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
