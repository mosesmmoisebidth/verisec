"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, Copy, Loader2, MailCheck, X } from "lucide-react";

import { BrandedQR } from "@/components/auth/branded-qr";
import { toast } from "@/components/ui/toast";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import { cn } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/** "continue": open it on this device (the code goes to your own email). "send": email the link to someone. */
export type ContinueMode = "continue" | "send";

type Made = { link: string; accessSentTo: string; linkSent: boolean };

const COPY: Record<ContinueMode, { title: string; body: string; field: string; cta: string }> = {
  continue: {
    title: "Continue this verification",
    body: "We make a new link that opens this verification where it stopped, and email a 6-digit access code. The earlier link, and the device that opened it, stop working.",
    field: "Send the access code to",
    cta: "Make new link",
  },
  send: {
    title: "Send this verification by email",
    body: "We email a new link that opens this verification where it stopped, and a 6-digit access code in a separate email. The link opens only with that code. The earlier link, and the device that opened it, stop working.",
    field: "Email",
    cta: "Send link",
  },
};

/**
 * Continue an unfinished verification, or send it on by email (the verifications ⋯ menu). Either way the console
 * makes a new link for the same verification and emails a new access code: whoever opens the link must have that
 * inbox, and the first device that enters the code holds the verification from then on. The flow then picks up
 * at the step where it stopped ("Welcome back").
 */
export function ContinueDialog({ id, label, mode, onClose }: { id: string; label: string; mode: ContinueMode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const myEmail = useCurrentAccount().account?.email?.trim().toLowerCase() || "";
  const [email, setEmail] = useState(mode === "continue" ? myEmail : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Made | null>(null);
  const [copied, setCopied] = useState(false);
  const c = COPY[mode];

  const mount = (node: HTMLDialogElement | null) => {
    ref.current = node;
    if (node && !node.open) node.showModal();
  };

  const submit = async () => {
    if (busy) return;
    const to = email.trim().toLowerCase();
    if (!EMAIL.test(to)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/verifications/${encodeURIComponent(id)}/link`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: to, send: mode === "send" }),
      });
      const j = (await r.json().catch(() => null)) as (Made & { message?: string }) | null;
      if (!r.ok || !j?.link) {
        setError(typeof j?.message === "string" ? j.message : "We couldn't make a new link. Please try again.");
        return;
      }
      setMade({ link: j.link, accessSentTo: j.accessSentTo, linkSent: j.linkSent });
      if (mode === "send") toast.success("Link sent", `${label} to ${j.accessSentTo}`);
    } catch {
      setError("The console is unreachable. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the link is visible to select by hand */
    }
  };

  return createPortal(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={mount}
      aria-labelledby="continue-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-[20px] border border-edge bg-white p-0 text-pine shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
    >
      <div className="flex max-h-[88dvh] flex-col gap-4 overflow-y-auto p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="continue-title" className="m-0 text-h2 font-medium tracking-[-0.3px] text-pine">
              {made ? (made.linkSent ? "Link sent" : "New link ready") : c.title}
            </h2>
            <p className="m-0 text-body text-pine/82">
              <span className="font-medium text-pine">{label}</span>.{" "}
              {made
                ? made.linkSent
                  ? "The link and the access code are on their way, in two separate emails."
                  : "Open it here, or scan the QR to continue on your phone. It asks for the access code first."
                : c.body}
            </p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="-m-1 grid size-7 shrink-0 place-items-center rounded-pill text-pine transition-colors hover:bg-pine/8"
          >
            <X aria-hidden className="size-4.5" strokeWidth={1.6} />
          </button>
        </header>

        {!made ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="continue-email" className="text-body text-ink">
                  {c.field}
                </label>
                {myEmail && email.trim().toLowerCase() !== myEmail ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(myEmail);
                      setError(null);
                    }}
                    title={`Send the code to your own email (${myEmail})`}
                    className="inline-flex max-w-[55%] items-center gap-1.5 rounded-pill border border-hairline bg-panel px-2.5 py-1 text-micro text-pine transition-colors hover:border-pine/30 hover:bg-hover-panel"
                  >
                    <MailCheck aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
                    <span className="truncate">Use my email</span>
                  </button>
                ) : null}
              </div>
              <input
                id="continue-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby="continue-email-note"
                placeholder="name@example.com"
                className={cn(
                  "h-10 w-full rounded-[10px] border bg-panel px-3.5 text-body text-ink outline-none placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime",
                  error ? "border-danger" : "border-hairline",
                )}
              />
              <span id="continue-email-note" role={error ? "alert" : undefined} className={cn("text-micro", error ? "text-danger" : "text-slate")}>
                {error ?? "The access code goes only to this email, never to this screen."}
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={() => ref.current?.close()}
                className="inline-flex h-10 items-center rounded-pill border border-hairline px-4 text-body text-pine transition-colors hover:bg-hover-panel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-pill bg-pine px-4 text-body font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-70"
              >
                {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
                {c.cta}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <div className="grid size-[216px] shrink-0 place-items-center overflow-hidden rounded-[14px] border border-hairline bg-white p-2">
              <BrandedQR data={made.link} size={200} label="QR code, scan to continue this verification" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex items-stretch gap-2">
                <input
                  readOnly
                  value={made.link}
                  aria-label="Verification link"
                  className="h-9 min-w-0 flex-1 rounded-[10px] border border-hairline bg-panel px-3 text-micro text-ink outline-none"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  aria-label="Copy link"
                  className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-hairline bg-panel text-ink transition-colors hover:bg-hover-panel"
                >
                  {copied ? <Check aria-hidden className="size-4 text-positive" strokeWidth={2.2} /> : <Copy aria-hidden className="size-4" strokeWidth={1.7} />}
                </button>
              </div>
              <div className="flex items-start gap-3 rounded-[12px] border border-lime bg-lime-tint px-3.5 py-3">
                <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-pine" strokeWidth={1.7} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-body font-medium text-pine">Access code emailed to {made.accessSentTo}</span>
                  <span className="text-micro text-pine/75">The link works for one hour, only with this code, on the first device that enters it.</span>
                </span>
              </div>
              <div className="mt-auto flex flex-wrap gap-2.5">
                {!made.linkSent ? (
                  <a
                    href={made.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-pill bg-pine px-4 text-body font-medium text-white transition-[filter] hover:brightness-110"
                  >
                    Open here
                    <ArrowUpRight aria-hidden className="size-4" strokeWidth={1.9} />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => ref.current?.close()}
                  className="inline-flex h-9 items-center rounded-pill border border-hairline px-4 text-body text-pine transition-colors hover:bg-hover-panel"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
