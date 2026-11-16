"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui";

import { setApiBlockedAction, setSuperadminAction } from "@/app/actions";

export function SuperadminToggle({ userId, name, on }: { userId: string; name: string; on: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        const ask = on
          ? `Remove superadmin from ${name}? They keep their account and teams.`
          : `Make ${name} a superadmin? They'll be able to see and manage every team and this page.`;
        if (confirm(ask)) start(() => setSuperadminAction(userId, !on));
      }}
    >
      {on ? "Remove" : "Make superadmin"}
    </Button>
  );
}

// Turns off someone's API tokens (all revoked, no new ones), or lets them make tokens again.
export function ApiBlockToggle({ userId, name, blocked }: { userId: string; name: string; blocked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        const ask = blocked
          ? `Let ${name} make API tokens again? Their old tokens stay revoked.`
          : `Turn off API tokens for ${name}? Every token they have stops working now, and they can't make new ones.`;
        if (confirm(ask)) start(() => setApiBlockedAction(userId, !blocked));
      }}
    >
      {blocked ? "Turn on" : "Turn off"}
    </Button>
  );
}
