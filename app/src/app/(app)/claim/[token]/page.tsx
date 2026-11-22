import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BzzyMark } from "@/components/brand";
import { buttonClass, Card } from "@/components/ui";
import { lookupClaimLink } from "@/lib/provision";
import { getCurrentUser } from "@/lib/session";

import { ContinueButton } from "../claim-forms";

export const metadata: Metadata = { title: "Set up your account", robots: { index: false } };

// From the "set up your bzzy account" email (docs/provisioning.md). Opening the link
// only shows a button, because mail scanners open links too; pressing it signs in.
export default function ClaimPage(props: PageProps<"/claim/[token]">) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <Suspense fallback={<p className="text-center text-muted">Loading…</p>}>
        <ClaimContent {...props} />
      </Suspense>
    </div>
  );
}

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      <BzzyMark className="size-11" />
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">{title}</h1>
      {children && <p className="mt-2 text-sm text-pretty text-muted">{children}</p>}
    </div>
  );
}

async function ClaimContent({ params }: PageProps<"/claim/[token]">) {
  const { token } = await params;
  const user = await getCurrentUser();
  const link = await lookupClaimLink(token);

  if (!link || link.state !== "live") {
    return (
      <Card className="p-6 sm:p-8">
        <Header title={link ? "This link has run out" : "This link has been used"}>
          {user
            ? "You're signed in, so you're all set."
            : "If you already set up your account, sign in with your passkey or GitHub. If not, reply to your order email and we'll send a new link."}
        </Header>
        <Link href={user ? "/lights" : "/"} className={buttonClass("primary", "md", "mt-6 w-full")}>
          {user ? "Open your lights" : "Sign in"}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <Header title="Set up your bzzy account">
        {link.lights === 1 ? "Your light is" : "Your lights are"} waiting in an account for <strong className="text-foreground">{link.email}</strong>. Continue to sign in, then add a passkey or GitHub
        for next time.
      </Header>
      <div className="mt-6">
        <ContinueButton token={token} />
      </div>
      {user && <p className="mt-4 text-center text-xs text-muted">You&apos;re signed in as someone else. Continuing switches to this account.</p>}
    </Card>
  );
}
