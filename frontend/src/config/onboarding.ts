/**
 * The onboarding a new account answers once, right after its first sign-in: which portal brought
 * it here, a few multiple-choice questions for that portal, how the portal works, and how its data
 * is handled. The answers are kept on the account, so every later sign-in lands in its portal.
 *
 * Every data-handling line here describes what the platform actually does today; keep it that way.
 */

export type PortalId = "kyc" | "fin";

export type Choice = { id: string; label: string; hint?: string };
export type Question = { id: string; title: string; subtitle: string; multi?: boolean; choices: Choice[] };

export type PortalInfo = {
  id: PortalId;
  name: string;
  tagline: string;
  /** What is inside, shown on the choice card. */
  includes: string[];
  home: string;
  questions: Question[];
  /** The three steps of using the portal, in order. */
  howItWorks: { title: string; body: string }[];
  /** How this portal treats the data put into it. */
  dataPromises: { title: string; body: string }[];
};

const VOLUME: Choice[] = [
  { id: "under_1k", label: "Fewer than 1,000" },
  { id: "1k_10k", label: "1,000 to 10,000" },
  { id: "10k_100k", label: "10,000 to 100,000" },
  { id: "over_100k", label: "More than 100,000" },
];

const REGIONS: Choice[] = [
  { id: "africa", label: "Africa" },
  { id: "europe", label: "Europe" },
  { id: "americas", label: "The Americas" },
  { id: "middle_east", label: "Middle East" },
  { id: "asia_pacific", label: "Asia-Pacific" },
  { id: "worldwide", label: "Worldwide" },
];

