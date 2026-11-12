import type { Metadata } from "next";
import { Suspense } from "react";

import { DeviceIcon } from "@/components/icons";
import { SignIn } from "@/components/sign-in";
import { Badge, Card, Container, EmptyState, PageHeader } from "@/components/ui";
import { devicesForUser } from "@/lib/devices";
import { BUILTIN_GIFS, DEFAULT_BUILTIN, deviceGifChoices, gifsForUser } from "@/lib/gifs";
import { STATUSES, type Status } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";

import { AddDeviceForm, DeviceActions } from "./device-forms";
import { DeviceScreens, type GifOption } from "./device-screens";
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

function SeenBadge({ lastSeenAt, now }: { lastSeenAt: Date | null; now: Date }) {
  if (!lastSeenAt) return <Badge>Never connected</Badge>;
  const mins = Math.round((now.getTime() - lastSeenAt.getTime()) / 60000);
  if (mins < 2) return <Badge tone="free" title={absoluteTime(lastSeenAt)}>Online</Badge>;
  return <Badge title={absoluteTime(lastSeenAt)}>Last seen {relativeTime(lastSeenAt, now.getTime())}</Badge>;
}

async function DevicesContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const now = new Date();
  const [devices, uploads] = await Promise.all([devicesForUser(user.id), gifsForUser(user.id)]);
  const choices = await Promise.all(devices.map((d) => (d.canManage ? deviceGifChoices(d.id) : null)));
  const builtinOptions: GifOption[] = BUILTIN_GIFS.map((g) => ({ value: `builtin:${g.id}`, label: `Built in: ${g.name}`, src: g.path }));
  const defaults = Object.fromEntries(
    STATUSES.map((s) => [s, builtinOptions.find((o) => o.value === `builtin:${DEFAULT_BUILTIN[s]}`)!]),
  ) as Record<Status, GifOption>;

  return (
    <div className="space-y-6">
      <PageHeader title="Devices" description="Each light shows its owner's status." />

      {devices.length > 0 ? (
        <ul className="space-y-6">
          {devices.map((d, i) => (
            <li key={d.id}>
              <Card className="flex flex-wrap items-center gap-x-4 gap-y-4">
                <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                    <DeviceIcon />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h2 className="truncate font-semibold tracking-tight">{d.name}</h2>
                      <SeenBadge lastSeenAt={d.lastSeenAt} now={now} />
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                      <span>{d.teamName}</span>
                      <span aria-hidden="true">·</span>
                      <code className="font-mono text-xs">{d.id}</code>
                    </p>
                  </div>
                </div>
                {d.canManage && <DeviceActions deviceId={d.id} />}
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
              </Card>
            </li>
          ))}
        </ul>
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
      A device is a bzzy light that sits on your desk and glows with your status. Add one below to get the details its
      setup page asks for.
    </EmptyState>
  );
}
