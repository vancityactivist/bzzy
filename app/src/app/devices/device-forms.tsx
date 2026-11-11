"use client";

import { useActionState, useState, useTransition } from "react";

import { addDevice, newDeviceToken, removeDevice, type NewDeviceResult } from "../actions";

function Credentials({ id, token }: { id: string; token: string }) {
  return (
    <div className="mt-4 rounded-lg border border-free/40 bg-free/10 p-4 text-sm">
      <p className="font-medium">Type these into the device&apos;s setup page. The token is only shown once.</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">App URL</dt>
        <dd className="font-mono break-all">{typeof window !== "undefined" ? window.location.origin : ""}</dd>
        <dt className="text-muted">Device ID</dt>
        <dd className="font-mono">{id}</dd>
        <dt className="text-muted">Token</dt>
        <dd className="font-mono break-all">{token}</dd>
      </dl>
      <p className="mt-3 text-muted">
        To open the setup page: hold BOOT while plugging the device in, then join the <code>bzzy-setup</code> Wi-Fi
        network from your phone.
      </p>
    </div>
  );
}

export function AddDeviceForm() {
  const [state, action, pending] = useActionState<NewDeviceResult, FormData>(addDevice, null);
  return (
    <section className="rounded-xl border border-line bg-card p-6">
      <h2 className="font-semibold">Add a device</h2>
      <form action={action} className="mt-3 flex gap-2">
        <input
          name="name"
          required
          maxLength={60}
          placeholder="Desk light"
          className="min-w-0 flex-1 rounded-md border border-line bg-background px-3 py-2"
        />
        <button
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {state?.ok === false && <p className="mt-2 text-sm text-busy">{state.error}</p>}
      {state?.ok && <Credentials id={state.id} token={state.token} />}
    </section>
  );
}

export function DeviceActions({ deviceId }: { deviceId: string }) {
  const [result, setResult] = useState<NewDeviceResult>(null);
  const [pending, start] = useTransition();
  return (
    <div className="w-full sm:w-auto">
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => {
            if (confirm("Make a new token? The device stops syncing until you enter it.")) {
              start(async () => setResult(await newDeviceToken(deviceId)));
            }
          }}
          className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-background"
        >
          New token
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm("Remove this device?")) start(() => removeDevice(deviceId));
          }}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-busy hover:bg-background"
        >
          Remove
        </button>
      </div>
      {result?.ok === false && <p className="mt-2 text-sm text-busy">{result.error}</p>}
      {result?.ok && <Credentials id={result.id} token={result.token} />}
    </div>
  );
}
