import type { Metadata } from "next";
import { Suspense } from "react";

import { ChevronRightIcon, DeviceIcon, PlusIcon } from "@/components/icons";
import { SignIn } from "@/components/sign-in";
import { Badge, buttonClass, Card, Container, EmptyState, PageHeader } from "@/components/ui";
import { devicesForUser } from "@/lib/devices";
import { firmwareState } from "@/lib/firmware";
import { isOnline } from "@/lib/poll-writes";
import { releaseForPage } from "@/lib/firmware-release";
import { BUILTIN_GIFS, DEFAULT_BUILTIN, deviceGifChoices, gifsForUser } from "@/lib/gifs";
import { nowSeconds, STATUSES, type Status } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";
import { sharedTeamsForUser } from "@/lib/teams";

import { DeviceFirmware } from "./device-firmware";
import { AddDeviceForm, DeviceActions } from "./device-forms";
import { DeviceRingSettings } from "./device-ring";
import { DeviceScreens, type GifOption } from "./device-screens";
import { PushTeamSelect } from "./push-team-select";
import { absoluteTime, relativeTime } from "./relative-time";

export const metadata: Metadata = { title: "Devices" };

export default function DevicesPage() {
  return (
    <Container size="narrow">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <DevicesContent />
      </Suspense>
    </Container>
  );
}

function SeenBadge({ lastSeenAt, pollSec, now }: { lastSeenAt: Date | null; pollSec: number; now: Date }) {
  if (!lastSeenAt) return <Badge>Never connected</Badge>;
  if (isOnline(lastSeenAt, now.getTime(), pollSec)) return <Badge tone="free" title={absoluteTime(lastSeenAt)}>Online</Badge>;
  return <Badge title={absoluteTime(lastSeenAt)}>Last seen {relativeTime(lastSeenAt, now.getTime())}</Badge>;
}

async function DevicesContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const now = new Date();
  const [devices, uploads, release, sharedTeams] = await Promise.all([
    devicesForUser(user.id),
    gifsForUser(user.id),
    releaseForPage(),
    sharedTeamsForUser(user.id),
  ]);
  const choices = await Promise.all(devices.map((d) => (d.canManage ? deviceGifChoices(d.id) : null)));
  const builtinOptions: GifOption[] = BUILTIN_GIFS.map((g) => ({ value: `builtin:${g.id}`, label: `Built in: ${g.name}`, src: g.path }));
  const defaults = Object.fromEntries(
    STATUSES.map((s) => [s, builtinOptions.find((o) => o.value === `builtin:${DEFAULT_BUILTIN[s]}`)!]),
  ) as Record<Status, GifOption>;

  // What's under a light's Settings, for its summary line.
  const settingsFor = (d: (typeof devices)[number], i: number) =>
    [
      d.ownerUserId === user.id && sharedTeams.length > 0 && "announcements",
      choices[i] && "screen and GIFs",
      d.canManage && "ring",
    ].filter((x): x is string => !!x);

  const card = (d: (typeof devices)[number]) => {
    const i = devices.indexOf(d);
    return (
      <li key={d.id}>
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-4">
          <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
              <DeviceIcon />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="truncate font-semibold tracking-tight">{d.name}</h2>
                <SeenBadge lastSeenAt={d.lastSeenAt} pollSec={d.pollSec} now={now} />
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                <span>{d.teamName}</span>
                <span aria-hidden="true">·</span>
                <code className="font-mono text-xs">{d.id}</code>
              </p>
            </div>
          </div>
          {d.canManage && <DeviceActions deviceId={d.id} name={d.name} />}
          <DeviceFirmware
            deviceId={d.id}
            state={firmwareState(d.firmware, release?.manifest, nowSeconds())}
            autoUpdate={d.firmware.autoUpdate}
            canManage={d.canManage}
          />
          {/* Everything you set once and rarely touch, folded away so the page is a list
              of lights rather than a wall of forms. */}
          {settingsFor(d, i).length > 0 && (
            <details className="group/settings w-full border-t border-line pt-3">
              <summary className="-mx-2 flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors select-none hover:bg-subtle [&::-webkit-details-marker]:hidden">
                <ChevronRightIcon className="size-4 shrink-0 text-muted transition-transform duration-150 group-open/settings:rotate-90" />
                Settings
                <span className="min-w-0 truncate font-normal text-muted">· {settingsFor(d, i).join(", ")}</span>
              </summary>
              <div className="mt-3 space-y-4">
                {d.ownerUserId === user.id && sharedTeams.length > 0 && (
                  <PushTeamSelect
                    deviceId={d.id}
                    value={d.pushTeamId}
                    teams={sharedTeams.map((t) => ({ id: t.id, name: t.name }))}
                  />
                )}
                {choices[i] && (
                  <DeviceScreens
                    deviceId={d.id}
                    defaultStatus={d.defaultStatus}
                    choices={choices[i]}
                    defaults={defaults}
                    options={[
                      ...uploads
                        .filter((u) => u.teamId === d.teamId)
                        .map((u) => ({ value: `asset:${u.id}`, label: u.name, src: `/api/gifs/${u.id}` })),
                      ...builtinOptions,
                    ]}
                  />
                )}
                {d.canManage && <DeviceRingSettings deviceId={d.id} ring={d.ring} defaultStatus={d.defaultStatus} />}
              </div>
            </details>
          )}
        </Card>
      </li>
    );
  };

  // Your own lights first, then lights of teams you manage, one group per team, so the
  // light you came to change isn't somewhere in the middle of everyone else's.
  const mine = devices.filter((d) => d.ownerUserId === user.id);
  const teamNames = [...new Set(devices.filter((d) => d.ownerUserId !== user.id).map((d) => d.teamName))];
  const groups = [
    ...(mine.length > 0 ? [{ key: "mine", title: "Your lights", devices: mine }] : []),
    ...teamNames.map((t, n) => ({
      key: `team-${n}`,
      title: `${t} lights`,
      devices: devices.filter((d) => d.ownerUserId !== user.id && d.teamName === t),
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices"
        description="Each light shows its owner's status."
        actions={
          <a href="#add-device" className={buttonClass("secondary", "sm")}>
            <PlusIcon />
            Add a light
          </a>
        }
      />

      {devices.length > 0 ? (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={groups.length > 1 ? `lights-${g.key}` : undefined} className="space-y-3">
            {groups.length > 1 && (
              <h2 id={`lights-${g.key}`} className="text-sm font-medium text-muted">
                {g.title}
              </h2>
            )}
            <ul className="space-y-6">{g.devices.map(card)}</ul>
          </section>
        ))
      ) : (
        <EmptyDevices />
      )}

      <AddDeviceForm />
    </div>
  );
}

function EmptyDevices() {
  return (
    <EmptyState icon={<DeviceIcon />} title="No devices yet">
      A device is a bzzy light that sits on your desk and glows with your status. Plug a new one in and follow its
      screen: it walks you through Wi-Fi, then shows a QR code that adds it here.
    </EmptyState>
  );
}
