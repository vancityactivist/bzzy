"use client";

import { useActionState, useState, useTransition } from "react";

import { CheckIcon, LinkIcon, LogOutIcon, PlusIcon, TrashIcon, XIcon } from "@/components/icons";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";

import { CopyButton } from "../devices/copy-button";
import {
  createInviteAction,
  createTeamAction,
  deleteTeamAction,
  type InviteResult,
  removeMemberAction,
  renameTeamAction,
  revokeInviteAction,
  setRoleAction,
  type TeamResult,
  transferOwnershipAction,
} from "./actions";

function ErrorLine({ result }: { result: TeamResult | InviteResult }) {
  if (result?.ok !== false) return null;
  return (
    <p className="text-sm text-danger" role="alert">
      {result.error}
    </p>
  );
}

export function CreateTeamForm({ first }: { first: boolean }) {
  const [state, action, pending] = useActionState<TeamResult, FormData>(createTeamAction, null);
  return (
    <Card>
      <CardHeader
        title={first ? "Make a team" : "Make another team"}
        description="You'll be its owner. Invite people with a link once it's made."
      />
      <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Team name" htmlFor="team-name" className="flex-1" error={state?.ok === false ? state.error : undefined}>
          <Input id="team-name" name="name" required minLength={2} maxLength={60} placeholder="Front office" />
        </Field>
        <Button variant="primary" disabled={pending}>
          <PlusIcon />
          {pending ? "Making…" : "Make team"}
        </Button>
      </form>
    </Card>
  );
}

// ---- invites ----

// Built in the browser so the link matches whichever address the app was opened on.
// Only rendered after the action returns, so window is always there.
function inviteUrl(path: string) {
  return `${window.location.origin}${path}`;
}

const DAYS_LABEL: Record<number, string> = { 1: "1 day", 7: "7 days", 30: "30 days" };

export function InviteForm({ teamId, canInviteAdmins }: { teamId: string; canInviteAdmins: boolean }) {
  const [kind, setKind] = useState<"team" | "single">("team");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [state, action, pending] = useActionState<InviteResult, FormData>(createInviteAction.bind(null, teamId), null);

  return (
    <div className="space-y-3">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Link" htmlFor="invite-kind">
          <Select
            id="invite-kind"
            name="kind"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as "team" | "single";
              setKind(k);
              if (k === "team") setRole("member");
            }}
          >
            <option value="team">Anyone with the link</option>
            <option value="single">One person</option>
          </Select>
        </Field>
        <Field label="Joins as" htmlFor="invite-role">
          <Select id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
            <option value="member">Member</option>
            {canInviteAdmins && (
              <option value="admin" disabled={kind === "team"}>
                Admin{kind === "team" ? " (one-person links only)" : ""}
              </option>
            )}
          </Select>
        </Field>
        <Field label="Works for" htmlFor="invite-days">
          <Select id="invite-days" name="days" defaultValue="7">
            {[1, 7, 30].map((d) => (
              <option key={d} value={d}>
                {DAYS_LABEL[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" disabled={pending}>
          <LinkIcon />
          {pending ? "Making…" : "Make link"}
        </Button>
      </form>
      <ErrorLine result={state} />
      {state?.ok && (
        <div role="status" className="rounded-xl bg-free/10 p-4 text-sm ring-1 ring-inset ring-free/30">
          <p className="flex items-start gap-2 font-medium">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-free" />
            <span>
              {state.kind === "team" ? "Share this link with your team." : "Send this link to one person."} It works for{" "}
              {DAYS_LABEL[state.days]} and is only shown once, so copy it now.
            </span>
          </p>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2">
            <span className="min-w-0 font-mono text-[13px] break-all">{inviteUrl(state.path)}</span>
            <CopyButton value={inviteUrl(state.path)} label="Invite link" />
          </div>
        </div>
      )}
    </div>
  );
}

export function RevokeInviteButton({ teamId, inviteId }: { teamId: string; inviteId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TeamResult>(null);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (confirm("Revoke this link? Anyone who hasn't used it yet won't be able to join with it.")) {
            start(async () => setResult(await revokeInviteAction(teamId, inviteId)));
          }
        }}
      >
        <XIcon />
        Revoke
      </Button>
      <ErrorLine result={result} />
    </>
  );
}

// ---- members ----

export function MemberControls({
  teamId,
  memberId,
  name,
  role,
  canSetRoles,
  canRemove,
  canTransfer,
}: {
  teamId: string;
  memberId: string;
  name: string;
  role: "owner" | "admin" | "member";
  canSetRoles: boolean;
  canRemove: boolean;
  canTransfer: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TeamResult>(null);
  const run = (fn: () => Promise<TeamResult>) => start(async () => setResult(await fn()));

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {canSetRoles && role !== "owner" && (
        <div className="w-32 shrink-0">
          <Select
            aria-label={`Role for ${name}`}
            value={role}
            disabled={pending}
            onChange={(e) => run(() => setRoleAction(teamId, memberId, e.target.value))}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
      )}
      {canTransfer && role !== "owner" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (confirm(`Make ${name} the owner? You'll become an admin.`)) run(() => transferOwnershipAction(teamId, memberId));
          }}
        >
          Make owner
        </Button>
      )}
      {canRemove && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label={`Remove ${name}`}
          onClick={() => {
            if (confirm(`Remove ${name} from the team? Their account and lights aren't affected.`)) {
              run(() => removeMemberAction(teamId, memberId));
            }
          }}
        >
          <TrashIcon />
          Remove
        </Button>
      )}
      <ErrorLine result={result} />
    </div>
  );
}

export function LeaveTeamButton({ teamId, userId, teamName }: { teamId: string; userId: string; teamName: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TeamResult>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (confirm(`Leave ${teamName}? You'll need a new invite link to come back.`)) {
            start(async () => setResult(await removeMemberAction(teamId, userId)));
          }
        }}
      >
        <LogOutIcon />
        Leave team
      </Button>
      <ErrorLine result={result} />
    </div>
  );
}

// ---- owner settings ----

export function RenameTeamForm({ teamId, name }: { teamId: string; name: string }) {
  const [state, action, pending] = useActionState<TeamResult, FormData>(renameTeamAction.bind(null, teamId), null);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Team name" htmlFor="rename-team" className="flex-1" error={state?.ok === false ? state.error : undefined}>
        <Input id="rename-team" name="name" required minLength={2} maxLength={60} defaultValue={name} />
      </Field>
      <Button disabled={pending}>{pending ? "Saving…" : state?.ok ? "Saved" : "Rename"}</Button>
    </form>
  );
}

export function DeleteTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TeamResult>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          const typed = prompt(`This removes everyone from the team and deletes its invite links. People keep their accounts and lights.\n\nType the team name to delete it:`);
          if (typed !== null && typed.trim() === teamName) start(async () => setResult(await deleteTeamAction(teamId)));
          else if (typed !== null) setResult({ ok: false, error: "The name didn't match, so nothing was deleted." });
        }}
      >
        <TrashIcon />
        Delete team
      </Button>
      <ErrorLine result={result} />
    </div>
  );
}
