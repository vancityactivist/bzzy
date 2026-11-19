"use client";

import { useActionState, useEffect, useId, useRef, useTransition } from "react";

import { CheckIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Button, Field, Input, Select } from "@/components/ui";
import { DEFAULT_EXPIRY_DAYS, DEFAULT_SCOPES, SCOPE_INFO, SCOPES, TOKEN_EXPIRY_DAYS } from "@/lib/api-rules";

import { createApiTokenAction, type NewTokenResult, revokeApiTokenAction } from "@/app/actions";
import { CopyButton } from "../devices/copy-button";

const expiryLabel = (d: number) => (d === 0 ? "Never" : d === 365 ? "1 year" : `${d} days`);

export function NewApiTokenForm({ first }: { first: boolean }) {
  const [state, action, pending] = useActionState<NewTokenResult, FormData>(createApiTokenAction, null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <div className="space-y-4">
      {state?.ok && (
        <div role="status" className="rounded-xl bg-free/10 p-4 text-sm ring-1 ring-inset ring-free/30">
          <p className="flex items-start gap-2 font-medium">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-free" />
            <span>
              Here&apos;s &ldquo;{state.name}&rdquo;. It&apos;s only shown once, so copy it into your integration now. Treat it
              like a password.
            </span>
          </p>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2">
            <span className="min-w-0 font-mono text-[13px] break-all">{state.token}</span>
            <CopyButton value={state.token} label="token" />
          </div>
        </div>
      )}
      <form ref={form} action={action} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field label="Name" htmlFor={`${id}-name`} hint="What it's for, so you know which to revoke." className="min-w-0 flex-1">
            <Input id={`${id}-name`} name="name" required maxLength={60} placeholder={first ? "Stream Deck" : "Home Assistant"} />
          </Field>
          <Field label="Expires" htmlFor={`${id}-exp`} className="sm:w-36">
            <Select id={`${id}-exp`} name="expiryDays" defaultValue={String(DEFAULT_EXPIRY_DAYS)}>
              {TOKEN_EXPIRY_DAYS.map((d) => (
                <option key={d} value={d}>
                  {expiryLabel(d)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">It can</legend>
          {SCOPES.map((s) => (
            <label key={s} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="scopes"
                value={s}
                defaultChecked={DEFAULT_SCOPES.includes(s)}
                className="mt-0.5 size-4 accent-foreground"
              />
              <span>
                <span className="font-medium">{SCOPE_INFO[s].label}</span>
                <span className="text-muted-foreground"> · {SCOPE_INFO[s].detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Button variant="primary" disabled={pending}>
          <PlusIcon />
          {pending ? "Making…" : "Make token"}
        </Button>
        {state?.ok === false && (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}

export function RevokeApiToken({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (confirm(`Revoke "${name}"? Anything using it stops working straight away.`)) start(() => revokeApiTokenAction(id));
      }}
    >
      <TrashIcon />
      {pending ? "Working…" : "Revoke"}
    </Button>
  );
}
