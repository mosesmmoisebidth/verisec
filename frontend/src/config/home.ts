/**
 * Home page content. Copy is taken verbatim from the VeriSec Labs Figma
 * file; the only edits are fixes for typos that existed in the design
 * ("How It Work" badge, a duplicated pricing row, a mistitled card).
 *
 * `lottie` fields name a file in `public/animation_files` (e.g. "lottie_1" ->
 * /animation_files/lottie_1.json), per the design's animation mapping. The
 * <Lottie> player loads them lazily.
 */

export const hero = {
  headline: "Verify Anyone, Anywhere\nIn Seconds.",
  subline:
    "Turn a document photo, a selfie, and one API call into a trusted decision. VeriSec unifies KYC, NFC, face biometrics and AML into a single Trust Seal per applicant.",
  primaryCta: { label: "Get Started", href: "/signup" },
  secondaryCta: { label: "Watch Demo" },
} as const;

/**
 * The product film "Watch Demo" plays. It is a file on this site (public/video), copied as delivered and never
 * re-encoded, so it plays at its full quality from our own server.
 */
export const demoVideo = {
  src: "/video/video_landing.mp4",
  title: "VeriSec product demo",
  // 1080p source: the frame is capped at this, so it shows large and stays sharp
  width: 1920,
  height: 1080,
  // the film opens on a plain light grey: the frame shows it while loading
  firstFrame: "#f2f2f2",
} as const;

export type AccordionItem = {
  id: string;
  title: string;
  description: string;
  /** Animation file stem in public/animation_files (optional). */
  lottie?: string;
};

export const trustProblem = {
  badge: "Why VeriSec",
  heading: "The Trust Problem Every Business Faces.",
  cta: { label: "How It Works", href: "/#how-it-works" },
  items: [
    {
      id: "fake-documents",
      lottie: "lottie_1",
      title: "Fake & Altered Documents",
      description:
        "Screens, print-outs and tampered IDs slip past human review. Every fake that gets through becomes fraud you pay for later.",
    },
    {
      id: "manual-review",
      lottie: "lottie_2",
      title: "Manual Review Bottlenecks",
      description:
        "Applicants abandon mid-review, ops teams drown in queues, and the same edge cases surface week after week.",
    },
    {
      id: "fragmented-tools",
      lottie: "lottie_3",
      title: "Fragmented Compliance Tools",
      description:
        "One vendor for documents, another for faces, a third for screening. Stitching them together costs quarters, not sprints.",
    },
  ] satisfies AccordionItem[],
};

export const features = {
  heading: "Everything You Need to Verify Identity.",
  subline:
    "One workflow builder. One API. One evidence bundle per applicant. Compose the checks you need, swap them out when your risk model changes.",
  cta: { label: "Get Started", href: "/signup" },
  cards: [
    {
      id: "document-chip",
      lottie: "lottie_4",
      title: "Document + Chip Authentication",
      description:
        "Read ~1,400 document types with cryptographic NFC proof against the ICAO Public Key Directory. No look-alike vendor tricks.",
      icon: "id-card",
      highlighted: false,
    },
    {
      id: "biometric-liveness",
      // calm and flat like its neighbours (was lottie_5, a glowing neon scan)
      lottie: "lottie_20",
      title: "Real-Time Biometric Liveness",
      description:
        "Passive + active anti-spoofing built to defeat deepfakes, injection attacks, and print-and-mask fraud. On-device SDKs, sub-second decisions.",
      icon: "scan-face",
      highlighted: true,
    },
    {
      id: "one-api",
      lottie: "lottie_6",
      title: "One API, Every Check",
      description:
        "Compose a Workflow once, call POST /kyc/verify. Add AML, PoA, phone or age gates without changing your integration.",
      icon: "braces",
      highlighted: false,
    },
  ],
} as const;

export const steps = {
  badge: "How It Works",
  heading: "Get Verified In 3 Easy Steps",
  cta: { label: "How It Works", href: "/#how-it-works" },
  items: [
    {
      id: "compose",
      lottie: "lottie_7",
      title: "Compose a Workflow",
      description:
        "Drag together the checks you need, document, chip, face, liveness, AML, PoA.",
    },
    {
      id: "call",
      lottie: "lottie_8",
      title: "Call One API",
      description:
        "One POST /kyc/verify, or a single hosted link the applicant opens on their phone.",
    },
    {
      id: "decide",
      lottie: "lottie_9",
      title: "Get a Decision + Trust Seal",
      description:
        "A single score, five badges, full audit trail. Delivered by response or webhook.",
    },
  ],
} as const;

/**
 * The animated "trusted by" strip between the How-It-Works steps and the
 * customer stories. Companies currently evaluating / piloting VeriSec, shown
 * with permission. Set `logo` to a file under /public (e.g. "/trusted/bk.svg")
 * to show a company's own official logo instead of its name wordmark; the strip
 * swaps automatically, no layout change.
 */
export type TrustedCompany = { name: string; href?: string; logo?: string };

export const trustedLogos: { heading: string; companies: TrustedCompany[] } = {
  heading: "Some of the companies already testing our solutions",
  companies: [
    { name: "Advans", logo: "/trusted/advans_logo.png" },
    { name: "Asili SACCO", logo: "/trusted/asili_saco.png" },
    { name: "Bank of Kigali", logo: "/trusted/bank_of_kigali.png", href: "https://bk.rw/" },
    { name: "Betano", logo: "/trusted/betano.png" },
    { name: "Centenary Bank", logo: "/trusted/centenary_bank.png", href: "https://www.centenarybank.co.ug/" },
    { name: "Defabet", logo: "/trusted/defabet.png" },
  ],
};

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  /** Company logo under /public (e.g. "/trusted/betano.png"); shown in the avatar circle instead of initials. */
  logo?: string;
};

