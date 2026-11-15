"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Ellipsis, Loader2, LogOut, Plus, ShieldAlert, Trash2, UserRound, X } from "lucide-react";

import { ConfirmDialog } from "@/components/team/member-actions";
import { toast } from "@/components/ui/toast";
import { DEMO_TEAM } from "@/lib/console/demo-team";
import { Select } from "@/components/ui/select";
import { useAccess, type Role } from "@/lib/access";
import { sinceLabel, teamApi, type LiveRole, type MemberDetail } from "@/lib/console/team-api";
import { cn } from "@/lib/utils";

/**
 * One team member — Figma "Desktop - 63": who they are, how they sign in, their role and its permissions (each area
 * at a level, customisable for this person alone), what they did, and the danger zone. Everything here is live: the
 * levels are the console's own permissions, and every change is enforced by the console on their next request.
 */

type Level = { label: string; caps: string[] };
type Area = { id: string; label: string; hint: string; levels: Level[] };

/** Each area of the platform and its levels, from none to all (a level includes the ones before it). */
const AREAS: Area[] = [
  { id: "run", label: "Run verifications", hint: "New sessions, the AML Explorer, cheque and card reads", levels: [{ label: "None", caps: [] }, { label: "Execute", caps: ["run"] }] },
  {
    id: "records",
    label: "Verification records",
    hint: "Summaries, full reports, and personal data (document numbers, dates of birth, images)",
    levels: [
      { label: "None", caps: [] },
      { label: "Summary", caps: ["verifications.summary"] },
      { label: "Full report", caps: ["verifications.summary", "verifications.detail"] },
      { label: "Reveal", caps: ["verifications.summary", "verifications.detail", "verifications.reveal"] },
    ],
  },
  { id: "workflows", label: "Workflows", hint: "See, or create, edit and publish", levels: [{ label: "None", caps: [] }, { label: "Read", caps: ["workflows.view"] }, { label: "Write", caps: ["workflows.view", "workflows.manage"] }] },
  { id: "keys", label: "API keys", hint: "See them masked, or create, rotate and revoke", levels: [{ label: "None", caps: [] }, { label: "Read", caps: ["keys.view"] }, { label: "Write", caps: ["keys.view", "keys.manage"] }] },
  { id: "playground", label: "API Playground", hint: "Run the APIs from the console", levels: [{ label: "None", caps: [] }, { label: "Execute", caps: ["playground"] }] },
  { id: "webhooks", label: "Webhooks", hint: "Endpoints and deliveries", levels: [{ label: "None", caps: [] }, { label: "Write", caps: ["webhooks.manage"] }] },
  { id: "billing", label: "Usage & billing", hint: "See usage, or buy credits and set budgets", levels: [{ label: "None", caps: [] }, { label: "Read", caps: ["billing.view"] }, { label: "Write", caps: ["billing.view", "billing.manage"] }] },
  { id: "team", label: "Team", hint: "Invite people, change roles and permissions", levels: [{ label: "None", caps: [] }, { label: "Write", caps: ["team.manage"] }] },
  { id: "settings", label: "Account/settings", hint: "Organisation settings, redact and delete records", levels: [{ label: "None", caps: [] }, { label: "Write", caps: ["settings.manage"] }] },
];
const AREA_CAPS = (a: Area) => [...new Set(a.levels.flatMap((l) => l.caps))];

/** The highest level of an area this set of permissions fully includes. */
function levelOf(a: Area, caps: Set<string>): Level {
  return [...a.levels].reverse().find((l) => l.caps.every((c) => caps.has(c))) ?? a.levels[0]!;
}
function withLevel(a: Area, caps: string[], level: Level): string[] {
  const drop = new Set(AREA_CAPS(a));
  return [...caps.filter((c) => !drop.has(c)), ...level.caps];
}
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** An email that wraps before its "@" on a narrow screen, never in the middle of a word. */
function Email({ value }: { value: string }) {
  const at = value.lastIndexOf("@");
  if (at <= 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, at)}
      <wbr />
      {value.slice(at)}
    </>
  );
}

