/**
 * The demo dataset for Usage & Billing — Figma Desktop-34.
 *
 * ALL THE FIGURES ARE ILLUSTRATIVE. Balance, budget, usage counts and invoice
 * totals are the values drawn in the frame; the platform does not meter any of
 * this yet. When it does, DELETE the entry rather than editing the number to
 * look plausible — an invented figure on a billing screen is one somebody will
 * reconcile against their bank.
 *
 * TWO THINGS ARE DERIVED, NOT STORED, and both must stay that way:
 *
 *   · THE RATE CARD IS THE CATALOGUE. `CATALOGUE` in `demo-data.ts` is already
 *     the one price list in this app — the workflow builder sums it to price a
 *     workflow. This screen prints the same list. Retyping the eight prices
 *     here would give the product two price lists that agree until the day one
 *     is edited, and then a customer is quoted one number by the builder and
 *     billed at another. The frame's eight rows and their prices match the
 *     catalogue exactly, which is the design saying the same thing.
 *   · "ESTIMATED $0.75 / VERIFICATION" IS A SUM. The frame's own copy names the
 *     three checks it is pricing — Document + Face + Liveness — and 0.35 + 0.20
 *     + 0.20 is exactly the $0.75 it prints. So it is computed from the same
 *     `priceOf()` the workflow cards use. A stored estimate is a stale estimate
 *     the first time a rate moves.
 *
 * ONE DEPARTURE: the frame's y-axis is drawn at 800 with the tallest column
 * near it. `axis` is left off so `niceMax()` derives the ceiling from the data
 * — a hard 800 clips the day a component is used 900 times.
 */

import { CATALOGUE, money, priceOf } from "./demo-data";
import type { BillingData, ComponentIcon, RateRow } from "./types";

/* ----------------------------------------------------------------------------
   Rates, read off the catalogue, in the frame's order
---------------------------------------------------------------------------- */

/** The eight the frame lists, in its order. The catalogue holds more. */
const RATE_ORDER: ComponentIcon[] = [
  "document",
  "authenticity",
  "face-match",
  "liveness",
  "nfc",
  "address",
  "phone",
  "aml",
];

const BY_ID = new Map(CATALOGUE.map((c) => [c.id, c]));

const RATES: RateRow[] = RATE_ORDER.map((id) => {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`rate card names a component the catalogue does not have: ${id}`);
  return {
    name: c.name,
    price: money(c.price),
    // `locked` is the catalogue's own word for "sold but not live yet", which
    // is what the frame's "(soon)" means. One flag, two screens.
    ...(c.locked ? { note: "(soon)" } : {}),
  };
});

/** The workflow the estimate prices — the frame names these three in its copy. */
const ESTIMATE: ComponentIcon[] = ["document", "face-match", "liveness"];

/* ----------------------------------------------------------------------------
   The dataset
---------------------------------------------------------------------------- */

export const DEMO_BILLING: BillingData = {
  title: "Usage & Billing",

  wallet: {
    label: "Credit wallet",
    balance: "$4218.44",
    caption: "Auto top-up at $500",
    cta: "Top up",
  },

  budget: {
    label: "Monthly budget",
    amount: "$2500",
    min: 0,
    max: 10000,
    value: 2500,
    hardStopLabel: "Hard stop on budget",
    hardStop: false,
  },

  activate: {
    label: "Activate Live billing",
    body: `Your workflow uses Document + Face + Liveness. Estimated ${money(
      priceOf(ESTIMATE),
    )} / verification.`,
    cta: "Continue to payment",
  },

  usage: {
    title: "Usage by component (this month)",
    axisLabel: "Verification checks run this month, by component",
    points: [
      { label: "Document Authenticity & Recognition", value: 662 },
      { label: "Proof of Address", value: 148 },
      { label: "Email & Phone", value: 131 },
      { label: "Face Liveness", value: 352 },
      { label: "Face 1:1 Match", value: 344 },
      { label: "NFC Verification", value: 176 },
      { label: "Device / IP", value: 122 },
    ],
  },

  rates: { title: "Rates", rows: RATES },

  invoices: {
    title: "Invoices",
    rows: [
      { id: "INV-2026-07", date: "2026-07-01", amount: "$1240.55", downloadLabel: "Download" },
      { id: "INV-2026-06", date: "2026-06-01", amount: "$984.10", downloadLabel: "Download" },
      { id: "INV-2026-05", date: "2026-05-01", amount: "$812.44", downloadLabel: "Download" },
      { id: "INV-2026-04", date: "2026-04-01", amount: "$655.00", downloadLabel: "Download" },
    ],
  },
};
