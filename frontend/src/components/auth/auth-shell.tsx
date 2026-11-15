import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { Wordmark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * The chrome both auth screens sit in — the two Figma "Welcome" frames.
 *
 * A ~52 / 48 split on the flow's cream ground: form left, the design's hero
 * panel right. Below `lg` the right panel is dropped rather than stacked — it
 * is decorative, and pushing it above the fold on a phone would bury the form
 * the page exists for.
 *
 * The right panel is the Figma "hero image + testimonials" frame exported
 * whole (`public/illustrations/auth-people.webp`): the lime grid, the two
 * people, the floating scan / tap / card badges, and both testimonial cards,
 * with the frame's own rounded corners and cream margin baked in. It is
 * `alt=""` and `aria-hidden` — it says nothing the form does not.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 bg-cream">
      <section className="flex flex-1 flex-col px-6 py-8 sm:px-10">
        {/* Clickable wordmark, top-left → back to the landing page. Plain <a>
            (hard nav), not next/link: this is a static export, so a Link would
            fetch a non-existent RSC payload and 404 in the console. */}
        <a href="/" aria-label="VeriSec home" className="w-fit shrink-0">
          <Wordmark />
        </a>

        <div className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-[480px]">
            {/* Back to the landing page, right above the Welcome heading. */}
            <a
              href="/"
              className="mb-6 inline-flex items-center gap-1.5 text-body text-quiet transition-colors hover:text-pine"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Back to home
            </a>
            {children}
          </div>
        </div>
      </section>

      <section aria-hidden className="hidden w-[48%] lg:block">
        {/* Centre the panel and let it fit by its own aspect ratio (never
            crop): `object-contain` inside a viewport-tall box keeps the whole
            composition, people AND both cards, visible at any height or zoom
            level, and it scales with the column width in step with the form
            instead of stretching to fill and clipping the edges. */}
        <div className="flex min-h-dvh items-center justify-center p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed
              decorative panel; next/image is `unoptimized` in the static export
              anyway, so it would add config surface and buy nothing. */}
          <img
            src="/illustrations/auth-people.webp?v=3"
            alt=""
            width={1376}
            height={1800}
            loading="eager"
            decoding="async"
            className="max-h-[calc(100dvh-1.5rem)] w-auto max-w-full object-contain"
          />
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Field
---------------------------------------------------------------------------- */

/**
 * A labelled input.
 *
 * Real `<label for>` + `<input>`, and the `autoComplete` tokens are the point:
 * a password manager can only fill a sign-up form it can read, and getting
 * `new-password` vs `current-password` right is the difference between a
 * manager offering to generate one and offering to reuse one.
 */
export function Field({
  id,
  label,
  placeholder,
  type = "text",
  autoComplete,
  inputMode,
  maxLength,
  defaultValue,
  error,
  onChange,
  onBlur,
  children,
}: {
  id: string;
  label: string;
  placeholder: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "email" | "tel" | "none" | "url" | "decimal" | "search";
  maxLength?: number;
  defaultValue?: string;
  error?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body font-medium text-pine">
        {label}
      </label>
      <span className="relative flex items-center">
        <input
          id={id}
          name={id}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          defaultValue={defaultValue}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={onChange}
          onBlur={onBlur}
          className={cn(
            "h-13 w-full rounded-box border bg-tile px-4 text-field text-pine outline-none placeholder:text-quiet/70 focus-visible:ring-2",
            error
              ? "border-[#e0a0a0] focus:border-[#d07a7a] focus-visible:ring-[#e05a5a]/40"
              : "border-card-line focus:border-pine/30 focus-visible:ring-lime",
          )}
        />
        {children}
      </span>
      {error ? (
        <span id={`${id}-error`} className="text-[13px] leading-snug text-[#b3261e]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-col gap-3 pb-8">
      <h1 className="m-0 text-display font-medium text-pine">{title}</h1>
      <p className="m-0 text-read text-quiet">{subtitle}</p>
    </header>
  );
}
