"use client";

import { useEffect, useState } from "react";
import { Building2, Check } from "lucide-react";

import { Field } from "@/components/auth/auth-shell";
import { SubmitButton, goTo, isEmail, readQuery } from "@/components/auth/form-bits";
import { PasswordField } from "@/components/auth/password-field";
import { newDeviceToast } from "@/components/auth/new-device-toast";
import { flashToast, toast } from "@/components/ui/toast";
import { humanCheckProblem, useHumanCheck } from "@/components/security/human-check";
import { signIn } from "@/config/auth";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthError, authApi, ssoSignInUrl } from "@/lib/auth-api";
import { landingAfterSignIn, nextFromUrl, withNext } from "@/lib/auth-landing";

type Errors = { email?: string; password?: string };

export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [ssoEmail, setSsoEmail] = useState("");
  const human = useHumanCheck("login");
  const [errors, setErrors] = useState<Errors>({});
  // the page this sign-in returns to (a Solutions card, a portal page), kept across sign-up and MFA
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNext(nextFromUrl());
  }, []);

  // Bounced back from an unfinished Google sign-in → tell them, as a toast.
  useEffect(() => {
    if (readQuery("error") === "google") {
      toast.error("Google sign-in didn't complete", "Please try again.");
    }
    if (readQuery("error") === "sso") {
      toast.error("Organization sign-in didn't complete", "Check your team email and try again, or contact your administrator.");
    }
    if (readQuery("error") === "idle") {
      toast.info("You were signed out", "Your session ended after being idle.");
    }
  }, []);

  const clear = (k: keyof Errors) => () => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const remember = fd.get("remember") === "on";

    // Validate on the client so an empty submit is a clear per-field message,
    // not a round-trip that comes back as a generic "something went wrong".
    const found: Errors = {};
    if (!email) found.email = "Enter your email address.";
    else if (!isEmail(email)) found.email = "Enter a valid email address.";
    if (!password) found.password = "Enter your password.";
    if (found.email || found.password) {
      setErrors(found);
      return;
    }
    if (!human.ready) {
      toast.error("One more step", "Complete the security check above the button.");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await authApi.login({ email, password, remember }, human.take());
      if (r.status === "email_unverified") {
        // The account hasn't confirmed its email yet. A fresh code was just sent;
        // take them to the verify-email step with their address prefilled.
        flashToast("info", "Confirm your email", "We've emailed you a code to finish signing in.");
        goTo(withNext(`/verify-email/?email=${encodeURIComponent(r.email || email)}`, next));
      } else if (r.status === "mfa_required") goTo(withNext("/mfa/", next));
      else {
        // A login from a new browser/computer is allowed — just flag it.
        if (r.newDevice) newDeviceToast(r.deviceName);
        // straight to the account's portal; onboarding only for an account that has never seen it
        goTo(await landingAfterSignIn(next).catch(() => signIn.next));
      }
    } catch (err) {
      const problem = err instanceof AuthError ? humanCheckProblem(err.status, err.data) : null;
      const msg =
        problem ??
        (err instanceof AuthError && err.status === 401
          ? "That email or password doesn't match."
          : "Something went wrong. Please try again.");
      toast.error("Couldn't sign you in", msg);
      setPending(false);
    }
  }

  return (
    // method="post": sent before the page's script is ready, the browser posts it rather than putting the password in the
    // address bar, history and server logs (a GET form would); once ready, onSubmit handles it
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field
        id="email"
        label={signIn.fields.email.label}
        placeholder={signIn.fields.email.placeholder}
        type="email"
        autoComplete="email"
        error={errors.email}
        onChange={(event) => {
          setSsoEmail(event.target.value);
          setErrors((current) => (current.email ? { ...current, email: undefined } : current));
        }}
      />
      <PasswordField
        id="password"
        label={signIn.fields.password.label}
        placeholder={signIn.fields.password.placeholder}
        autoComplete="current-password"
        error={errors.password}
        onChange={clear("password")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5">
          <span className="relative inline-flex size-[18px] shrink-0">
            <input
              type="checkbox"
              name="remember"
              className="peer size-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-card-line bg-tile transition-colors checked:border-lime checked:bg-lime focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
            />
            <Check
              aria-hidden
              className="pointer-events-none absolute inset-0 m-auto size-3 text-pine opacity-0 transition-opacity peer-checked:opacity-100"
              strokeWidth={3.5}
            />
          </span>
          <span className="text-body text-pine">{signIn.remember}</span>
        </label>
        <a
          href={signIn.reset.href}
          className="text-body text-pine underline underline-offset-4 transition-colors hover:text-pine/70"
        >
          {signIn.reset.label}
        </a>
      </div>

      {human.widget}
      <SubmitButton pending={pending}>{signIn.submit}</SubmitButton>

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const email = ((document.getElementById("email") as HTMLInputElement | null)?.value ?? ssoEmail).trim();
          if (!email) {
            setErrors((current) => ({ ...current, email: "Enter your team email address to continue with SSO." }));
            return;
          }
          if (!isEmail(email)) {
            setErrors((current) => ({ ...current, email: "Enter a valid work email address." }));
            return;
          }
          setPending(true);
          window.location.href = ssoSignInUrl(email, next);
        }}
        className="inline-flex h-13 w-full items-center justify-center gap-3 rounded-box border border-card-line bg-tile text-field text-pine transition-colors hover:bg-hover-light disabled:opacity-70"
      >
        <Building2 aria-hidden className="size-5" strokeWidth={1.7} />
        Continue with organization SSO
      </button>
      <p className="-mt-3 mb-0 text-center text-[12px] text-quiet">Use the email address on your existing VeriSec team account.</p>

      <GoogleButton next={next} />

      <p className="m-0 pt-2 text-center text-body text-quiet">
        {signIn.alt.prefix}{" "}
        <a href={withNext(signIn.alt.href, next)} className="font-medium text-pine underline underline-offset-4">
          {signIn.alt.label}
        </a>
      </p>
    </form>
  );
}
