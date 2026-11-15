/**
 * Pricing content shared by the home pricing section and /pricing page.
 *
 * Two models the visitor switches between with the sliding toggle:
 *  - Credits: prepaid one-time top-ups, 1 credit = $1 of usage, spend on anything, never expire.
 *  - Subscription: a monthly quota of full verification flows (overflow draws from credits).
 * These mirror the products sold through the billing checkout (Polar).
 */

export type PricingModel = "credits" | "subscription";

export type Plan = {
  id: string;
  name: string;
  tagline: string;
  /** Headline price, e.g. "$25" or "$49". */
  price: string;
  /** e.g. "one-time" or "/month". */
  priceSuffix?: string;
  /** The headline thing you get: "25 credits" or "100 verifications / month". */
  highlight: string;
  features: string[];
  cta: { label: string; href: string };
  /** Visual treatment: dark pine card vs highlighted lime gradient. */
  variant: "dark" | "featured";
  icon: "zap" | "rocket" | "gem";
  /** Optional ribbon, e.g. "Most popular" or "10% bonus". */
  badge?: string;
};

export const pricingSection = {
  badge: "Pricing",
  heading: "Simple pricing, two ways to pay",
  subline:
    "Buy prepaid credits and spend them on anything, or take a monthly plan for your verification volume. Switch between them any time.",
} as const;

export const pricingHero = {
  heading: "Pay the way that fits you.",
  subline:
    "Prepaid credits for pay-as-you-go, or a monthly plan for steady verification volume. No seats, no hidden fees.",
} as const;

export const pricingModels: Record<
  PricingModel,
  { label: string; note: string }
> = {
  credits: {
    label: "One-time",
    note: "Prepaid credits. Spend on anything, and they never expire.",
  },
  subscription: {
    label: "Subscription",
    note: "A monthly quota of full verification flows.",
  },
};

/** Start the purchase: sign in, then finish in the billing console. */
const BUY = "/login/?next=/billing/";

export const creditPacks: Plan[] = [
  {
    id: "credits-25",
    name: "Starter",
    tagline: "For trying things out.",
    price: "$25",
    priceSuffix: "one-time",
    highlight: "25 credits",
    features: [
      "1 credit = $1 of usage",
      "Spend on any API call or verification",
      "Single runs or full flows",
      "Credits never expire",
      "No monthly commitment",
    ],
    cta: { label: "Buy credits", href: BUY },
    variant: "dark",
    icon: "zap",
  },
  {
    id: "credits-110",
    name: "Growth",
    tagline: "For steady, everyday usage.",
    price: "$100",
    priceSuffix: "one-time",
    highlight: "110 credits",
    badge: "10% bonus",
    features: [
      "Everything in Starter",
      "10 bonus credits included",
      "Best for regular volume",
      "Spend across every product",
      "Credits never expire",
    ],
    cta: { label: "Buy credits", href: BUY },
    variant: "featured",
    icon: "rocket",
  },
  {
    id: "credits-575",
    name: "Scale",
    tagline: "For high-volume teams.",
    price: "$500",
    priceSuffix: "one-time",
    highlight: "575 credits",
    badge: "15% bonus",
    features: [
      "Everything in Growth",
      "75 bonus credits included",
      "Lowest effective rate",
      "Priority support",
      "Credits never expire",
    ],
    cta: { label: "Buy credits", href: BUY },
    variant: "dark",
    icon: "gem",
  },
];

export const subscriptionPlans: Plan[] = [
  {
    id: "plan-starter",
    name: "Starter",
    tagline: "For teams going live.",
    price: "$49",
    priceSuffix: "/month",
    highlight: "100 verifications / month",
    features: [
      "100 full verification flows",
      "All checks included",
      "Overflow draws from your credits",
      "Resets every month",
      "Standard support",
    ],
    cta: { label: "Get started", href: BUY },
    variant: "dark",
    icon: "zap",
  },
  {
    id: "plan-business",
    name: "Business",
    tagline: "For growing products.",
    price: "$199",
    priceSuffix: "/month",
    highlight: "500 verifications / month",
    badge: "Most popular",
    features: [
      "Everything in Starter",
      "500 full verification flows",
      "Better per-verification rate",
      "Priority support",
      "Overflow draws from your credits",
    ],
    cta: { label: "Get started", href: BUY },
    variant: "featured",
    icon: "rocket",
  },
  {
    id: "plan-growth",
    name: "Growth",
    tagline: "For scale.",
    price: "$599",
    priceSuffix: "/month",
    highlight: "2,000 verifications / month",
    features: [
      "Everything in Business",
      "2,000 full verification flows",
      "Best per-verification rate",
      "Priority support",
      "Overflow draws from your credits",
    ],
    cta: { label: "Get started", href: BUY },
    variant: "dark",
    icon: "gem",
  },
];

export const pricingPlans: Record<PricingModel, Plan[]> = {
  credits: creditPacks,
  subscription: subscriptionPlans,
};

export type AddOn = {
  id: string;
  name: string;
  price: string;
  unit: string;
  icon: "nfc" | "user-search" | "map-pin" | "scan-face";
};

export const addOns: AddOn[] = [
  { id: "nfc", name: "NFC chip", price: "+$0.90", unit: "/ call", icon: "nfc" },
  {
    id: "aml",
    name: "AML screening",
    price: "+$0.80",
    unit: "/ call",
    icon: "user-search",
  },
  {
    id: "poa",
    name: "Proof of Address",
    price: "+$0.40",
    unit: "/ call",
    icon: "map-pin",
  },
  {
    id: "face-1n",
    name: "Face 1:N",
    price: "+$0.30",
    unit: "/ call",
    icon: "scan-face",
  },
];

export const billingFaq = {
  heading: "Frequently Asked Questions.",
  cta: { label: "Contact Us", href: "/contact" },
  defaultOpen: "models",
  items: [
    {
      id: "models",
      question: "Credits or a subscription — which do I need?",
      answer:
        "Credits are prepaid and flexible: top up once and spend them on any API call or verification. A subscription gives you a fixed number of full verification flows each month at a better rate. Many teams use both: a plan for steady volume, credits for everything else.",
    },
    {
      id: "expire",
      question: "Do credits expire?",
      answer:
        "No. Prepaid credits stay on your account until you use them. One credit equals one dollar of usage.",
    },
    {
      id: "overflow",
      question: "What happens when my plan's monthly verifications run out?",
      answer:
        "Nothing breaks. Extra verifications simply draw from your credit balance at the usual rate, so you're never blocked mid-month. The plan's quota resets at the start of each billing period.",
    },
    {
      id: "both",
      question: "Can I use credits and a subscription together?",
      answer:
        "Yes. A verification uses your plan's monthly quota first, then falls back to credits. Single API calls always use credits.",
    },
    {
      id: "data-protection",
      question: "How is my data protected?",
      answer:
        "We hold a Data Protection Certificate. Your data is used only for the verification you ask for, stored encrypted, and never sold or used for anything else. Retention windows are configurable.",
    },
  ],
} as const;
