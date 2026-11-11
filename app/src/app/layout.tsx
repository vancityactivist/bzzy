import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";

import { AppLinks, UserMenu } from "@/components/user-menu";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "bzzy",
  description: "Set your desk light's status from anywhere.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-2xl items-center gap-5 px-4 py-3 text-sm">
            <Link href="/" className="text-base font-semibold tracking-tight">
              bzzy
            </Link>
            <Suspense fallback={null}>
              <AppLinks />
            </Suspense>
            <div className="ml-auto">
              <Suspense fallback={null}>
                <UserMenu />
              </Suspense>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
