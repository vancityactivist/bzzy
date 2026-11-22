"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui";

import { deleteAccountAction, deleteAccountSummaryAction } from "@/app/actions";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// Delete someone's account. Asks what it will touch first, warns about lights and teams,
// then wants the email (or name) typed to go ahead.
export function DeleteAccountButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await deleteAccountSummaryAction(userId);
            if (!res.ok) return setError(res.error);
            const s = res.summary;
            const lines = [`Delete ${s.name}'s account? This can't be undone.`, ""];
            lines.push("Their sign-ins, passkeys, calendars (Google access revoked), API tokens, webhooks, GIF uploads, orders and team memberships all go.");
            if (s.lights.length)
              lines.push(
                "",
                `⚠ They have ${plural(s.lights.length, "light")}: ${s.lights.map((l) => `${l.name} (${l.id})`).join(", ")}. These aren't deleted: they move to your lights, off any order and out of ship mode.`,
              );
            if (s.ownedTeams.length)
              lines.push(
                "",
                `⚠ They own ${plural(s.ownedTeams.length, "shared team")}: ${s.ownedTeams
                  .map((t) => (t.others ? `${t.name} (passed to someone else in it)` : `${t.name} (nobody else in it, so it's deleted)`))
                  .join(", ")}.`,
              );
            const word = s.email ?? s.name;
            lines.push("", `Type ${word} to delete the account:`);
            const typed = prompt(lines.join("\n"));
            if (typed === null) return;
            if (typed.trim().toLowerCase() !== word.toLowerCase()) return setError("That didn't match, so nothing was deleted.");
            setError(await deleteAccountAction(userId));
          })
        }
      >
        Delete
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
