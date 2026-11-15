"use client";

import { useState } from "react";

import { Field } from "@/components/auth/auth-shell";
import { SubmitButton, goTo, isEmail } from "@/components/auth/form-bits";
import { flashToast, toast } from "@/components/ui/toast";
import { humanCheckProblem, useHumanCheck } from "@/components/security/human-check";
import { resetPassword } from "@/config/auth";
import { AuthError, authApi } from "@/lib/auth-api";

export function ResetRequestForm() {
  const [pending, setPending] = useState(false);
  const human = useHumanCheck("reset");
  const [error, setError] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email) {
      setError("Enter your email address.");
      return;
    }
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!human.ready) {
      toast.error("One more step", "Complete the security check above the button.");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await authApi.forgot(email, human.take());
      // Always advance (the API never reveals whether the email is registered).
      flashToast("success", "Check your email", "If an account exists, we've sent a reset code.");
      goTo(`${resetPassword.next}?email=${encodeURIComponent(email)}`);
    } catch (err) {
      const problem = err instanceof AuthError ? humanCheckProblem(err.status, err.data) : null;
      toast.error(problem ? "Couldn't send the code" : "Something went wrong", problem ?? "Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field
        id="email"
        label={resetPassword.fields.email.label}
        placeholder={resetPassword.fields.email.placeholder}
        type="email"
        autoComplete="email"
        error={error}
        onChange={() => error && setError(undefined)}
      />
      {human.widget}
      <SubmitButton pending={pending}>{resetPassword.submit}</SubmitButton>
      <p className="m-0 pt-2 text-center text-body text-quiet">
        {resetPassword.back.prefix}{" "}
        <a href={resetPassword.back.href} className="font-medium text-pine underline underline-offset-4">
          {resetPassword.back.label}
        </a>
      </p>
    </form>
  );
}
