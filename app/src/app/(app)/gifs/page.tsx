import type { Metadata } from "next";
import { Suspense } from "react";

import { SignIn } from "@/components/sign-in";
import { STATUS_META } from "@/components/status-meta";
import { Container, PageHeader } from "@/components/ui";
import { devicesForUser } from "@/lib/devices";
import { gifPrefsForUser } from "@/lib/gif-prefs";
import { BUILTIN_GIFS, DEFAULT_BUILTIN, deviceGifChoices, editableAssets, gifsForUser } from "@/lib/gifs";
import { STATUSES } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";
import { teamsForUser } from "@/lib/teams";

import { AddGifCard } from "./gif-forms";
import { GifLibrary, type LibraryItem } from "./gif-library";

export const metadata: Metadata = { title: "GIFs" };

export default function GifsPage() {
  return (
    <Container>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <GifsContent />
      </Suspense>
    </Container>
  );
}

async function GifsContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const [uploads, teams, prefs, devices] = await Promise.all([
    gifsForUser(user.id),
    teamsForUser(user.id),
    gifPrefsForUser(user.id),
    devicesForUser(user.id),
  ]);
  const [editable, choices] = await Promise.all([
    editableAssets(user.id, uploads),
    Promise.all(devices.map(async (d) => ({ device: d, choices: await deviceGifChoices(d.id) }))),
  ]);

  // Which lights show each GIF, and for which status: "Desk light · Busy".
  const usedBy = new Map<string, string[]>();
  for (const { device, choices: c } of choices) {
    for (const s of STATUSES) {
      const choice = c[s] === "default" ? `builtin:${DEFAULT_BUILTIN[s]}` : c[s];
      if (choice === "none") continue;
      usedBy.set(choice, [...(usedBy.get(choice) ?? []), `${device.name} · ${STATUS_META[s].label}`]);
    }
  }
  // Uploads to a shared team are everyone's in it: say which team, so a GIF someone else
  // added isn't a surprise.
  const shared = new Map(teams.filter((t) => !t.personal).map((t) => [t.id, t.name]));
  const pref = (choice: string) => prefs.get(choice) ?? { favourite: false, lastShownAt: 0 };

  const items: LibraryItem[] = [
    ...uploads.map((g) => {
      const choice = `asset:${g.id}`;
      return {
        choice,
        id: g.id,
        name: g.name,
        src: `/api/gifs/${g.id}`,
        source: shared.has(g.teamId) ? ("team" as const) : ("mine" as const),
        team: shared.get(g.teamId) ?? null,
        bytes: g.bytes,
        madeFor: null,
        addedAt: g.createdAt.getTime(),
        editable: editable.has(g.id),
        usedBy: usedBy.get(choice) ?? [],
        ...pref(choice),
      };
    }),
    ...BUILTIN_GIFS.map((g) => {
      const choice = `builtin:${g.id}`;
      return {
        choice,
        id: null,
        name: g.name,
        src: g.path,
        source: "builtin" as const,
        team: null,
        bytes: g.bytes,
        madeFor: g.status ? STATUS_META[g.status].label : null,
        addedAt: 0,
        editable: false,
        usedBy: usedBy.get(choice) ?? [],
        ...pref(choice),
      };
    }),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="GIFs" description="Point at one to try it on your light. Press play to put it on for real." />
      <GifLibrary items={items} add={<AddGifCard />} />
    </div>
  );
}