const fmtDate = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(+d) ? "-" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export function MemberPage() {
  const access = useAccess();
  const [id, setId] = useState<string | null>(null);
  const [m, setM] = useState<MemberDetail | null>(null);
  const [roles, setRoles] = useState<LiveRole[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const [r, t] = await Promise.all([teamApi.member(id), teamApi.list()]);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setM(r.data);
    if (t.ok) setRoles(t.data.roles);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (id === null && typeof window !== "undefined" && !new URLSearchParams(window.location.search).get("id"))
    return <Notice title="No member selected." />;
  if (error) return <Notice title={error} />;
  if (!m) return <Notice title="Loading member" loading />;

  const owner = m.role === "owner";
  const role = roles.find((r) => r.id === m.role);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <a href="/team/" className="inline-flex items-center gap-1 text-body text-slate transition-colors hover:text-pine">
          <ChevronLeft aria-hidden className="size-4" strokeWidth={1.8} />
          Team
        </a>
        <a
          href="/team/?invite=1"
          className="inline-flex h-[35px] shrink-0 items-center gap-2 rounded-pill bg-lime px-3 text-micro font-medium text-pine transition-[filter] hover:brightness-95"
        >
          <Plus aria-hidden className="size-[15px]" strokeWidth={2.2} />
          Invite Member
        </a>
      </div>

      <Header m={m} roles={roles} onChanged={load} />
      <Overview m={m} />
      <Permissions m={m} roleName={role?.name ?? m.roleName} roleSummary={m.roleSummary} roleDefaults={role?.capabilities ?? []} owner={owner} grantable={(c) => access.can(c as Parameters<typeof access.can>[0])} onSaved={load} />
      <Activity m={m} />
      {!owner && !m.isMe ? <Danger m={m} onChanged={load} /> : null}
    </div>
  );
}

function Notice({ title, loading }: { title: string; loading?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-shell border border-hairline bg-panel px-6 py-14 text-center">
      {loading ? <Loader2 aria-hidden className="size-6 animate-spin text-muted" /> : <UserRound aria-hidden className="size-6 text-muted" />}
      <p className="m-0 text-body font-medium text-pine">{title}</p>
      {!loading ? (
        <a href="/team/" className="text-micro text-pine underline underline-offset-4">
          Back to Team
        </a>
      ) : null}
    </div>
  );
}

const STATUS: Record<MemberDetail["status"], { label: string; cls: string; dot: string }> = {
  active: { label: "Active", cls: "bg-lime-tint text-[#3d7a0c]", dot: "bg-[#5aa516]" },
  invited: { label: "Invited", cls: "bg-caution-tint text-caution", dot: "bg-caution" },
  deactivated: { label: "Suspended", cls: "bg-danger-tint text-danger", dot: "bg-danger" },
};

