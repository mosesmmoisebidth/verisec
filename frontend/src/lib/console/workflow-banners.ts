/**
 * A photo for every ready-made workflow, of the kind of company that runs it (a bank, a casino, a
 * clinic, a courier...), so the gallery reads at a glance. The files are ours to serve
 * (`public/workflows/banners/<template>.webp`, 1080x400); each was taken from Pexels under the Pexels
 * licence (free for commercial use, no attribution required). The number is the Pexels photo id,
 * kept so every banner can be traced back to its source: https://www.pexels.com/photo/<id>/
 */
const PHOTO: Record<string, number> = {
  "id-liveness-face": 5871442,
  "standard-kyc": 23496937,
  "fast-onboarding": 8938734,
  "driver-verification": 1392621,
  "passport-only": 7310015,
  "document-only": 7841499,
  "vpn-step-up": 4064645,
  "high-risk-country-review": 592753,
  "aml-escalation": 2526491,
  "risk-based-id": 18834566,
  "enhanced-due-diligence": 8730850,
  "document-watchlist": 8441780,
  "sanctions-with-address": 3063470,
  "investor-onboarding": 4960438,
  "age-check": 8762843,
  "age-check-21": 3769144,
  "adaptive-age": 7848992,
  "anonymizer-block": 17489153,
  "location-consistency": 7663519,
  "risky-device-step-up": 24181865,
  "contact-risk-review": 5292269,
  "proof-of-address": 8364963,
  "tenant-screening": 8112184,
  "address-for-high-risk": 2157401,
  "phone-email": 7821764,
  "sim-registration": 1458283,
  "crypto-exchange": 843700,
  "igaming-player": 7594240,
  "marketplace-seller": 7857535,
  "remote-hiring": 4226140,
  "patient-identity": 19957221,
  "lending-application": 8293750,
  "exam-candidate": 6683577,
  "face-reauthentication": 7383144,
  "duplicate-check": 7362948,
};

/** The banner of a template, or null for one without a photo yet (the card then draws a brand panel). */
export function bannerOf(templateId: string): string | null {
  return PHOTO[templateId] ? `/workflows/banners/${templateId}.webp` : null;
}
