import { Suspense } from "react";

import { SignIn } from "@/components/sign-in";
import { devicesForUser } from "@/lib/devices";
import { BUILTIN_GIFS, DEFAULT_BUILTIN, deviceGifChoices, gifsForUser } from "@/lib/gifs";
import { STATUSES, type Status } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";

import { AddDeviceForm, DeviceActions } from "./device-forms";
import { DeviceScreens, type GifOption } from "./device-screens";

export default function DevicesPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <DevicesContent />
    </Suspense>
  );
}

function seen(d: Date | null) {
  if (!d) return "Never connected";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "Online";
  if (mins < 60) return `Last seen ${mins} min ago`;
  return `Last seen ${d.toLocaleString("en-CA", { timeZone: "America/Vancouver" })}`;
}

async function DevicesContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const [devices, uploads] = await Promise.all([devicesForUser(user.id), gifsForUser(user.id)]);
  const choices = await Promise.all(devices.map((d) => (d.canManage ? deviceGifChoices(d.id) : null)));
  const builtinOptions: GifOption[] = BUILTIN_GIFS.map((g) => ({ value: `builtin:${g.id}`, label: `Built in: ${g.name}`, src: g.path }));
  const defaults = Object.fromEntries(
    STATUSES.map((s) => [s, builtinOptions.find((o) => o.value === `builtin:${DEFAULT_BUILTIN[s]}`)!]),
  ) as Record<Status, GifOption>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Devices</h1>
        <p className="text-sm text-muted">Each light shows its owner&apos;s status.</p>
      </div>

      {devices.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {devices.map((d, i) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{d.name}</p>
                <p className="text-sm text-muted">
                  <code className="font-mono">{d.id}</code> · {d.teamName} · {seen(d.lastSeenAt)}
                </p>
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
            </li>
          ))}
        </ul>
      )}

      <AddDeviceForm />
    </div>
  );
}
