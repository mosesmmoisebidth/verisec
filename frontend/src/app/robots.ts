import type { MetadataRoute } from "next";

import { apiRoutes, crawlableApiRoutes, privateRoutes, siteUrl } from "@/config/seo";

/** Static export requires this — see the note in sitemap.ts. */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // the most specific rule wins, so the demo's public menu stays readable under the disallowed /api/
      allow: ["/", ...crawlableApiRoutes],
      // Everything behind sign-in. The console and the applicant flow now live
      // in the same tree as the public site, and an indexed /dashboard would
      // put a demo workspace full of invented figures into search results.
      // Plus the API paths, which are not pages (see apiRoutes).
      disallow: [...privateRoutes, ...apiRoutes],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
