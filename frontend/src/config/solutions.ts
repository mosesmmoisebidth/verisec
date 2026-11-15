/** Solutions index + per-product detail content. */

/** flagship: the whole platform; available: live and working on its own; coming-soon: not open yet. */
export type SolutionStatus = "flagship" | "available" | "coming-soon";

export type Solution = {
  slug: string;
  name: string;
  description: string;
  status: SolutionStatus;
  icon:
    | "id-card"
    | "receipt"
    | "scan-line"
    | "nfc"
    | "car"
    | "user-search"
    | "credit-card"
    | "file-scan"
    | "scan-face";
  /** Animation file stem in public/animation_files (e.g. "lottie_10"). */
  lottie: string;
  /** Only products with a detail page link out. */
  href?: string;
  /**
   * Where an available product opens inside the platform (its API Playground or its page). One
   * sign-in covers the KYC and Financial portals; a signed-out visitor signs in first and lands here.
   */
  open?: string;
  /** Marks a product that ships as an on-premise / offline SDK: its card opens the access popup. */
  access?: "alpr";
};

export const solutionsHero = {
  heading: "Every identity check we build.",
  subline:
    "KYC is the flagship, the whole platform, wrapped as one API. Every other product is available on its own, too.",
} as const;

export const solutions: Solution[] = [
  {
    slug: "kyc",
    name: "KYC",
    description:
      "Full identity verification in one API : document, chip, face, liveness, screening.",
    status: "flagship",
    icon: "id-card",
    lottie: "lottie_10",
    href: "/solutions/kyc",
  },
  {
    slug: "micr",
    name: "MICR",
    description: "Reads the magnetic line on bank cheques in one shot.",
    status: "available",
    icon: "receipt",
    lottie: "lottie_11",
    open: "/fin/api-keys/playground/?group=MICR",
  },
  {
    slug: "mrz",
    name: "MRZ",
    description: "Reads the machine-readable zone on passports, IDs and visas.",
    status: "available",
    icon: "scan-line",
    lottie: "lottie_12",
    open: "/api-keys/playground/?group=MRZ",
  },
  {
    slug: "nfc",
    name: "NFC Verification",
    description:
      "Cryptographic proof that a passport or eID chip is genuine and unaltered.",
    status: "coming-soon",
    icon: "nfc",
    lottie: "lottie_13",
  },
  {
    slug: "alpr",
    name: "ALPR / ANPR",
    description:
      "Reads vehicle plates and classifies the vehicle: plate, country, colour, body and make.",
    status: "available",
    icon: "car",
    lottie: "lottie_14",
    access: "alpr",
  },
  {
    slug: "aml",
    name: "AML Screening",
    description:
      "Screen people and entities against sanctions, PEP, adverse media and crypto lists.",
    status: "available",
    icon: "user-search",
    lottie: "lottie_15",
    open: "/explorer/",
  },
  {
    slug: "scan-to-pay",
    name: "Scan-to-Pay",
    description: "Read a bank card by camera instead of typing it in.",
    status: "available",
    icon: "credit-card",
    lottie: "lottie_16",
    open: "/fin/api-keys/playground/?group=Credit%20Card",
  },
  {
    slug: "custom-ocr",
    name: "Custom OCR",
    description: "Read any non-standard document into your own field schema.",
    status: "coming-soon",
    icon: "file-scan",
    lottie: "lottie_17",
  },
  {
    slug: "face",
    name: "Face",
    description: "Standalone face biometrics, the engine behind KYC.",
    status: "available",
    icon: "scan-face",
    lottie: "lottie_18",
    open: "/api-keys/playground/?group=Face",
  },
];

export const kycPage = {
  breadcrumb: [
    { label: "Solutions", href: "/solutions" },
    { label: "KYC", href: "/solutions/kyc" },
  ],
  heading: "The whole verification platform, in one API call.",
  subline:
    "Compose a workflow from document, chip, face, liveness and AML. Get one Trust Seal a score and five badges per applicant.",
  primaryCta: { label: "Start for Free", href: "/signup" },
  secondaryCta: { label: "Book a Demo", href: "/contact" },
  checksHeading: "Every check, one call",
  checks: [
    {
      id: "document",
      name: "Document",
      detail: "Read + authenticity",
      icon: "file-check",
    },
    { id: "nfc", name: "NFC chip", detail: "Cryptographic proof", icon: "nfc" },
    {
      id: "face",
      name: "Face match",
      detail: "Selfie to document",
      icon: "scan-face",
    },
    {
      id: "liveness",
      name: "Liveness",
      detail: "Passive + active",
      icon: "eye",
    },
    { id: "aml", name: "AML", detail: "Sanctions & PEP", icon: "user-search" },
  ],
  trustSeal: {
    badge: "Why VeriSec",
    heading: "The Trust Seal",
    body: "One workflow builder. One API. One evidence bundle per applicant. Compose the checks you need, swap them out when your risk model changes.",
    cta: { label: "Get Started", href: "/signup" },
    chips: [
      { label: "Cryptographic", icon: "package-check" },
      { label: "Phone", icon: "phone" },
      { label: "Address", icon: "map-pin" },
      { label: "Image-clean", icon: "camera" },
      { label: "AML-clear", icon: "user-check" },
    ],
  },
  builtForHeading: "Built for",
  builtFor: [
    {
      id: "banks",
      name: "Banks",
      description: "Full KYC + AML, cryptographic assurance.",
      icon: "landmark",
    },
    {
      id: "fintechs",
      name: "Fintechs",
      description: "Fast onboarding, single Trust Seal.",
      icon: "smartphone",
    },
    {
      id: "crypto",
      name: "Crypto",
      description: "Sanctions + PEP screening, chip-proven ID.",
      icon: "bitcoin",
    },
    {
      id: "marketplaces",
      name: "Marketplaces",
      description: "Lightweight KYC, high pass rates.",
      icon: "shopping-cart",
    },
  ],
} as const;
