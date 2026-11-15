"use client";

import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";

import type { TemplatePicker as PickerData } from "@/lib/console/types";

/**
 * "Start a new workflow" — Figma frame Desktop-31's dialog.
 *
 * The only stateful thing on the workflows screen, so it is the only client
 * component: open/closed, and the live template filter. Everything it renders
 * still arrives as data.
 *
 * Rendered as a native <dialog> so focus trapping, Escape and the top layer are
 * the platform's job rather than a hand-rolled overlay that gets them subtly
 * wrong.
 */
export function TemplatePicker({
  picker,
  label,
  onPick,
  busy,
}: {
  picker: PickerData;
  label: string;
  /** Live mode: a tile creates a workflow from its template id ("blank" for scratch). */
  onPick?: (id: string, name: string) => void;
  /** A workflow is being created: tiles are not clickable meanwhile. */
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return picker.templates;
    return picker.templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [picker.templates, query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-[35px] items-center gap-2 rounded-pill bg-lime px-3 text-micro font-medium text-pine transition-[filter] hover:brightness-95"
      >
        <Plus aria-hidden className="size-[15px]" strokeWidth={2} />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/15 p-4 backdrop-blur-[8px]"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={picker.title}
            className="flex max-h-[min(568px,90dvh)] w-full max-w-[768px] flex-col gap-4 rounded-[20px] border border-edge bg-white p-6 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]"
          >
            <header className="flex items-start justify-between gap-4">
              <h2 className="m-0 text-[17.9px] leading-[18px] font-medium tracking-[-0.45px] text-ink">
                {picker.title}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-m-1 grid size-6 place-items-center rounded-pill text-ink transition-colors hover:bg-hover-panel"
              >
                <X aria-hidden className="size-4" strokeWidth={1.6} />
              </button>
            </header>

            <label className="relative flex h-12 shrink-0 items-center rounded-[12px] border border-edge focus-within:border-pine/30 focus-within:ring-2 focus-within:ring-lime/40">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3.5 size-[18px] text-slate"
                strokeWidth={1.7}
              />
              <span className="sr-only">{picker.searchPlaceholder}</span>
              <input
                // Focus has to ENTER the modal on open and this overlay is a
                // plain <div>, not a native <dialog>, so nothing moves it here
                // — removing this would leave focus stranded on the page
                // behind, which is what the rule is trying to prevent. The real
                // fix is to make this a <dialog> like every other one in the
                // app; until then autofocus is the accessible choice.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={picker.searchPlaceholder}
                className="h-full w-full rounded-[12px] bg-transparent pr-3.5 pl-11 text-[15px] text-ink outline-none placeholder:text-slate"
              />
            </label>

            {/* The grid scrolls, not the dialog: the header and search stay put
                while eighteen templates move under them. */}
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {!query &&
                  (onPick ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPick("blank", "")}
                      className="flex flex-col overflow-hidden rounded-[12px] border border-dashed border-edge text-left transition-colors hover:bg-hover-panel disabled:cursor-wait disabled:opacity-60"
                    >
                      <span className="grid w-full flex-1 place-items-center py-9 text-slate">
                        <Plus aria-hidden className="size-6" strokeWidth={1.5} />
                      </span>
                      <span className="px-3 pb-3 text-[13px] font-medium text-ink">{picker.scratch.label}</span>
                    </button>
                  ) : (
                    <a
                      href={picker.scratch.href}
                      className="flex flex-col overflow-hidden rounded-[12px] border border-dashed border-edge transition-colors hover:bg-hover-panel"
                    >
                      <span className="grid flex-1 place-items-center py-9 text-slate">
                        <Plus aria-hidden className="size-6" strokeWidth={1.5} />
                      </span>
                      <span className="px-3 pb-3 text-[13px] font-medium text-ink">
                        {picker.scratch.label}
                      </span>
                    </a>
                  ))}

                {matches.map((t) => {
                  const body = (
                    <>
                      <span
                        aria-hidden
                        className="relative h-[86px] w-full"
                        style={{ background: `linear-gradient(160deg, ${t.from}, ${t.to})` }}
                      >
                        {t.badge ? (
                          <span className="absolute top-2 left-2 rounded-pill bg-white/90 px-2 py-0.5 text-[11px] leading-4 font-medium text-pine">
                            {t.badge}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex flex-col gap-0.5 px-3 py-2.5">
                        <span className="text-[13px] font-medium text-ink">{t.name}</span>
                        {t.summary ? <span className="line-clamp-2 text-[11px] leading-4 text-slate">{t.summary}</span> : null}
                        <span className="tnum text-xs text-slate">{t.priceRange}</span>
                      </span>
                    </>
                  );
                  return onPick ? (
                    <button
                      key={`${t.id ?? ""}:${t.name}`}
                      type="button"
                      disabled={busy || t.disabled}
                      onClick={() => t.id && onPick(t.id, t.name)}
                      title={t.disabled ? t.badge : undefined}
                      className="flex flex-col overflow-hidden rounded-[12px] border border-edge bg-panel text-left transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none"
                    >
                      {body}
                    </button>
                  ) : (
                    <a
                      key={t.name}
                      href={t.href}
                      className="flex flex-col overflow-hidden rounded-[12px] border border-edge bg-panel transition-shadow hover:shadow-md"
                    >
                      {body}
                    </a>
                  );
                })}
              </div>

              {matches.length === 0 && (
                <p className="m-0 py-10 text-center text-[13px] text-slate">{picker.emptyLabel}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
