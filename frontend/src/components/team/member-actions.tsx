"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Check,
  Crown,
  Ellipsis,
  Eye,
  Loader2,
  Minus,
  Pencil,
  Send,
  ShieldUser,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserMinus,
  X,
} from "lucide-react";

import { PermissionsEditor } from "@/components/team/permissions-editor";
import { Select } from "@/components/ui/select";
import { useAccess, type Role } from "@/lib/access";
import type { CapabilityInfo, LiveRole } from "@/lib/console/team-api";
import type { ActionItem, ConfirmCopy, MemberAction, TeamMember } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * The per-row ⋯ menu and the dialogs behind it — Figma Desktop-24 and its
 * Delete / Activate / Deactivate panels.
 *
 * THE MENU IS A MODAL SHEET, NOT AN ABSOLUTELY-POSITIONED DROPDOWN, and that
 * is deliberate rather than a shortcut. The table scrolls horizontally, which
 * makes it a clipping context in both axes — an absolute menu on the last
 * column would be cut off by the container on every row. The frame draws this
 * menu with its own title and a rule under it, which is a small sheet already;
 * rendering it as one is faithful AND puts it in the top layer where nothing
 * can clip it. Focus trapping and Escape come free.
 *
 * WHICH ACTIONS APPEAR IS DERIVED FROM STATUS (and, live, from the rules the
 * console enforces): nobody changes their own row, the Owner's role changes only
 * by handing ownership over, an invitation can be sent again until it is used.
 */

const GLYPH: Record<MemberAction, typeof Eye> = {
  view: Eye,
  role: ShieldUser,
  permissions: SlidersHorizontal,
  deactivate: UserMinus,
  activate: UserCheck,
  edit: Pencil,
  delete: Trash2,
  resend: Send,
  transfer: Crown,
};

/** What the live Team page hands each row: the roles, who is looking, and the action runner. */
export type MemberLive = {
  roles: LiveRole[];
  /** Every permission, named and grouped (for Edit permissions). */
  capabilities?: CapabilityInfo[];
  canTransfer: boolean;
  /** Runs one action; resolves true when it worked (the list reloads itself). */
  act: (kind: MemberAction, member: TeamMember, arg?: string) => Promise<boolean>;
};

/** Actions that make sense for a member in this state. */
function actionsFor(member: TeamMember, all: ActionItem[], live?: MemberLive): ActionItem[] {
  const allowed = new Set<MemberAction>(["view"]);
  if (!live) {
    ["role", "edit", "delete"].forEach((a) => allowed.add(a as MemberAction));
    if (member.status === "active") allowed.add("deactivate");
    if (member.status === "deactivated") allowed.add("activate");
    return all.filter((a) => allowed.has(a.id) && a.id !== "resend" && a.id !== "transfer");
  }
  const owner = member.roleId === "owner";
  if (!member.isMe) {
    allowed.add("edit");
    if (!owner) {
      allowed.add("role");
      if (live.capabilities?.length) allowed.add("permissions");
      allowed.add("delete");
      if (member.status === "active") allowed.add("deactivate");
      if (member.status === "active" && live.canTransfer) allowed.add("transfer");
    }
    if (member.status === "deactivated") allowed.add("activate");
    if (member.status === "invited") allowed.add("resend");
  }
  return all.filter((a) => allowed.has(a.id));
}

type ConfirmKind = "delete" | "activate" | "deactivate" | "transfer";
type Open = ConfirmKind | "view" | "role" | "permissions" | "edit" | null;

const CONFIRMABLE = new Set<MemberAction>(["delete", "activate", "deactivate", "transfer"]);

