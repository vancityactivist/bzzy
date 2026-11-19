"use client";

import { useOptimistic, useState, useTransition } from "react";

import { STATUS_META } from "@/components/status-meta";
import { Button, cx, Input, Select } from "@/components/ui";
import { type Status, STATUSES } from "@/lib/protocol";

import { renameDeviceAction, setAllowFlashAction, setDeviceTeamAction, setFollowsAction, setLightDefaultAction } from "@/app/actions";

// One setting: what it is on the left, the control on the right (stacked on phones).
function Row({ title, hint, children }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
        checked ? "bg-foreground" : "bg-line-strong",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow-card transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

export function LightSettings({
  deviceId,
  name,
  isOwner,
  canManage,
  followsOwner,
  defaultStatus,
  team,
  legacyPush,
  teams,
  allowFlash,
}: {
  deviceId: string;
  name: string;
  isOwner: boolean;
  canManage: boolean;
  followsOwner: boolean;
  defaultStatus: Status;
  team: string; // "" = just you, "legacy" = just you but with legacyPush's announcements
  legacyPush: string | null;
  teams: { id: string; name: string }[];
  allowFlash: boolean;
}) {
  const [pending, start] = useTransition();
  const [follows, setFollows] = useOptimistic(followsOwner);
  const [flash, setFlash] = useOptimistic(allowFlash);
  const [def, setDef] = useOptimistic(defaultStatus);
  const [teamValue, setTeamValue] = useOptimistic(team);
  const [draftName, setDraftName] = useState(name);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="divide-y divide-line">
      {canManage && (
        <form
          className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await renameDeviceAction(deviceId, draftName);
              setError(r.ok ? null : (r.error ?? "Couldn't rename it."));
            });
          }}
        >
          <label htmlFor="light-name" className="text-sm font-medium">
            Name
          </label>
          <div className="flex items-center gap-2 sm:w-80">
            <Input id="light-name" value={draftName} maxLength={60} onChange={(e) => setDraftName(e.target.value)} />
            {draftName.trim() !== name && (
              <Button size="sm" variant="primary" disabled={pending || !draftName.trim()}>
                Save
              </Button>
            )}
          </div>
        </form>
      )}

      {isOwner && (
        <Row
          title="Follows me"
          hint={
            follows
              ? "It shows your status, and a press on it changes all your lights."
              : "It has its own status, set from Home or its button. Your status and calendar don't change it."
          }
        >
          <Switch
            label="Follows me"
            checked={follows}
            disabled={pending}
            onChange={(v) =>
              start(async () => {
                setFollows(v);
                await setFollowsAction(deviceId, v);
              })
            }
          />
        </Row>
      )}

      {isOwner && !follows && (
        <Row title="Between meetings" hint="What it shows when nothing is set.">
          <Select
            aria-label="Between meetings"
            value={def}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value as Status;
              start(async () => {
                setDef(v);
                await setLightDefaultAction(deviceId, v);
              });
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Row>
      )}

      {isOwner && (
        <Row title="Team" hint={teams.length ? "Its admins can manage it, and it shows the team's announcements." : "Join or make a team to share announcements."}>
          <Select
            aria-label="Team"
            value={teamValue}
            disabled={pending || teams.length === 0}
            onChange={(e) => {
              const v = e.target.value;
              start(async () => {
                setTeamValue(v);
                const r = await setDeviceTeamAction(deviceId, v);
                setError(r.ok ? null : (r.error ?? "Couldn't change its team."));
              });
            }}
          >
            {legacyPush && <option value="legacy" disabled>{`Just you, with ${legacyPush} announcements`}</option>}
            <option value="">Just you</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Row>
      )}

      {canManage && (
        <Row title="Allow flashing" hint="Off keeps the ring steady in the status colour, announcements included.">
          <Switch
            label="Allow flashing"
            checked={flash}
            disabled={pending}
            onChange={(v) =>
              start(async () => {
                setFlash(v);
                await setAllowFlashAction(deviceId, v);
              })
            }
          />
        </Row>
      )}

      {error && (
        <p className="py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
