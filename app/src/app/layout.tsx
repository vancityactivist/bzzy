import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Host_Grotesk } from "next/font/google";

import { SITE_NAME, SITE_URL } from "@/lib/site";

import "./globals.css";

// One pair of faces for the whole site (Console, app/tokens.css): Host Grotesk for what a person
// reads, Atkinson Hyperlegible Mono for what the light or the server measured.
const hostGrotesk = Host_Grotesk({ variable: "--font-host", subsets: ["latin"], weight: ["400", "500"] });
const atkinsonMono = Atkinson_Hyperlegible_Mono({
  variable: "--font-atkinson-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  preload: false,
});

const TITLE = "bzzy: a desk status light for heads-down work";
const DESCRIPTION =
  "bzzy is a small status light for your monitor. Set Free, Busy, Do not disturb or Away from your phone, your calendar or the light itself.";

// Share images come from opengraph-image.jpg and twitter-image.jpg next to this file.
// Pages that are public set their own canonical URL (page.tsx); the app's pages are noindex.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { template: "%s · bzzy", default: TITLE },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_CA", url: "/", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    // Console's paper and graphite grounds (tokens.css), as hex because browsers want a plain colour here.
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#16191c" },
  ],
  colorScheme: "light dark",
  // Lets the phone tab bar reach under the home indicator (it pads itself with safe-area-inset-bottom).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${hostGrotesk.variable} ${atkinsonMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
