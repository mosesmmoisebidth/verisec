"use client";

import { useEffect, useState } from "react";
import { ShieldUser } from "lucide-react";

import { AuthHeading, Field } from "@/components/auth/auth-shell";
import { SubmitButton, goTo, readQuery } from "@/components/auth/form-bits";
import { PasswordField } from "@/components/auth/password-field";
import { flashToast, toast } from "@/components/ui/toast";
import { humanCheckProblem, useHumanCheck } from "@/components/security/human-check";
import { acceptInvite, signIn } from "@/config/auth";
import { authApi } from "@/lib/auth-api";
import { landingAfterSignIn } from "@/lib/auth-landing";
import { teamApi, type Invitation } from "@/lib/console/team-api";

type Errors = { name?: string; password?: string; confirm?: string };
type State = { kind: "loading" } | { kind: "invalid"; message: string } | { kind: "ready"; invite: Invitation };

/**
 * The page an invited person opens from their email. The link carries who was invited and a one-time code; the
 * console checks both, the person chooses a password, and they are signed straight in to their team.
 */
export function AcceptInviteForm() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const human = useHumanCheck("login");
  const [errors, setErrors] = useState<Errors>({});
  const [link, setLink] = useState({ user: "", code: "" });

  useEffect(() => {
    // the link is only readable in the browser (static export); the state follows the console's answer
    const user = readQuery("user");
    const code = readQuery("code");
    let alive = true;
    void (async () => {
      const r = user && code ? await teamApi.invitation(user) : null;
      if (!alive) return;
      setLink({ user, code });
      setState(
        !r
          ? { kind: "invalid", message: acceptInvite.invalid.incomplete }
          : r.ok
            ? { kind: "ready", invite: r.data }
            : { kind: "invalid", message: r.message },
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const clear = (k: keyof Errors) => () => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind !== "ready") return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const pw = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    const next: Errors = {};
    if (!name) next.name = "Enter your name, as your team will see it.";
    if (!pw) next.password = "Choose a password.";
    else if (pw.length < 8) next.password = "Use at least 8 characters.";
    if (!confirm) next.confirm = "Re-enter your password.";
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
    const r = await teamApi.accept(link.user, link.code, pw, name);
    if (!r.ok) {
      if (r.status === 400 && /password/i.test(r.message)) setErrors({ password: r.message });
      else if (r.status === 404 || r.status === 400) setState({ kind: "invalid", message: r.message });
      else toast.error("Couldn't finish joining", r.message);
      setPending(false);
      return;
    }
    // straight in: the password they just chose signs them in
    try {
      // the security check belongs to this sign-in (the invitation itself is proven by its emailed code)
      const s = await authApi.login({ email: r.data.email || state.invite.email, password: pw, remember: false }, human.take());
      flashToast("success", `Welcome to ${state.invite.orgName}`, `You joined as ${state.invite.roleName}.`);
      goTo(s.status === "mfa_required" ? "/mfa/" : await landingAfterSignIn(null).catch(() => signIn.next));
    } catch {
      flashToast("success", "You're in the team", "Sign in with your email and the password you just chose.");
      goTo(acceptInvite.signIn.href);
    }
  }

  if (state.kind === "loading") return <AuthHeading title={acceptInvite.title} subtitle={acceptInvite.loading} />;

  if (state.kind === "invalid")
    return (
      <>
        <AuthHeading title={acceptInvite.invalid.title} subtitle={state.message} />
        <a
          href={acceptInvite.signIn.href}
          className="inline-flex h-13 w-full items-center justify-center rounded-pill bg-lime text-field font-medium text-pine transition-[filter] hover:brightness-95"
        >
          {acceptInvite.signIn.label}
        </a>
      </>
    );

  const { invite } = state;
  // an invitation by email alone named them after the address: ask instead of showing that
  const knownName = invite.name && invite.name !== invite.email.split("@")[0] ? invite.name : "";
  return (
    <>
      <AuthHeading title={acceptInvite.title} subtitle={acceptInvite.subtitle(invite.orgName)} />
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-body font-medium text-pine">{acceptInvite.fields.email.label}</span>
          <span className="flex h-13 w-full items-center rounded-box border border-card-line bg-tile/60 px-4 text-field text-pine/80">
            <span className="min-w-0 break-all">{invite.email}</span>
          </span>
        </div>

        <div className="flex items-start gap-3 rounded-box border border-card-line bg-tile px-4 py-3.5">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-pill bg-pine text-lime">
            <ShieldUser className="size-[18px]" strokeWidth={1.8} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body text-quiet">
              {acceptInvite.role}: <span className="font-medium text-pine">{invite.roleName}</span>
            </span>
            <span className="text-body text-pine/80">{invite.roleSummary}</span>
          </span>
        </div>

        <Field
          id="name"
          label={acceptInvite.fields.name.label}
          placeholder={acceptInvite.fields.name.placeholder}
          autoComplete="name"
          maxLength={80}
          defaultValue={knownName}
          error={errors.name}
          onChange={clear("name")}
        />
        <PasswordField
          id="password"
          label={acceptInvite.fields.password.label}
          placeholder={acceptInvite.fields.password.placeholder}
          autoComplete="new-password"
          error={errors.password}
          onChange={clear("password")}
        />
        <PasswordField
          id="confirm"
          label={acceptInvite.fields.confirm.label}
          placeholder={acceptInvite.fields.confirm.placeholder}
          autoComplete="new-password"
          error={errors.confirm}
          onChange={clear("confirm")}
        />
        {human.widget}
        <SubmitButton pending={pending}>{acceptInvite.submit}</SubmitButton>
        <p className="m-0 pt-2 text-center text-body text-quiet">
          {acceptInvite.signIn.prefix}{" "}
          <a href={acceptInvite.signIn.href} className="font-medium text-pine underline underline-offset-4">
            {acceptInvite.signIn.label}
          </a>
        </p>
      </form>
    </>
  );
}
