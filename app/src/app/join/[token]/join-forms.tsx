"use client";

import { signIn } from "next-auth/webauthn";
import { useState, useTransition } from "react";

import { signInWithGitHubToInvite } from "@/app/actions";
import { GithubIcon, KeyIcon } from "@/components/icons";
import { Button, Field, Input } from "@/components/ui";

import { acceptInviteAction, joinAfterSignUpAction, type TeamResult } from "../../teams/actions";

function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p className="text-sm text-danger" role="alert">
      {message}
    </p>
  ) : null;
}

// Signed in: one press. The action redirects to the team on success.
export function JoinButton({ token, teamName }: { token: string; teamName: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TeamResult>(null);
  return (
    <div className="space-y-3">
      <Button variant="primary" className="w-full" disabled={pending} onClick={() => start(async () => setResult(await acceptInviteAction(token)))}>
        {pending ? "Joining…" : `Join ${teamName}`}
      </Button>
      <ErrorLine message={result?.ok === false ? result.error : null} />
    </div>
  );
}

// No account yet: name and email, then the browser makes a passkey. The server only
// allows a new passkey account while this invite is live (auth.ts).
export function NewAccountForm({ token, teamName }: { token: string; teamName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    setBusy(true);
    setError(null);
    try {
      const res = await signIn("passkey", { action: "register", email, name, invite: token, redirect: false });
      // next-auth returns nothing when the server refused to start (an email that
      // already has an account, or a link that just ended).
      if (!res || !res.ok || res.error) {
        setError("We couldn't make that account. If you've used bzzy before, sign in below instead.");
        return;
      }
      const joined = await joinAfterSignUpAction(token);
      if (!joined.ok) {
        setError(joined.error);
        return;
      }
      // A full load on purpose: the header and tab bar were rendered signed out.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/teams/${joined.teamId}?joined=1`);
    } catch {
      setError("The passkey wasn't saved. Try again?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
    >
      <Field label="Your name" htmlFor="join-name">
        <Input id="join-name" name="name" required maxLength={80} autoComplete="name" placeholder="Jordan Lee" />
      </Field>
      <Field label="Email" htmlFor="join-email" hint="So your team can tell who you are. We don't send email yet.">
        <Input id="join-email" name="email" type="email" required autoComplete="email webauthn" placeholder="jordan@example.com" />
      </Field>
      <Button variant="primary" className="w-full" disabled={busy}>
        <KeyIcon />
        {busy ? "Waiting for your device…" : `Join ${teamName} with a passkey`}
      </Button>
      <p className="text-xs text-pretty text-muted">
        A passkey signs you in with your fingerprint, face or device PIN. No password to remember.
      </p>
      <ErrorLine message={error} />
    </form>
  );
}

// Has an account: sign in, come back to this page, then press Join.
export function SignInToJoin({ token }: { token: string }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <form action={signInWithGitHubToInvite.bind(null, token)}>
        <Button className="w-full">
          <GithubIcon />
          GitHub
        </Button>
      </form>
      <Button type="button" className="w-full" onClick={() => signIn("passkey", { redirectTo: `/join/${token}` })}>
        <KeyIcon />
        Passkey
      </Button>
    </div>
  );
}
