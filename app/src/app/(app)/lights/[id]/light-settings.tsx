"use client";

import { useOptimistic, useState, useTransition } from "react";

import { Button, cx, Input, Select } from "@/components/ui";
import { type Status, STATUSES } from "@/lib/protocol";
import { allLabels, LABEL_MAX, STANDARD_LABEL, type StatusLabels, tidyLabel } from "@/lib/status-labels";

import {
  renameDeviceAction,
  setAllowFlashAction,
  setDeviceTeamAction,
  setFollowsAction,
  setLightDefaultAction,
  setLightLabelsAction,
} from "@/app/actions";

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
  statusLabels,
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
  statusLabels: StatusLabels | null;
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
                {allLabels(statusLabels)[s]}
              </option>
            ))}
          </Select>
        </Row>
      )}

      {isOwner && !follows && <LightNames deviceId={deviceId} statusLabels={statusLabels} />}

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

// What a light with its own status calls the statuses (a boardroom: "Room free", "In use").
function LightNames({ deviceId, statusLabels }: { deviceId: string; statusLabels: StatusLabels | null }) {
  const initial = Object.fromEntries(STATUSES.map((s) => [s, statusLabels?.[s] ?? ""])) as Record<Status, string>;
  const [saved, setSaved] = useState(initial);
  const [names, setNames] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = STATUSES.some((s) => tidyLabel(names[s]) !== tidyLabel(saved[s]));

  return (
    <form
      className="space-y-3 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setLightLabelsAction(deviceId, names);
          if (r.ok) setSaved(names);
          setMessage(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: `${r.status ? `${STANDARD_LABEL[r.status]}: ` : ""}${r.error}` });
        });
      }}
    >
      <div>
        <p className="text-sm font-medium">Status names</p>
        <p className="mt-0.5 text-sm text-muted">What this light calls each status, up to {LABEL_MAX} characters. Blank keeps the standard word.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {STATUSES.map((s) => (
          <Input
            key={s}
            aria-label={`Name for ${STANDARD_LABEL[s]}`}
            placeholder={STANDARD_LABEL[s]}
            maxLength={LABEL_MAX}
            value={names[s]}
            onChange={(e) => {
              setMessage(null);
              setNames((n) => ({ ...n, [s]: e.target.value }));
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save names"}
        </Button>
        {message && (
          <p className={cx("text-sm", message.ok ? "text-muted" : "text-danger")} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