export const testimonials = {
  badge: "Customer Stories",
  heading: "Trusted by Compliance & Risk Teams.",
  subline:
    "Fintechs, marketplaces, banks and crypto exchanges use VeriSec to onboard millions of applicants without giving up on scrutiny.",
  cta: { label: "Get Started", href: "/signup" },
  items: [
    {
      quote:
        "“We are evaluating VeriSec for age estimation. Their SDK is accurate at estimating age, which is exactly what our checks need.”",
      name: "Francisco Nicolau Sargo Froes",
      role: "Head of Analytics · Betano",
      logo: "/trusted/betano.png",
    },
    {
      quote:
        "“What stands out is how dynamic and accurate VeriSec's ID engine is across very different documents. It generalises well and still reads most IDs even when they are blurry.”",
      name: "Augustine Shimenga",
      role: "Manager · Defabet",
      logo: "/trusted/defabet.png",
    },
    {
      quote:
        "“Integrating VeriSec into our operations would be easy, and the documentation is rich and clear. We are considering VeriSec for MICR because the APIs are accurate and efficient.”",
      name: "Emily Mutaga",
      role: "Developer · Bank of Kigali",
      logo: "/trusted/bank_of_kigali.png",
    },
    {
      quote:
        "“We already use VeriSec's credit card recognition engine in parts of our internal application, and we are now considering taking it into production.”",
      name: "Xavier Mongabure",
      role: "Employee · Advans",
      logo: "/trusted/advans_logo.png",
    },
    {
      quote:
        "“What impresses me most is that even a person's name is encrypted. VeriSec's security is strong and well designed, which makes it a good fit for integration with our bank.”",
      name: "James Bosco Arim",
      role: "Security Officer · Centenary Bank",
      logo: "/trusted/centenary_bank.png",
    },
  ] satisfies Testimonial[],
};

export const integrations = {
  badge: "Integrations",
  heading: "Integrates With Your Stack.",
  subline:
    "Push verification events to the tools your ops, risk and product teams already live in. No middleware, no bespoke ETL.",
} as const;

export const faq = {
  badge: "FAQ",
  heading: "Frequently Asked Questions.",
  cta: { label: "Contact Us", href: "/contact" },
  /** id of the item expanded by default (matches the Figma state) */
  defaultOpen: "data-protection",
  items: [
    {
      id: "documents",
      question: "What documents do you support?",
      answer:
        "Passports, national IDs and driver's licences from 190+ countries, roughly 1,400 document types, plus bank cheques (MICR), vehicle plates and payment cards.",
    },
    {
      id: "data-protection",
      question: "How is my verification data protected?",
      answer:
        "We hold a Data Protection Certificate. Your data is used only for the verification you ask for, stored encrypted, and never sold or used for anything else. Every action is logged, and retention is configurable.",
    },
    {
      id: "speed",
      question: "How fast is a verification?",
      answer:
        "Warm engines return individual checks in under 200 milliseconds. A full document + face + liveness bundle typically completes in two to three seconds.",
    },
    {
      id: "sandbox",
      question: "Can I test everything in a sandbox before paying?",
      answer:
        "Yes. The sandbox is free and ships with 1,000 verifications, every check enabled, and realistic synthetic documents to test against.",
    },
    {
      id: "customize",
      question: "Can I customize the verification flow per use case?",
      answer:
        "Yes. Compose a Workflow per product, region or risk tier, add or remove checks without changing your integration.",
    },
    {
      id: "face-liveness",
      question: "Can you confirm the person is real and matches their ID?",
      answer:
        "Yes. We match the selfie to the photo on the document and run a liveness check to confirm a real, present person, not a photo or a screen replay.",
    },
    {
      id: "aml-flag",
      question: "What happens if AML screening flags someone?",
      answer:
        "The case routes to review with the matched lists and evidence attached. You approve, reject or escalate, every action is logged for audit.",
    },
    {
      id: "pro-vs-enterprise",
      question: "What's the difference between Pro and Enterprise",
      answer:
        "Enterprise adds data residency choices, SSO + SCIM, custom SLAs and retention windows, plus a dedicated CSM and solutions engineer.",
    },
  ],
} as const;

export const catalog = {
  badge: "Products",
  heading: "Explore the full product catalog",
  cta: { label: "All solutions", href: "/solutions" },
  items: [
    {
      id: "kyc",
      lottie: "lottie_10",
      title: "KYC",
      href: "/solutions/kyc",
      description:
        "Full identity verification in one API, document, chip, face, liveness, screening.",
    },
    {
      id: "micr",
      lottie: "lottie_11",
      title: "MICR",
      href: "/solutions#micr",
      description: "Reads the magnetic line on bank cheques in one shot.",
    },
    {
      id: "mrz",
      lottie: "lottie_12",
      title: "MRZ",
      href: "/solutions#mrz",
      description:
        "Reads the machine-readable zone on passports, IDs and visas.",
    },
    {
      id: "nfc",
      lottie: "lottie_13",
      title: "NFC Verification",
      href: "/solutions#nfc",
      description:
        "Cryptographic proof that a passport or eID chip is genuine and unaltered.",
    },
    {
      id: "alpr",
      lottie: "lottie_14",
      title: "ALPR / ANPR",
      href: "/solutions#alpr",
      access: "alpr",
      description:
        "Reads vehicle plates and classifies the vehicle: plate, country, colour, body and make.",
    },
    {
      id: "aml",
      lottie: "lottie_15",
      title: "AML Screening",
      href: "/solutions#aml",
      description:
        "Screen people and entities against sanctions, PEP, adverse media and crypto lists.",
    },
  ],
} as const;
