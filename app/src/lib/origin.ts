import "server-only";

import { headers } from "next/headers";

import { SITE_URL } from "./site";

// The address to put in links that leave the app, like emails. Production always
// uses the public domain, even when the request came in on bzzy.vercel.app, so
// people never get sent to the device host. Elsewhere (previews, local dev) it's
// whatever host the request came in on, so links work there too.
export async function appOrigin(): Promise<string> {
  if (process.env.VERCEL_ENV === "production") return SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return SITE_URL;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
