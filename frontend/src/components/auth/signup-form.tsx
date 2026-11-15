"use client";

import { useEffect, useState } from "react";

import { Field } from "@/components/auth/auth-shell";
import { SubmitButton, goTo } from "@/components/auth/form-bits";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordField } from "@/components/auth/password-field";
import { flashToast, toast } from "@/components/ui/toast";
import { humanCheckProblem, useHumanCheck } from "@/components/security/human-check";
import { signUp } from "@/config/auth";
import { AuthError, authApi } from "@/lib/auth-api";
import { nextFromUrl, withNext } from "@/lib/auth-landing";
import { businessProblem, emailProblem, firstNameProblem, lastNameProblem } from "@/lib/identity-rules";

type Errors = { first?: string; last?: string; email?: string; business?: string; password?: string; confirm?: string };

/** The console names the field it refused (the same rules run there). */
const SERVER_FIELD: Record<string, keyof Errors> = { first_name: "first", last_name: "last", email: "email", business: "business" };

export function SignupForm() {
  const [pending, setPending] = useState(false);
  const human = useHumanCheck("signup");
  const [errors, setErrors] = useState<Errors>({});
  // the page the new account goes on to after verifying and signing in (kept from the sign-in page)
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReturnTo(nextFromUrl());
  }, []);

  const clear = (k: keyof Errors) => () => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  // a field says what is wrong as soon as the person leaves it, not only on submit
  const check = (k: keyof Errors, rule: (v: string) => string | null) => (e: React.FocusEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    if (!v.trim()) return;
    const p = rule(v);
    setErrors((x) => ({ ...x, [k]: p ?? undefined }));
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const first = String(fd.get("first") ?? "").trim();
    const last = String(fd.get("last") ?? "").trim().replace(/\s+/g, " ");
    const email = String(fd.get("email") ?? "").trim();
    const business = String(fd.get("business") ?? "").trim().replace(/\s+/g, " ");
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");

    const next: Errors = {
      first: firstNameProblem(first) ?? undefined,
      last: lastNameProblem(last) ?? undefined,
      email: emailProblem(email) ?? undefined,
      business: businessProblem(business) ?? undefined,
    };
    if (!password) next.password = "Choose a password.";
    else if (password.length < 8) next.password = "Use at least 8 characters.";
    if (!confirm) next.confirm = "Type your password again.";
    else if (confirm !== password) next.confirm = "The passwords don't match.";
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      // take them to the first field that needs fixing
      const firstBad = (["first", "last", "email", "business", "password", "confirm"] as const).find((k) => next[k]);
      if (firstBad) document.getElementById(firstBad)?.focus();
      return;
    }
    if (!human.ready) {
      toast.error("One more step", "Complete the security check above the button.");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await authApi.register({ fullName: `${first} ${last}`, email, businessName: business, password }, human.take());
      flashToast("success", "Account created", "We've emailed you a verification code.");
      goTo(withNext(`/verify-email/?email=${encodeURIComponent(email)}`, returnTo));
    } catch (err) {
      const problem = err instanceof AuthError ? humanCheckProblem(err.status, err.data) : null;
      if (problem) {
        toast.error("Couldn't create your account", problem);
        setPending(false);
        return;
      }
      const data = err instanceof AuthError ? (err.data as { code?: string; field?: string; message?: string } | null) : null;
      const field = data?.field ? SERVER_FIELD[data.field] : undefined;
      const dup = err instanceof AuthError && (err.status === 409 || /already|exist|taken/i.test(err.message));
      if (field && typeof data?.message === "string") {
        setErrors({ [field]: data.message });
      } else if (dup && data?.code === "business_taken") {
        // the server says which detail is taken: the business name, or the person's email
        setErrors({ business: (err as AuthError).message || "An account already uses this business name." });
      } else if (dup) {
        setErrors({ email: "An account with this email already exists." });
      } else {
        toast.error("Couldn't create your account", "Check your details and try again.");
      }
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          id="first"
          label={signUp.fields.first.label}
          placeholder={signUp.fields.first.placeholder}
          autoComplete="given-name"
          maxLength={30}
          error={errors.first}
          onChange={clear("first")}
          onBlur={check("first", firstNameProblem)}
        />
        <Field
          id="last"
          label={signUp.fields.last.label}
          placeholder={signUp.fields.last.placeholder}
          autoComplete="family-name"
          maxLength={60}
          error={errors.last}
          onChange={clear("last")}
          onBlur={check("last", lastNameProblem)}
        />
      </div>
      <Field
        id="email"
        label={signUp.fields.email.label}
        placeholder={signUp.fields.email.placeholder}
        type="email"
        autoComplete="email"
        error={errors.email}
        onChange={clear("email")}
        onBlur={check("email", emailProblem)}
      />
      <Field
        id="business"
        label={signUp.fields.business.label}
        placeholder={signUp.fields.business.placeholder}
        autoComplete="organization"
        maxLength={80}
        error={errors.business}
        onChange={clear("business")}
        onBlur={check("business", businessProblem)}
      />
      <PasswordField
        id="password"
        label={signUp.fields.password.label}
        placeholder={signUp.fields.password.placeholder}
        autoComplete="new-password"
        error={errors.password}
        onChange={clear("password")}
      />
      <PasswordField
        id="confirm"
        label={signUp.fields.confirm.label}
        placeholder={signUp.fields.confirm.placeholder}
        autoComplete="new-password"
        error={errors.confirm}
        onChange={clear("confirm")}
      />
      {human.widget}
      <SubmitButton pending={pending}>{signUp.submit}</SubmitButton>
      <GoogleButton next={returnTo} />
      <p className="m-0 pt-2 text-center text-body text-quiet">
        {signUp.alt.prefix}{" "}
        <a href={withNext(signUp.alt.href, returnTo)} className="font-medium text-pine underline underline-offset-4">
          {signUp.alt.label}
        </a>
      </p>
    </form>
  );
}
