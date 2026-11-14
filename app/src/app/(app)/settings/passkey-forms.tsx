"use client";

import { useState, useTransition } from "react";

import { TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui";

import { renamePasskeyAction, revokePasskeyAction } from "@/app/actions";

export function PasskeyActions({ credentialID, name }: { credentialID: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            const next = prompt("Name this passkey", name)?.trim();
            if (next && next !== name) start(() => renamePasskeyAction(credentialID, next.slice(0, 60)));
          }}
        >
          Rename
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Remove "${name}"? It won't be able to sign in to bzzy any more.`)) return;
            setError(null);
            start(async () => {
              const res = await revokePasskeyAction(credentialID);
              if (res.error) setError(res.error);
            });
          }}
        >
          <TrashIcon />
          {pending ? "Working…" : "Remove"}
        </Button>
      </span>
      {error && (
        <p className="max-w-xs text-right text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
