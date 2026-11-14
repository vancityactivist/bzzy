import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// One page for now: the signed-out landing at /. Everything else needs an account.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 }];
}
