import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";

import { HeaderNav, MobileNav } from "@/components/user-menu";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const TITLE = "bzzy — a desk light that says when you're heads down";
const DESCRIPTION =
  "bzzy is a small status light for your monitor. Set Free, Busy, Do not disturb or Away from your phone, your calendar or the light itself.";

export const metadata: Metadata = {
  metadataBase: new URL("https://bzzy.vercel.app"),
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-line bg-background/75 backdrop-blur-lg backdrop-saturate-150">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              bzzy
            </Link>
            <Suspense fallback={null}>
              <HeaderNav />
            </Suspense>
          </div>
        </header>
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
        <Suspense fallback={null}>
          <MobileNav />
        </Suspense>
      </body>
    </html>
  );
}
