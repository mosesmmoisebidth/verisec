import { useEffect, useRef, useState } from "react";
import { Check, Clock, Loader2, TriangleAlert, X } from "lucide-react";

import type { AppInfo } from "@/lib/console/integrations-api";
import { IntegrationsError } from "@/lib/console/integrations-api";
import { WebhooksError } from "@/lib/console/webhooks-api";
import { cn } from "@/lib/utils";

/** Small parts of the Integrations screen, in the Webhooks screen's style. */

export const errText = (e: unknown, fallback: string) =>
  e instanceof IntegrationsError || e instanceof WebhooksError ? e.message : fallback;

/** Logos shipped with the site for the apps on the home page, used until Composio's load. */
const LOCAL_LOGO: Record<string, string> = {
  slack: "/brand/integrations/slack.png",
  googledrive: "/brand/integrations/google-drive.png",
  figma: "/brand/integrations/figma.png",
  instagram: "/brand/integrations/instagram.png",
  tiktok: "/brand/integrations/tiktok.png",
  googleads: "/brand/integrations/google-ads.png",
  discord: "/brand/integrations/discord.svg",
  telegram: "/brand/integrations/telegram.svg",
  gmail: "/brand/integrations/gmail.svg",
  googlesheets: "/brand/integrations/google-sheets.svg",
  linkedin: "/brand/integrations/linkedin.svg",
  whatsapp: "/brand/integrations/whatsapp.svg",
  microsoft_teams: "/brand/integrations/microsoft-teams.svg",
  googlechat: "/brand/integrations/google-chat.svg",
};

export function AppLogo({ app, slug, size }: { app?: Pick<AppInfo, "logo" | "name"> | null; slug: string; size: number }) {
  const src = app?.logo || LOCAL_LOGO[slug];
  if (!src) {
    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-box bg-well text-[11px] font-medium text-slate uppercase"
        style={{ width: size, height: size }}
      >
        {(app?.name ?? slug).slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote app logos from Composio
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[6px] object-contain"
    />
  );
}

export function Tick() {
  return (
    <span
      aria-hidden
      className="grid size-[17px] shrink-0 place-items-center rounded-pill border-[1.5px] border-lime bg-page text-transparent transition-colors peer-checked:bg-lime peer-checked:text-pine peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2"
    >
      <Check className="size-2.5" strokeWidth={3.4} />
    </span>
  );
}

/** The console's switch, controlled: a real checkbox with `role="switch"`. */
export function Toggle({
  on,
  busy,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  busy: boolean;
  disabled?: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={busy || disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        className="pointer-events-none flex h-5 w-9 items-center rounded-pill bg-well p-0.5 transition-colors peer-checked:bg-lime peer-checked:[&>span]:translate-x-4 peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2"
      >
        <span className="size-4 rounded-pill bg-page shadow-sm transition-transform" />
      </span>
    </span>
  );
}

export function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-body font-medium text-pine">{label}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

type Tone = "ok" | "off" | "warn" | "bad" | "wait";
const TONE: Record<Tone, { pill: string; glyph: typeof Check }> = {
  ok: { pill: "bg-pass-tint text-ramp-2", glyph: Check },
  off: { pill: "bg-well text-slate", glyph: X },
  warn: { pill: "bg-caution-tint text-caution", glyph: TriangleAlert },
  bad: { pill: "bg-danger-tint text-danger", glyph: X },
  wait: { pill: "bg-caution-tint text-caution", glyph: Clock },
};

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  const Glyph = t.glyph;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-micro font-medium whitespace-nowrap", t.pill)}>
      <Glyph aria-hidden className="size-3" strokeWidth={2.4} />
      {children}
    </span>
  );
}

/** "2026-07-21 09:14:03", in the viewer's time zone, as on the Webhooks screen. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const button = {
  primary:
    "inline-flex h-9 items-center justify-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100",
  secondary:
    "inline-flex h-9 items-center justify-center gap-2 rounded-pill border border-hairline bg-page px-4 text-body text-pine hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-50",
  link: "inline-flex items-center gap-1.5 text-micro text-pine underline underline-offset-2 transition-colors hover:text-pine/70 disabled:no-underline disabled:opacity-60",
};

export const field =
  "w-full rounded-box border border-hairline bg-page px-3 text-body text-pine placeholder:text-inert focus:outline-none focus-visible:ring-2 focus-visible:ring-pine";

/** A native `<dialog>`, like every other dialog in the console. */
export function Dialog({
  open,
  onClose,
  labelledBy,
  width = 560,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  width?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={labelledBy}
      className="m-auto max-h-[calc(100dvh-32px)] overflow-hidden rounded-shell border border-hairline bg-page p-0 text-pine shadow-xl backdrop:bg-pine/40"
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
    >
      {open ? children : null}
    </dialog>
  );
}

export function DialogHeader({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <h2 id={id} className="m-0 text-[18px] font-medium">
        {title}
      </h2>
      <button type="button" onClick={onClose} aria-label="Close" className="rounded-pill p-1 text-slate hover:bg-hover-light">
        <X aria-hidden className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}

/** A yes/no question before something that cannot be undone. */
export function Confirm({
  open,
  title,
  body,
  action,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  action: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onCancel} labelledBy="confirm-title" width={440}>
      <div className="flex flex-col gap-3 p-6">
        <h2 id="confirm-title" className="m-0 text-[18px] font-medium">
          {title}
        </h2>
        <p className="m-0 text-body text-slate">{body}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className={button.secondary}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm().finally(() => setBusy(false));
            }}
            className="inline-flex h-9 items-center gap-2 rounded-pill bg-danger px-4 text-body font-medium text-page hover:brightness-95 disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.8} /> : null}
            {action}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
