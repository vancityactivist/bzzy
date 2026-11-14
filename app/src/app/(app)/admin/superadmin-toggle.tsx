"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui";

import { setSuperadminAction } from "@/app/actions";

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
