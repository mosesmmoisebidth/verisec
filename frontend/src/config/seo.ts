/**
 * Canonical site origin, used for metadataBase, canonical URLs, sitemap
 * and social-preview image URLs.
 *
 * Set NEXT_PUBLIC_SITE_URL at build time to the real production origin.
 * The live origin is https://verisec.dev.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://verisec.dev"
).replace(/\/$/, "");

/** Routes included in the sitemap. Trailing slashes match `trailingSlash: true`. */
export const publicRoutes = [
  { path: "/", priority: 1.0 },
  { path: "/demo/", priority: 0.9 },
  { path: "/solutions/", priority: 0.9 },
  { path: "/solutions/kyc/", priority: 0.9 },
  { path: "/developers/", priority: 0.8 },
  { path: "/pricing/", priority: 0.8 },
  { path: "/contact/", priority: 0.7 },
  { path: "/slack/", priority: 0.6 },
  { path: "/privacy/", priority: 0.3 },
  { path: "/terms/", priority: 0.3 },
] as const;

/**
 * Kept out of the sitemap and disallowed in robots.
 *
 * The auth screens have no SEO value — and now that the console lives in the
 * same tree, neither does anything behind them: an indexed /dashboard would put
 * a demo workspace full of invented figures into search results.
 */
export const privateRoutes = [
  "/login/",
  "/signup/",
  "/welcome/",
  "/dashboard/",
  "/workflows/",
  "/verifications/",
  "/api-keys/",
  "/webhooks/",
  "/billing/",
  "/team/",
  "/settings/",
  "/verify/",
  "/playground/",
  "/fin/",
  "/explorer/",
  "/onboarding/",
  "/mfa/",
  "/accept-invite/",
  "/reset-password/",
  "/set-new-password/",
  "/verify-email/",
] as const;

/**
 * Not pages: the console API, the Financial engines, and the public API paths that the Developers page and the
 * docs name in their examples (crawlers read "/v1/idv/read" in the text and request it as a page, getting 404, and
 * the page scripts call signed-in endpoints that answer 401). Disallowed so search engines stop requesting them.
 * The demo's public menu stays readable so the demo page renders fully for crawlers.
 */
export const apiRoutes = ["/api/", "/fin-api/", "/v1/", "/v2/"] as const;
export const crawlableApiRoutes = ["/api/demo/config"] as const;

/** Shared OpenGraph image — a real .png so static hosts send image/png. */
export const ogImage = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "VeriSec Labs: verify anyone, anywhere in seconds",
} as const;
