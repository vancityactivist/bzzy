import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // GIF uploads go through a Server Action; Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // The app lives at bzzy.ca (docs/domains.md). People on the old bzzy.vercel.app address
  // are sent there, but the device API and built-in GIFs keep answering on the old host:
  // a light saves its app URL in flash and doesn't follow redirects for API calls.
  async redirects() {
    return [
      {
        source: "/:path((?!api/device/|gifs/).*)",
        has: [{ type: "host", value: "bzzy.vercel.app" }],
        destination: "https://bzzy.ca/:path",
        permanent: true,
      },
    ];
  },
  // Search engines should only list bzzy.ca. The old host keeps serving lights (see above) but
  // everything it still answers is marked noindex, and so is the API on every host.
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      { source: "/:path*", has: [{ type: "host", value: "bzzy.vercel.app" }], headers: noindex },
      { source: "/api/:path*", headers: noindex },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
