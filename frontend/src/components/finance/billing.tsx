"use client";

import { useCallback, useEffect, useState } from "react";

import { Billing, type BillingActivity } from "@/components/billing/billing";
import { BuyDialog } from "@/components/billing/buy-dialog";
import { Loading, Notice, RetryButton } from "@/components/finance/parts";
import { useAccess } from "@/lib/access";
import { toast } from "@/components/ui/toast";
import { billingApi, credits, MICRO, type ActivityRow, type BillingSummary, type CatalogProduct } from "@/lib/console/billing-api";
import { BILLING, BILLING_BASE, money, RATES } from "@/lib/finance/content";
import type { Axis, BillingData } from "@/lib/console/types";

const PAGE = 10;

/** The Financial portal's products in the shared wallet's records. */
const FIN_PRODUCTS = new Set(["micr", "scan2pay"]);

/** The summary also lists every API's price, tagged with its product. */
type Summary = BillingSummary & {
  apis?: { id: string; name: string; product: string; price: number }[];
  usage: (BillingSummary["usage"][number] & { product: string })[];
};

/** "8 Oct, 23:41" in the viewer's time. */
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One movement of the shared wallet in words: what happened, the change, and what was left. */
function line(r: ActivityRow): BillingActivity["rows"][number] {
  const after = BILLING.left(credits(r.available));
  const text = r.note ?? r.kind;
  switch (r.kind) {
    case "starter":
    case "top_up":
      return { id: r.id, when: when(r.at), text, amount: `+${credits(r.amount)}`, tone: "in", after };
    case "charge":
    case "settle":
      return { id: r.id, when: when(r.at), text, amount: r.amount ? `−${credits(-r.amount)}` : "0.00", tone: "out", after };
    case "hold":
      return { id: r.id, when: when(r.at), text, amount: BILLING.held(credits(r.hold)), tone: "neutral", after };
    case "release":
      return { id: r.id, when: when(r.at), text, amount: BILLING.back(credits(-r.hold)), tone: "neutral", after };
    default:
      return { id: r.id, when: when(r.at), text, amount: "", tone: "neutral", after };
  }
}

/**
 * Usage & Billing on the organisation's ONE credit wallet, shared with the KYC
 * console (1 credit = $1 at list price): the balance, the monthly budget, this
 * month's Financial API usage, the Financial prices, and every wallet movement.
 * Everything is live from the console's billing endpoints.
 */
