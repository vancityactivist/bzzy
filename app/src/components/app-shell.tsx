import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { HeaderNav, MobileNav } from "./user-menu";

// The app's chrome: skip link, sticky header, main and the phone tab bar. Every app page
// gets it from app/(app)/layout.tsx; the home page wraps its signed-in view in it by hand,
// because signed out it shows the landing page, which brings its own header and footer.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
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
    </>
  );
}
