"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

import { ColumnChart } from "@/components/charts/charts";
import { Switch } from "@/components/ui/switch";
import type { Axis, BillingData } from "@/lib/console/types";

/** What makes the page live (the KYC console): budget saving, controls that are not open yet, empty states. */
export type BillingLive = {
  /** Shown on the Top up button while card payments are not switched on (the button is disabled). */
  topUpNote?: string;
  /** Shown on Continue to payment while Live billing is not open (the button is disabled). */
  paymentNote?: string;
  /** Opens the credit-pack picker. When set, the Top up button is live (the note is ignored). */
  onTopUp?: () => void;
  /** Opens the plan picker. When set, the Activate button is live (the note is ignored). */
  onUpgrade?: () => void;
  /** The month's spend, under the budget. */
  spentLine?: string;
  budgetStep?: number;
  /** Under the slider: the most it can be set to, and why. */
  budgetHint?: string;
  /** Saves the budget (credits, null = none) and its hard stop. Resolves once saved (or refused). */
  onBudget?: (budget: number | null, hardStop: boolean) => Promise<boolean>;
  /** The person's role sees the budget but cannot change it (the slider and switch are shown, locked). */
  budgetLocked?: boolean;
  usageEmpty?: string;
  invoicesEmpty?: string;
};

export type BillingActivity = {
  title: string;
  rows: { id: string; when: string; text: string; amount: string; tone: "in" | "out" | "neutral"; after: string }[];
  page: number;
  pages: number;
  onPage: (page: number) => void;
  empty: string;
};

/**
 * Usage & Billing — Figma Desktop-34.
 *
 * Rendered with demo data (the Financial portal) it is static; with `live` and `activity` (the KYC console) it
 * shows the organisation's real credits, saves the budget and lists every credit movement.
 *
 * Originally a server component. The one thing on it that looks stateful — the budget
 * slider — is a real `<input type="range">` rendered at its stored value, so
 * it is draggable and arrow-key operable and announces its number before any
 * handler exists. Top up, Continue to payment and the invoice downloads are
 * visible and unwired; there is no billing endpoint behind them.
 *
 * The rate card and the "$0.75 / verification" estimate are DERIVED from the
 * workflow catalogue rather than typed here — see `demo-billing.ts`.
 */
