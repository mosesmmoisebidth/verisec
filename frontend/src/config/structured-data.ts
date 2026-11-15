/**
 * Structured data (schema.org JSON-LD) and the keyword set for the whole site.
 *
 * Search engines read these blocks to understand who VeriSec Labs is, what the
 * product does, and the questions it answers, which earns rich results and helps
 * ranking. Everything here is pulled from real site content (contact, FAQ,
 * products) so nothing is invented. No ratings or review counts are fabricated.
 */
import { faq } from "@/config/home";
import { siteUrl } from "@/config/seo";
import { contact } from "@/config/site";

const ORG_ID = `${siteUrl}/#organization`;
const SITE_ID = `${siteUrl}/#website`;
const SOFTWARE_ID = `${siteUrl}/#software`;

const description =
  "VeriSec Labs unifies KYC, document verification, NFC/ePassport, face biometrics, liveness detection, AML screening, bank cheque (MICR) reading, payment card capture and BIN lookup into one API, returning a single Trust Seal per applicant.";

/**
 * A broad, relevant keyword set. Google no longer ranks on the keywords meta
 * tag, but Bing and other engines still read it, and these terms also feed the
 * `knowsAbout` / `keywords` fields on the schema.org blocks below.
 */
export const keywords = [
  // KYC / identity
  "KYC API", "KYC software", "Know Your Customer", "identity verification",
  "identity verification API", "ID verification", "digital identity verification",
  "digital onboarding", "customer onboarding", "KYB", "eKYC", "Trust Seal",
  // documents
  "document verification", "document authentication", "ID document verification",
  "passport verification", "national ID verification", "driver's license verification",
  "1400 document types", "document OCR", "tamper detection", "document authenticity",
  // MRZ / NFC
  "MRZ reader", "MRZ parser", "machine readable zone", "ICAO 9303",
  "NFC passport", "ePassport", "chip verification", "passive authentication",
  // face biometrics
  "face biometrics", "face recognition API", "facial recognition", "face match",
  "1:1 face match", "1:N face search", "biometric authentication", "selfie verification",
  "liveness detection", "passive liveness", "anti-spoofing", "presentation attack detection",
  "face attributes", "age verification", "age estimation",
  // AML / screening
  "AML screening", "anti money laundering", "sanctions screening", "PEP screening",
  "politically exposed persons", "adverse media screening", "watchlist screening",
  "crypto risk", "proof of address", "proof of address verification",
  // financial / MICR / cards
  "cheque reader", "cheque MICR", "MICR reader", "magnetic ink character recognition",
  "bank cheque scanning", "payment card reader", "credit card scanner", "debit card OCR",
  "card capture", "BIN lookup", "bank identification number", "card issuer lookup",
  "bank directory", "IBAN", "SWIFT BIC",
  // risk / fraud
  "fraud prevention", "fraud detection", "email risk", "phone risk", "IP risk",
  "device intelligence", "compliance", "regulatory compliance",
  // SDKs / developer
  "KYC SDK", "identity SDK", "verification SDK", "mobile capture SDK",
  "iOS SDK", "Android SDK", "React Native SDK", "Flutter SDK",
  "Python SDK", "Node.js SDK", "Go SDK", "Java SDK", ".NET SDK", "PHP SDK", "Ruby SDK",
  "REST API", "identity API", "biometric API", "verification API", "webhooks",
  // brand / place
  "VeriSec", "VeriSec Labs", "Rwanda fintech", "Africa identity verification",
];

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORG_ID,
  name: "VeriSec Labs",
  alternateName: "VeriSec",
  url: `${siteUrl}/`,
  logo: {
    "@type": "ImageObject",
    url: `${siteUrl}/apple-icon.png`,
  },
  image: `${siteUrl}/og.png`,
  description,
  email: contact.email,
  telephone: contact.phones[0],
  foundingDate: "2026",
  slogan: "Verify anyone, anywhere in seconds.",
  knowsAbout: keywords,
  areaServed: "Worldwide",
  address: [
    {
      "@type": "PostalAddress",
      addressLocality: "Kigali",
      addressCountry: "RW",
    },
    {
      "@type": "PostalAddress",
      addressLocality: "Princeton",
      addressRegion: "NJ",
      addressCountry: "US",
    },
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      email: contact.email,
      telephone: contact.phones[0],
      contactType: "customer support",
      areaServed: "Worldwide",
      availableLanguage: ["English"],
    },
  ],
  sameAs: [
    "https://pub.dev/packages/verisec_api",
    "https://www.npmjs.com/package/@veriseclabs/capture-react-native",
    "https://github.com/mosesmmoisebidth/verisec-kotlin",
  ],
};

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": SITE_ID,
  url: `${siteUrl}/`,
  name: "VeriSec Labs",
  description,
  publisher: { "@id": ORG_ID },
  inLanguage: "en",
};

