"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { Field } from "@/components/auth/auth-shell";
import { SubmitButton, goTo } from "@/components/auth/form-bits";
import { flashToast } from "@/components/ui/toast";
import { mfaChallenge } from "@/config/auth";
import { AuthError, authApi, type MfaResult } from "@/lib/auth-api";
import { landingAfterSignIn, nextFromUrl } from "@/lib/auth-landing";
import { getPasskeyAssertion } from "@/lib/webauthn";
import { newDeviceToast } from "@/components/auth/new-device-toast";

export function MfaChallengeForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [opts, setOpts] = useState<{ totp: boolean; passkey: boolean }>({ totp: true, passkey: false });
  const [pkBusy, setPkBusy] = useState(false);

  // Which factors this pending login can use.
  useEffect(() => {
    void authApi
      .mfaOptions()
      .then((o) => setOpts(o))
      .catch(() => undefined);
  }, []);

  function handleFinish(r: MfaResult) {
    if (r.status === "authenticated") {
      // A new browser/computer doesn't block the sign-in — just flag it.
      if (r.newDevice) newDeviceToast(r.deviceName);
      // straight to the account's portal; onboarding only for an account that has never seen it
      void landingAfterSignIn(nextFromUrl())
        .catch(() => mfaChallenge.next)
        .then(goTo);
      return true;
    }
    return false;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    if (!code) {
      setError("Enter the 6-digit code from your app.");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      handleFinish(await authApi.mfa(code));
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) {
        flashToast("info", "Please sign in again", "Your verification session expired.");
        goTo("/login");
        return;
      }
      setError("That code isn't right. Try the current code from your app.");
      setPending(false);
    }
  }

  async function usePasskey() {
    setError(undefined);
    setPkBusy(true);
    try {
      const { options } = await authApi.mfaWebauthnBegin();
      const credential = await getPasskeyAssertion(options);
      if (!handleFinish(await authApi.mfaWebauthnFinish(credential))) setPkBusy(false);
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) {
        flashToast("info", "Please sign in again", "Your verification session expired.");
        goTo("/login");
        return;
      }
      const name = (err as { name?: string })?.name;
      setError(
        name === "NotAllowedError"
          ? "The passkey prompt was dismissed. Try again."
          : "Couldn't verify your passkey. Try again, or use a code.",
      );
      setPkBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <p role="alert" className="m-0 rounded-box border border-[#eabfbf] bg-[#fdeeee] px-3.5 py-2.5 text-body text-[#b3261e]">
          {error}
        </p>
      ) : null}

      {opts.passkey ? (
        <button
          type="button"
          onClick={usePasskey}
          disabled={pkBusy}
          className="inline-flex h-13 w-full items-center justify-center gap-2.5 rounded-pill bg-pine text-field font-medium text-lime transition-[filter] hover:brightness-110 disabled:opacity-60"
        >
          {pkBusy ? (
            <Loader2 aria-hidden className="size-5 animate-spin" strokeWidth={2.2} />
          ) : (
            <KeyRound aria-hidden className="size-5" strokeWidth={1.9} />
          )}
          Use a passkey
        </button>
      ) : null}

      {opts.passkey && opts.totp ? (
        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-card-line" />
          <span className="text-body text-quiet">or enter a code</span>
          <span className="h-px flex-1 bg-card-line" />
        </div>
      ) : null}

      {opts.totp ? (
        <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <Field
            id="code"
            label={mfaChallenge.field.label}
            placeholder={mfaChallenge.field.placeholder}
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <SubmitButton pending={pending}>{mfaChallenge.submit}</SubmitButton>
        </form>
      ) : null}

      <p className="m-0 pt-1 text-center text-body text-quiet">
        {mfaChallenge.back.prefix}{" "}
        <a href={mfaChallenge.back.href} className="font-medium text-pine underline underline-offset-4">
          {mfaChallenge.back.label}
        </a>
      </p>
    </div>
  );
}
