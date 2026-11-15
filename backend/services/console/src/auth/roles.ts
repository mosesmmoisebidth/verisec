import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Team roles: what each person may do in the portals (VeriSec_KYC_Settings_Billing_Team_Webhooks_Spec 3.3, extended to
 * the pages built since and approved by the user on 2026-10-08). A role is a set of capabilities; the console enforces
 * them on every route (this file), the screens only hide what a role cannot use. A person's API keys are capped by
 * their role in the key service.
 */
export const ROLES = ['owner', 'admin', 'developer', 'reviewer', 'billing', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export type Capability =
  | 'verifications.summary'
  | 'verifications.detail'
  | 'verifications.reveal'
  | 'run'
  | 'workflows.view'
  | 'workflows.manage'
  | 'keys.view'
  | 'keys.manage'
  | 'playground'
  | 'webhooks.manage'
  | 'billing.view'
  | 'billing.manage'
  | 'team.manage'
  | 'settings.manage'
  | 'ownership';

const MATRIX: Record<Capability, readonly Role[]> = {
  // Dashboard, verification summaries (and the Financial portal's scans and dashboard)
  'verifications.summary': ['owner', 'admin', 'developer', 'reviewer', 'viewer'],
  'verifications.detail': ['owner', 'admin', 'developer', 'reviewer'],
  // full document number, date of birth, images
  'verifications.reveal': ['owner', 'admin', 'reviewer'],
  // new sessions, the AML Explorer, cheque, card and BIN reads
  run: ['owner', 'admin', 'developer', 'reviewer'],
  'workflows.view': ['owner', 'admin', 'developer', 'reviewer', 'viewer'],
  'workflows.manage': ['owner', 'admin', 'developer'],
  // a Viewer sees the list, masked (secrets are never shown to anyone after creation)
  'keys.view': ['owner', 'admin', 'developer', 'viewer'],
  'keys.manage': ['owner', 'admin', 'developer'],
  playground: ['owner', 'admin', 'developer'],
  'webhooks.manage': ['owner', 'admin', 'developer'],
  'billing.view': ['owner', 'admin', 'developer', 'billing', 'viewer'],
  'billing.manage': ['owner', 'admin', 'billing'],
  'team.manage': ['owner', 'admin'],
  'settings.manage': ['owner', 'admin'],
  // transfer ownership, close the account
  ownership: ['owner'],
};

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
export const can = (role: Role | undefined, cap: Capability) => !!role && MATRIX[cap].includes(role);
/** Every capability a role has (for the screens). */
export const capabilitiesOf = (role: Role) => (Object.keys(MATRIX) as Capability[]).filter((c) => MATRIX[c].includes(role));

export const CAPABILITIES = Object.keys(MATRIX) as Capability[];
/** What an Owner or Admin may add to or take from a member's role. Ownership only ever moves by Transfer ownership. */
export const EDITABLE: Capability[] = CAPABILITIES.filter((c) => c !== 'ownership');

/** Each permission as the Team page names it, in the group it is shown under. */
export const CAPABILITY_INFO: Record<Capability, { group: string; label: string }> = {
  'verifications.summary': { group: 'Verifications', label: 'See the dashboard and verification summaries' },
  'verifications.detail': { group: 'Verifications', label: "Open a verification's full report" },
  'verifications.reveal': { group: 'Verifications', label: 'See personal data (document numbers, dates of birth, images)' },
  run: { group: 'Verifications', label: 'Start verifications, use the AML Explorer, run cheque and card reads' },
  'workflows.view': { group: 'Workflows', label: 'See workflows' },
  'workflows.manage': { group: 'Workflows', label: 'Create, edit and publish workflows' },
  'keys.view': { group: 'Developers', label: 'See API keys (always masked)' },
  'keys.manage': { group: 'Developers', label: 'Create, rotate and revoke API keys' },
  playground: { group: 'Developers', label: 'Use the API Playground' },
  'webhooks.manage': { group: 'Developers', label: 'Manage webhooks' },
  'billing.view': { group: 'Billing', label: 'See usage, credits and invoices' },
  'billing.manage': { group: 'Billing', label: 'Buy credits and set budgets' },
  'team.manage': { group: 'Team & settings', label: 'Invite people and change their roles and permissions' },
  'settings.manage': { group: 'Team & settings', label: 'Change organisation settings, redact and delete records' },
  ownership: { group: 'Team & settings', label: 'Transfer ownership and close the account' },
};

/** A member's own permissions on top of their role: some added, some taken away. */
export type Permissions = { add: Capability[]; remove: Capability[] };
export const NO_CHANGES: Permissions = { add: [], remove: [] };

const isCap = (v: unknown): v is Capability => typeof v === 'string' && (EDITABLE as string[]).includes(v);

/** The stored permissions (Zitadel metadata `vs_perms`, written only by the console), cleaned; nothing on record = none. */
export function parsePermissions(raw: unknown): Permissions {
  try {
    const v = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { add?: unknown; remove?: unknown } | null;
    const list = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter(isCap))] : []);
    return { add: list(v?.add), remove: list(v?.remove) };
  } catch {
    return { add: [], remove: [] };
  }
}

/** The changes from a role's defaults that make this exact set (only what differs is stored). */
export function permissionsFor(role: Role, wanted: Capability[]): Permissions {
  const base = new Set(capabilitiesOf(role));
  const want = new Set(wanted.filter(isCap));
  return {
    add: EDITABLE.filter((c) => want.has(c) && !base.has(c)),
    remove: EDITABLE.filter((c) => !want.has(c) && base.has(c)),
  };
}

/** What a member may do: their role's permissions, with their own added and taken away (an Owner always has all). */
export function effectiveCapabilities(role: Role, p?: Permissions | null): Capability[] {
  if (role === 'owner' || !p) return capabilitiesOf(role);
  const out = new Set(capabilitiesOf(role));
  for (const c of p.add) if (c !== 'ownership') out.add(c);
  for (const c of p.remove) out.delete(c);
  return CAPABILITIES.filter((c) => out.has(c));
}

/** Whether a signed-in request may do this: its member's own permissions when known, else the role's. */
export const allowed = (req: { role?: Role; caps?: Capability[] }, cap: Capability) => (req.caps ? req.caps.includes(cap) : can(req.role, cap));

export const ROLE_NAMES: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
  reviewer: 'Reviewer',
  billing: 'Billing',
  viewer: 'Viewer',
};

const NEED = 'verisec:need';
/** The capability a route needs (on a handler, or a whole controller). */
export const Need = (cap: Capability) => SetMetadata(NEED, cap);

/**
 * Refuses a route the signed-in person's role does not allow. Runs after the guard that signs the person in (it reads
 * `req.role`, which that guard sets); a route without `@Need` is left to its own guard.
 */
@Injectable()
export class NeedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const cap = this.reflector.getAllAndOverride<Capability | undefined>(NEED, [ctx.getHandler(), ctx.getClass()]);
    if (!cap) return true;
    const req = ctx.switchToHttp().getRequest<{ role?: Role; caps?: Capability[] }>();
    const role = req.role;
    if (allowed(req, cap)) return true;
    throw new ForbiddenException({
      code: 'forbidden',
      message: req.caps
        ? 'Your permissions do not include this. Ask an Owner or Admin of your team.'
        : `Your role${role ? ` (${ROLE_NAMES[role]})` : ''} cannot do this. Ask an Owner or Admin of your team.`,
    });
  }
}
