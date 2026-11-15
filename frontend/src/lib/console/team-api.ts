/**
 * Team, live: the organisation's people, their roles and invitations, from the console (`/api/team`).
 * One organisation, one team: the KYC console and the Financial portal show the same members.
 */
import type { Role } from "@/lib/access";

const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type LiveMember = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  roleName: string;
  status: "active" | "invited" | "deactivated";
  /** ISO time of the person's last activity, or null when they have never signed in. */
  lastActive: string | null;
  invitedAt: string;
  isMe: boolean;
  /** What they may do: their role's permissions with their own changes. */
  permissions?: string[];
  customPermissions?: boolean;
};

/** One permission, as the Team page names and groups it (ownership is not editable). */
export type CapabilityInfo = { id: string; group: string; label: string; editable: boolean };

export type LiveRole = { id: Role; name: string; summary: string; invitable: boolean; capabilities?: string[] };

export type LiveTeam = {
  me: { id: string | null; role: Role; canTransfer: boolean };
  roles: LiveRole[];
  capabilities?: CapabilityInfo[];
  members: LiveMember[];
};

/** One member's page (GET /api/team/:id). */
export type MemberDetail = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  roleName: string;
  roleSummary: string;
  status: "active" | "invited" | "deactivated";
  joined: string | null;
  lastActive: string | null;
  lastLogin: { device: string; at: string } | null;
  twoFactor: boolean;
  permissions: string[];
  customPermissions: boolean;
  isMe: boolean;
  activity: { action: string; target: string; at: string }[];
};

export type Invitation = { email: string; name: string; orgName: string; role: Role; roleName: string; roleSummary: string };

type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<Result<T>> {
  try {
    const r = await fetch(`${API}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
    const j = (await r.json().catch(() => null)) as (T & { message?: unknown }) | null;
    if (!r.ok) {
      const m = j?.message;
      return {
        ok: false,
        status: r.status,
        message: r.status === 401 ? "Sign in to manage your team." : typeof m === "string" ? m : "Something went wrong. Please try again.",
      };
    }
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the console. Check your connection and try again." };
  }
}

const json = (b: unknown) => ({ body: JSON.stringify(b) });
const one = (id: string) => encodeURIComponent(id);

export const teamApi = {
  list: () => call<LiveTeam>("/api/team"),
  // `permissions`: the exact set they get, when it differs from the role's (the console stores only the difference)
  invite: (email: string, role: Role, name?: string, permissions?: string[]) =>
    call<{ ok: true; id: string }>("/api/team/invite", { method: "POST", ...json({ email, role, name, ...(permissions ? { permissions } : {}) }) }),
  member: (id: string) => call<MemberDetail>(`/api/team/${one(id)}`),
  signOut: (id: string) => call<{ ok: true; ended: number }>(`/api/team/${one(id)}/signout`, { method: "POST" }),
  setPermissions: (id: string, permissions: string[]) => call<{ ok: true }>(`/api/team/${one(id)}`, { method: "PATCH", ...json({ permissions }) }),
  resend: (id: string) => call<{ ok: true }>(`/api/team/${one(id)}/resend`, { method: "POST" }),
  setRole: (id: string, role: Role) => call<{ ok: true }>(`/api/team/${one(id)}`, { method: "PATCH", ...json({ role }) }),
  rename: (id: string, name: string) => call<{ ok: true }>(`/api/team/${one(id)}`, { method: "PATCH", ...json({ name }) }),
  deactivate: (id: string) => call<{ ok: true }>(`/api/team/${one(id)}/deactivate`, { method: "POST" }),
  activate: (id: string) => call<{ ok: true }>(`/api/team/${one(id)}/activate`, { method: "POST" }),
  remove: (id: string) => call<{ ok: true }>(`/api/team/${one(id)}`, { method: "DELETE" }),
  transfer: (id: string) => call<{ ok: true }>(`/api/team/${one(id)}/transfer`, { method: "POST" }),
  // the invited person, before they have an account they can sign in to
  invitation: (user: string) => call<Invitation>(`/api/team/invitation?user=${one(user)}`),
  accept: (user: string, code: string, password: string, name?: string) =>
    call<{ ok: true; email: string }>("/api/team/accept", { method: "POST", ...json({ user, code, password, name }) }),
};

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "4 days ago", then the date. */
export function sinceLabel(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 90) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
