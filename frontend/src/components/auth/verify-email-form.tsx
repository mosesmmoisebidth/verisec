"use client";

import { useEffect, useState } from "react";

import { Field } from "@/components/auth/auth-shell";
import { SubmitButton, goTo, readQuery } from "@/components/auth/form-bits";
import { nextFromUrl, withNext } from "@/lib/auth-landing";
import { flashToast, toast } from "@/components/ui/toast";
import { humanCheckProblem, useHumanCheck } from "@/components/security/human-check";
import { verifyEmail as copy } from "@/config/auth";
import { AuthError, authApi } from "@/lib/auth-api";

export function VerifyEmailForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const human = useHumanCheck("resend");
  const [error, setError] = useState<string>();

  useEffect(() => setEmail(readQuery("email")), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim().toUpperCase();
    if (!code) {
      setError("Enter the code we emailed you.");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await authApi.verifyEmail({ email, code });
      flashToast("success", "Email verified", "You can now sign in.");
      goTo(withNext(copy.next, nextFromUrl()));
    } catch (err) {
      if (err instanceof AuthError && err.status === 400) {
        setError("That code is invalid or has expired.");
      } else {
        toast.error("Something went wrong", "Please try again.");
      }
      setPending(false);
    }
  }

  // a new code needs the security check: it shows when Resend is first pressed
  const [askCheck, setAskCheck] = useState(false);
  async function resend() {
    if (!human.ready) {
      setAskCheck(true);
      toast.info("One more step", "Complete the security check below, then press Resend again.");
      return;
    }
    try {
      await authApi.resendVerification(email, human.take());
    } catch (err) {
      const problem = err instanceof AuthError ? humanCheckProblem(err.status, err.data) : null;
      if (problem) {
        toast.error("Couldn't send a new code", problem);
        return;
      }
      /* never reveal whether the email exists */
    }
    toast.info("Code sent", "We've emailed you a new code.");
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {email ? (
        <p className="m-0 text-read text-quiet">
          Sent to <span className="font-medium text-pine">{email}</span>.
        </p>
      ) : null}
      <Field
        id="code"
        label={copy.field.label}
        placeholder={copy.field.placeholder}
        type="text"
        autoComplete="one-time-code"
        maxLength={6}
        error={error}
        onChange={() => error && setError(undefined)}
      />
      <SubmitButton pending={pending}>{copy.submit}</SubmitButton>
      <p className="m-0 pt-2 text-center text-body text-quiet">
        {copy.resend.prefix}{" "}
        <button
          type="button"
          onClick={resend}
          className="font-medium text-pine underline underline-offset-4 transition-colors hover:text-pine/70"
        >
          {copy.resend.label}
        </button>
      </p>
      {askCheck ? human.widget : null}
    </form>
  );
}
