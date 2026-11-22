import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BzzyMark } from "@/components/brand";
import { AddPasskey } from "@/components/passkey-buttons";
import { Button, buttonClass, Card } from "@/components/ui";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/session";
import { count, eq } from "drizzle-orm";

import { connectGitHub } from "../actions";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

// Right after a claim link: they're signed in this once. Ask for a way back in.
export default function ClaimWelcome() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <Suspense fallback={<p className="text-center text-muted">Loading…</p>}>
        <Welcome />
      </Suspense>
    </div>
  );
}

async function Welcome() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [[keys], [github]] = await Promise.all([
    db().select({ n: count() }).from(schema.authenticators).where(eq(schema.authenticators.userId, user.id)),
    db().select({ n: count() }).from(schema.accounts).where(eq(schema.accounts.userId, user.id)),
  ]);
  const hasPasskey = (keys?.n ?? 0) > 0;
  const hasGitHub = (github?.n ?? 0) > 0;
  const ready = hasPasskey || hasGitHub;

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <BzzyMark className="size-11" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">{ready ? "You're all set" : "You're in"}</h1>
        <p className="mt-2 text-sm text-pretty text-muted">
          {ready
            ? "Next time, sign in with your passkey or GitHub."
            : "This link only works once, so add a way to sign in next time. A passkey uses your phone or computer's lock, with no password."}
        </p>
      </div>
      <div className="mt-6 space-y-3">
        {!hasPasskey && <AddPasskey />}
        {!hasGitHub && (
          <form action={connectGitHub}>
            <Button className="w-full">Connect GitHub instead</Button>
          </form>
        )}
        <Link href="/lights" className={buttonClass(ready ? "primary" : "secondary", "md", "w-full")}>
          {ready ? "Open your lights" : "Skip for now"}
        </Link>
      </div>
    </Card>
  );
}
