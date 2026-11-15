"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Billing, type BillingActivity } from "@/components/billing/billing";
import { BuyDialog } from "@/components/billing/buy-dialog";
import { toast } from "@/components/ui/toast";
import { useAccess } from "@/lib/access";
import { billingApi, credits, MICRO, type ActivityRow, type BillingSummary, type CatalogProduct } from "@/lib/console/billing-api";
import { DEMO_BILLING } from "@/lib/console/demo-billing";
import type { BillingData } from "@/lib/console/types";

const PAGE = 10;
const COMING = "Card payments are coming soon";

/** "8 Oct, 23:41" in the viewer's time. */
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One ledger movement in words: what happened, how it changed the credits, and what was left. */
function line(r: ActivityRow): BillingActivity["rows"][number] {
  const after = `${credits(r.available)} left`;
  const text = r.note ?? r.kind;
  switch (r.kind) {
    case "starter":
    case "top_up":
      return { id: r.id, when: when(r.at), text, amount: `+${credits(r.amount)}`, tone: "in", after };
    case "charge":
    case "settle":
      return { id: r.id, when: when(r.at), text, amount: r.amount ? `−${credits(-r.amount)}` : "0.00", tone: "out", after };
    case "hold":
      return { id: r.id, when: when(r.at), text, amount: `${credits(r.hold)} held`, tone: "neutral", after };
    case "release":
      return { id: r.id, when: when(r.at), text, amount: `${credits(-r.hold)} back`, tone: "neutral", after };
    default:
      return { id: r.id, when: when(r.at), text, amount: "", tone: "neutral", after };
  }
}

/** The organisation's billing, live: credits, holds, this month's usage, the budget, and every movement. */
export function LiveBilling() {
  const canManage = useAccess().can("billing.manage");
  const [sum, setSum] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [buyKind, setBuyKind] = useState<"credits" | "plan" | null>(null);

  const load = useCallback(async () => {
    const r = await billingApi.summary();
    if (!r.ok) return setError(r.message);
    setError(null);
    setSum(r.data);
    setRows(r.data.activity.rows);
    setTotal(r.data.activity.total);
    setPage(1);
    if (r.data.checkout) {
      const c = await billingApi.catalog();
      if (c.ok) setProducts(c.data.products);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Returning from a successful checkout: acknowledge it, clear the query, and refresh the balance
  // (the webhook credits the account within a second or two of payment).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("purchase") === "success") {
      toast.success("Payment received", "Your purchase is being applied to this account.");
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => void load(), 1500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = async (p: number) => {
    const r = await billingApi.activity(p, PAGE);
    if (!r.ok) return toast.error("Couldn't load the activity", r.message);
    setRows(r.data.rows);
    setTotal(r.data.total);
    setPage(p);
  };

  const onBudget = async (budget: number | null, hardStop: boolean) => {
    const r = await billingApi.budget(budget, hardStop);
    if (!r.ok) {
      toast.error("Couldn't save the budget", r.message);
      return false;
    }
    toast.success("Budget saved", budget === null ? "No monthly budget." : `${budget.toLocaleString()} credits a month${hardStop ? ", hard stop on" : ""}.`);
    void load();
    return true;
  };

  if (error)
    return (
      <div className="flex flex-col gap-row">
        <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">Usage & Billing</h1>
        <p className="m-0 flex flex-wrap items-center gap-3 rounded-box bg-danger-tint px-4 py-3 text-body text-danger">
          {error}
          <button type="button" onClick={() => void load()} className="font-medium text-pine underline underline-offset-2">
            Try again
          </button>
        </p>
      </div>
    );

  if (!sum)
    return (
      <div className="flex flex-col gap-row">
        <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">Usage & Billing</h1>
        <span className="inline-flex items-center gap-2 text-body text-slate">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Please wait…
        </span>
      </div>
    );

  const a = sum.account;
  const budget = a.budget === null ? 0 : Math.round(a.budget / MICRO);
  // the most a month can spend: what the account has now plus what it already spent this month (whole credits)
  const most = Math.floor((a.balance + a.spentThisMonth) / MICRO);
  const step = most <= 100 ? 1 : most <= 1000 ? 5 : 10;
  const est = sum.estimate;
  const plan = sum.plan;
  const data: BillingData = {
    ...DEMO_BILLING,
    wallet: {
      label: "Credit wallet",
      balance: `${credits(a.available)} credits`,
      caption: a.held > 0 ? `${credits(a.held)} held for open verifications` : "1 credit = $1 at list price",
      cta: "Top up",
    },
    budget: {
      label: "Monthly budget",
      amount: budget ? `${budget.toLocaleString()} credits` : "No budget",
      min: 0,
      max: Math.max(most, budget),
      value: budget,
      hardStopLabel: "Hard stop on budget",
      hardStop: a.hardStop,
    },
    activate:
      plan && plan.active
        ? {
            label: "Verification plan",
            body: `${plan.plan ?? "Active plan"}: ${plan.remaining.toLocaleString()} of ${plan.quota.toLocaleString()} verifications left this period.`,
            cta: "Change plan",
          }
        : {
            label: "Verification plans",
            body: "A monthly quota of full verification flows at a better rate. Overflow draws from your credits.",
            cta: "Choose a plan",
          },
    usage: {
      title: "Usage by component (this month)",
      axisLabel: "Checks and API calls run this month, by component",
      points: sum.usage.map((u) => ({ label: u.label, value: u.count })),
    },
    rates: {
      title: "Rates",
      rows: sum.rates.map((r) => ({ name: r.name, price: `$${credits(r.price)}`, ...(r.available ? {} : { note: "(soon)" }) })),
    },
    invoices: { title: "Invoices", rows: [] },
  };
  const top = Math.max(0, ...sum.usage.map((u) => u.count));
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
    <Billing
      data={data}
      // whole-number ticks while the counts are small
      usageAxis={top > 0 && top < 5 ? { max: 5, yTicks: [0, 1, 2, 3, 4, 5] } : undefined}
      live={{
        topUpNote: sum.checkout ? undefined : COMING,
        paymentNote: sum.checkout ? undefined : COMING,
        onTopUp: sum.checkout ? () => setBuyKind("credits") : undefined,
        onUpgrade: sum.checkout ? () => setBuyKind("plan") : undefined,
        spentLine: `${credits(a.spentThisMonth)} credits spent this month`,
        budgetStep: step,
        budgetHint: !canManage
          ? "Your role can see the budget. An Owner, Admin or Billing member can change it."
          : most > 0
            ? `Up to ${most.toLocaleString()} credits: what your account has this month.`
            : "Top up to set a budget.",
        onBudget,
        budgetLocked: !canManage,
        usageEmpty: "Nothing has used credits this month yet.",
        invoicesEmpty: "No invoices yet. They begin once card payments are switched on.",
      }}
      activity={{
        title: "Credit activity",
        rows: rows.map(line),
        page,
        pages,
        onPage: (p) => void goTo(p),
        empty: "No credit activity yet.",
      }}
    />
      {buyKind ? (
        <BuyDialog
          kind={buyKind}
          products={products}
          onClose={() => setBuyKind(null)}
          returnTo="/billing/"
        />
      ) : null}
    </>
  );
}
