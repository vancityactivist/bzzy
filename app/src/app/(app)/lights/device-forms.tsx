"use client";

import { useActionState, useState, useTransition } from "react";

import { CheckIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { MoreMenu } from "@/components/more-menu";
import { Button, Field, Input } from "@/components/ui";

import { addDevice, newDeviceToken, removeDevice, type NewDeviceResult } from "@/app/actions";
import { CopyButton } from "./copy-button";

function Credentials({ id, token }: { id: string; token: string }) {
  const rows = [
    { label: "App URL", value: typeof window !== "undefined" ? window.location.origin : "" },
    { label: "Device ID", value: id },
    { label: "Token", value: token },
  ];
  return (
    <div
      role="status"
      className="w-full rounded-xl bg-free/10 p-4 text-sm ring-1 ring-inset ring-free/30"
    >
      <p className="flex items-start gap-2 font-medium">
        <CheckIcon className="mt-0.5 size-4 shrink-0 text-free" />
        <span>Type these into the device&apos;s setup page. The token is only shown once, so copy it now.</span>
      </p>
      <dl className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-line bg-card px-3 py-2">
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className="flex items-center justify-between gap-2">
              <span className="min-w-0 font-mono text-[13px] break-all">{r.value}</span>
              <CopyButton value={r.value} label={r.label} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-muted">
        To open the setup page: hold the top button (or BOOT) while plugging the light in, scan the Wi-Fi code on its
        screen, then open <span className="font-medium text-foreground">Advanced: set up by hand</span>.
      </p>
    </div>
  );
}

export function AddDeviceForm() {
  const [state, action, pending] = useActionState<NewDeviceResult, FormData>(addDevice, null);
  return (
    <div>
      <p className="text-sm text-muted">Give it a name here, then type the details into the light&apos;s own setup page.</p>
      <form action={action} className="mt-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Name" htmlFor="device-name" className="flex-1" error={state?.ok === false ? state.error : undefined}>
            <Input id="device-name" name="name" required maxLength={60} placeholder="Desk light" aria-invalid={state?.ok === false || undefined} />
          </Field>
          <Button variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add light"}
          </Button>
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" name="autoUpdate" defaultChecked className="mt-0.5 size-4 shrink-0 accent-foreground" />
          <span>
            Update the firmware automatically
            <span className="block text-muted">New versions install when you&apos;re free or away. You can change this later.</span>
          </span>
        </label>
      </form>
      {state?.ok && (
        <div className="mt-4">
          <Credentials id={state.id} token={state.token} />
        </div>
      )}
    </div>
  );
}

/** Renders as flex items of the device row: the buttons, then (when there is one) a full-width panel. */
export function DeviceActions({ deviceId, name }: { deviceId: string; name: string }) {
  const [result, setResult] = useState<NewDeviceResult>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <MoreMenu
        label={`More for ${name}`}
        items={[
          {
            label: "New token",
            icon: <RefreshIcon />,
            disabled: pending,
            onSelect: () => {
              if (confirm(`Make a new token for ${name}? It stops syncing until you enter the new one.`)) {
                start(async () => setResult(await newDeviceToken(deviceId)));
              }
            },
          },
          {
            label: "Remove light",
            icon: <TrashIcon />,
            danger: true,
            disabled: pending,
            onSelect: () => {
              if (confirm(`Remove ${name}? It stops showing your status until it's paired again.`)) start(() => removeDevice(deviceId));
            },
          },
        ]}
      />
      {result?.ok === false && (
        <p className="w-full text-sm text-danger" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && <Credentials id={result.id} token={result.token} />}
    </>
  );
}
