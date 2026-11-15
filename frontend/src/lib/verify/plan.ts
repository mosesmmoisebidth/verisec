"use client";

/**
 * What this verification runs: the checks of the workflow version the session is pinned to
 * (POST /api/kyc/plan). The flow shows only the screens those checks need; the server refuses
 * any check the workflow leaves out, so this decides what the applicant SEES, never what is
 * allowed. A session without a workflow (`checks: null`) runs every screen.
 *
 * A workflow with rules (`dynamic`) can add a check once something is learned (a VPN, the
 * document country): its plan is fetched again on every screen (`refreshPlan`). Rules only ever
 * add checks, so a screen the cached plan allows shows at once; one it leaves out waits for the
 * fresh plan before it is skipped.
 */
import { useEffect, useSyncExternalStore } from "react";

import { sessionTag } from "./brand";
import { kycApi } from "./kyc-api";
import type { FlowScreen, Leaner } from "./types";

export type Plan = { workflow: string | null; checks: string[] | null; documentTypes: string[] | null; dynamic?: boolean };

const KEY = "verisec.kyc.plan";
const EVERYTHING: Plan = { workflow: null, checks: null, documentTypes: null };

/** The checks a screen needs (any one of them). Screens not listed always show. */
const NEEDS: Record<string, string[]> = {
  "document-type": ["document"],
  "document-front": ["document"],
  "document-back": ["document"],
  "document-review": ["document"],
  "document-face": ["face-match"],
  epassport: ["nfc"],
  "face-intro": ["liveness"],
  selfie: ["liveness"],
  phone: ["phone"],
  "phone-code": ["phone"],
  email: ["email"],
  "email-code": ["email"],
  // the screening summary: shown when the workflow screens the applicant (device signals are
  // taken on every page without a screen of their own)
  checking: ["aml", "phone", "email"],
  findings: ["aml", "phone", "email"],
  "address-upload": ["address"],
  "address-confirm": ["address"],
};

export function screenAllowed(plan: Plan | null, slug: string): boolean {
  if (!plan?.checks) return true;
  const need = NEEDS[slug];
  return !need || need.some((c) => plan.checks!.includes(c));
}

/** The contact step is named for what it runs: phone and email, one of them, or screening alone. */
export function stepLabel(stepId: string, title: string, caption: string, plan: Plan | null): { title: string; caption: string } {
  if (stepId !== "contact" || !plan?.checks) return { title, caption };
  const phone = plan.checks.includes("phone");
  const email = plan.checks.includes("email");
  if (phone && email) return { title, caption };
  if (phone) return { title: "Phone Verification", caption: "Confirm your phone number" };
  if (email) return { title: "Email Verification", caption: "Confirm your email address" };
  return { title: "Screening", caption: "Watchlist and risk checks" };
}

/** The full wording when the workflow runs every check it names, else the first shorter one that fits. */
export function wordingFor<T>(plan: Plan | null, full: T, needs?: string[], leaner?: Leaner<T>): T {
  const has = plan?.checks;
  if (!has || !needs?.length || needs.every((c) => has.includes(c))) return full;
  return leaner?.find((v) => v.needs.every((c) => has.includes(c)))?.value ?? full;
}

/** Whether something marked with `needs` (any one of them) belongs in this workflow. */
export const appliesTo = (plan: Plan | null, needs?: string[]) =>
  !plan?.checks || !needs?.length || needs.some((c) => plan.checks!.includes(c));

/** A screen as this workflow shows it: its explainer, tip and checklist without checks it leaves out. */
export function screenFor(screen: FlowScreen, plan: Plan | null): FlowScreen {
  if (!plan?.checks) return screen;
  const aside = screen.aside && {
    ...screen.aside,
    body: wordingFor(plan, screen.aside.body, screen.aside.needs, screen.aside.leaner),
    link: screen.aside.link?.tip
      ? {
          ...screen.aside.link,
          tip: { ...screen.aside.link.tip, body: wordingFor(plan, screen.aside.link.tip.body, screen.aside.link.tip.needs, screen.aside.link.tip.leaner) },
        }
      : screen.aside.link,
  };
  const panel = screen.panel.kind === "checklist" ? { ...screen.panel, items: screen.panel.items.filter((i) => appliesTo(plan, i.needs)) } : screen.panel;
  return { ...screen, aside, panel };
}

let current: Plan | null = null;
let pending: Promise<void> | null = null;
let refreshing: Promise<void> | null = null;
const listeners = new Set<() => void>();

function read(): Plan | null {
  if (current) return current;
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { tag?: string; plan?: Plan } | null;
    const tag = sessionTag();
    if (c?.plan && tag && c.tag === tag) current = c.plan;
  } catch {}
  return current;
}

function publish(plan: Plan, keep: boolean) {
  current = plan;
  if (keep) {
    try {
      const tag = sessionTag();
      if (tag) sessionStorage.setItem(KEY, JSON.stringify({ tag, plan }));
    } catch {}
  }
  for (const l of listeners) l();
}

function load() {
  if (read() || pending) return;
  pending = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await kycApi.plan();
      if (r.ok) return publish(planFrom(r.data), true);
      await new Promise((ok) => setTimeout(ok, 2_000));
    }
    // the session could not be reached: show every screen (the server still decides what runs)
    publish(EVERYTHING, false);
  })().finally(() => {
    pending = null;
  });
}

const planFrom = (d: Plan): Plan => ({ workflow: d.workflow, checks: d.checks, documentTypes: d.documentTypes, dynamic: !!d.dynamic });

/** Fetch the plan again (a rule may have added a check); resolves once it has settled, never throws. */
export function refreshPlan(): Promise<void> {
  refreshing ??= (async () => {
    const r = await kycApi.plan();
    if (r.ok) publish(planFrom(r.data), true);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The plan, or null while it loads. */
export function usePlan(): Plan | null {
  const plan = useSyncExternalStore(subscribe, read, () => null);
  useEffect(() => {
    load();
  }, []);
  return plan;
}
