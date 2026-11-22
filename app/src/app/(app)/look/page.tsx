import type { Metadata } from "next";
import { Suspense } from "react";

import { SignIn } from "@/components/sign-in";
import { Container, PageHeader } from "@/components/ui";
import { devicesForUser } from "@/lib/devices";
import { gifPrefsForUser } from "@/lib/gif-prefs";
import { BUILTIN_GIFS, DEFAULT_BUILTIN, editableAssets, gifsForUser, userGifChoices } from "@/lib/gifs";
import { getLook } from "@/lib/look";
import { hasFeature, STATUSES, type Status } from "@/lib/protocol";
import { statusLabel } from "@/lib/status-labels";
import { getCurrentUser } from "@/lib/session";
import { teamsForUser } from "@/lib/teams";

import { AddGifCard } from "./gif-forms";
import { GifLibrary, type LibraryItem } from "./gif-library";
import { type GifOption, LookEditor } from "./look-editor";

export const metadata: Metadata = { title: "Look" };

export default function LookPage() {
  return (
    <Container>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <LookContent />
      </Suspense>
    </Container>
  );
}

async function LookContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const [uploads, teams, prefs, devices, choices, look] = await Promise.all([
    gifsForUser(user.id),
    teamsForUser(user.id),
    gifPrefsForUser(user.id),
    devicesForUser(user.id),
    userGifChoices(user.id),
    getLook(user.id),
  ]);
  const editable = await editableAssets(user.id, uploads);

  // Which status each GIF is used for: "Busy".
  const usedBy = new Map<string, string[]>();
  for (const s of STATUSES) {
    const choice = choices[s] === "default" ? `builtin:${DEFAULT_BUILTIN[s]}` : choices[s];
    if (choice === "none") continue;
    usedBy.set(choice, [...(usedBy.get(choice) ?? []), statusLabel(s, look.statusLabels)]);
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
        madeFor: g.status ? statusLabel(g.status, look.statusLabels) : null,
        addedAt: 0,
        editable: false,
        usedBy: usedBy.get(choice) ?? [],
        ...pref(choice),
      };
    }),
  ];

  const builtinOptions: GifOption[] = BUILTIN_GIFS.map((g) => ({ value: `builtin:${g.id}`, label: `Built in: ${g.name}`, src: g.path }));
  const defaults = Object.fromEntries(
    STATUSES.map((s) => {
      const g = BUILTIN_GIFS.find((b) => b.id === DEFAULT_BUILTIN[s])!;
      return [s, { value: "default", label: g.name, src: g.path }];
    }),
  ) as Record<Status, GifOption>;
  const options: GifOption[] = [
    ...uploads.map((u) => ({ value: `asset:${u.id}`, label: shared.has(u.teamId) ? `${u.name} (${shared.get(u.teamId)})` : u.name, src: `/api/gifs/${u.id}` })),
    ...builtinOptions,
  ];
  const mine = devices.filter((d) => d.ownerUserId === user.id);
  const following = mine.map((d) => d.name);
  // Lights that follow you whose firmware can't draw your own status names yet.
  const olderFirmware = mine.filter((d) => d.followsOwner && !hasFeature(d.features, "labels")).map((d) => d.name);

  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <PageHeader
          title="Look"
          description="What each status looks like on every light that follows you. Set it once and a new light looks the same the moment it's added."
        />
        <LookEditor
          gifs={choices}
          options={options}
          defaults={defaults}
          ledStyles={look.ledStyles}
          meetingWarn={look.meetingWarn}
          statusLabels={look.statusLabels}
          lights={following}
          olderFirmware={olderFirmware}
        />
      </section>
      <section id="library" className="scroll-mt-20 space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your GIFs</h2>
          <p className="mt-1 text-sm text-muted">Point at one to try it on your light. Press play to show it now.</p>
        </div>
        <GifLibrary items={items} add={<AddGifCard />} />
      </section>
    </div>
  );
}
