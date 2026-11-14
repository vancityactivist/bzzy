"use client";

import { useState, useTransition } from "react";

import { Field, Select } from "@/components/ui";

import { setPushTeamAction, type TeamResult } from "../teams/actions";

// Which team's announcements this light shows. Only its owner sees this.
export function PushTeamSelect({ deviceId, value, teams }: { deviceId: string; value: string | null; teams: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TeamResult>(null);
  const id = `push-team-${deviceId}`;
  return (
    <Field
      label="Team announcements"
      htmlFor={id}
      className="w-full sm:max-w-xs"
      hint="Messages and flashes your team's admins send show on this light."
      error={result?.ok === false ? result.error : undefined}
    >
      <Select
        id={id}
        defaultValue={value ?? ""}
        disabled={pending}
        onChange={(e) => {
          const teamId = e.target.value;
          start(async () => setResult(await setPushTeamAction(deviceId, teamId)));
        }}
      >
        <option value="">None</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
