import { Suspense } from "react";

import { AddPasskey } from "@/components/passkey-buttons";
import { SignIn } from "@/components/sign-in";
import { getCurrentUser } from "@/lib/session";
import { teamsForUser } from "@/lib/teams";

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const teams = await teamsForUser(user.id);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="rounded-xl border border-line bg-card p-6">
        <h2 className="font-semibold">Passkeys</h2>
        <p className="mt-1 text-sm text-muted">Sign in with your fingerprint, face or device PIN instead of GitHub.</p>
        <div className="mt-4">
          <AddPasskey />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-6">
        <h2 className="font-semibold">Teams</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {teams.map((t) => (
            <li key={t.id}>
              {t.name} <span className="text-muted">· {t.personal ? "personal" : t.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">Shared teams for an office come later.</p>
      </section>
    </div>
  );
}
