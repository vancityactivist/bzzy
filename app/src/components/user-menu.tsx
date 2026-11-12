import Link from "next/link";

import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/session";

import { AccountMenu } from "./account-menu";
import { NavLinks, TabBar } from "./site-nav";
import { buttonClass } from "./ui";

// The request-time parts of the app shell. Each reads the session, so the layout renders
// them inside <Suspense>.

// Header, right of the wordmark. Signed in: section pills (sm and up) and the account menu.
// Signed out: just a Sign in button.
export async function HeaderNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/#sign-in" className={buttonClass("secondary", "sm", "ml-auto")}>
        Sign in
      </Link>
    );
  }
  const admin = await isAdmin(user.id);
  return (
    <>
      <NavLinks className="hidden sm:flex" />
      <div className="ml-auto">
        <AccountMenu name={user.name} image={user.image} admin={admin} />
      </div>
    </>
  );
}

// The phone tab bar, signed in only.
export async function MobileNav() {
  const user = await getCurrentUser();
  return user ? <TabBar /> : null;
}
