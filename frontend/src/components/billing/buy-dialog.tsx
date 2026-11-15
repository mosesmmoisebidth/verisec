"use client";

import { useEffect, useState } from "react";
import { Gem, Loader2, Rocket, X, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { billingApi, type CatalogProduct } from "@/lib/console/billing-api";
import { toast } from "@/components/ui/toast";

const ICONS = [Zap, Rocket, Gem] as const;

const money = (cents: number | null, currency: string) =>
  cents == null
    ? ""
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: (currency || "usd").toUpperCase(),
        maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100);

/**
 * The credit-pack / plan picker. Lists the catalog for one model, and on a choice opens the hosted
 * checkout (Polar) for that product with this organisation on it, so the webhook credits the right
 * account after payment. Closes on Escape or a click outside.
 */
export function BuyDialog({
  kind,
  products,
  onClose,
  returnTo,
}: {
  kind: "credits" | "plan";
  products: CatalogProduct[];
  onClose: () => void;
  /** The billing page to return to after paying, so the buyer lands back on the portal they started from. */
  returnTo?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const items = products
    .filter((p) => p.kind === kind)
    .sort((a, b) => (a.priceAmount ?? 0) - (b.priceAmount ?? 0));
  const title = kind === "credits" ? "Buy credits" : "Choose a plan";
  const sub =
    kind === "credits"
      ? "Prepaid credits. 1 credit = $1 of usage, spend on anything, and they never expire."
      : "A monthly quota of full verification flows. Overflow draws from your credits.";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const buy = async (id: string) => {
    if (busy) return;
    setBusy(id);
    const r = await billingApi.checkout(id, returnTo);
    if (!r.ok) {
      setBusy(null);
      toast.error("Couldn't start checkout", r.message);
      return;
    }
    // Hand off to the hosted checkout; the webhook credits this account once it's paid.
    window.location.href = r.data.url;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-shell border border-hairline bg-page p-6 shadow-[0_24px_60px_-12px_rgba(14,50,40,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-card font-medium tracking-[-0.26px] text-pine">
              {title}
            </h2>
            <p className="m-0 text-body text-slate">{sub}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-box border border-edge bg-panel text-pine transition-colors hover:bg-hover-light"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {items.length === 0 ? (
          <p className="m-0 py-10 text-center text-body text-slate">
            Nothing is available to buy right now.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {items.map((p, i) => {
              const Icon = ICONS[i] ?? Gem;
              const featured = items.length === 3 && i === 1;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-shell border p-4",
                    featured
                      ? "border-lime bg-[image:var(--gradient-feature)]"
                      : "border-hairline bg-panel",
                  )}
                >
                  <Icon aria-hidden className="size-7 text-pine" />
                  <div className="flex flex-col gap-0.5">
                    <p className="m-0 text-body font-medium text-pine">{p.name}</p>
                    <p className="m-0 text-eyebrow text-slate">
                      {p.kind === "credits"
                        ? `${p.amount?.toLocaleString() ?? "—"} credits`
                        : `${p.amount?.toLocaleString() ?? "—"} verifications / mo`}
                    </p>
                  </div>
                  <p className="tnum m-0 text-[24px] leading-7 font-medium text-pine">
                    {money(p.priceAmount, p.currency)}
                    {p.recurring ? (
                      <span className="text-eyebrow font-normal text-slate"> /mo</span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    onClick={() => void buy(p.id)}
                    disabled={!!busy}
                    className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-box bg-pine px-3 text-body font-medium text-lime transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy === p.id ? (
                      <>
                        <Loader2 aria-hidden className="size-4 animate-spin" /> Starting…
                      </>
                    ) : p.kind === "credits" ? (
                      "Buy"
                    ) : (
                      "Subscribe"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="m-0 text-eyebrow text-slate">
          You&apos;ll be taken to our secure checkout. Credits and plans are added to this account
          automatically after payment.
        </p>
      </div>
    </div>
  );
}
