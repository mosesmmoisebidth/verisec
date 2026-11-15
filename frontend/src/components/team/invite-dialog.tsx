"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mail, Plus, UserRound, X } from "lucide-react";

import { PermissionsEditor } from "@/components/team/permissions-editor";
import { Select } from "@/components/ui/select";

import type { Role } from "@/lib/access";
import { useAccess } from "@/lib/access";
import type { CapabilityInfo, LiveRole } from "@/lib/console/team-api";
import type { InviteForm } from "@/lib/console/types";

/**
 * "Invite team member" — Figma Desktop-24's dialog.
 *
 * ONE DEPARTURE: the second field is labelled "Role". The frame labels it
 * "Environment" — copy pasted in from the Add webhook endpoint dialog — while
 * the control beneath it is plainly a role picker defaulting to "Viewer".
 * Inviting somebody with the wrong permissions because the label named the
 * wrong thing is the kind of mistake this screen exists to prevent.
 *
 * The role list defaults to the LEAST privileged option, which is what the
 * frame draws and the right default regardless: nobody should be granted more
 * than Viewer by pressing Enter. Live, the chosen role's one-line description
 * sits under the picker, so the person inviting sees what they are granting.
 */
export function InviteDialog({
  form,
  label,
  live,
}: {
  form: InviteForm;
  label: string;
  /** The console's roles and the invite call; resolves null when sent, or the reason it was not. */
  live?: {
    roles: LiveRole[];
    capabilities?: CapabilityInfo[];
    invite: (email: string, role: Role, permissions?: string[]) => Promise<string | null>;
  };
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const access = useAccess();
  const names = live ? form.roles.filter((n) => live.roles.some((r) => r.name === n && r.invitable)) : form.roles;
  const [role, setRole] = useState(names[0] ?? "");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = live?.roles.find((r) => r.name === role);
  // what the invited person will be able to do: the role's permissions until the inviter changes them
  const defaults = picked?.capabilities ?? [];
  const [perms, setPerms] = useState<string[] | null>(null);
  const chosen = perms ?? defaults;
  const custom = !!perms && (perms.length !== defaults.length || perms.some((p) => !defaults.includes(p)));

  // /team/?invite=1 (the member page's Invite Member) opens it straight away
  useEffect(() => {
    if (live && new URLSearchParams(window.location.search).get("invite") === "1" && !ref.current?.open) ref.current?.showModal();
  }, [live]);

  const reset = () => {
    setEmail("");
    setRole(names[0] ?? "");
    setPerms(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!live || busy) return;
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      setError("Enter the email address of the person to invite.");
      return;
    }
    if (!picked) return;
    setBusy(true);
    const problem = await live.invite(clean, picked.id, custom ? chosen : undefined);
    setBusy(false);
    if (problem) setError(problem);
    else {
      ref.current?.close();
      reset();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex h-[35px] shrink-0 items-center gap-2 rounded-pill bg-lime px-3 text-micro font-medium text-pine transition-[filter] hover:brightness-95"
      >
        <Plus aria-hidden className="size-[15px]" strokeWidth={2.2} />
        {label}
      </button>

      {/* Backdrop-close. eslint's premise — a click handler with no keyboard
          path, is false for <dialog>: Escape closes it natively, which is the
          keyboard equivalent this rule exists to require. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={ref}
        aria-labelledby="invite-title"
        onClose={() => setError(null)}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto max-h-[92dvh] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-[20px] border border-edge bg-white p-0 text-ink shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
      >
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4 p-5 sm:p-6">
          <header className="flex items-start justify-between gap-4">
            <h2
              id="invite-title"
              className="m-0 text-[17.9px] leading-[18px] font-medium tracking-[-0.45px] text-ink"
            >
              {form.title}
            </h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label={form.closeLabel}
              className="-m-1 grid size-6 shrink-0 place-items-center rounded-pill text-ink transition-colors hover:bg-hover-panel"
            >
              <X aria-hidden className="size-4" strokeWidth={1.6} />
            </button>
          </header>

          <div className="flex flex-col gap-3">
            <label htmlFor="invite-email" className="text-body text-ink">
              {form.emailLabel}
            </label>
            <span className="relative flex h-9 items-center">
              <Mail
                aria-hidden
                className="pointer-events-none absolute left-3 size-[18px] text-slate"
                strokeWidth={1.5}
              />
              <input
                id="invite-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={form.emailPlaceholder}
                value={email}
                onChange={(e) => {
                  setEmail(e.currentTarget.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "invite-error" : undefined}
                className="h-full w-full rounded-[10px] border border-hairline bg-panel pr-3 pl-10 text-body text-ink outline-none placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime"
              />
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="invite-role" className="text-body text-ink">
              {form.roleLabel}
            </label>
            <Select
              block
              menuFixed
              id="invite-role"
              name="role"
              label={form.roleLabel}
              options={names}
              value={role}
              onValueChange={(r) => {
                setRole(r);
                // a new role starts from its own permissions
                setPerms(null);
              }}
              icon={UserRound}
              className="h-9 w-full rounded-[10px] border border-hairline bg-panel py-0 pr-10 pl-10 text-body text-ink"
            />
            {picked ? <p className="m-0 -mt-1 text-micro text-slate">{picked.summary}</p> : null}
          </div>

          {picked && live?.capabilities?.length ? (
            <PermissionsEditor
              catalogue={live.capabilities}
              roleName={picked.name}
              roleDefaults={defaults}
              value={chosen}
              onChange={setPerms}
              grantable={(id) => access.can(id as Parameters<typeof access.can>[0])}
            />
          ) : null}

          {error ? (
            <p id="invite-error" role="alert" className="m-0 text-micro text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 inline-flex h-9 w-full items-center justify-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            {form.submitLabel}
          </button>
        </form>
      </dialog>
    </>
  );
}
