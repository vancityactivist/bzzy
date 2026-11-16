import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// The public pages: the signed-out landing at / and the API docs. Everything else needs an account.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/docs/api`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
