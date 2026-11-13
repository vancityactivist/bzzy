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
