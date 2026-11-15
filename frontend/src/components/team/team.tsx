"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, ShieldOff } from "lucide-react";

import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

import { InviteDialog } from "@/components/team/invite-dialog";
import { MemberActions, type MemberLive } from "@/components/team/member-actions";
import type { Role } from "@/lib/access";
import { useCurrentAccount } from "@/lib/console/use-current-account";
import { sinceLabel, teamApi, type LiveMember, type LiveTeam } from "@/lib/console/team-api";
import type { MemberAction, MemberStatus, TeamData, TeamMember } from "@/lib/console/types";
import { cn } from "@/lib/utils";

/**
 * Team — Figma Desktop-24.
 *
 * A grid table on the shared column template, like the verifications list: one
 * declaration used by the header and every row, so a column cannot be wide in
 * one and narrow in the other.
 *
 * NO PHOTOGRAPHS. The frame fills the avatar column with stock faces; attaching
 * a real person's face to an invented employee is the objection the dashboard's
 * activity list already answers with initials on pine. Same answer here.
 *
 * LIVE: signed in, the rows are the organisation's real people from the console
 * (`/api/team`), the menu runs each action there, and the pager pages the list.
 * Signed out (the local preview without the sign-in gate) the frame's sample rows stay.
 */
export function Team({ data }: { data: TeamData }) {
  const live = useLiveTeam(data);
  const view: TeamData = live.members ? { ...data, members: live.members } : data;
  const [rows, setRows] = useState(data.pagination.rowsLabel);
  const [page, setPage] = useState(1);
  const size = parseInt(rows, 10) || 10;
  const pages = Math.max(1, Math.ceil(view.members.length / size));
  const current = Math.min(page, pages);
  const shown = live.members ? view.members.slice((current - 1) * size, current * size) : view.members;

  const template = data.columns.map((c) => `${c.width}fr`).join(" ");
  const alignOf = (i: number) => data.columns[i]?.align ?? "left";

  if (live.state === "loading") return <Notice icon={Loader2} spin text="Loading your team" />;
  if (live.state === "error") return <Notice icon={ShieldOff} text={live.message} />;

  return (
    <div className="flex flex-col gap-row">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{data.title}</h1>
        <InviteDialog form={data.invite} label={data.inviteLabel} live={live.invite} />
      </header>

      <section className="overflow-hidden rounded-shell border border-hairline bg-page">
        <div className="overflow-x-auto">
          <div role="table" style={{ minWidth: 940 }}>
            <div
              role="row"
              className="grid items-center gap-x-3 border-b border-edge bg-panel px-5 py-3"
              style={{ gridTemplateColumns: template }}
            >
              {data.columns.map((col, i) => (
                <span
                  key={col.key}
                  role="columnheader"
                  className={cn(
                    "text-micro text-muted",
                    alignOf(i) === "right" ? "text-right" : "text-left",
                  )}
                >
                  {col.header}
                </span>
              ))}
            </div>

            <div role="rowgroup">
              {shown.map((member) => (
                <div
                  key={member.id}
                  role="row"
                  className="grid items-center gap-x-3 border-b border-edge px-5 py-3.5 transition-colors last:border-b-0 hover:bg-hover-light"
                  style={{ gridTemplateColumns: template }}
                >
                  {data.columns.map((col, i) => (
                    <div
                      key={col.key}
                      role="cell"
                      className={cn(
                        "min-w-0",
                        alignOf(i) === "right" ? "text-right" : "text-left",
                      )}
                    >
                      <Cell column={col.key} member={member} data={data} live={live.row} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <Pagination
          data={data.pagination}
          live={
            live.members
              ? {
                  rows,
                  onRows: (r) => {
                    setRows(r);
                    setPage(1);
                  },
                  pages,
                  current,
                  onPage: setPage,
                }
              : undefined
          }
        />
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   Cells
---------------------------------------------------------------------------- */

const STATUS: Record<MemberStatus, { label: string; pill: string }> = {
  active: { label: "active", pill: "bg-pass-tint text-ramp-2" },
  invited: { label: "Invited", pill: "bg-inert-tint text-inert" },
  deactivated: { label: "Deactivated", pill: "bg-caution-tint text-caution" },
};

function Cell({
  column,
  member,
  data,
  live,
}: {
  column: string;
  member: TeamMember;
  data: TeamData;
  live?: MemberLive;
}) {
  switch (column) {
    case "name":
      return (
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-pill bg-pine text-micro font-medium text-lime"
          >
            {member.initials}
          </span>
          {member.roleId ? (
            // live: the name opens the member's page
            <a
              href={`/team/member/?id=${encodeURIComponent(member.id)}`}
              className="min-w-0 text-body font-medium break-words text-pine underline-offset-4 hover:underline"
            >
              {member.name}
            </a>
          ) : (
            <span className="min-w-0 text-body font-medium break-words text-pine">{member.name}</span>
          )}
          {member.isMe ? <span className="shrink-0 text-micro text-muted">(you)</span> : null}
        </span>
      );

    case "email":
      return <span className="block text-body break-all text-slate">{member.email}</span>;

    case "role":
      // One neutral chip for every role, which is what the frame draws. Roles
      // are not a severity scale, and colouring them would imply one.
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-pill bg-well px-2.5 py-1 text-micro font-medium text-pine">{member.role}</span>
          {member.customPermissions ? (
            <span
              title="This person's permissions differ from the role's (⋯ > Edit permissions)"
              className="inline-flex items-center rounded-pill bg-lime px-2 py-0.5 text-[11px] font-semibold text-pine"
            >
              Custom
            </span>
          ) : null}
        </span>
      );

    case "status": {
      const s = STATUS[member.status];
      return (
        <span
          className={cn(
            "inline-flex items-center rounded-pill px-2.5 py-1 text-micro font-medium",
            s.pill,
          )}
        >
          {s.label}
        </span>
      );
    }

    case "lastActive":
      return (
        <span
          className={cn("block truncate text-body", member.lastActive ? "text-slate" : "text-muted")}
        >
          {member.lastActive ?? data.neverActiveLabel}
          {member.lastActive ? null : <span className="sr-only">Never signed in</span>}
        </span>
      );

    case "actions":
      return (
        <span className="flex justify-end">
          <MemberActions
            member={member}
            label={data.actionsLabel}
            actions={data.actions}
            confirm={data.confirm}
            live={live}
          />
        </span>
      );

    default:
      return null;
  }
}

/* ----------------------------------------------------------------------------
   Pagination
---------------------------------------------------------------------------- */

type PagerLive = { rows: string; onRows: (r: string) => void; pages: number; current: number; onPage: (p: number) => void };

/** 1 … 4 5 6 … 10: the first, the last, and the pages around the current one. */
function pageList(pages: number, current: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = [...new Set([1, pages, current - 1, current, current + 1])].filter((p) => p >= 1 && p <= pages).sort((x, y) => x - y);
  const out: (number | null)[] = [];
  keep.forEach((p, i) => {
    if (i > 0 && p - keep[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

function Pagination({ data, live }: { data: TeamData["pagination"]; live?: PagerLive }) {
  const pages = live ? pageList(live.pages, live.current) : data.pages;
  const current = live ? live.current : data.current;
  return (
    <nav
      aria-label="Team pages"
      className="flex flex-wrap items-center justify-between gap-4 border-t border-pager-line px-6 py-4"
    >
      <Select
        id="team-rows"
        name="rows"
        label="Rows per page"
        options={data.rowsOptions}
        {...(live ? { value: live.rows, onValueChange: live.onRows } : { defaultValue: data.rowsLabel })}
        className="h-11 rounded-pill bg-hover-sunken py-0 pr-9 pl-4 text-body text-pine"
      />

      <ol className="m-0 flex list-none items-center gap-0.5 p-0">
        {pages.map((page, i) =>
          page === null ? (
            <li key={`gap-${i}`} className="grid size-10 place-items-center text-body text-slate">
              …
            </li>
          ) : (
            <li key={page}>
              <button
                type="button"
                onClick={live ? () => live.onPage(page) : undefined}
                aria-current={page === current ? "page" : undefined}
                className={cn(
                  "tnum grid size-10 place-items-center rounded-box text-body transition-colors",
                  page === current
                    ? "bg-lime font-medium text-pine"
                    : "text-slate hover:bg-hover-light hover:text-pine",
                )}
              >
                {page}
                <span className="sr-only"> page</span>
              </button>
            </li>
          ),
        )}
      </ol>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={live ? () => live.onPage(Math.max(1, current - 1)) : undefined}
          disabled={live ? current <= 1 : undefined}
          className="inline-flex h-11 items-center gap-1.5 rounded-pill border border-hairline bg-page px-4 text-body text-pine shadow-sm transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft aria-hidden className="size-4" strokeWidth={1.8} />
          {data.previousLabel}
        </button>
        <button
          type="button"
          onClick={live ? () => live.onPage(Math.min(live.pages, current + 1)) : undefined}
          disabled={live ? current >= live.pages : undefined}
          className="inline-flex h-11 items-center gap-1.5 rounded-pill border border-hairline bg-page px-4 text-body text-pine shadow-sm transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {data.nextLabel}
          <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
        </button>
      </div>
    </nav>
  );
}

/* ----------------------------------------------------------------------------
   Live
---------------------------------------------------------------------------- */

function Notice({ icon: Icon, text, spin }: { icon: typeof Loader2; text: string; spin?: boolean }) {
  return (
    <section className="grid place-items-center rounded-shell border border-hairline bg-panel px-6 py-16">
      <span className="flex items-center gap-2.5 text-body text-slate">
        <Icon aria-hidden className={cn("size-5 text-pine", spin && "animate-spin")} strokeWidth={1.8} />
        {text}
      </span>
    </section>
  );
}

type LiveState = {
  state: "demo" | "loading" | "ready" | "error";
  message: string;
  members: TeamMember[] | null;
  invite?: {
    roles: LiveTeam["roles"];
    capabilities?: LiveTeam["capabilities"];
    invite: (email: string, role: Role, permissions?: string[]) => Promise<string | null>;
  };
  row?: MemberLive;
};

const SUCCESS: Partial<Record<MemberAction, (name: string, role?: string) => [string, string]>> = {
  role: (n, r) => ["Role changed", `${n} is now ${r}. It applies at once.`],
  permissions: (n) => ["Permissions saved", `What ${n} can do changed. It applies at once.`],
  edit: (n) => ["Name saved", `${n} is saved.`],
  deactivate: (n) => ["Member deactivated", `${n} can no longer sign in.`],
  activate: (n) => ["Member reactivated", `${n} can sign in again.`],
  delete: (n) => ["Member removed", `${n} no longer has access.`],
  resend: (n) => ["Invitation sent again", `${n} has a new invitation email. The earlier link no longer works.`],
};

/** The organisation's real team, when signed in; the frame's sample rows otherwise. */
/*
 * The people list is a search, and the identity service updates its search a moment after a change (eventually
 * consistent): a reload right after Delete can still list the person. So what this page changed is kept over every
 * reload: a removed person stays gone, a changed role or status shows at once, a new invitation is listed.
 */
type Patch = { removed?: true; added?: LiveMember } & Partial<Pick<LiveMember, "role" | "roleName" | "status" | "name">>;

function useLiveTeam(data: TeamData): LiveState {
  const { status } = useCurrentAccount();
  const [team, setTeam] = useState<LiveTeam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const patch = (id: string, p: Patch) => setPatches((all) => ({ ...all, [id]: { ...all[id], ...p } }));

  const load = useCallback(async () => {
    const r = await teamApi.list();
    if (r.ok) {
      setTeam(r.data);
      setError(null);
    } else setError(r.message);
  }, []);
  useEffect(() => {
    // the state is set once the list arrives (after the request), not during the effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authed") void load();
  }, [status, load]);

  if (status === "anon") return { state: "demo", message: "", members: null };
  if (error && !team) return { state: "error", message: error, members: null };
  if (!team) return { state: "loading", message: "", members: null };

  const listed = new Set(team.members.map((m) => m.id));
  const merged: LiveMember[] = [
    ...team.members,
    ...Object.values(patches).flatMap((x) => (x.added && !listed.has(x.added.id) ? [x.added] : [])),
  ]
    .filter((m) => !patches[m.id]?.removed)
    .map((m) => {
      const p = patches[m.id];
      return p ? { ...m, role: p.role ?? m.role, roleName: p.roleName ?? m.roleName, status: p.status ?? m.status, name: p.name ?? m.name } : m;
    });
  const members: TeamMember[] = merged.map((m) => ({
    id: m.id,
    name: m.name,
    initials: m.initials,
    email: m.email,
    role: m.roleName,
    roleId: m.role,
    status: m.status,
    lastActive: sinceLabel(m.lastActive),
    isMe: m.isMe,
    invitedAt: m.invitedAt,
    permissions: m.permissions,
    customPermissions: m.customPermissions,
  }));

  const act = async (kind: MemberAction, member: TeamMember, arg?: string): Promise<boolean> => {
    const r =
      kind === "role"
        ? await teamApi.setRole(member.id, arg as Role)
        : kind === "permissions"
          ? await teamApi.setPermissions(member.id, (arg ?? "").split(",").filter(Boolean))
        : kind === "edit"
          ? await teamApi.rename(member.id, arg ?? "")
          : kind === "deactivate"
            ? await teamApi.deactivate(member.id)
            : kind === "activate"
              ? await teamApi.activate(member.id)
              : kind === "delete"
                ? await teamApi.remove(member.id)
                : kind === "resend"
                  ? await teamApi.resend(member.id)
                  : kind === "transfer"
                    ? await teamApi.transfer(member.id)
                    : null;
    if (!r) return false;
    if (!r.ok) {
      toast.error("That didn't work", r.message);
      return false;
    }
    if (kind === "transfer") {
      // the signed-in person is an Admin now: everything they can see changes with it
      window.location.reload();
      return true;
    }
    const roleName = kind === "role" ? team.roles.find((x) => x.id === arg)?.name : undefined;
    if (kind === "delete") patch(member.id, { removed: true });
    else if (kind === "deactivate") patch(member.id, { status: "deactivated" });
    else if (kind === "activate") patch(member.id, { status: "active" });
    else if (kind === "role" && roleName) patch(member.id, { role: arg as Role, roleName });
    else if (kind === "edit" && arg) patch(member.id, { name: arg });
    const msg = SUCCESS[kind]?.(kind === "edit" ? (arg ?? member.name) : member.name, roleName);
    if (msg) toast.success(msg[0], msg[1]);
    await load();
    return true;
  };

  return {
    state: "ready",
    message: "",
    members,
    invite: {
      roles: team.roles,
      capabilities: team.capabilities,
      invite: async (email, role, permissions) => {
        const r = await teamApi.invite(email, role, undefined, permissions);
        if (!r.ok) return r.message;
        const name = team.roles.find((x) => x.id === role)?.name ?? data.invite.roleLabel;
        const local = email.split("@")[0] ?? email;
        patch(r.data.id, {
          added: {
            id: r.data.id,
            name: local,
            initials: local.slice(0, 2).toUpperCase(),
            email,
            role,
            roleName: name,
            status: "invited",
            lastActive: null,
            invitedAt: new Date().toISOString(),
            isMe: false,
          },
        });
        toast.success("Invitation sent", `${email} will get an email to join as ${name}.`);
        await load();
        return null;
      },
    },
    row: { roles: team.roles, capabilities: team.capabilities, canTransfer: team.me.canTransfer, act },
  };
}
