/**
 * Client for the console branding API (`/api/branding`) — the white-label layer applicants see on
 * the hosted verification screens: company name, return URL and logo. Reading is open to any member;
 * changing it is owner/admin only (the server enforces this and answers 403 otherwise).
 */
const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type Branding = {
  companyName: string | null;
  returnUrl: string | null;
  logo: string | null;
  hasLogo: boolean;
};

async function call<T>(path: string, method: "GET" | "PATCH" | "POST" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api/branding${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { message?: string })?.message ?? String(res.status)), { status: res.status });
  return data as T;
}

export const brandingApi = {
  get: () => call<Branding>("", "GET"),
  update: (b: { companyName?: string | null; returnUrl?: string | null }) =>
    call<{ companyName: string | null; returnUrl: string | null; hasLogo: boolean }>("", "PATCH", b),
  setLogo: (image: string) => call<{ hasLogo: boolean; logo: string | null }>("/logo", "POST", { image }),
  clearLogo: () => call<{ hasLogo: boolean }>("/logo", "DELETE"),
};