export function FinBilling() {
  const [sum, setSum] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [buyKind, setBuyKind] = useState<"credits" | "plan" | null>(null);
  const { can } = useAccess();

  const load = useCallback(async () => {
    const r = await billingApi.summary();
    if (!r.ok) return setError(r.message);
    setError(null);
    setSum(r.data as Summary);
    setRows(r.data.activity.rows);
    setTotal(r.data.activity.total);
    setPage(1);
    if (r.data.checkout) {
      const c = await billingApi.catalog();
      if (c.ok) setProducts(c.data.products);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once on mount
    void load();
  }, [load]);

  // Returning from a successful checkout: acknowledge it, clear the query, and refresh the wallet
  // (the webhook credits the shared wallet within a second or two of payment).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("purchase") === "success") {
      toast.success("Payment received", "Your purchase is being applied to your wallet.");
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => void load(), 1500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = async (p: number) => {
    const r = await billingApi.activity(p, PAGE);
    if (!r.ok) return toast.error(BILLING.activityError, r.message);
    setRows(r.data.rows);
    setTotal(r.data.total);
    setPage(p);
  };

  const onBudget = async (budget: number | null, hardStop: boolean) => {
    const r = await billingApi.budget(budget, hardStop);
    if (!r.ok) {
      toast.error(BILLING.budgetError, r.message);
      return false;
    }
    toast.success(BILLING.budgetSaved, budget === null ? BILLING.noBudgetSaved : BILLING.budgetSavedBody(budget, hardStop));
    void load();
    return true;
  };

  if (error) {
    return (
      <Notice tone="error" title={BILLING.errorTitle} action={<RetryButton label={BILLING.retry} onClick={() => void load()} />}>
        {error}
      </Notice>
    );
  }
  if (!sum) return <Loading label="Please wait…" />;

  const a = sum.account;
  const budget = a.budget === null ? 0 : Math.round(a.budget / MICRO);
  // the most a month can spend: what the wallet holds now plus what it already spent this month (whole credits)
  const most = Math.floor((a.balance + a.spentThisMonth) / MICRO);
  const usage = sum.usage.filter((u) => FIN_PRODUCTS.has(u.product));
  const prices = (sum.apis ?? []).filter((p) => FIN_PRODUCTS.has(p.product));
  const plan = sum.plan;
  const canBuy = sum.checkout;
  const data: BillingData = {
    ...BILLING_BASE,
    wallet: {
      label: BILLING.walletLabel,
      balance: BILLING.balance(credits(a.available)),
      caption: a.held > 0 ? BILLING.heldCaption(credits(a.held)) : BILLING.unitCaption,
      cta: BILLING.topUp,
    },
    budget: {
      label: BILLING.budgetLabel,
      amount: budget ? BILLING.balance(budget.toLocaleString()) : BILLING.noBudget,
      min: 0,
      max: Math.max(most, budget),
      value: budget,
      hardStopLabel: BILLING.hardStop,
      hardStop: a.hardStop,
    },
    activate:
      plan && plan.active
        ? {
            label: BILLING.planActiveLabel,
            body: BILLING.planActiveBody(plan.plan ?? "Active plan", plan.remaining.toLocaleString(), plan.quota.toLocaleString()),
            cta: BILLING.planActiveCta,
          }
        : { label: BILLING.planChooseLabel, body: BILLING.planChooseBody, cta: BILLING.planChooseCta },
    usage: { title: BILLING.usageTitle, axisLabel: BILLING.usageAxis, points: usage.map((u) => ({ label: u.label, value: u.count })) },
    rates: {
      title: BILLING.ratesTitle,
      rows: prices.length
        ? prices.map((p) => ({ name: p.name, price: `$${credits(p.price)}` }))
        : RATES.map((r) => ({ name: r.name, price: money(r.price) })),
    },
    invoices: { title: BILLING_BASE.invoices.title, rows: [] },
  };

  return (
    <>
      <Notice tone="info">{BILLING.sharedNote}</Notice>
      <Billing
        data={data}
        usageAxis={wholeAxis(usage.map((u) => u.count))}
        live={{
          topUpNote: canBuy ? undefined : BILLING.comingSoon,
          paymentNote: canBuy ? undefined : BILLING.comingSoon,
          onTopUp: canBuy ? () => setBuyKind("credits") : undefined,
          onUpgrade: canBuy ? () => setBuyKind("plan") : undefined,
          spentLine: BILLING.spent(credits(a.spentThisMonth)),
          budgetStep: most <= 100 ? 1 : most <= 1000 ? 5 : 10,
          budgetHint: most > 0 ? BILLING.budgetHint(most.toLocaleString()) : BILLING.budgetHintEmpty,
          onBudget: can("billing.manage") ? onBudget : undefined,
          usageEmpty: BILLING.usageEmpty,
          invoicesEmpty: BILLING.invoicesEmpty,
        }}
        activity={{
          title: BILLING.activityTitle,
          rows: rows.map(line),
          page,
          pages: Math.max(1, Math.ceil(total / PAGE)),
          onPage: (p) => void goTo(p),
          empty: BILLING.activityEmpty,
        }}
      />
      {buyKind ? (
        <BuyDialog kind={buyKind} products={products} onClose={() => setBuyKind(null)} returnTo="/fin/billing/" />
      ) : null}
    </>
  );
}

/**
 * Whole-number gridlines. The console chart's automatic ticks round a small
 * ceiling (1 or 2) into repeated values, so small counts get an explicit axis.
 */
function wholeAxis(values: number[]): Axis | undefined {
  const peak = Math.max(0, ...values);
  if (peak === 0) return undefined;
  if (peak <= 4) return { max: 4, yTicks: [0, 1, 2, 3, 4] };
  if (peak <= 8) return { max: 8, yTicks: [0, 2, 4, 6, 8] };
  return undefined;
}