export const PORTALS: Record<PortalId, PortalInfo> = {
  kyc: {
    id: "kyc",
    name: "Identity verification and AML",
    tagline: "Verify the people you onboard and screen them against watchlists.",
    includes: ["ID documents and the chip", "Face match and liveness", "Sanctions, PEP and AML screening"],
    home: "/dashboard",
    questions: [
      {
        id: "org_type",
        title: "What kind of organisation are you?",
        subtitle: "So we can show you the checks that matter most in your field.",
        choices: [
          { id: "bank", label: "Bank or credit union" },
          { id: "fintech", label: "Fintech or payments" },
          { id: "crypto", label: "Crypto or digital assets" },
          { id: "platform", label: "Marketplace or online platform" },
          { id: "telecom", label: "Telecom" },
          { id: "government", label: "Government or public sector" },
          { id: "other", label: "Something else" },
        ],
      },
      {
        id: "checks",
        title: "Which checks do you need?",
        subtitle: "Pick all that apply. You can change your workflow any time.",
        multi: true,
        choices: [
          { id: "documents", label: "Identity documents", hint: "Passports, ID cards, driving licences" },
          { id: "face", label: "Face match and liveness", hint: "The person is real, and matches the document" },
          { id: "aml", label: "Sanctions, PEP and AML screening", hint: "Watchlists and politically exposed people" },
          { id: "contact", label: "Phone and email", hint: "Ownership confirmed with a one-time code" },
          { id: "address", label: "Proof of address", hint: "Utility bills and bank statements" },
          { id: "device", label: "Device and IP risk", hint: "Proxies, emulators, reused devices" },
        ],
      },
      {
        id: "volume",
        title: "How many people will you verify each month?",
        subtitle: "A rough number is fine.",
        choices: VOLUME,
      },
      {
        id: "regions",
        title: "Where are the people you verify?",
        subtitle: "Pick all that apply.",
        multi: true,
        choices: REGIONS,
      },
      {
        id: "start",
        title: "How would you like to start?",
        subtitle: "Both work from day one; you can use either later.",
        choices: [
          { id: "links", label: "Send verification links from the console", hint: "No code needed" },
          { id: "api", label: "Build it into my product with the API", hint: "API keys and a playground" },
          { id: "exploring", label: "Just exploring for now" },
        ],
      },
    ],
    howItWorks: [
      { title: "Start a verification", body: "Send an applicant a link or a QR code from the console, or create one from your product with the API." },
      { title: "The applicant verifies", body: "In about two minutes: their document, a live selfie, their phone and email, then screening. They can save and come back on the same device." },
      { title: "You review the result", body: "Every check, the reasons behind it and the Trust Seal score are in Verifications, ready to approve or review." },
    ],
    dataPromises: [
      { title: "Encrypted before it leaves the device", body: "Document photos and selfies are encrypted in the applicant's browser before they are uploaded." },
      { title: "A separate key for every record", body: "Each verification is stored encrypted with its own key, kept in a separate key vault." },
      { title: "Only your organisation sees it", body: "Your verifications are visible to your organisation's team and to no other account." },
      { title: "Deleted for good when you say so", body: "Redacting a verification destroys its key, so its personal data can never be read again. We never sell your data." },
    ],
  },
  fin: {
    id: "fin",
    name: "Financial document analysis",
    tagline: "Read cheques and payment cards, and look up any card or bank.",
    includes: ["Cheque MICR line and fields", "Payment card reading", "BIN, issuer and bank lookups"],
    home: "/fin",
    questions: [
      {
        id: "org_type",
        title: "What kind of organisation are you?",
        subtitle: "So we can point you to the right tools first.",
        choices: [
          { id: "bank", label: "Bank or credit union" },
          { id: "processor", label: "Payment processor" },
          { id: "lender", label: "Lender" },
          { id: "accounting", label: "Accounting or audit" },
          { id: "fintech", label: "Fintech" },
          { id: "other", label: "Something else" },
        ],
      },
      {
        id: "documents",
        title: "What will you analyse?",
        subtitle: "Pick all that apply.",
        multi: true,
        choices: [
          { id: "cheques", label: "Cheques", hint: "MICR line, amounts, dates, parties and bank" },
          { id: "cards", label: "Payment cards", hint: "Number, expiry, network and issuer" },
          { id: "bins", label: "BIN and issuer lookups", hint: "From the first digits of a card" },
          { id: "banks", label: "Bank details lookups", hint: "Bank names, codes and countries" },
        ],
      },
      {
        id: "volume",
        title: "How many documents each month?",
        subtitle: "A rough number is fine.",
        choices: VOLUME,
      },
      {
        id: "regions",
        title: "Where do your documents come from?",
        subtitle: "Pick all that apply.",
        multi: true,
        choices: REGIONS,
      },
      {
        id: "start",
        title: "How would you like to start?",
        subtitle: "Both work from day one; you can use either later.",
        choices: [
          { id: "upload", label: "Upload documents in the portal", hint: "Drop a photo or scan" },
          { id: "api", label: "Build it into my product with the API", hint: "API keys and a playground" },
          { id: "exploring", label: "Just exploring for now" },
        ],
      },
    ],
    howItWorks: [
      { title: "Send a document", body: "Upload a cheque or a card in the Playground, take a photo with your camera, or send it to the API." },
      { title: "We read it", body: "The MICR line, amounts, dates, parties and bank of a cheque; the number, expiry, network and issuer of a card, each with its checks." },
      { title: "Review and look up", body: "Every scan is kept in Scans for your team, and any BIN or bank can be looked up on its own." },
    ],
    dataPromises: [
      { title: "Card images are never stored", body: "Only the first six and last four digits of a card are kept. The full number appears only in the answer to your own request." },
      { title: "Only your organisation sees it", body: "Your scans and your history are visible to your organisation's team and to no other account." },
      { title: "Encrypted in transit", body: "Everything you send and receive travels over HTTPS." },
      { title: "Used only for your checks", body: "Your documents are read to answer your request. We never sell your data." },
    ],
  },
};

export const ONBOARDING = {
  welcome: "Welcome to VeriSec",
  choose: {
    title: "What brings you to VeriSec?",
    subtitle: "Choose the portal you need. It is where you will land each time you sign in.",
  },
  howTitle: (name: string) => `How ${name} works`,
  howSubtitle: "Three steps, from your first request to a decision.",
  dataTitle: "How we look after your data",
  dataSubtitle: "You can rely on this from your very first request.",
  enter: "Enter my portal",
  saving: "Setting up your portal",
};
