/** The Industries dropdown in the main navigation (desktop mega-menu and the mobile menu). */

export type IndustryIcon =
  | "landmark"
  | "wallet"
  | "bitcoin"
  | "hand-coins"
  | "shield-check"
  | "dices"
  | "smartphone"
  | "shopping-bag"
  | "briefcase"
  | "car"
  | "plane"
  | "house"
  | "heart-pulse"
  | "graduation-cap"
  | "building"
  | "heart-handshake"
  | "arrow-left-right"
  | "scale";

export type Industry = {
  slug: string;
  name: string;
  /** One line under the name in the dropdown. */
  description: string;
  icon: IndustryIcon;
};

/** Where an industry item leads: a conversation with the team about that industry. */
export const industryHref = "/contact";

export const industries: Industry[] = [
  { slug: "banking", name: "Banking", description: "Open accounts online, fully verified.", icon: "landmark" },
  { slug: "fintech", name: "Fintech & payments", description: "Onboard users, read cards and cheques.", icon: "wallet" },
  { slug: "crypto", name: "Crypto & Web3", description: "Verify traders, screen wallets.", icon: "bitcoin" },
  { slug: "remittance", name: "Money transfer", description: "Verify senders, screen for sanctions.", icon: "arrow-left-right" },
  { slug: "lending", name: "Lending & microfinance", description: "Verify borrowers, stop repeat fraud.", icon: "hand-coins" },
  { slug: "insurance", name: "Insurance", description: "Confirm policyholders, stop fraud.", icon: "shield-check" },
  { slug: "gaming", name: "Gaming & betting", description: "Age checks, one account per person.", icon: "dices" },
  { slug: "telecom", name: "Telecom", description: "Register SIM cards to a real identity.", icon: "smartphone" },
  { slug: "marketplaces", name: "Marketplaces & e-commerce", description: "Verify sellers and buyers.", icon: "shopping-bag" },
  { slug: "gig-economy", name: "Gig economy & HR", description: "Onboard drivers and staff safely.", icon: "briefcase" },
  { slug: "mobility", name: "Mobility & car rental", description: "Check licences before handover.", icon: "car" },
  { slug: "travel", name: "Travel & hospitality", description: "Fast check-in by reading the passport.", icon: "plane" },
  { slug: "real-estate", name: "Real estate", description: "Verify tenants and buyers first.", icon: "house" },
  { slug: "legal", name: "Legal & notary", description: "Verify clients before signing.", icon: "scale" },
  { slug: "healthcare", name: "Healthcare & telehealth", description: "Confirm patients before consultations.", icon: "heart-pulse" },
  { slug: "education", name: "Education & e-learning", description: "Confirm students for exams.", icon: "graduation-cap" },
  { slug: "government", name: "Government & public services", description: "Verified identity for online services.", icon: "building" },
  { slug: "social", name: "Social & dating", description: "Prove every profile is a real person.", icon: "heart-handshake" },
];
