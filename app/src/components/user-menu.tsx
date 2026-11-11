import Link from "next/link";

import { signOutAction } from "@/app/actions";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/session";

export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/#sign-in" className="rounded-md border border-line px-2 py-1 hover:bg-card">
        Sign in
      </Link>
    );
  }
  return (
    <form action={signOutAction} className="flex items-center gap-3">
      <span className="text-muted">{user.name}</span>
      <button className="rounded-md border border-line px-2 py-1 hover:bg-card">Sign out</button>
    </form>
  );
}

// The app's own pages, shown only when signed in. Signed out, the nav is just the wordmark.
export async function AppLinks() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <>
      <Link href="/" className="text-muted hover:text-foreground">
        Status
      </Link>
      <Link href="/devices" className="text-muted hover:text-foreground">
        Devices
      </Link>
      <Link href="/gifs" className="text-muted hover:text-foreground">
        GIFs
      </Link>
      <Link href="/settings" className="text-muted hover:text-foreground">
        Settings
      </Link>
      {(await isAdmin(user.id)) && (
        <Link href="/admin" className="text-muted hover:text-foreground">
          Admin
        </Link>
      )}
    </>
  );
}
