import type { MetadataRoute } from "next";

import { publicRoutes, siteUrl } from "@/config/seo";

/**
 * `output: 'export'` requires metadata routes to be explicitly static —
 * without this the build fails with "export const dynamic = force-static
 * not configured on route /sitemap.xml".
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return publicRoutes.map(({ path, priority }) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    changeFrequency: "monthly",
    priority,
  }));
}
