/**
 * Client for the danger-zone account API (`/api/account`): deactivate, transfer ownership, soft-delete.
 * Every change is owner-gated on the server (and transfer accept is recipient-gated); the UI reflects the
 * server's answer and never assumes it is allowed.
 */
const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export type Member = { userId: string; email: string; name: string; role: string; isSelf: boolean };

export type TransferState = {
  role: string;
  canInitiate: boolean;
  transfer:
    | {
        id: string;
        toUser: string;
        toEmail: string;
        toName: string;
        status: "pending" | "accepted";
        iAmOwner: boolean;
        iAmRecipient: boolean;
        createdAt: string;
      }
    | null;
};

async function call<T>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api/account${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { message?: string })?.message ?? String(res.status)), { status: res.status });
  return data as T;
}

export type SecurityState = {
  sessionTimeoutHours: number | null;
  ipAllowlist: string[];
  sso: { enabled: boolean; name: string | null; metadataUrl: string | null };
};

export type SecurityAuditEntry = {
  at: string;
  actor: string;
  action: string;
  detail: string | null;
  ip: string | null;
};

async function auditWorkbook(): Promise<Blob> {
  const res = await fetch(`${API}/api/account/audit.xlsx`, { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string })?.message ?? `Export failed (${res.status})`);
  }
  return res.blob();
}

export const accountApi = {
  members: () => call<{ members: Member[] }>("/members", "GET"),
  security: () => call<SecurityState>("/security", "GET"),
  updateSecurity: (body: { sessionTimeoutHours: number | null; ipAllowlist: string[] }) =>
    call<Omit<SecurityState, "sso">>("/security", "PATCH", body),
  configureSso: (body: { name: string; metadataXml: string }) =>
    call<{ sso: { enabled: boolean; name: string } }>("/security/sso", "POST", body),
  disableSso: () => call<{ sso: { enabled: false; name: null } }>("/security/sso", "DELETE"),
  audit: (limit = 100) => call<{ entries: SecurityAuditEntry[] }>(`/audit?limit=${limit}`, "GET"),
  auditWorkbook,
  deactivate: () => call<{ ok: true }>("/deactivate", "POST", {}),
  transferStatus: () => call<TransferState>("/transfer", "GET"),
  transferInitiate: (toUserId: string) => call<{ ok: true }>("/transfer", "POST", { toUserId }),
  transferAccept: () => call<{ ok: true }>("/transfer/accept", "POST", {}),
  transferApprove: () => call<{ ok: true }>("/transfer/approve", "POST", {}),
  transferCancel: () => call<{ ok: true }>("/transfer/cancel", "POST", {}),
  deleteStart: () => call<{ ok: true; sentTo: string }>("/delete/start", "POST", {}),
  deleteConfirm: (code: string) => call<{ ok: true }>("/delete/confirm", "POST", { code }),
};
