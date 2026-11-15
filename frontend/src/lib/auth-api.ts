/**
 * Client for the VeriSec console auth API (`/api/auth/*`).
 *
 * Every call sends cookies (`credentials: "include"`) so the httpOnly session
 * set by the API travels back on later requests. The base URL is baked at build
 * time from `NEXT_PUBLIC_AUTH_API` (defaults to the local console on :3001).
 */
const API_BASE = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

/**
 * The "Continue with Google" button navigates the whole page here (not fetch):
 * the API 302s to Google, and after consent lands the browser back on the app
 * with the session cookie already set. A full navigation is required — the
 * OAuth handshake can't run inside a same-origin fetch.
 */
export const googleSignInUrl = `${API_BASE}/api/auth/google/start`;

/** Begin an organization SAML flow with the email already registered to the team. */
export function ssoSignInUrl(email: string, next?: string | null): string {
  const params = new URLSearchParams({ email: email.trim() });
  if (next) params.set("next", next);
  return `${API_BASE}/api/auth/sso/start?${params.toString()}`;
}

export class AuthError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.data = data;
  }
}

async function req<T = unknown>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>, captcha?: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/auth/${path}`, {
    method,
    // the human check's one-time token (sign-up, sign-in, password reset), see components/security/human-check
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(captcha ? { "X-Captcha-Token": captcha } : {}) },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.message === "string" ? data.message : res.statusText || "Request failed";
    throw new AuthError(msg, res.status, data);
  }
  return data as T;
}

// A finished sign-in optionally carries a NON-blocking "new device" flag: the
// login already succeeded, but it came from a browser/computer we hadn't seen,
// so the UI shows a heads-up toast (and the server emails an alert).
export type SignedIn = { status: "authenticated"; newDevice?: boolean; deviceName?: string };
export type LoginResult =
  | SignedIn
  | { status: "mfa_required"; factors: string[] }
  | { status: "email_unverified"; email: string };
export type MfaResult = SignedIn;

export type TrustedDevice = { id: string; name: string; firstSeen: string; lastSeen: string };
export type PendingDevice = { id: string; name: string; code: string; requestedAt: string };
export type DevicesResult = { current: string | null; trusted: TrustedDevice[]; pending: PendingDevice[] };
/** The onboarding an account answered after sign-up; its portal is where every sign-in lands. */
export type OnboardingRecord = { portal: "kyc" | "fin"; answers: Record<string, string | string[]>; completedAt: string };
export type MeResult = {
  userId: string | null;
  orgId?: string | null;
  onboarding?: OnboardingRecord | null;
  /** Onboarding has been shown to this account (it is offered once, after sign-up). */
  onboardingSeen?: boolean;
  loginName: string | null;
  displayName: string | null;
  orgName: string | null;
  avatarUrl: string | null;
  /** The person's team role and what it lets them do (see lib/access.ts). */
  role?: "owner" | "admin" | "developer" | "reviewer" | "billing" | "viewer" | null;
  capabilities?: string[];
  mfaEnabled: boolean;
  passwordVerified: boolean;
  mfaVerified: boolean;
};

export const authApi = {
  register: (b: { fullName: string; email: string; businessName: string; password: string }, captcha?: string) =>
    req("register", "POST", b, captcha),
  login: (b: { email: string; password: string; remember?: boolean }, captcha?: string) =>
    req<LoginResult>("login", "POST", b, captcha),
  mfa: (code: string) => req<MfaResult>("mfa", "POST", { code }),
  mfaSetup: () => req<{ secret: string; uri: string }>("mfa/setup", "POST"),
  mfaVerify: (code: string) => req("mfa/verify", "POST", { code }),
  mfaDisable: () => req("mfa/disable", "POST"),
  // Passkey / security key (WebAuthn)
  passkeyRegisterBegin: () => req<{ u2fId: string; options: unknown }>("passkey/register/begin", "POST"),
  passkeyRegisterFinish: (b: { u2fId: string; credential: unknown; name?: string }) =>
    req("passkey/register/finish", "POST", b),
  mfaOptions: () => req<{ totp: boolean; passkey: boolean }>("mfa/options", "GET"),
  mfaWebauthnBegin: () => req<{ options: unknown }>("mfa/webauthn/begin", "POST"),
  mfaWebauthnFinish: (credential: unknown) => req<MfaResult>("mfa/webauthn/finish", "POST", { credential }),
  listDevices: () => req<DevicesResult>("devices", "GET"),
  approveDevice: (id: string) => req("devices/approve", "POST", { id }),
  removeDevice: (id: string) => req("devices/remove", "POST", { id }),
  verifyEmail: (b: { email: string; code: string }) => req("verify-email", "POST", b),
  resendVerification: (email: string, captcha?: string) => req("resend-verification", "POST", { email }, captcha),
  forgot: (email: string, captcha?: string) => req("forgot-password", "POST", { email }, captcha),
  reset: (b: { email: string; code: string; password: string }, captcha?: string) => req("reset-password", "POST", b, captcha),
  logout: () => req("logout", "POST"),
  saveOnboarding: (b: { portal: "kyc" | "fin"; answers: Record<string, string | string[]> }) =>
    req<OnboardingRecord>("onboarding", "POST", b),
  markOnboardingSeen: () => req<{ ok: true }>("onboarding/seen", "POST", {}),
  /** Profile tab: change the signed-in person's name. */
  updateProfile: (name: string) => req<{ name: string }>("profile", "PATCH", { name }),
  /** Profile tab: set the profile photo (a small downscaled data URL), or clear it with "". */
  setAvatar: (image: string) => req<{ avatar: string | null }>("avatar", "POST", { image }),
  /** Business tab: rename the organisation (owner/admin only). */
  renameOrg: (name: string) => req<{ orgName: string }>("org", "PATCH", { name }),
  me: async (): Promise<MeResult | null> => {
    try {
      return await req<MeResult>("me", "GET");
    } catch {
      return null;
    }
  },
};