export function MemberActions({
  member,
  label,
  actions,
  confirm,
  live,
}: {
  member: TeamMember;
  label: string;
  actions: ActionItem[];
  confirm: Record<ConfirmKind, ConfirmCopy>;
  live?: MemberLive;
}) {
  const menu = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<Open>(null);
  const items = actionsFor(member, actions, live);

  const pick = (id: MemberAction) => {
    menu.current?.close();
    if (live && id === "view") {
      window.location.href = `/team/member/?id=${encodeURIComponent(member.id)}`;
      return;
    }
    if (CONFIRMABLE.has(id)) setOpen(id as ConfirmKind);
    else if (live && (id === "view" || id === "role" || id === "permissions" || id === "edit")) setOpen(id);
    else if (live && id === "resend") void live.act("resend", member);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => menu.current?.showModal()}
        aria-label={`${label} for ${member.name}`}
        className="grid size-8 place-items-center rounded-box text-slate transition-colors hover:bg-hover-light hover:text-pine"
      >
        <Ellipsis aria-hidden className="size-4" strokeWidth={2} />
      </button>

      {/* Backdrop-close. eslint's premise — a click handler with no keyboard
          path, is false for <dialog>: Escape closes it natively, which is the
          keyboard equivalent this rule exists to require. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={menu}
        aria-label={`${label} for ${member.name}`}
        onClick={(e) => {
          if (e.target === menu.current) menu.current?.close();
        }}
        className="m-auto w-[min(240px,calc(100vw-2rem))] rounded-[14px] border border-hairline bg-white p-0 text-pine shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
      >
        <div className="flex flex-col gap-2 p-3">
          <p className="m-0 border-b border-pine/8 pb-2 text-nav font-medium text-pine">{label}</p>
          {items.map((action) => {
            const Glyph = GLYPH[action.id];
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => pick(action.id)}
                className={cn(
                  "flex items-center gap-2 rounded-well bg-pine/5 px-2 py-1.5 text-caption transition-colors hover:bg-pine/10",
                  action.id === "delete" && "text-destructive hover:bg-destructive/10",
                )}
              >
                <Glyph aria-hidden className="size-4 shrink-0" strokeWidth={1.7} />
                {action.label}
              </button>
            );
          })}
        </div>
      </dialog>

      {open === "view" && live ? <ViewDialog member={member} roles={live.roles} onClose={() => setOpen(null)} /> : null}
      {open === "role" && live ? (
        <RoleDialog member={member} roles={live.roles} onClose={() => setOpen(null)} onSave={(r) => live.act("role", member, r)} />
      ) : null}
      {open === "permissions" && live?.capabilities ? (
        <PermissionsDialog
          member={member}
          roles={live.roles}
          catalogue={live.capabilities}
          onClose={() => setOpen(null)}
          onSave={(caps) => live.act("permissions", member, caps.join(","))}
        />
      ) : null}
      {open === "edit" && live ? (
        <NameDialog member={member} onClose={() => setOpen(null)} onSave={(n) => live.act("edit", member, n)} />
      ) : null}
      {open && CONFIRMABLE.has(open as MemberAction) ? (
        <ConfirmDialog
          copy={confirm[open as ConfirmKind]}
          name={member.name}
          onClose={() => setOpen(null)}
          onConfirm={live ? () => live.act(open as ConfirmKind, member) : undefined}
        />
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------------------
   View / Change role / Edit
---------------------------------------------------------------------------- */

/** The small white dialog the invite form uses, for the three live forms. */
function Sheet({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const mount = (node: HTMLDialogElement | null) => {
    ref.current = node;
    if (node && !node.open) node.showModal();
  };
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={mount}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className={cn(
        "m-auto max-h-[92dvh] overflow-y-auto rounded-[20px] border border-edge bg-white p-0 text-ink shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]",
        wide ? "w-[min(560px,calc(100vw-2rem))]" : "w-[min(448px,calc(100vw-2rem))]",
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 className="m-0 text-[17.9px] leading-[18px] font-medium tracking-[-0.45px] text-ink">{title}</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="-m-1 grid size-6 shrink-0 place-items-center rounded-pill text-ink transition-colors hover:bg-hover-panel"
          >
            <X aria-hidden className="size-4" strokeWidth={1.6} />
          </button>
        </header>
        {children}
        {footer ? <footer className="flex flex-wrap justify-end gap-3">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

const STATUS_LABEL = { active: "Active", invited: "Invited, not joined yet", deactivated: "Deactivated" } as const;

function ViewDialog({ member, roles, onClose }: { member: TeamMember; roles: LiveRole[]; onClose: () => void }) {
  const role = roles.find((r) => r.id === member.roleId);
  const rows: [string, string][] = [
    ["Email", member.email],
    ["Role", member.role],
    ["Status", STATUS_LABEL[member.status]],
    ["Last active", member.lastActive ?? "Never signed in"],
    ...(member.invitedAt ? ([["Added", new Date(member.invitedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })]] as [string, string][]) : []),
  ];
  return (
    <Sheet title={member.name} onClose={onClose}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-pill bg-pine text-body font-medium text-lime">
          {member.initials}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-body font-medium text-pine">{member.name}</span>
          <span className="text-micro break-all text-slate">{member.email}</span>
        </span>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-box border border-hairline bg-panel px-4 py-3">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-micro text-muted">{k}</dt>
            <dd className="m-0 min-w-0 text-micro break-words text-pine">{v}</dd>
          </div>
        ))}
      </dl>
      {role ? <p className="m-0 text-micro text-slate">{role.name}: {role.summary}</p> : null}
    </Sheet>
  );
}

function PermissionsDialog({
  member,
  roles,
  catalogue,
  onClose,
  onSave,
}: {
  member: TeamMember;
  roles: LiveRole[];
  catalogue: CapabilityInfo[];
  onClose: () => void;
  onSave: (caps: string[]) => Promise<boolean>;
}) {
  const access = useAccess();
  const role = roles.find((r) => r.id === member.roleId);
  const defaults = role?.capabilities ?? [];
  const editable = new Set(catalogue.filter((c) => c.editable).map((c) => c.id));
  const start = (member.permissions ?? defaults).filter((c) => editable.has(c));
  const [value, setValue] = useState<string[]>(start);
  const [busy, setBusy] = useState(false);
  const dirty = value.length !== start.length || value.some((v) => !start.includes(v));
  const save = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    const ok = await onSave(value);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      title="Edit permissions"
      wide
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-pill border border-hairline bg-page px-4 text-body text-pine transition-colors hover:bg-hover-light"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !dirty}
            className="inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Save permissions
          </button>
        </>
      }
    >
      <p className="m-0 text-body text-slate">
        {member.name} is {member.role === "Admin" ? "an" : "a"} {member.role}. Turn on more, or turn some off, for them alone. It applies at once.
      </p>
      <PermissionsEditor
        catalogue={catalogue}
        roleName={role?.name ?? member.role}
        roleDefaults={defaults}
        value={value}
        onChange={setValue}
        grantable={(id) => access.can(id as Parameters<typeof access.can>[0])}
      />
    </Sheet>
  );
}

function RoleDialog({
  member,
  roles,
  onClose,
  onSave,
}: {
  member: TeamMember;
  roles: LiveRole[];
  onClose: () => void;
  onSave: (role: Role) => Promise<boolean>;
}) {
  const choices = roles.filter((r) => r.invitable);
  const [picked, setPicked] = useState(choices.find((r) => r.id === member.roleId)?.name ?? choices[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const role = choices.find((r) => r.name === picked);
  const save = async () => {
    if (!role || busy) return;
    setBusy(true);
    const ok = await onSave(role.id);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      title="Change role"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-pill border border-hairline bg-page px-4 text-body text-pine transition-colors hover:bg-hover-light"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !role || role.id === member.roleId}
            className="inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Save role
          </button>
        </>
      }
    >
      <p className="m-0 text-body text-slate">
        {member.name} is {member.role === "Admin" ? "an" : "a"} {member.role}. The new role applies at once.
      </p>
      <Select
        block
        menuFixed
        id={`role-${member.id}`}
        label="Role"
        options={choices.map((r) => r.name)}
        value={picked}
        onValueChange={setPicked}
        icon={ShieldUser}
        className="h-9 w-full rounded-[10px] border border-hairline bg-panel py-0 pr-10 pl-10 text-body text-ink"
      />
      {role ? <p className="m-0 text-micro text-slate">{role.summary}</p> : null}
    </Sheet>
  );
}

function NameDialog({ member, onClose, onSave }: { member: TeamMember; onClose: () => void; onSave: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState(member.name);
  const [busy, setBusy] = useState(false);
  const clean = name.trim();
  const save = async () => {
    if (!clean || busy) return;
    setBusy(true);
    const ok = await onSave(clean);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      title="Edit member"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-pill border border-hairline bg-page px-4 text-body text-pine transition-colors hover:bg-hover-light"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !clean || clean === member.name}
            className="inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Save
          </button>
        </>
      }
    >
      <label htmlFor={`name-${member.id}`} className="text-body text-ink">
        Full name
      </label>
      <input
        id={`name-${member.id}`}
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && void save()}
        className="-mt-2 h-9 w-full rounded-[10px] border border-hairline bg-panel px-3 text-body text-ink outline-none focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime"
      />
      <p className="m-0 text-micro text-slate">Their email ({member.email}) stays the same.</p>
    </Sheet>
  );
}

/* ----------------------------------------------------------------------------
   Confirm
---------------------------------------------------------------------------- */

const TONE = {
  destructive: {
    ground: "bg-[image:var(--gradient-confirm-destructive)]",
    disc: "bg-destructive/12 text-destructive",
    button: "bg-destructive text-white",
    glyph: Trash2,
  },
  affirm: {
    ground: "bg-[image:var(--gradient-confirm-affirm)]",
    disc: "bg-affirm/12 text-affirm",
    button: "bg-affirm text-white",
    glyph: Check,
  },
  warn: {
    ground: "bg-[image:var(--gradient-confirm-warn)]",
    disc: "bg-warn/16 text-warn",
    button: "bg-warn text-pine",
    glyph: Minus,
  },
} as const;

/**
 * One confirm dialog.
 *
 * TWO DEPARTURES FROM THE FRAMES:
 *
 *   · The body names the member. The frame hard-codes "Jane Smith", who is not
 *     one of the six rows — the whole job of a confirm dialog is to say which
 *     record is about to change, and naming the wrong person is worse than
 *     naming nobody. The copy carries `{name}` and it is substituted here.
 *   · The amber button takes PINE text, not the frame's white. White on
 *     `--color-warn` is about 1.9:1, which is unreadable and fails WCAG at any
 *     size. Pine on the same amber clears 7:1 and keeps the colour the design
 *     chose, so the fix costs the design nothing.
 *
 * ARTWORK IS OPTIONAL AND THE FALLBACK IS NOT A HOLE. Delete and Activate ship
 * the frames' rendered illustrations; the amber ones were never supplied, so
 * they draw the same idea as a glyph in a tinted disc at the same visual weight.
 *
 * Live, the confirm button runs the action and the dialog closes once it worked;
 * on the demo page (no `onConfirm`) the button stays inert.
 */
export function ConfirmDialog({
  copy,
  name,
  onClose,
  onConfirm,
}: {
  copy: ConfirmCopy;
  name: string;
  onClose: () => void;
  onConfirm?: () => Promise<boolean>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const tone = TONE[copy.tone];
  const Glyph = tone.glyph;

  // Opened as soon as it mounts — it only exists while it is meant to be open.
  const open = (node: HTMLDialogElement | null) => {
    ref.current = node;
    if (node && !node.open) node.showModal();
  };

  const run = async () => {
    if (!onConfirm || busy) return;
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) ref.current?.close();
  };

  // Backdrop-close below. eslint's premise — a click handler with no keyboard
  // path — is false for <dialog>: Escape closes it natively, which is the
  // keyboard equivalent this rule exists to require.
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={open}
      aria-labelledby="confirm-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className={cn(
        "m-auto w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-[20px] border border-edge p-0 text-pine shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]",
        tone.ground,
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 id="confirm-title" className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">
            {copy.title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={copy.cancelLabel}
            className="-m-1 grid size-7 shrink-0 place-items-center rounded-pill text-pine transition-colors hover:bg-pine/8"
          >
            <X aria-hidden className="size-4.5" strokeWidth={1.6} />
          </button>
        </header>

        <p className="m-0 max-w-[46ch] text-body text-pine/82">{copy.body.replace("{name}", name)}</p>

        <span aria-hidden className="grid place-items-center py-2">
          {copy.illustration ? (
            // A fixed-size decorative asset in a modal. `next/image` is
            // `unoptimized` in the static export anyway, so it would add config
            // surface and buy nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={copy.illustration.src}
              alt=""
              width={copy.illustration.width}
              height={copy.illustration.height}
              loading="eager"
              decoding="async"
              className="h-44 w-auto"
            />
          ) : (
            <span className={cn("grid size-40 place-items-center rounded-pill", tone.disc)}>
              <Glyph className="size-16" strokeWidth={1.4} />
            </span>
          )}
        </span>

        <footer className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="inline-flex h-10 items-center rounded-pill border border-hairline bg-page px-5 text-body text-pine transition-colors hover:bg-hover-light"
          >
            {copy.cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-pill px-6 text-body font-medium transition-opacity hover:opacity-90 disabled:opacity-60",
              tone.button,
            )}
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            {copy.confirmLabel}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
