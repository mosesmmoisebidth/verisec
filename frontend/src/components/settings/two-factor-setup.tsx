"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, KeyRound, Laptop, Loader2, QrCode, ShieldCheck, Smartphone, Usb, X } from "lucide-react";

import { BrandedQR } from "@/components/auth/branded-qr";
import { toast } from "@/components/ui/toast";
import type { SettingToggle, TwoFactorSetup } from "@/lib/console/types";
import { authApi } from "@/lib/auth-api";
import { createPasskey, passkeySupported, type PasskeyChoice } from "@/lib/webauthn";
import { cn } from "@/lib/utils";

/**
 * The two-factor toggle on the Profile tab, plus the enable wizard it opens.
 *
 * The wizard first asks HOW to secure the account — an authenticator app (TOTP)
 * or a passkey / security key (WebAuthn) — then runs the matching flow. Both are
 * verified against Zitadel; the switch only flips on once one succeeds.
 */
export function TwoFactorToggle({ toggle, setup }: { toggle: SettingToggle; setup: TwoFactorSetup }) {
  const [enabled, setEnabled] = useState(toggle.on);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reflect the REAL enrolled state, so a refresh doesn't reset the switch.
  useEffect(() => {
    let alive = true;
    void authApi.me().then((me) => {
      if (alive && me) setEnabled(!!me.mfaEnabled);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onToggle() {
    if (busy) return;
    if (!enabled) {
      setOpen(true);
    } else {
      setBusy(true);
      try {
        await authApi.mfaDisable();
        setEnabled(false);
        toast.success("Two-factor turned off", "You'll sign in with just your password.");
      } catch {
        toast.error("Couldn't turn off two-factor", "Please try again.");
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[14px] font-medium text-pine">{toggle.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={toggle.label}
          disabled={busy}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-pill p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/60 disabled:cursor-not-allowed disabled:opacity-60",
            enabled ? "bg-lime" : "bg-well",
          )}
        >
          <span className={cn("size-4 rounded-pill bg-page shadow-sm transition-transform", enabled && "translate-x-4")} />
        </button>
      </div>

      <SetupModal
        setup={setup}
        open={open}
        onClose={(completed) => {
          setOpen(false);
          if (completed) {
            setEnabled(true);
            toast.success("Two-factor enabled", "You'll verify your identity at sign-in.");
          }
        }}
      />
    </>
  );
}

/* ----------------------------------------------------------------------------
   Wizard: Choose method → (TOTP: Scan → Verify → Done) | (Passkey → Done)
---------------------------------------------------------------------------- */

type Mode = "choose" | "totp" | "passkey";

function SetupModal({
  setup,
  open,
  onClose,
}: {
  setup: TwoFactorSetup;
  open: boolean;
  onClose: (completed: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  // TOTP
  const [step, setStep] = useState(1);
  const [data, setData] = useState<{ secret: string; uri: string } | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string>();
  // Passkey
  const [pkBusy, setPkBusy] = useState(false);
  const [pkError, setPkError] = useState<string>();
  const [pkDone, setPkDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("choose");
    setStep(1);
    setData(null);
    setCode("");
    setLoadError(undefined);
    setVerifyError(undefined);
    setPkBusy(false);
    setPkError(undefined);
    setPkDone(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const btnLime =
    "inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-5 text-body font-medium text-pine transition-[filter] hover:brightness-95 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
  const btnGrey =
    "inline-flex h-9 items-center rounded-pill bg-[#ececeb] px-4 text-body font-medium text-pine transition-colors hover:bg-[#e2e2e0]";
  const cancelBtn = "text-body text-slate underline-offset-2 transition-colors hover:text-pine hover:underline";

  async function startTotp() {
    setMode("totp");
    setStep(1);
    setData(null);
    setLoadError(undefined);
    try {
      setData(await authApi.mfaSetup());
    } catch (e) {
      setLoadError(
        (e as { status?: number })?.status === 401
          ? "Please sign in again to enable two-factor."
          : "Couldn't start setup. Please try again.",
      );
    }
  }

  async function verifyAndAdvance() {
    setVerifyError(undefined);
    setVerifying(true);
    try {
      await authApi.mfaVerify(code);
      setStep(3);
    } catch {
      setVerifyError("That code isn't right. Try the current one from your app.");
    } finally {
      setVerifying(false);
    }
  }

  async function registerPasskey(choice: PasskeyChoice) {
    setPkError(undefined);
    setPkBusy(true);
    try {
      const { u2fId, options } = await authApi.passkeyRegisterBegin();
      const credential = await createPasskey(options, choice);
      const name = choice === "this-device" ? "This device" : choice === "phone" ? "Phone passkey" : "Security key";
      await authApi.passkeyRegisterFinish({ u2fId, credential, name });
      setPkDone(true);
    } catch (e) {
      const name = (e as { name?: string })?.name ?? "Error";
      const detail = (e as { message?: string })?.message ?? "";
      // eslint-disable-next-line no-console
      console.error("passkey create failed:", name, detail, e);
      setPkError(`Couldn't set it up, ${name}${detail ? `: ${detail}` : ""}. Try another option below, or an Authenticator app.`);
    } finally {
      setPkBusy(false);
    }
  }

  // Header title/subtitle
  const heading =
    mode === "choose"
      ? { t: "Add two-factor authentication", s: "Choose how you'll verify it's you at sign-in." }
      : mode === "totp"
        ? step === 3
          ? { t: "You're all set", s: "Two-factor authentication is on for your account." }
          : step === 2
            ? { t: setup.verify.title, s: setup.verify.subtitle }
            : { t: setup.scan.title, s: setup.scan.subtitle }
        : pkDone
          ? { t: "You're all set", s: "Your passkey is registered for this account." }
          : { t: "Set up a passkey", s: "Choose Windows Hello, Face ID, a security key, or your phone." };

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <button
        type="button"
        aria-label={setup.closeLabel}
        onClick={() => onClose(false)}
        className="absolute inset-0 h-full w-full cursor-default bg-pine/20 backdrop-blur-md duration-200 animate-in fade-in"
      />

      <div
        role="dialog"
        aria-label="Two-factor setup"
        className="relative flex w-full max-w-[440px] flex-col gap-4 rounded-[20px] border border-hairline bg-white p-6 shadow-[0_28px_70px_-16px_rgba(14,50,40,0.45)] duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex items-center gap-3">
          {mode === "totp" ? (
            <span className="flex flex-1 gap-1.5">
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  aria-hidden
                  className={cn("h-1.5 flex-1 rounded-pill transition-colors", s <= step ? "bg-lime" : "bg-well")}
                />
              ))}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <button
            type="button"
            aria-label={setup.closeLabel}
            onClick={() => onClose(false)}
            className="-m-1 grid size-7 place-items-center rounded-full text-pine/60 transition-colors hover:bg-hover-light hover:text-pine"
          >
            <X aria-hidden className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[19px] font-medium tracking-[-0.3px] text-pine">{heading.t}</h2>
          <p className="m-0 text-body text-slate">{heading.s}</p>
        </div>

        {mode === "choose" ? <ChooseStep onTotp={startTotp} onPasskey={() => setMode("passkey")} /> : null}
        {mode === "totp" && step === 1 ? (
          <ScanStep data={data} error={loadError} manualLabel={setup.scan.manualLabel} />
        ) : null}
        {mode === "totp" && step === 2 ? <VerifyStep value={code} onChange={setCode} error={verifyError} /> : null}
        {mode === "totp" && step === 3 ? <DoneStep passkey={false} /> : null}
        {mode === "passkey" && !pkDone ? (
          <PasskeyStep busy={pkBusy} error={pkError} supported={passkeySupported()} onChoose={registerPasskey} />
        ) : null}
        {mode === "passkey" && pkDone ? <DoneStep passkey /> : null}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" className={cancelBtn} onClick={() => onClose(false)}>
            {setup.cancelLabel}
          </button>
          <div className="flex items-center gap-2.5">
            {/* Back to the method picker */}
            {(mode === "totp" && step === 1) || (mode === "passkey" && !pkDone) ? (
              <button type="button" className={btnGrey} onClick={() => setMode("choose")}>
                {setup.backLabel}
              </button>
            ) : null}
            {mode === "totp" && step === 2 ? (
              <button type="button" className={btnGrey} onClick={() => setStep(1)}>
                {setup.backLabel}
              </button>
            ) : null}

            {/* Primary action */}
            {mode === "totp" && step === 1 ? (
              <button type="button" className={btnLime} disabled={!data} onClick={() => setStep(2)}>
                {setup.continueLabel}
              </button>
            ) : mode === "totp" && step === 2 ? (
              <button
                type="button"
                className={btnLime}
                disabled={code.length < 6 || verifying}
                aria-busy={verifying}
                onClick={verifyAndAdvance}
              >
                {verifying ? <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.2} /> : setup.continueLabel}
              </button>
            ) : (mode === "totp" && step === 3) || (mode === "passkey" && pkDone) ? (
              <button type="button" className={btnLime} onClick={() => onClose(true)}>
                {setup.finishLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---- Choose method ---------------------------------------------------- */

function ChooseStep({ onTotp, onPasskey }: { onTotp: () => void; onPasskey: () => void }) {
  const supported = passkeySupported();
  return (
    <div className="flex flex-col gap-2.5">
      <MethodCard
        icon={<KeyRound aria-hidden className="size-5" strokeWidth={1.8} />}
        title="Passkey or security key"
        desc="Windows Hello, Face ID, a security key, or your phone, you choose. Most secure, nothing to type."
        badge="Recommended"
        disabled={!supported}
        note={supported ? undefined : "Not available on this browser"}
        onClick={onPasskey}
      />
      <MethodCard
        icon={<QrCode aria-hidden className="size-5" strokeWidth={1.8} />}
        title="Authenticator app"
        desc="Google Authenticator, Authy, Microsoft Authenticator, scan a QR, enter codes."
        onClick={onTotp}
      />
    </div>
  );
}

function MethodCard({
  icon,
  title,
  desc,
  badge,
  note,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  note?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-[14px] border border-hairline bg-[#fbfcfa] p-4 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-55" : "hover:border-lime/60 hover:bg-lime/5",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-pine text-lime">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-medium text-pine">{title}</span>
          {badge ? (
            <span className="rounded-full bg-lime/25 px-2 py-0.5 text-[11px] font-medium text-pine">{badge}</span>
          ) : null}
        </span>
        <span className="text-[13px] leading-snug text-slate">{note ?? desc}</span>
      </span>
      {!disabled ? <ChevronRight aria-hidden className="size-5 shrink-0 text-pine/40" strokeWidth={1.8} /> : null}
    </button>
  );
}

/* ---- TOTP: Scan (branded QR) ------------------------------------------ */

function ScanStep({
  data,
  error,
  manualLabel,
}: {
  data: { secret: string; uri: string } | null;
  error?: string;
  manualLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid size-[208px] place-items-center rounded-[16px] border border-hairline bg-[#fbfcfa]">
        {error ? (
          <p className="m-0 px-4 text-center text-body text-[#b3261e]">{error}</p>
        ) : data ? (
          <BrandedQR data={data.uri} size={192} />
        ) : (
          <Loader2 aria-hidden className="size-6 animate-spin text-slate" strokeWidth={2} />
        )}
      </div>
      {data ? (
        <div className="w-full rounded-[12px] bg-well px-4 py-3 text-center">
          <p className="m-0 text-eyebrow text-slate">{manualLabel}</p>
          <p className="tnum m-0 mt-1 font-mono text-[13px] font-semibold tracking-[1px] break-all text-pine">
            {data.secret}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ---- TOTP: Verify (6 cells) ------------------------------------------- */

function VerifyStep({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const set = (i: number, ch: string) => {
    const digit = ch.replace(/\D/g, "").slice(-1);
    const next = cells.slice();
    next[i] = digit;
    onChange(next.join(""));
    if (digit && i < 5) refs.current[i + 1]?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center gap-2.5">
        {cells.map((c, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={c}
            inputMode="numeric"
            maxLength={1}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !cells[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            className="size-[52px] rounded-[12px] border border-hairline bg-page text-center text-[20px] font-medium text-pine outline-none transition-colors focus:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/50"
          />
        ))}
      </div>
      {error ? <p className="m-0 text-center text-body text-[#b3261e]">{error}</p> : null}
    </div>
  );
}

/* ---- Passkey: register ------------------------------------------------ */

function PasskeyStep({
  busy,
  error,
  supported,
  onChoose,
}: {
  busy: boolean;
  error?: string;
  supported: boolean;
  onChoose: (c: PasskeyChoice) => void;
}) {
  if (busy) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid size-14 place-items-center rounded-pill bg-lime/15 text-pine">
          <Loader2 aria-hidden className="size-7 animate-spin" strokeWidth={1.9} />
        </span>
        <p className="m-0 max-w-[32ch] text-body text-slate">
          Waiting for your device, follow the prompt your browser just opened.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {error ? (
        <p className="m-0 rounded-box border border-[#eabfbf] bg-[#fdeeee] px-3.5 py-2.5 text-body text-[#b3261e]">
          {error}
        </p>
      ) : null}
      <MethodCard
        icon={<Laptop aria-hidden className="size-5" strokeWidth={1.8} />}
        title="This device"
        desc="Windows Hello or Touch ID on the computer you're using now."
        disabled={!supported}
        note={!supported ? "Not available on this browser" : undefined}
        onClick={() => onChoose("this-device")}
      />
      <MethodCard
        icon={<Smartphone aria-hidden className="size-5" strokeWidth={1.8} />}
        title="Your phone"
        desc="Scan a QR and unlock with your phone's Face ID or fingerprint."
        onClick={() => onChoose("phone")}
      />
      <MethodCard
        icon={<Usb aria-hidden className="size-5" strokeWidth={1.8} />}
        title="Security key"
        desc="A hardware key you plug in, like a YubiKey."
        onClick={() => onChoose("security-key")}
      />
    </div>
  );
}

/* ---- Done ------------------------------------------------------------- */

function DoneStep({ passkey }: { passkey: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <span className="grid size-14 place-items-center rounded-pill bg-lime/20 text-pine">
        <ShieldCheck aria-hidden className="size-7" strokeWidth={1.8} />
      </span>
      <p className="m-0 flex items-center gap-1.5 text-center text-body text-pine">
        <Check aria-hidden className="size-4 text-pine" strokeWidth={2.4} />
        {passkey
          ? "You'll use your passkey next time you sign in."
          : "You'll be asked for a code next time you sign in."}
      </p>
    </div>
  );
}
