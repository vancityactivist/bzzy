import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { SignIn } from "@/components/sign-in";
import { Badge, Card, Container } from "@/components/ui";
import { devicesForUser } from "@/lib/devices";
import { firmwareState } from "@/lib/firmware";
import { releaseForPage } from "@/lib/firmware-release";
import { isOnline } from "@/lib/poll-writes";
import { nowSeconds } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";
import { sharedTeamsForUser } from "@/lib/teams";

import { DeviceFirmware } from "../device-firmware";
import { DeviceActions } from "../device-forms";
import { absoluteTime, relativeTime } from "../relative-time";
import { LightSettings } from "./light-settings";

export const metadata: Metadata = { title: "Light" };

export default function LightPage({ params, searchParams }: PageProps<"/lights/[id]">) {
  return (
    <Container size="narrow">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <LightContent params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function LightContent({ params, searchParams }: Pick<PageProps<"/lights/[id]">, "params" | "searchParams">) {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const [{ id }, { added }] = await Promise.all([params, searchParams]);
  const [devices, release, shared] = await Promise.all([devicesForUser(user.id), releaseForPage(), sharedTeamsForUser(user.id)]);
  const d = devices.find((x) => x.id === id);
  if (!d || !d.canManage) notFound();
  const isOwner = d.ownerUserId === user.id;
  const now = nowSeconds() * 1000;
  const online = isOnline(d.lastSeenAt, now, d.pollSec);
  // Its team, which is also whose announcements it shows ("" = just its owner). A light
  // set up before teams and announcements were one setting can be in no team but still
  // show a team's announcements: "legacy" keeps that until its owner picks something.
  const legacyPush = d.teamPersonal && d.pushTeamName ? d.pushTeamName : null;
  const team = d.teamPersonal ? (legacyPush ? "legacy" : "") : d.teamId;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={isOwner ? "/lights" : `/teams/${d.teamId}`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ChevronRightIcon className="size-4 rotate-180" />
          {isOwner ? "Lights" : d.teamName}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{d.name}</h1>
          {online ? (
            <Badge tone="free">Online</Badge>
          ) : (
            <Badge title={d.lastSeenAt ? absoluteTime(d.lastSeenAt) : undefined}>
              {d.lastSeenAt ? `Seen ${relativeTime(d.lastSeenAt, now)}` : "Never connected"}
            </Badge>
          )}
          <div className="ml-auto flex items-center">
            <DeviceActions deviceId={d.id} name={d.name} />
          </div>
        </div>
      </div>

      {added && (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-free/10 p-4 text-sm ring-1 ring-inset ring-free/30">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-free" />
          <span>
            Added. It should say &ldquo;All set&rdquo; on its screen within a few seconds. It follows you and uses your{" "}
            <Link href="/look" className="underline underline-offset-2">
              look
            </Link>
            .
          </span>
        </div>
      )}

      <Card className="py-1 sm:py-1">
        <LightSettings
          deviceId={d.id}
          name={d.name}
          isOwner={isOwner}
          canManage={d.canManage}
          followsOwner={d.followsOwner}
          defaultStatus={d.defaultStatus}
          team={team}
          legacyPush={legacyPush}
          teams={shared.map((t) => ({ id: t.id, name: t.name }))}
          allowFlash={d.ring.allowFlash}
        />
      </Card>

      <Card>
        <h2 className="text-sm font-medium">Updates</h2>
        <div className="mt-1">
          <DeviceFirmware
            deviceId={d.id}
            state={firmwareState(d.firmware, release?.manifest, nowSeconds())}
            autoUpdate={d.firmware.autoUpdate}
            canManage={d.canManage}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Light ID <code className="font-mono">{d.id}</code>
        </p>
      </Card>
    </div>
  );
}
