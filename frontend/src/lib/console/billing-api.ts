/**
 * Usage & Billing, live: the organisation's credits, what used them and its monthly budget, from the console.
 * Amounts arrive in millionths of a credit (1 credit = $1 of list price), so 0.002 for a BIN lookup is exact.
 */
const API = process.env.NEXT_PUBLIC_AUTH_API ?? "https://localhost:3001";

export const MICRO = 1_000_000;

export type CreditAccount = {
  balance: number;
  held: number;
  available: number;
  budget: number | null;
  hardStop: boolean;
  spentThisMonth: number;
};

export type ActivityRow = {
  id: string;
  at: string;
  kind: "starter" | "top_up" | "charge" | "hold" | "settle" | "release" | "budget" | string;
  /** The change to the balance (negative = taken). */
  amount: number;
  /** The change to the part held for open verifications. */
  hold: number;
  balance: number;
  available: number;
  note: string | null;
  ref: string | null;
  keyId: string | null;
  /** The portal the credits went to: "kyc", "micr" or "scan2pay" (null for top-ups and budgets). */
  product: string | null;
};

export type BillingSummary = {
  unit: number;
  account: CreditAccount;
  usage: { product: string; item: string; label: string; count: number; amount: number }[];
  activity: { total: number; rows: ActivityRow[] };
  estimate: { workflow: string; min: number; max: number } | null;
  /** The prices charges are taken at (the console's own list). */
  rates: { id: string; name: string; price: number; available: boolean }[];
  /** Every API's price per call, with its product ("kyc", "micr", "scan2pay"); `upTo` = priced by what it finds, at most `price`. */
  apis: { id: string; name: string; product: string; price: number; upTo: boolean }[];
  /** The active monthly verification plan, or null for none. */
  plan: PlanEntitlement | null;
  /** Whether the payment provider is configured (the Buy / Upgrade buttons work). */
  checkout: boolean;
  invoices: { id: string; date: string; amount: number }[];
};

/** A bought monthly plan: how much of this period's verification quota is left. */
export type PlanEntitlement = {
  plan: string | null;
  quota: number;
  used: number;
  remaining: number;
  periodEnd: string | null;
  active: boolean;
};

/** One purchasable product, from the billing catalog (credit pack or monthly plan). */
export type CatalogProduct = {
  id: string;
  name: string;
  kind: "credits" | "plan" | "other";
  /** Credits a pack grants, or the monthly verification quota a plan grants. */
  amount: number | null;
  /** Price in cents (minor units). */
  priceAmount: number | null;
  currency: string;
  recurring: boolean;
};

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
        message: r.status === 401 ? "Sign in to see your billing." : typeof m === "string" ? m : "Something went wrong. Please try again.",
      };
    }
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the console. Check your connection and try again." };
  }
}

export const billingApi = {
  summary: () => call<BillingSummary>("/api/billing/summary"),
  activity: (page: number, size = 10) => call<{ total: number; rows: ActivityRow[] }>(`/api/billing/activity?page=${page}&size=${size}`),
  budget: (budget: number | null, hardStop: boolean) =>
    call<CreditAccount>("/api/billing/budget", { method: "PUT", body: JSON.stringify({ budget, hardStop }) }),
  /** The things this organisation can buy (credit packs and monthly plans). */
  catalog: () => call<{ enabled: boolean; products: CatalogProduct[] }>("/api/billing/catalog"),
  /**
   * Open a hosted checkout for one product; the answer is the URL to send the buyer to. `returnTo` is the
   * billing page to come back to after paying ("/billing/" or "/fin/billing/"); the backend only honours its
   * own allow-list, so anything else falls back to the default.
   */
  checkout: (productId: string, returnTo?: string) =>
    call<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ productId, returnTo }) }),
};

/** Credits as people read them: two decimals, more only when a price needs them (0.002). */
export function credits(micro: number): string {
  const c = micro / MICRO;
  return Math.abs(c * 100 - Math.round(c * 100)) < 1e-6 ? c.toFixed(2) : String(+c.toFixed(4));
}
