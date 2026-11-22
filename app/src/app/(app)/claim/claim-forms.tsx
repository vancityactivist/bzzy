"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";

import { type ClaimResult, redeemLink } from "./actions";

export function ContinueButton({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ClaimResult, FormData>(() => redeemLink(token), null);
  return (
    <form action={action}>
      <Button variant="primary" className="w-full" disabled={pending}>
        {pending ? "Signing you in…" : "Continue"}
      </Button>
      {state?.ok === false && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
