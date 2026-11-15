"use client";

import { useRef } from "react";
import { Box, Check, Clock, Plus, Server, X } from "lucide-react";

import { Select } from "@/components/ui/select";

import type { CreateKeyForm } from "@/lib/console/types";

/**
 * "Create API key" — Figma Desktop-48.
 *
 * The only stateful thing on this screen, so the only client component on it —
 * open and closed, nothing else. Everything it renders still arrives as data.
 *
 * A native `<dialog>` driven by `showModal()`, so focus trapping, Escape, the
 * top layer and inertness of the page behind are the platform's job rather than
 * a hand-rolled overlay that gets them subtly wrong.
 *
 * REAL INPUTS, not styled divs — a real checkbox, a real select, a real text
 * field. Every one is keyboard-operable and announced before a single handler
 * exists, so wiring this form means adding `onSubmit`, not rebuilding it. It is
 * genuinely not wired: submitting is prevented rather than faked, because a
 * dialog that appears to mint a credential and does not is worse than one that
 * plainly cannot yet.
 */
export function CreateKeyDialog({ form, label }: { form: CreateKeyForm; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex h-[35px] shrink-0 items-center gap-2 rounded-pill bg-lime px-3 text-micro font-medium text-pine transition-[filter] hover:brightness-95"
      >
        <Plus aria-hidden className="size-[15px]" strokeWidth={2.2} />
        {label}
      </button>

      {/* Backdrop-close. eslint's premise — a click handler with no keyboard
          path, is false for <dialog>: Escape closes it natively, which is the
          keyboard equivalent this rule exists to require. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={ref}
        aria-labelledby="create-key-title"
        // Native <dialog> does not close on a backdrop click. The target is the
        // dialog itself only when the press landed outside the padded card.
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto w-[min(521px,calc(100vw-2rem))] rounded-[20px] border border-edge bg-white p-0 text-ink shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
      >
        <form
          // Not wired. Prevented rather than left to navigate the page away.
          onSubmit={(e) => e.preventDefault()}
          className="flex max-h-[88dvh] flex-col gap-4 overflow-y-auto p-6"
        >
          <header className="flex items-start justify-between gap-4">
            <h2
              id="create-key-title"
              className="m-0 text-[17.9px] leading-[18px] font-medium tracking-[-0.45px] text-ink"
            >
              {form.title}
            </h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label={form.closeLabel}
              className="-m-1 grid size-6 shrink-0 place-items-center rounded-pill text-ink transition-colors hover:bg-hover-panel"
            >
              <X aria-hidden className="size-4" strokeWidth={1.6} />
            </button>
          </header>

          <Field label={form.nameLabel} htmlFor="key-name">
            <span className="relative flex h-9 items-center">
              <Server
                aria-hidden
                className="pointer-events-none absolute left-3 size-[18px] text-slate"
                strokeWidth={1.5}
              />
              <input
                id="key-name"
                name="name"
                type="text"
                autoComplete="off"
                placeholder={form.namePlaceholder}
                className="h-full w-full rounded-[10px] border border-hairline bg-panel pr-3 pl-10 text-body text-ink outline-none placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime"
              />
            </span>
          </Field>

          <Field label={form.envLabel} htmlFor="key-env">
            <Combobox id="key-env" name="environment" options={form.envOptions} icon={Box} />
          </Field>

          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="p-0 text-body text-ink">{form.permissionsLabel}</legend>
            {/* The frame's two-column grid, one column on a narrow viewport. A
                permission whose label truncates is a permission nobody can
                grant with confidence. */}
            <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {form.permissions.map((permission) => (
                <label
                  key={permission.label}
                  className="flex cursor-pointer items-center gap-2.5 py-0.5"
                >
                  <input
                    type="checkbox"
                    name="permissions"
                    value={permission.label}
                    defaultChecked={permission.on}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="grid size-[17px] shrink-0 place-items-center rounded-pill border-[1.5px] border-lime bg-page text-transparent transition-colors peer-checked:bg-lime peer-checked:text-pine peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2"
                  >
                    <Check className="size-2.5" strokeWidth={3.4} />
                  </span>
                  <span className="min-w-0 text-body text-ink">{permission.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field label={form.rateLabel} htmlFor="key-rate">
            <Combobox id="key-rate" name="rateLimit" options={form.rateOptions} icon={Clock} />
          </Field>

          <button
            type="submit"
            className="mt-1 inline-flex h-9 w-full items-center justify-center rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95"
          >
            {form.submitLabel}
          </button>
        </form>
      </dialog>
    </>
  );
}

/* ----------------------------------------------------------------------------
   Field parts
---------------------------------------------------------------------------- */

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={htmlFor} className="text-body text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

/** The frame's `Combobox` — now the platform's custom `Select` (no native OS
 *  popup), keeping the leading icon the frame draws. */
function Combobox({
  id,
  name,
  options,
  icon: Icon,
}: {
  id: string;
  name: string;
  options: string[];
  icon: typeof Box;
}) {
  return (
    <Select
      block
      id={id}
      name={name}
      label={name}
      options={options}
      icon={Icon}
      className="h-9 w-full rounded-[10px] border border-hairline bg-panel py-0 pr-10 pl-10 text-body text-ink"
    />
  );
}
