"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";

import { CheckIcon, PlusIcon, TrashIcon, WebhookIcon } from "@/components/icons";
import { Button, Field, Input } from "@/components/ui";
import { EVENT_INFO, WEBHOOK_EVENTS } from "@/lib/webhook-rules";

import {
  createWebhookAction,
  deleteWebhookAction,
  type NewWebhookResult,
  setWebhookEnabledAction,
  testWebhookAction,
  type WebhookTestResult,
} from "@/app/actions";
import { CopyButton } from "../lights/copy-button";

export function NewWebhookForm({ first }: { first: boolean }) {
  const [state, action, pending] = useActionState<NewWebhookResult, FormData>(createWebhookAction, null);
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
              Added. Here&apos;s its signing secret, only shown once. Give it to the receiver so it can check each event really came from bzzy.
            </span>
          </p>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2">
            <span className="min-w-0 font-mono text-[13px] break-all">{state.secret}</span>
            <CopyButton value={state.secret} label="signing secret" />
          </div>
        </div>
      )}
      <form ref={form} action={action} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field label="URL" htmlFor={`${id}-url`} hint="Where to send events. Has to be https://." className="min-w-0 flex-1">
            <Input
              id={`${id}-url`}
              name="url"
              type="url"
              required
              maxLength={2000}
              inputMode="url"
              placeholder="https://example.com/bzzy"
              autoComplete="off"
            />
          </Field>
          <Field label="Name" htmlFor={`${id}-desc`} className="sm:w-44">
            <Input id={`${id}-desc`} name="description" maxLength={100} placeholder={first ? "Home Assistant" : "Optional"} />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Send</legend>
          {WEBHOOK_EVENTS.map((e) => (
            <label key={e} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" name="events" value={e} defaultChecked className="mt-0.5 size-4 accent-foreground" />
              <span>
                <span className="font-medium">{EVENT_INFO[e].label}</span>
                <span className="text-muted"> · {EVENT_INFO[e].detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Button variant="primary" disabled={pending}>
          <PlusIcon />
          {pending ? "Adding…" : "Add webhook"}
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

export function WebhookActions({ id, url, enabled }: { id: string; url: string; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<WebhookTestResult>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" disabled={pending} onClick={() => start(async () => setResult(await testWebhookAction(id)))}>
          <WebhookIcon />
          {pending ? "Working…" : "Send test"}
        </Button>
        <Button size="sm" disabled={pending} onClick={() => start(() => setWebhookEnabledAction(id, !enabled))}>
          {enabled ? "Turn off" : "Turn on"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          aria-label={`Remove the webhook to ${url}`}
          onClick={() => {
            if (confirm(`Remove the webhook to ${url}? It stops getting events straight away.`)) start(() => deleteWebhookAction(id));
          }}
        >
          <TrashIcon />
          Remove
        </Button>
      </div>
      {result && (
        <p role="status" className={result.ok ? "text-sm text-free" : "text-sm text-danger"}>
          {result.message}
        </p>
      )}
    </div>
  );
}
