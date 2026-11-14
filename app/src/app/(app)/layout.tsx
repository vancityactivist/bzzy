import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";

// The signed-in app (devices, GIFs, teams, settings, admin, sign-in, invites) is no use to a
// searcher, so keep it out of results. Links on these pages can still be followed.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