function Card({ title, right, children, className }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-5 rounded-[20px] border border-hairline bg-panel p-5 sm:p-6", className)}>
      {title || right ? (
        <header className="flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="m-0 text-[17px] font-medium tracking-[-0.2px] text-pine">{title}</h2> : <span />}
          {right}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- header */

function Header({ m, roles, onChanged }: { m: MemberDetail; roles: LiveRole[]; onChanged: () => void }) {
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<"role" | "signout" | "remove" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const owner = m.role === "owner";
  const st = STATUS[m.status];
  useEffect(() => {
    if (!menu) return;
    const off = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [menu]);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-pill bg-lime text-[17px] font-semibold text-pine">
            {m.initials}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="m-0 text-[20px] font-medium tracking-[-0.3px] break-words text-pine">{m.name}</h1>
            <p className="m-0 text-body [overflow-wrap:anywhere] text-slate">
              <Email value={m.email} />
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-[8px] bg-lime px-2.5 py-1 text-micro font-medium text-pine">{m.roleName}</span>
              <span className={cn("inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-micro font-medium", st.cls)}>
                <span aria-hidden className={cn("size-1.5 rounded-pill", st.dot)} />
                {st.label}
              </span>
              {m.customPermissions ? <span className="rounded-[8px] border border-lime bg-white px-2.5 py-1 text-micro font-medium text-pine">Custom permissions</span> : null}
            </div>
          </div>
        </div>
        {!owner && !m.isMe ? (
          <div ref={menuRef} className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDialog("role")}
              className="inline-flex h-10 items-center rounded-pill border border-hairline bg-white px-4 text-body text-pine transition-colors hover:bg-hover-light"
            >
              Change role
            </button>
            <button
              type="button"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((o) => !o)}
              className="grid size-10 place-items-center rounded-pill border border-hairline bg-white text-pine transition-colors hover:bg-hover-light"
            >
              <Ellipsis aria-hidden className="size-4" strokeWidth={2} />
            </button>
            {menu ? (
              <div role="menu" className="absolute top-12 right-0 z-30 flex w-52 flex-col gap-2 rounded-[14px] border border-hairline bg-white p-2.5 shadow-[0_12px_28px_-10px_rgb(14_50_40/0.25)]">
                <p className="m-0 border-b border-pine/8 px-1 pb-2 text-body font-medium text-pine">Suspend Access</p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setDialog("signout");
                  }}
                  className="flex items-center gap-2 rounded-[8px] bg-pine/5 px-2 py-1.5 text-left text-[13px] text-pine transition-colors hover:bg-pine/10"
                >
                  <LogOut aria-hidden className="size-4" strokeWidth={1.7} />
                  Force sign-out
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setDialog("remove");
                  }}
                  className="flex items-center gap-2 rounded-[8px] bg-danger-tint px-2 py-1.5 text-left text-[13px] text-danger transition-colors hover:bg-danger/15"
                >
                  <Trash2 aria-hidden className="size-4" strokeWidth={1.7} />
                  Remove from Team
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {dialog === "role" ? <RoleDialog m={m} roles={roles} onClose={() => setDialog(null)} onDone={onChanged} /> : null}
      {dialog === "signout" ? (
        <Confirm
          title={`Sign ${m.name} out everywhere?`}
          body="Every session they have open ends now, on every device. They can sign in again unless you also suspend them."
          cta="Force sign-out"
          onClose={() => setDialog(null)}
          run={async () => {
            const r = await teamApi.signOut(m.id);
            if (!r.ok) return toast.error("Couldn't sign them out", r.message), false;
            toast.success("Signed out everywhere", `${r.data.ended} session${r.data.ended === 1 ? "" : "s"} ended.`);
            onChanged();
            return true;
          }}
        />
      ) : null}
      {dialog === "remove" ? <RemoveConfirm m={m} onClose={() => setDialog(null)} /> : null}
    </Card>
  );
}

function RoleDialog({ m, roles, onClose, onDone }: { m: MemberDetail; roles: LiveRole[]; onClose: () => void; onDone: () => void }) {
  const choices = roles.filter((r) => r.invitable);
  const [picked, setPicked] = useState(choices.find((r) => r.id === m.role)?.name ?? choices[0]?.name ?? "");
  const role = choices.find((r) => r.name === picked);
  return (
    <Confirm
      title="Change role"
      body={`${m.name} is ${m.roleName === "Admin" ? "an" : "a"} ${m.roleName}. A new role starts from its own permissions and applies at once.`}
      cta="Save role"
      tone="lime"
      disabled={!role || role.id === m.role}
      onClose={onClose}
      run={async () => {
        if (!role) return false;
        const r = await teamApi.setRole(m.id, role.id as Role);
        if (!r.ok) return toast.error("Couldn't change the role", r.message), false;
        toast.success("Role changed", `${m.name} is now ${role.name}. It applies at once.`);
        onDone();
        return true;
      }}
    >
      <Select block menuFixed id="member-role" label="Role" options={choices.map((r) => r.name)} value={picked} onValueChange={setPicked} icon={UserRound} className="h-10 w-full rounded-[10px] border border-hairline bg-panel py-0 pr-10 pl-10 text-body text-ink" />
      {role ? <p className="m-0 text-micro text-slate">{role.summary}</p> : null}
    </Confirm>
  );
}

/** Figma "Delete User": the same dialog the Team list uses. */
function RemoveConfirm({ m, onClose }: { m: MemberDetail; onClose: () => void }) {
  return (
    <ConfirmDialog
      copy={DEMO_TEAM.confirm.delete}
      name={m.name}
      onClose={onClose}
      onConfirm={async () => {
        const r = await teamApi.remove(m.id);
        if (!r.ok) return toast.error("Couldn't remove them", r.message), false;
        toast.success("Member removed", `${m.name} no longer has access.`);
        window.location.href = "/team/";
        return true;
      }}
    />
  );
}

/* ---------------------------------------------------------------- overview */

function Overview({ m }: { m: MemberDetail }) {
  const items: [string, React.ReactNode][] = [
    ["Email", <Email key="e" value={m.email} />],
    ["Role", m.roleName],
    ["Joined", fmtDate(m.joined)],
    ["Last active", sinceLabel(m.lastActive) ?? "Never"],
    ["Last login", m.lastLogin ? `${m.lastLogin.device}, ${sinceLabel(m.lastLogin.at) ?? ""}` : "Never"],
    ["Two-factor auth", m.twoFactor ? "Enabled" : "Not set up"],
    ["Account status", STATUS[m.status].label],
    ["Member ID", m.id],
  ];
  return (
    <Card title="Overview">
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-1">
            <dt className="text-[11px] font-medium tracking-[0.06em] text-slate uppercase">{k}</dt>
            <dd className="m-0 text-body [overflow-wrap:anywhere] text-pine">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ---------------------------------------------------------------- role & permissions */

function Permissions({
  m,
  roleName,
  roleSummary,
  roleDefaults,
  owner,
  grantable,
  onSaved,
}: {
  m: MemberDetail;
  roleName: string;
  roleSummary: string;
  roleDefaults: string[];
  owner: boolean;
  grantable: (cap: string) => boolean;
  onSaved: () => void;
}) {
  const [custom, setCustom] = useState(m.customPermissions);
  const [caps, setCaps] = useState<string[]>(m.permissions);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCaps(m.permissions);
    setCustom(m.customPermissions);
  }, [m.permissions, m.customPermissions]);
  const set = useMemo(() => new Set(caps), [caps]);
  const dirty = !same(caps, m.permissions);
  const locked = owner || m.isMe;

  const save = async (next: string[]) => {
    setBusy(true);
    const r = await teamApi.setPermissions(m.id, next.filter((c) => c !== "ownership"));
    setBusy(false);
    if (!r.ok) {
      toast.error("Couldn't save the permissions", r.message);
      return;
    }
    toast.success("Permissions saved", `What ${m.name} can do changed. It applies at once.`);
    onSaved();
  };

  return (
    <Card
      title="Role & permissions"
      right={
        <label className={cn("flex items-center gap-3 text-micro text-pine", locked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
          Customize permissions for this member
          <button
            type="button"
            role="switch"
            aria-checked={custom}
            disabled={locked || busy}
            onClick={() => {
              if (custom) {
                // back to the role's own permissions
                setCustom(false);
                if (!same(m.permissions, roleDefaults) || m.customPermissions) void save(roleDefaults);
                else setCaps(m.permissions);
              } else setCustom(true);
            }}
            className={cn("relative h-6 w-11 shrink-0 rounded-pill transition-colors", custom ? "bg-lime" : "bg-pine/15")}
          >
            <span aria-hidden className={cn("absolute top-0.5 size-5 rounded-pill bg-white shadow transition-[left]", custom ? "left-[22px]" : "left-0.5")} />
          </button>
        </label>
      }
    >
      <div className="flex flex-col gap-2 rounded-[14px] border border-lime/70 bg-lime-tint px-4 py-3.5">
        <span className="w-fit rounded-[6px] bg-lime px-2 py-0.5 text-[12px] font-medium text-pine">{roleName}</span>
        <p className="m-0 text-body text-pine">
          {owner ? "Full control of the account, including billing, ownership and closing the account. The Owner always has every permission." : roleSummary}
        </p>
        {m.isMe && !owner ? <p className="m-0 text-micro text-pine/70">You cannot change your own permissions. Ask another Owner or Admin.</p> : null}
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {AREAS.map((a, i) => {
          const current = levelOf(a, set);
          const base = levelOf(a, new Set(roleDefaults));
          const options = a.levels.filter((l) => l.label === current.label || l.caps.every((c) => set.has(c) || grantable(c))).map((l) => l.label);
          const changed = custom && current.label !== base.label;
          return (
            <li key={a.id} className={cn("flex flex-wrap items-center justify-between gap-3 py-3", i > 0 && "border-t border-hairline")}>
              <div className="flex min-w-0 flex-col">
                <span className="text-body text-pine">{a.label}</span>
                <span className="text-micro text-slate">{changed ? `Changed for this person (the ${roleName} role gives ${base.label})` : a.hint}</span>
              </div>
              <Select
                menuFixed
                menuAlign="end"
                id={`lvl-${a.id}`}
                label={`${a.label} level`}
                options={options}
                value={current.label}
                disabled={!custom || locked || busy}
                onValueChange={(v) => {
                  const lvl = a.levels.find((l) => l.label === v);
                  if (lvl) setCaps((c) => withLevel(a, c, lvl));
                }}
                className={cn(
                  "h-9 w-[150px] rounded-pill border bg-white py-0 pr-9 pl-4 text-[13px] text-pine",
                  changed ? "border-lime ring-1 ring-lime" : "border-hairline",
                )}
              />
            </li>
          );
        })}
      </ul>

      {custom && dirty ? (
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-hairline pt-4">
          <span className="mr-auto text-micro text-slate">Unsaved changes</span>
          <button
            type="button"
            onClick={() => setCaps(m.permissions)}
            className="inline-flex h-9 items-center rounded-pill border border-hairline bg-white px-4 text-body text-pine transition-colors hover:bg-hover-light"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(caps)}
            className="inline-flex h-9 items-center gap-2 rounded-pill bg-lime px-4 text-body font-medium text-pine transition-[filter] hover:brightness-95 disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Save permissions
          </button>
        </div>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------- activity */

function Activity({ m }: { m: MemberDetail }) {
  return (
    <Card title="Activity" className="bg-white">
      {m.activity.length ? (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                {["Action", "Target", "When"].map((h, i) => (
                  <th key={h} className={cn("px-1 pb-2.5 text-[11px] font-medium tracking-[0.06em] text-slate uppercase", i === 2 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.activity.map((a, i) => (
                <tr key={`${a.at}-${i}`} className="border-b border-hairline last:border-0">
                  <td className="px-1 py-3 text-body font-medium text-pine">{a.action}</td>
                  <td className="px-1 py-3 text-body break-all text-slate">{a.target}</td>
                  <td className="px-1 py-3 text-right text-body whitespace-nowrap text-slate">{sinceLabel(a.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-body text-slate">Nothing yet. Sign-ins and what they do with verification records show here.</p>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- danger zone */

function Danger({ m, onChanged }: { m: MemberDetail; onChanged: () => void }) {
  const [ask, setAsk] = useState<"suspend" | "remove" | null>(null);
  const suspended = m.status === "deactivated";
  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-danger/40 bg-white p-5 sm:p-6">
      <h2 className="m-0 flex items-center gap-2 text-[17px] font-medium text-danger">
        <ShieldAlert aria-hidden className="size-4.5" strokeWidth={1.8} />
        Danger zone
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-body font-medium text-pine">{suspended ? "Access suspended" : "Suspend access"}</span>
          <span className="text-micro text-slate">
            {suspended ? "They cannot sign in. Reactivate to let them back in with the same role." : "Reversible. Suspended members keep their role but can't sign in."}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAsk("suspend")}
          className="inline-flex h-10 items-center rounded-pill border border-hairline bg-panel px-5 text-body text-pine transition-colors hover:bg-hover-light"
        >
          {suspended ? "Reactivate" : "Suspend"}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-body font-medium text-pine">Remove from team</span>
          <span className="text-micro text-slate">Sessions and API keys tied to this member are revoked immediately.</span>
        </div>
        <button
          type="button"
          onClick={() => setAsk("remove")}
          className="inline-flex h-10 items-center rounded-pill bg-danger px-5 text-body font-medium text-white transition-[filter] hover:brightness-95"
        >
          Remove
        </button>
      </div>
      {ask === "suspend" ? (
        // Figma "Deactivate User" / "Activate User"
        <ConfirmDialog
          copy={suspended ? DEMO_TEAM.confirm.activate : DEMO_TEAM.confirm.deactivate}
          name={m.name}
          onClose={() => setAsk(null)}
          onConfirm={async () => {
            const r = suspended ? await teamApi.activate(m.id) : await teamApi.deactivate(m.id);
            if (!r.ok) return toast.error("That didn't work", r.message), false;
            toast.success(suspended ? "Member reactivated" : "Access suspended", suspended ? `${m.name} can sign in again.` : `${m.name} can no longer sign in.`);
            onChanged();
            return true;
          }}
        />
      ) : null}
      {ask === "remove" ? <RemoveConfirm m={m} onClose={() => setAsk(null)} /> : null}
    </section>
  );
}

/* ---------------------------------------------------------------- confirm */

function Confirm({
  title,
  body,
  cta,
  tone = "pine",
  disabled,
  onClose,
  run,
  children,
}: {
  title: string;
  body: string;
  cta: string;
  tone?: "pine" | "lime" | "danger";
  disabled?: boolean;
  onClose: () => void;
  run: () => Promise<boolean>;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
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
      className="m-auto w-[min(460px,calc(100vw-2rem))] rounded-[20px] border border-edge bg-white p-0 text-pine shadow-[0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)] backdrop:bg-black/14 backdrop:backdrop-blur-[7.6px]"
    >
      <div className="flex flex-col gap-4 p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 className="m-0 text-[18px] font-medium tracking-[-0.3px] text-pine">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Cancel" className="-m-1 grid size-7 shrink-0 place-items-center rounded-pill text-pine hover:bg-pine/8">
            <X aria-hidden className="size-4.5" strokeWidth={1.6} />
          </button>
        </header>
        <p className="m-0 text-body text-pine/80">{body}</p>
        {children}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" onClick={() => ref.current?.close()} className="inline-flex h-10 items-center rounded-pill border border-hairline px-4 text-body text-pine hover:bg-hover-panel">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={async () => {
              setBusy(true);
              const ok = await run();
              setBusy(false);
              if (ok) ref.current?.close();
            }}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-pill px-4 text-body font-medium transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50",
              tone === "danger" ? "bg-danger text-white" : tone === "lime" ? "bg-lime text-pine" : "bg-pine text-white",
            )}
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            {cta}
          </button>
        </div>
      </div>
    </dialog>
  );
}
