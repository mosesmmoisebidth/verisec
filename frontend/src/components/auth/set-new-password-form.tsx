"use client";

import { useEffect, useState } from "react";

import { Field } from "@/components/auth/auth-shell";
import { SubmitButton, goTo, readQuery } from "@/components/auth/form-bits";
import { PasswordField } from "@/components/auth/password-field";
import { flashToast, toast } from "@/components/ui/toast";
import { humanCheckProblem, useHumanCheck } from "@/components/security/human-check";
import { setPassword } from "@/config/auth";
import { AuthError, authApi } from "@/lib/auth-api";

type Errors = { code?: string; password?: string; confirm?: string };

export function SetNewPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const human = useHumanCheck("reset_confirm");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => setEmail(readQuery("email")), []);

  const clear = (k: keyof Errors) => () => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") ?? "").trim().toUpperCase();
    const pw = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");

    const next: Errors = {};
    if (!code) next.code = "Enter the code we emailed you.";
    if (!pw) next.password = "Choose a new password.";
    else if (pw.length < 8) next.password = "Use at least 8 characters.";
    if (!confirm) next.confirm = "Re-enter your new password.";
    else if (pw && pw !== confirm) next.confirm = "Those passwords don't match.";
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    if (!human.ready) {
      toast.error("One more step", "Complete the security check above the button.");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await authApi.reset({ email, code, password: pw }, human.take());
      flashToast("success", "Password updated", "You can now sign in with your new password.");
      goTo(setPassword.next);
    } catch (err) {
      const problem = err instanceof AuthError ? humanCheckProblem(err.status, err.data) : null;
      if (problem) {
        toast.error("Couldn't update your password", problem);
      } else if (err instanceof AuthError && err.status === 400) {
        setErrors({ code: "That code is invalid or has expired." });
      } else {
        toast.error("Something went wrong", "Please try again.");
      }
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field
        id="code"
        label={setPassword.fields.code.label}
        placeholder={setPassword.fields.code.placeholder}
        type="text"
        autoComplete="one-time-code"
        maxLength={6}
        error={errors.code}
        onChange={clear("code")}
      />
      <PasswordField
        id="password"
        label={setPassword.fields.password.label}
        placeholder={setPassword.fields.password.placeholder}
        autoComplete="new-password"
        error={errors.password}
        onChange={clear("password")}
      />
      <PasswordField
        id="confirm"
        label={setPassword.fields.confirm.label}
        placeholder={setPassword.fields.confirm.placeholder}
        autoComplete="new-password"
        error={errors.confirm}
        onChange={clear("confirm")}
      />
      {human.widget}
      <SubmitButton pending={pending}>{setPassword.submit}</SubmitButton>
      <p className="m-0 pt-2 text-center text-body text-quiet">
        {setPassword.resend.prefix}{" "}
        <a
          href={email ? `${setPassword.resend.href}?email=${encodeURIComponent(email)}` : setPassword.resend.href}
          className="font-medium text-pine underline underline-offset-4"
        >
          {setPassword.resend.label}
        </a>
      </p>
    </form>
  );
}