const software = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": SOFTWARE_ID,
  name: "VeriSec",
  alternateName: "VeriSec Identity & KYC API",
  applicationCategory: "SecurityApplication",
  applicationSubCategory: "Identity Verification & KYC API",
  operatingSystem: "Web, REST API, iOS, Android",
  url: `${siteUrl}/`,
  description,
  provider: { "@id": ORG_ID },
  publisher: { "@id": ORG_ID },
  softwareVersion: "1.0",
  keywords: keywords.join(", "),
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free sandbox with 1,000 verifications and every check enabled.",
  },
  featureList: [
    "KYC identity verification with a single Trust Seal per applicant",
    "Document recognition across roughly 1,400 document types",
    "Document authenticity and tamper detection",
    "MRZ reading and check-digit parsing (passports, IDs, visas)",
    "NFC / ePassport chip reading and cryptographic verification",
    "1:1 face match and 1:N face search",
    "Passive liveness detection and anti-spoofing",
    "Face attributes and age verification",
    "AML sanctions, PEP and adverse-media screening",
    "Proof of address analysis",
    "Bank cheque MICR reading",
    "Payment card capture and validation",
    "BIN lookup to network, type, issuer and country",
    "Email, phone, IP and wallet risk",
    "Composable verification workflows and webhooks",
    "Server SDKs: Python, Node.js, Go, Java, .NET, PHP, Ruby",
    "Mobile capture SDKs: iOS, Android, React Native, Flutter",
  ],
};

/** The products, as a list of Services, so each is understood as its own offering. */
const services = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "@id": `${siteUrl}/#services`,
  name: "VeriSec products",
  itemListElement: [
    ["KYC", "Document, chip, face, liveness and screening composed into one decision."],
    ["Document Recognition & Authenticity", "Read roughly 1,400 document types and detect tampering."],
    ["MRZ", "Read the machine-readable zone on passports, IDs and visas."],
    ["NFC / ePassport", "Read and cryptographically verify the chip."],
    ["Face Biometrics", "1:1 match, 1:N search, liveness and attributes."],
    ["Liveness Detection", "Confirm a real, present person, not a photo or screen replay."],
    ["AML Screening", "Sanctions, PEP, adverse media and crypto-risk lists."],
    ["Proof of Address", "Read and validate a proof-of-address document."],
    ["Cheque MICR", "Read the magnetic line on bank cheques in one shot."],
    ["Payment Cards & BIN", "Read a payment card and resolve its BIN to a network and issuer."],
    ["Contact & Risk", "Email, phone, IP and wallet risk in one dossier."],
  ].map(([name, desc], i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "Service",
      name,
      description: desc,
      provider: { "@id": ORG_ID },
      areaServed: "Worldwide",
    },
  })),
};

/** Global blocks, rendered site-wide from the root layout. */
export const globalJsonLd = [organization, website, software, services];

/** FAQ block, rendered on the page that shows the FAQ (home). Pulled verbatim. */
export const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${siteUrl}/#faq`,
  mainEntity: faq.items.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};
