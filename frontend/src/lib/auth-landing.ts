import { PORTALS } from "@/config/onboarding";
import { authApi } from "@/lib/auth-api";

/** Pages a sign-in never returns to (they would loop, or ask for it again). */
const AUTH_PAGES = /^\/(login|signup|mfa|verify-email|reset-password|set-new-password|onboarding|welcome)(\/|\?|#|$)/;

/**
 * A page of this site to return to after signing in, or null: only a same-site path, never another
 * site ("//host", a backslash or a control character), and never one of the sign-in pages.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw[0] !== "/" || raw[1] === "/") return null;
  if (/[\u0000-\u001f\\]/.test(raw) || AUTH_PAGES.test(raw)) return null;
  return raw;
}

/** `path` carrying the page to return to (left as it is when there is none). */
export function withNext(path: string, next: string | null | undefined): string {
  const n = safeNext(next);
  return n ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(n)}` : path;
}

/** The return page this URL carries, if any. */
export function nextFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

/**
 * Where a finished sign-in lands, decided before navigating: the page the person was going to (one
 * sign-in opens every portal), else the portal the account chose, the KYC portal for an account that
 * has already been shown onboarding (answered or not), and onboarding only for an account that has
 * never seen it (it then continues to the page they were going to). The server's record decides,
 * never the browser tab.
 */
export async function landingAfterSignIn(next?: string | null): Promise<string> {
  const me = await authApi.me();
  if (!me?.userId) return "/login";
  const dest = safeNext(next);
  if (me.onboarding?.portal) return dest ?? PORTALS[me.onboarding.portal].home;
  if (me.onboardingSeen) return dest ?? PORTALS.kyc.home;
  return withNext("/onboarding/", dest);
}
