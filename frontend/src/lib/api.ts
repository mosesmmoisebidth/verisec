/**
 * Thin client for the VeriSec FastAPI backend.
 *
 * The site is a static export, so all auth calls happen in the browser.
 * Point NEXT_PUBLIC_API_BASE_URL at the backend (e.g. https://api.example)
 * at build time; when unset, forms surface a clear "not connected" error
 * instead of silently failing.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// TODO(backend): confirm exact auth route paths with verivision_backend.
const routes = {
  login: "/auth/signin",
  signup: "/auth/signup",
} as const;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!API_BASE) {
    throw new ApiError(
      "Backend is not configured yet. Set NEXT_PUBLIC_API_BASE_URL and rebuild.",
    );
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((data: { detail?: string }) => data.detail)
      .catch(() => undefined);
    throw new ApiError(
      detail ?? `Request failed (${response.status})`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

export type AuthSession = { accessToken: string };

export function login(input: { email: string; password: string }) {
  return post<AuthSession>(routes.login, input);
}

export function signup(input: {
  fullName: string;
  workEmail: string;
  businessName: string;
  password: string;
}) {
  return post<AuthSession>(routes.signup, input);
}
