/**
 * Global site configuration: brand, navigation, contact, footer.
 * All copy lives here (and in the sibling config files) so content
 * edits never require touching component code.
 */

export const siteConfig = {
  name: "VeriSec",
  legalName: "VeriSec Labs",
  tagline: "Verify anyone, anywhere in seconds.",
  description:
    "Turn a document photo, a selfie, and one API call into a trusted decision. VeriSec unifies KYC, NFC, face biometrics and AML into a single Trust Seal per applicant.",
  copyright: "© 2026 VeriSec Labs. All rights reserved.",
} as const;

export type NavItem = {
  label: string;
  href: string;
  /**
   * Renders this dropdown instead of a plain link. Solutions links to its page on mobile; Industries has no page:
   * it lives only in the dropdown (desktop) and in an expanding list (mobile).
   */
  menu?: "solutions" | "industries";
};

export const mainNav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Solutions", href: "/solutions", menu: "solutions" },
  { label: "Industries", href: "#industries", menu: "industries" },
  { label: "Developers", href: "/developers" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
];

export const contact = {
  locations: ["Kigali, Rwanda", "Princeton, New Jersey, USA"],
  phones: ["+250792712603", "+250792207293", "+250792408820"],
  email: "support@verisec.dev",
} as const;

/**
 * Footer link lists. Every target resolves to a real page: product links go to
 * the KYC detail page or a `/solutions#<slug>` anchor on the solutions index;
 * resources point to /developers and the legal pages. Update targets here as
 * dedicated pages (Status, Trust Center, per-product) are built.
 */
export type FooterColumn = {
  heading: string;
  links: { label: string; href: string }[];
};

export const footerColumns: FooterColumn[] = [
  {
    heading: "COMPANY",
    links: [
      { label: "About", href: "/#about" },
      { label: "Solutions", href: "/solutions" },
      { label: "Pricing", href: "/pricing" },
      { label: "Developers", href: "/developers" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "PRODUCTS",
    links: [
      { label: "KYC", href: "/solutions/kyc" },
      { label: "MICR", href: "/solutions#micr" },
      { label: "MRZ", href: "/solutions#mrz" },
      { label: "NFC Verification", href: "/solutions#nfc" },
      { label: "ALPR / ANPR", href: "/solutions#alpr" },
      { label: "AML Screening", href: "/solutions#aml" },
      { label: "Scan-to-Pay", href: "/solutions#scan-to-pay" },
      { label: "Custom OCR", href: "/solutions#custom-ocr" },
    ],
  },
  {
    heading: "RESOURCES",
    links: [
      { label: "Documentation", href: "https://docs.verisec.dev" },
      { label: "API Reference", href: "https://docs.verisec.dev/docs/api" },
      { label: "Status", href: "/status/" },
      { label: "Security", href: "/privacy" },
      { label: "Trust Center", href: "/privacy" },
    ],
  },
];

export const legalLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
] as const;
