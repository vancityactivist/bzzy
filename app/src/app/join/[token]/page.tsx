import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { UsersIcon } from "@/components/icons";
import { buttonClass, Card } from "@/components/ui";
import { roleInTeam, lookupInvite } from "@/lib/teams";
import { getCurrentUser } from "@/lib/session";

import { JoinButton, NewAccountForm, SignInToJoin } from "./join-forms";

export const metadata: Metadata = { title: "Join a team", robots: { index: false } };

export default function JoinPage(props: PageProps<"/join/[token]">) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <Suspense fallback={<p className="text-center text-muted">Loading…</p>}>
        <JoinContent {...props} />
      </Suspense>
    </div>
  );
}

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span aria-hidden className="flex size-11 items-center justify-center rounded-xl bg-subtle text-muted">
        <UsersIcon className="size-5" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">{title}</h1>
      {children && <p className="mt-1.5 text-sm text-pretty text-muted">{children}</p>}
    </div>
  );
}

async function JoinContent({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  // The session first: it marks the page as request-time before the invite check reads the clock.
  const user = await getCurrentUser();
  const invite = await lookupInvite(token);

  if (!invite) {
    return (
      <Card className="p-6 sm:p-8">
        <Header title="This invite link doesn't work">Check you copied all of it, or ask whoever sent it for a new one.</Header>
      </Card>
    );
  }

  const already = user ? await roleInTeam(user.id, invite.teamId) : null;
  if (already) {
    return (
      <Card className="p-6 sm:p-8">
        <Header title={`You're already in ${invite.teamName}`} />
        <Link href={`/teams/${invite.teamId}`} className={buttonClass("primary", "md", "mt-6 w-full")}>
          Open the team
        </Link>
      </Card>
    );
  }

  if (invite.state !== "live") {
    return (
      <Card className="p-6 sm:p-8">
        <Header title={`This invite to ${invite.teamName} has ${invite.state === "used" ? "been used" : invite.state === "revoked" ? "been revoked" : "expired"}`}>
          Ask your team&apos;s admin for a new link.
        </Header>
      </Card>
    );
  }

  const people = `${invite.members} ${invite.members === 1 ? "person" : "people"}`;
  const as = invite.role === "admin" ? " as an admin" : "";

  return (
    <Card className="p-6 sm:p-8">
      <Header title={`Join ${invite.teamName}`}>
        You&apos;ve been invited{as}. {people} already share their status here.
      </Header>
      <div className="mt-6">
        {user ? (
          <JoinButton token={token} teamName={invite.teamName} />
        ) : (
          <div className="space-y-6">
            <NewAccountForm token={token} teamName={invite.teamName} />
            <div className="border-t border-line pt-5">
              <p className="mb-3 text-center text-sm text-muted">Already use bzzy?</p>
              <SignInToJoin token={token} />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
