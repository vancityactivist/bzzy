"use client";

import { useState, useTransition } from "react";

import { Button, Select } from "@/components/ui";

import { assignToClaimAction, takeBackFromClaimAction } from "@/app/actions";

type Claim = { id: string; label: string };

// A light that's already set up goes onto an order without pairing it again (to test
// ship mode with one of your own lights, say), or comes back off one.
export function ClaimControls({
  deviceId,
  name,
  claimRef,
  claims,
}: {
  deviceId: string;
  name: string;
  claimRef: string | null;
  claims: Claim[];
}) {
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (claimRef) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const ask = `Take ${name} back from ${claimRef}? It moves to your own lights, off the order and out of ship mode. It keeps working without pairing again.`;
            if (confirm(ask)) start(async () => setError(await takeBackFromClaimAction(deviceId)));
          }}
        >
          Take back
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
  if (claims.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <Select
          aria-label={`Order for ${name}`}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          wrapperClassName="w-56"
          className="h-8 text-xs"
          disabled={pending}
        >
          <option value="">Assign to an order…</option>
          {claims.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || !pick}
          onClick={() => {
            const claim = claims.find((c) => c.id === pick);
            const ask = `Give ${name} to ${claim?.label ?? "this order"}? It moves to that person's account and shows their status. Use Take back to undo.`;
            if (confirm(ask))
              start(async () => {
                setError(await assignToClaimAction(deviceId, pick));
                setPick("");
              });
          }}
        >
          Assign
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
