import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ChevronRightIcon, UsersIcon } from "@/components/icons";
import { SignIn } from "@/components/sign-in";
import { Badge, Card, Container, EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { sharedTeamsForUser } from "@/lib/teams";

import { CreateTeamForm } from "./team-forms";

export const metadata: Metadata = { title: "Team" };

export default function TeamsPage({ searchParams }: PageProps<"/teams">) {
  return (
    <Container size="narrow">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <TeamsContent searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

async function TeamsContent({ searchParams }: { searchParams: PageProps<"/teams">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const teams = await sharedTeamsForUser(user.id);
  // Most people are in one team: the Team tab goes straight to it. Its "All teams" link
  // comes back here with ?all, to make another team.
  if (teams.length === 1 && !("all" in (await searchParams))) redirect(`/teams/${teams[0].id}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Team" description="Share your office's lights. Each person keeps their own account, lights and status." />

      {teams.length > 0 ? (
        <ul className="space-y-3">
          {teams.map((t) => (
            <li key={t.id}>
              <Link href={`/teams/${t.id}`} className="group block rounded-2xl">
                <Card className="flex items-center gap-3 transition-colors group-hover:border-line-strong">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted-foreground">
                    <UsersIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold tracking-tight">{t.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t.members} {t.members === 1 ? "person" : "people"}
                    </p>
                  </div>
                  <Badge tone={t.role === "member" ? "neutral" : "inverse"}>{ROLE_LABEL[t.role]}</Badge>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<UsersIcon />} title="You're not in a team yet">
          Make one for your office below, or ask whoever runs yours for an invite link.
        </EmptyState>
      )}

      <CreateTeamForm first={teams.length === 0} />
    </div>
  );
}
