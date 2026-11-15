"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { KeyRound, Loader2, ShieldOff } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { linkGate } from "@/lib/verify/dpop";
import { cn } from "@/lib/utils";

/**
 * Over every screen of the flow: the link's access code, when it asks for one, or why the verification cannot go
 * on (disabled by the organisation, already finished, opened on another device, locked, expired). Nothing of the
 * flow behind it works until the code is right, and a stopped verification stays stopped.
 */
export function LinkGate() {
  const g = useSyncExternalStore(linkGate.subscribe, linkGate.get, () => null);
  if (!g) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/30 px-4 py-8 backdrop-blur-[6px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-gate-title"
        className="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-[22px] border border-edge bg-white p-6 text-center shadow-[0_18px_40px_-12px_rgb(14_50_40/0.35)] sm:p-8"
      >
        <span aria-hidden className="grid size-14 place-items-center rounded-pill bg-pine text-lime">
          {g.kind === "code" ? <KeyRound className="size-6" strokeWidth={1.8} /> : <ShieldOff className="size-6" strokeWidth={1.8} />}
        </span>
        {g.kind === "code" ? <CodeForm reason={g.reason} wrong={g.wrong} /> : <Stopped title={g.title} reason={g.reason} />}
        <p className="m-0 flex items-center gap-1.5 text-micro text-muted">
          <LogoMark className="h-3.5 text-pine" />
          Secured by VeriSec
        </p>
      </section>
    </div>
  );
}

function Stopped({ title, reason }: { title: string; reason: string }) {
  return (
    <>
      <h1 id="link-gate-title" className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">
        {title}
      </h1>
      <p className="m-0 text-body text-slate">{reason}</p>
    </>
  );
}

function CodeForm({ reason, wrong }: { reason: string; wrong: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // a wrong code comes back as a new question: clear the field and let them type again
  useEffect(() => {
    setBusy(false);
    setCode("");
    input.current?.focus();
  }, [reason, wrong]);
  const ready = code.length === 6;
  return (
    <form
      className="flex w-full flex-col items-center gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        linkGate.answer(code);
      }}
    >
      <h1 id="link-gate-title" className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">
        Check your email
      </h1>
      <p className="m-0 text-body text-slate">
        {wrong
          ? "We emailed you a 6-digit code for this verification. Enter it to continue on this device."
          : reason || "We emailed you a 6-digit code for this verification. Enter it to continue on this device."}
      </p>
      <label htmlFor="access-code" className="sr-only">
        Access code
      </label>
      <input
        ref={input}
        id="access-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-invalid={wrong || undefined}
        aria-describedby="access-code-note"
        className={cn(
          "tnum h-14 w-full max-w-[260px] rounded-[14px] border bg-white text-center text-[28px] font-medium tracking-[0.4em] text-pine outline-none transition-colors focus:border-pine/40 focus:ring-2 focus:ring-lime/50",
          wrong ? "border-danger" : "border-hairline",
        )}
        placeholder="000000"
      />
      <p id="access-code-note" role={wrong ? "alert" : undefined} className={cn("m-0 min-h-5 text-micro", wrong ? "text-danger" : "text-muted")}>
        {wrong ? reason : "Can't find it? Check your spam folder, or ask the organisation for a new link."}
      </p>
      <button
        type="submit"
        disabled={!ready || busy}
        className="inline-flex h-11 w-full max-w-[260px] items-center justify-center gap-2 rounded-pill bg-lime px-5 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        Continue
      </button>
    </form>
  );
}
