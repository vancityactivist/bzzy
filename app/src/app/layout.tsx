import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

// Not preloaded: the signed-out landing page uses its own fonts (SUSE, JetBrains Mono), and a
// preload would fetch Geist there too. The app's pages fetch it as soon as text uses it.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], preload: false });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });

const TITLE = "bzzy: a desk status light for heads-down work";
const DESCRIPTION =
  "bzzy is a small status light for your monitor. Set Free, Busy, Do not disturb or Away from your phone, your calendar or the light itself.";

export const metadata: Metadata = {
  metadataBase: new URL("https://bzzy.ca"),
  title: { template: "%s · bzzy", default: TITLE },
  description: DESCRIPTION,
  applicationName: "bzzy",
  openGraph: { type: "website", siteName: "bzzy", url: "/", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  colorScheme: "light dark",
  // Lets the phone tab bar reach under the home indicator (it pads itself with safe-area-inset-bottom).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The landing page sets data-* and classes on <html> before hydration (components/landing.tsx).
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
