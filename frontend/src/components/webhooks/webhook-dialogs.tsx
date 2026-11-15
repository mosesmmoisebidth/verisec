"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, ShieldAlert, X } from "lucide-react";

import { EnvChip } from "@/components/api-keys/parts";
import type { WebhookEndpointRow } from "@/lib/console/webhooks-api";
import { cn } from "@/lib/utils";

/**
 * The Webhooks screen's dialogs: the signing secret (shown once, after create
 * or rotate) and a confirmation for Rotate and Delete. Native `<dialog>`s, as
 * everywhere in the console: focus trap, Escape and the top layer are the
 * platform's. Same look as the API keys dialogs.
 */

export const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-lime px-5 text-[14px] font-semibold text-pine shadow-cta transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100";
const SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-pill border border-hairline bg-page px-4 text-[14px] font-medium text-pine transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-50";
const DANGER =
  "inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-danger px-5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export function Modal({
  open,
  onClose,
  labelledBy,
  width = 560,
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  width?: number;
  /** false: Escape and the backdrop do nothing (the one-time secret must be acknowledged first). */
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    // Escape (the `cancel` event) becomes a request to close, so the `open` prop stays the only switch.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      style={{ width: `min(${width}px, calc(100vw - 2rem))` }}
      className="m-auto max-h-[calc(100dvh-2rem)] overflow-hidden rounded-[20px] border border-edge bg-white p-0 text-ink shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
    >
      {open ? children : null}
    </dialog>
  );
}

function DialogHeader({ id, title, sub, onClose }: { id: string; title: string; sub?: React.ReactNode; onClose?: () => void }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-rule px-6 pt-5 pb-4">
      <div className="min-w-0">
        <h2 id={id} className="m-0 text-[17.9px] leading-[24px] font-medium tracking-[-0.45px] text-ink">
          {title}
        </h2>
        {sub ? <div className="mt-1 text-[13px] leading-[19px] break-all text-slate">{sub}</div> : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 grid size-7 shrink-0 place-items-center rounded-pill text-ink transition-colors hover:bg-hover-panel"
        >
          <X aria-hidden className="size-4" strokeWidth={1.8} />
        </button>
      ) : null}
    </header>
  );
}

/* ----------------------------------------------------------------------------
   The signing secret, once
---------------------------------------------------------------------------- */

export interface Reveal {
  endpoint: WebhookEndpointRow;
  secret: string;
  rotated: boolean;
  /** After a rotation: until when the previous secret keeps signing. */
  previousUntil?: string;
}

export function SecretDialog({ reveal, onClose }: { reveal: Reveal | null; onClose: () => void }) {
  return (
    <Modal open={!!reveal} onClose={() => undefined} dismissible={false} labelledBy="webhook-secret-title" width={620}>
      {reveal ? <SecretBody reveal={reveal} onClose={onClose} /> : null}
    </Modal>
  );
}

function SecretBody({ reveal, onClose }: { reveal: Reveal; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reveal.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const until = reveal.previousUntil ? new Date(reveal.previousUntil) : null;
  return (
    <div className="flex flex-col">
      <DialogHeader
        id="webhook-secret-title"
        title={reveal.rotated ? "Your new signing secret" : "Endpoint added"}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <EnvChip env={reveal.endpoint.env} />
            {reveal.endpoint.url}
          </span>
        }
      />
      <div className="flex flex-col gap-4 px-6 py-5">
        <p className="m-0 flex items-start gap-2 rounded-[12px] bg-caution-tint px-3.5 py-3 text-[13px] leading-[19px] text-caution">
          <ShieldAlert aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2} />
          This is the only time this signing secret is shown. Copy it now into your server&apos;s secret store; it cannot be shown again.
        </p>
        <div className="flex items-center gap-2 rounded-[14px] border border-edge bg-code-bg p-2 pl-3.5">
          <code className="min-w-0 flex-1 font-mono text-[13px] break-all text-code-ink select-all">{reveal.secret}</code>
          <button type="button" onClick={() => void copy()} className={cn(PRIMARY, "h-9 shrink-0 px-4")}>
            {copied ? <Check aria-hidden className="size-4" strokeWidth={2.6} /> : <Copy aria-hidden className="size-4" strokeWidth={2} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="m-0 text-[13px] leading-[19px] text-slate">
          Every request carries the <code className="font-mono text-[12.5px] text-pine">webhook-id</code>,{" "}
          <code className="font-mono text-[12.5px] text-pine">webhook-timestamp</code> and{" "}
          <code className="font-mono text-[12.5px] text-pine">webhook-signature</code> headers (Standard Webhooks). Check the signature with
          this secret before you trust the body.
        </p>
        {reveal.rotated ? (
          <p className="m-0 text-[13px] leading-[19px] text-slate">
            {until
              ? `The previous secret keeps signing until ${until.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Switch your server before then.`
              : "The previous secret keeps signing for 24 hours. Switch your server before then."}
          </p>
        ) : null}
        <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-ink">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4 accent-[#0e3228]" />
          I have stored this secret safely
        </label>
      </div>
      <footer className="flex justify-end border-t border-rule px-6 py-4">
        <button type="button" onClick={onClose} disabled={!saved} className={PRIMARY}>
          Done
        </button>
      </footer>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Confirm (Rotate, Delete)
---------------------------------------------------------------------------- */

export interface Confirm {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  endpoint: WebhookEndpointRow;
  run: () => Promise<void>;
}

export function ConfirmDialog({ confirm, onClose }: { confirm: Confirm | null; onClose: () => void }) {
  return (
    <Modal open={!!confirm} onClose={onClose} labelledBy="webhook-confirm-title" width={480}>
      {confirm ? <ConfirmBody confirm={confirm} onClose={onClose} /> : null}
    </Modal>
  );
}

function ConfirmBody({ confirm, onClose }: { confirm: Confirm; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col">
      <DialogHeader id="webhook-confirm-title" title={confirm.title} sub={confirm.endpoint.url} onClose={busy ? undefined : onClose} />
      <p className="m-0 px-6 py-5 text-[13.5px] leading-[20px] text-ink">{confirm.body}</p>
      <footer className="flex justify-end gap-2 border-t border-rule px-6 py-4">
        <button type="button" onClick={onClose} disabled={busy} className={SECONDARY}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void confirm.run().finally(() => setBusy(false));
          }}
          className={confirm.danger ? DANGER : PRIMARY}
        >
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.2} /> : null}
          {confirm.confirmLabel}
        </button>
      </footer>
    </div>
  );
}
