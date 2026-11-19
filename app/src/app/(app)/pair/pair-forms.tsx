"use client";

import { signIn } from "next-auth/webauthn";
import { useActionState } from "react";

import { GithubIcon, KeyIcon } from "@/components/icons";
import { Button, Field, Input, Select } from "@/components/ui";

import { claimPairingAction, goToPairCode, type PairResult, signInWithGitHubToPair } from "./actions";

function ErrorLine({ message }: { message: string | null | undefined }) {
  return message ? (
    <p className="text-sm text-danger" role="alert">
      {message}
    </p>
  ) : null;
}

export function EnterCodeForm() {
  const [state, action, pending] = useActionState<PairResult, FormData>(goToPairCode, null);
  return (
    <form action={action} className="space-y-3">
      <Field label="Code on the light's screen" htmlFor="pair-code">
        <Input
          id="pair-code"
          name="code"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          placeholder="K7Q-F2M"
          className="text-center font-mono text-lg tracking-[0.2em] uppercase"
          aria-invalid={state?.ok === false || undefined}
        />
      </Field>
      <Button variant="primary" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
      <ErrorLine message={state?.ok === false ? state.error : null} />
    </form>
  );
}

export function ClaimForm({ code, teams }: { code: string; teams: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<PairResult, FormData>(claimPairingAction.bind(null, code), null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Name" htmlFor="pair-name" hint="So you can tell your lights apart.">
        <Input id="pair-name" name="name" required maxLength={60} defaultValue="Desk light" />
      </Field>
      <Field
        label="Team"
        htmlFor="pair-team"
        hint="It shows your status either way. In a team, the team's admins can manage it too and send it pushes."
      >
        <Select id="pair-team" name="teamId" defaultValue={teams[0]?.id}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" name="autoUpdate" defaultChecked className="mt-0.5 size-4 shrink-0 accent-foreground" />
        <span>
          Update the firmware automatically
          <span className="block text-muted-foreground">New versions install when you&apos;re free or away. You can change this later.</span>
        </span>
      </label>
      <Button variant="primary" className="w-full" disabled={pending}>
        {pending ? "Adding…" : "Add this light"}
      </Button>
      <ErrorLine message={state?.ok === false ? state.error : null} />
    </form>
  );
}

// Signed out: sign in, come back to this page, then add the light.
export function SignInToPair({ code }: { code: string }) {
  return (
    <div className="space-y-2.5">
      <form action={signInWithGitHubToPair.bind(null, code)}>
        <Button variant="primary" className="w-full">
          <GithubIcon />
          Continue with GitHub
        </Button>
      </form>
      <Button type="button" className="w-full" onClick={() => signIn("passkey", { redirectTo: `/pair/${code}` })}>
        <KeyIcon />
        Sign in with a passkey
      </Button>
    </div>
  );
}
