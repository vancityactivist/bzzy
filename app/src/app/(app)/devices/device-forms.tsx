"use client";

import { useActionState, useState, useTransition } from "react";

import { CheckIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";

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
        To open the setup page: hold BOOT while plugging the device in, then join the{" "}
        <code className="rounded bg-subtle px-1 font-mono text-[13px] text-foreground">bzzy-setup</code> Wi-Fi network
        from your phone.
      </p>
    </div>
  );
}

export function AddDeviceForm() {
  const [state, action, pending] = useActionState<NewDeviceResult, FormData>(addDevice, null);
  return (
    <Card>
      <CardHeader title="Add a device" description="Give it a name, then enter the details we show you on the device's setup page." />
      <form action={action} className="mt-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Name" htmlFor="device-name" className="flex-1" error={state?.ok === false ? state.error : undefined}>
            <Input id="device-name" name="name" required maxLength={60} placeholder="Desk light" aria-invalid={state?.ok === false || undefined} />
          </Field>
          <Button variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add device"}
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
    </Card>
  );
}

/** Renders as flex items of the device row: the buttons, then (when there is one) a full-width panel. */
export function DeviceActions({ deviceId }: { deviceId: string }) {
  const [result, setResult] = useState<NewDeviceResult>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            if (confirm("Make a new token? The device stops syncing until you enter it.")) {
              start(async () => setResult(await newDeviceToken(deviceId)));
            }
          }}
        >
          <RefreshIcon />
          New token
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (confirm("Remove this device?")) start(() => removeDevice(deviceId));
          }}
        >
          <TrashIcon />
          Remove
        </Button>
      </div>
      {result?.ok === false && (
        <p className="w-full text-sm text-danger" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && <Credentials id={result.id} token={result.token} />}
    </>
  );
}
