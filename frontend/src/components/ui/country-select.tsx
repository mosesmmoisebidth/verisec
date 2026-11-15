"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import type { Country } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * Country picker — every ISO country with its flag, a search box, and full
 * keyboard support, writing a hidden input so the value submits under `name`.
 *
 * The country list comes from the `world-countries` dataset (passed in from a
 * server component so the dataset stays out of the client bundle); the flags are
 * the SVGs in `public/flags/<code>.svg`. The trigger keeps the caller's own
 * `className` so it matches the field it sits in, exactly like `Select`.
 */
export function CountrySelect({
  countries,
  name,
  defaultCode,
  label,
  className,
  id,
  onChange,
  dial,
}: {
  countries: readonly Country[];
  name?: string;
  /** Initial alpha-2 code (lowercased). Falls back to the first country. */
  defaultCode?: string;
  label?: string;
  className?: string;
  id?: string;
  /** Reports the selected alpha-2 code, including the initial one on mount. */
  onChange?: (code: string) => void;
  /** Calling-code mode: the trigger shows only flag + dial code, and each row
   *  shows the dial code beside the name. Countries must carry `dial`. */
  dial?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [code, setCode] = useState(defaultCode ?? countries[0]?.code ?? "");

  // Report the initial code once so callers capture the default without a click.
  const reported = useRef(false);
  useEffect(() => {
    if (!reported.current && code) {
      reported.current = true;
      onChange?.(code);
    }
  }, [code, onChange]);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;

  const selected = useMemo(
    () => countries.find((c) => c.code === code),
    [countries, code],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    const digits = q.replace(/[^\d]/g, "");
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code === q ||
        (digits && c.dial ? c.dial.replace("+", "").startsWith(digits) : false),
    );
  }, [countries, query]);

  const [active, setActive] = useState(0);

  // Keep the active row in range as the filter narrows, and reset to the top on
  // a new query.
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (open) optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Focus the search as the menu opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const commit = (c: Country) => {
    setCode(c.code);
    onChange?.(c.code);
    setOpen(false);
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(filtered.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[active]) commit(filtered[active]);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative flex w-full">
      {name ? <input type="hidden" name={name} value={code} /> : null}

      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex cursor-pointer items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-pine/28",
          className,
        )}
      >
        {selected ? <Flag code={selected.code} /> : null}
        <span className="min-w-0 flex-1 truncate">
          {dial ? (selected?.dial ?? "Code") : (selected?.name ?? "Select a country")}
        </span>
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
          className={cn(
            "absolute top-[calc(100%+6px)] left-0 z-50 flex max-h-[min(340px,60vh)] w-full flex-col overflow-hidden rounded-2xl border border-divider bg-white shadow-lg",
            dial ? "min-w-[300px]" : "min-w-[240px]",
          )}
          role="dialog"
          aria-label={label}
        >
          <div className="flex items-center gap-2 border-b border-divider px-3 py-2">
            <Search aria-hidden className="size-4 shrink-0 text-pine/47" strokeWidth={1.7} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search countries"
              aria-label="Search countries"
              className="h-8 w-full border-0 bg-transparent text-field text-pine placeholder:text-pine/47 focus:outline-none"
            />
          </div>

          <div role="listbox" id={listboxId} aria-label={label} className="overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="m-0 px-3 py-6 text-center text-field text-pine/47">No countries found</p>
            ) : (
              filtered.map((c, i) => {
                const isSelected = c.code === code;
                const isActive = i === active;
                return (
                  <button
                    key={c.code}
                    ref={(el) => {
                      optionRefs.current[i] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commit(c)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-field text-pine outline-none transition-colors",
                      isActive ? "bg-pine/6" : "hover:bg-pine/6",
                      isSelected && "font-medium",
                    )}
                  >
                    <Flag code={c.code} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {dial && c.dial ? <span className="tnum shrink-0 text-body text-quiet">{c.dial}</span> : null}
                    {isSelected ? (
                      <Check aria-hidden className="size-4 shrink-0 text-pine" strokeWidth={2} />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A flag SVG from `public/flags/`, hidden if the file is missing. */
export function Flag({ code }: { code: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${code}.svg`}
      alt=""
      aria-hidden
      loading="lazy"
      width={22}
      height={16}
      className="h-4 w-[22px] shrink-0 rounded-[2px] object-cover ring-1 ring-pine/10"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}