export function Billing({
  data,
  usageAxis,
  live,
  activity,
}: {
  data: BillingData;
  /** Optional fixed axis for the usage chart (e.g. whole-number ticks for small counts). */
  usageAxis?: Axis;
  live?: BillingLive;
  activity?: BillingActivity;
}) {
  return (
    <div className="flex flex-col gap-row">
      <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{data.title}</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <Wallet data={data.wallet} note={live?.onTopUp ? undefined : live?.topUpNote} onTopUp={live?.onTopUp} />
        <Budget data={data.budget} live={live} />
        <Activate data={data.activate} note={live?.onUpgrade ? undefined : live?.paymentNote} onUpgrade={live?.onUpgrade} />
      </div>

      <section className="flex flex-col gap-3 rounded-shell border border-hairline bg-panel p-5">
        <h2 className="m-0 text-card font-medium tracking-[-0.26px] text-pine">
          {data.usage.title}
        </h2>
        {/* No `axis` passed: the frame draws a fixed 800 ceiling, and a fixed
            ceiling clips the month a component is used 900 times. `niceMax()`
            derives it from the data instead. */}
        {data.usage.points.length ? (
          <ColumnChart points={data.usage.points} label={data.usage.axisLabel} axis={usageAxis} />
        ) : (
          <p className="m-0 py-10 text-center text-body text-slate">{live?.usageEmpty ?? "Nothing used yet this month."}</p>
        )}
      </section>

      {activity ? (
        <>
          <Rates data={data.rates} columns />
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <Activity data={activity} />
            </div>
            <Invoices data={data.invoices} empty={live?.invoicesEmpty} />
          </div>
        </>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Rates data={data.rates} />
          <Invoices data={data.invoices} empty={live?.invoicesEmpty} />
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   The three cards
---------------------------------------------------------------------------- */

function Eyebrow({ children, className = "text-slate" }: { children: string; className?: string }) {
  return (
    <p className={`m-0 text-eyebrow tracking-[0.6px] uppercase ${className}`}>{children}</p>
  );
}

function Wallet({ data, note, onTopUp }: { data: BillingData["wallet"]; note?: string; onTopUp?: () => void }) {
  return (
    <section className="relative flex flex-col gap-1 overflow-hidden rounded-shell border border-edge bg-pine p-5">
      {/* The frame's four stacked translucent ellipses. Decorative, so hidden
          from the accessibility tree rather than announced as four somethings. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="absolute size-[214px] rounded-pill bg-white/3"
            style={{ right: -40 + i * 26, top: -70 + i * 22 }}
          />
        ))}
      </span>

      <span className="relative flex flex-col gap-1">
        <Eyebrow className="text-white/61">{data.label}</Eyebrow>
        <p className="tnum m-0 text-[35.9px] leading-10 text-white">{data.balance}</p>
        <p className="m-0 pb-3 text-eyebrow text-white/61">{data.caption}</p>
        <button
          type="button"
          disabled={!!note}
          title={note}
          onClick={onTopUp}
          className="inline-flex h-8 w-fit items-center rounded-box bg-lime px-3 text-eyebrow font-medium text-pine transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100"
        >
          {data.cta}
        </button>
        {note ? <span className="text-eyebrow text-white/61">{note}</span> : null}
      </span>
    </section>
  );
}

function Budget({ data, live }: { data: BillingData["budget"]; live?: BillingLive }) {
  // live: the slider and the switch only change a draft; nothing is saved until Save is pressed
  const [value, setValue] = useState(data.value);
  const [stop, setStop] = useState(data.hardStop);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setValue(data.value);
    setStop(data.hardStop);
  }, [data.value, data.hardStop]);
  const changed = !!live?.onBudget && (value !== data.value || stop !== data.hardStop);
  const save = async () => {
    if (!live?.onBudget || saving) return;
    setSaving(true);
    const ok = await live.onBudget(value > 0 ? value : null, stop);
    setSaving(false);
    if (!ok) {
      setValue(data.value);
      setStop(data.hardStop);
    }
  };
  const shown = live?.onBudget ? (value > 0 ? `${value.toLocaleString()} credits` : "No budget") : data.amount;
  return (
    <section className="flex flex-col gap-2 rounded-shell border border-hairline bg-panel p-5">
      <Eyebrow>{data.label}</Eyebrow>
      <p className="tnum m-0 text-[24px] leading-8 font-medium text-pine">{shown}</p>
      {live?.spentLine ? <p className="m-0 text-eyebrow text-slate">{live.spentLine}</p> : null}

      <label className="sr-only" htmlFor="budget">
        {data.label}
      </label>
      <input
        id="budget"
        name="budget"
        type="range"
        min={data.min}
        max={data.max}
        step={live?.budgetStep ?? 100}
        {...(live?.onBudget
          ? {
              value,
              disabled: data.max <= 0 || !!live.budgetLocked,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(Number(e.currentTarget.value)),
            }
          : { defaultValue: data.value })}
        className="vs-slider mt-2 w-full"
      />
      {live?.budgetHint ? <p className="m-0 text-eyebrow text-slate">{live.budgetHint}</p> : null}

      <div className="flex items-center justify-between gap-4 pt-1">
        <span className="text-eyebrow text-slate">{data.hardStopLabel}</span>
        <Switch
          key={`${data.hardStop}-${stop}`}
          on={stop}
          name="hardStop"
          label={data.hardStopLabel}
          disabled={!!live?.budgetLocked}
          onChange={live?.onBudget ? setStop : undefined}
        />
      </div>

      {changed ? (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setValue(data.value);
              setStop(data.hardStop);
            }}
            className="inline-flex h-8 items-center rounded-box border border-hairline bg-page px-3 text-eyebrow font-medium text-pine transition-colors hover:bg-hover-light"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-8 items-center rounded-box bg-pine px-3 text-eyebrow font-medium text-lime transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save budget"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Activate({ data, note, onUpgrade }: { data: BillingData["activate"]; note?: string; onUpgrade?: () => void }) {
  return (
    <section className="flex flex-col gap-4 rounded-shell border border-lime bg-[image:var(--gradient-feature)] p-5">
      <Eyebrow className="text-pine/73">{data.label}</Eyebrow>
      <p className="m-0 flex-1 text-body text-pine">{data.body}</p>
      <span className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!!note}
          title={note}
          onClick={onUpgrade}
          className="inline-flex h-9 w-fit items-center rounded-box bg-pine px-4 text-body text-lime transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {data.cta}
        </button>
        {note ? <span className="text-eyebrow text-pine/73">{note}</span> : null}
      </span>
    </section>
  );
}

/* ----------------------------------------------------------------------------
   Rates + invoices
---------------------------------------------------------------------------- */

function Rates({ data, columns }: { data: BillingData["rates"]; columns?: boolean }) {
  return (
    <section className="flex flex-col gap-3 rounded-shell border border-hairline bg-panel p-5">
      <h2 className="m-0 text-card font-medium tracking-[-0.26px] text-pine">{data.title}</h2>
      {/* A description list, not a table: these are one price per named check,
          which is exactly a term/definition pair. */}
      <dl className={columns ? "m-0 grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3" : "m-0 flex flex-col"}>
        {data.rows.map((row) => (
          <div
            key={row.name}
            className={
              columns
                ? "flex items-center justify-between gap-4 border-b border-edge py-2.5"
                : "flex items-center justify-between gap-4 border-b border-edge py-2.5 last:border-b-0"
            }
          >
            <dt className="min-w-0 text-body text-pine">{row.name}</dt>
            <dd className="tnum m-0 shrink-0 text-body font-medium text-pine">
              {row.price}
              {row.note ? (
                <span className="ml-1.5 font-normal text-muted">{row.note}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Invoices({ data, empty }: { data: BillingData["invoices"]; empty?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-shell border border-hairline bg-panel p-5">
      <h2 className="m-0 text-card font-medium tracking-[-0.26px] text-pine">{data.title}</h2>
      {!data.rows.length && empty ? <p className="m-0 py-6 text-center text-body text-slate">{empty}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {data.rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-3 rounded-box border border-edge bg-invoice px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-body font-medium text-pine">
              {row.id}
            </span>
            <span className="tnum hidden shrink-0 text-body text-slate sm:inline">{row.date}</span>
            <span className="tnum shrink-0 text-body font-medium text-pine">{row.amount}</span>
            {/* A button, not an <a download>: there is no PDF to point at, and
                a link to nowhere is worse than a control that is visibly not
                wired. */}
            <button
              type="button"
              className="grid size-8 shrink-0 place-items-center rounded-box bg-lime text-pine transition-[filter] hover:brightness-95"
            >
              <Download aria-hidden className="size-4" strokeWidth={1.8} />
              <span className="sr-only">
                {row.downloadLabel} {row.id}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ----------------------------------------------------------------------------
   Credit activity (live): every movement of the organisation's credits
---------------------------------------------------------------------------- */

const TONE = { in: "text-ramp-2", out: "text-pine", neutral: "text-slate" } as const;

function Activity({ data }: { data: BillingActivity }) {
  return (
    <section className="flex flex-col gap-3 rounded-shell border border-hairline bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-card font-medium tracking-[-0.26px] text-pine">{data.title}</h2>
        {data.pages > 1 ? (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Newer"
              disabled={data.page <= 1}
              onClick={() => data.onPage(data.page - 1)}
              className="grid size-8 place-items-center rounded-pill border border-edge bg-page text-pine hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <span className="tnum text-eyebrow text-slate">
              {data.page} of {data.pages}
            </span>
            <button
              type="button"
              aria-label="Older"
              disabled={data.page >= data.pages}
              onClick={() => data.onPage(data.page + 1)}
              className="grid size-8 place-items-center rounded-pill border border-edge bg-page text-pine hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </span>
        ) : null}
      </div>
      {data.rows.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {data.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-box border border-edge bg-invoice px-3 py-2">
              <span className="tnum w-[118px] shrink-0 text-eyebrow text-slate">{row.when}</span>
              <span className="min-w-0 flex-1 text-body text-pine">{row.text}</span>
              <span className={`tnum shrink-0 text-body font-medium ${TONE[row.tone]}`}>{row.amount}</span>
              <span className="tnum w-[128px] shrink-0 text-right text-eyebrow text-slate">{row.after}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 py-6 text-center text-body text-slate">{data.empty}</p>
      )}
    </section>
  );
}
