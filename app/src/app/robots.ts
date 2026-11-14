import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Only the landing page is public. The app's own pages stay crawlable so search engines can
// see their noindex tag ((app)/layout.tsx); blocking them here would hide that tag and the
// bare URLs could still be listed. The device API and GIF downloads aren't pages at all.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
