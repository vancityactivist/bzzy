"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { checkGifChoice } from "@/lib/gifs";
import { nowSeconds } from "@/lib/protocol";
import { pushInput, pushLeds } from "@/lib/push-rules";
import { createPush, endPush } from "@/lib/pushes";
import { requireUser } from "@/lib/session";
import { ASSIGNABLE_ROLES, INVITE_DAYS } from "@/lib/team-rules";
import {
  acceptInvite,
  createInvite,
  createTeam,
  deleteTeam,
  removeMember,
  renameTeam,
  revokeInvite,
  setDevicePushTeam,
  setMemberRole,
  TeamError,
  transferOwnership,
} from "@/lib/teams";

export type TeamResult = { ok: true } | { ok: false; error: string } | null;
export type InviteResult = { ok: true; path: string; kind: "team" | "single"; role: string; days: number } | { ok: false; error: string } | null;

// TeamError messages are written for people; anything else is a bug, so say less.
function failed(e: unknown): { ok: false; error: string } {
  if (e instanceof TeamError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again?" };
}

export async function createTeamAction(_prev: TeamResult, formData: FormData): Promise<TeamResult> {
  const user = await requireUser();
  let teamId: string;
  try {
    teamId = await createTeam(user.id, String(formData.get("name") ?? ""));
  } catch (e) {
    return failed(e);
  }
  redirect(`/teams/${teamId}`);
}

export async function renameTeamAction(teamId: string, _prev: TeamResult, formData: FormData): Promise<TeamResult> {
  const user = await requireUser();
  try {
    await renameTeam(user.id, teamId, String(formData.get("name") ?? ""));
  } catch (e) {
    return failed(e);
  }
  refresh();
  return { ok: true };
}

export async function deleteTeamAction(teamId: string): Promise<TeamResult> {
  const user = await requireUser();
  try {
    await deleteTeam(user.id, teamId);
  } catch (e) {
    return failed(e);
  }
  redirect("/teams");
}

const inviteInput = z.object({
  kind: z.enum(["team", "single"]),
  role: z.enum(ASSIGNABLE_ROLES),
  days: z.coerce.number().refine((d) => (INVITE_DAYS as readonly number[]).includes(d)),
});

export async function createInviteAction(teamId: string, _prev: InviteResult, formData: FormData): Promise<InviteResult> {
  const user = await requireUser();
  const parsed = inviteInput.safeParse({ kind: formData.get("kind"), role: formData.get("role"), days: formData.get("days") });
  if (!parsed.success) return { ok: false, error: "Pick a link type, role and expiry." };
  try {
    const token = await createInvite(user.id, teamId, parsed.data);
    refresh();
    return { ok: true, path: `/join/${token}`, ...parsed.data };
  } catch (e) {
    return failed(e);
  }
}

export async function revokeInviteAction(teamId: string, inviteId: string): Promise<TeamResult> {
  const user = await requireUser();
  try {
    await revokeInvite(user.id, teamId, inviteId);
  } catch (e) {
    return failed(e);
  }
  refresh();
  return { ok: true };
}

export async function removeMemberAction(teamId: string, memberId: string): Promise<TeamResult> {
  const user = await requireUser();
  try {
    await removeMember(user.id, teamId, memberId);
  } catch (e) {
    return failed(e);
  }
  if (memberId === user.id) redirect("/teams");
  refresh();
  return { ok: true };
}

export async function setRoleAction(teamId: string, memberId: string, role: string): Promise<TeamResult> {
  const user = await requireUser();
  const parsed = z.enum(ASSIGNABLE_ROLES).safeParse(role);
  if (!parsed.success) return { ok: false, error: "Unknown role." };
  try {
    await setMemberRole(user.id, teamId, memberId, parsed.data);
  } catch (e) {
    return failed(e);
  }
  refresh();
  return { ok: true };
}

export async function transferOwnershipAction(teamId: string, memberId: string): Promise<TeamResult> {
  const user = await requireUser();
  try {
    await transferOwnership(user.id, teamId, memberId);
  } catch (e) {
    return failed(e);
  }
  refresh();
  return { ok: true };
}

export async function acceptInviteAction(token: string): Promise<TeamResult> {
  const user = await requireUser();
  let teamId: string;
  try {
    teamId = await acceptInvite(user.id, token);
  } catch (e) {
    return failed(e);
  }
  redirect(`/teams/${teamId}?joined=1`);
}

// Right after a passkey sign-up: no redirect, because the page has to reload fully
// for the header to notice the new session. The form navigates itself.
export async function joinAfterSignUpAction(token: string): Promise<{ ok: true; teamId: string } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    return { ok: true, teamId: await acceptInvite(user.id, token) };
  } catch (e) {
    return failed(e);
  }
}

export async function setPushTeamAction(deviceId: string, teamId: string): Promise<TeamResult> {
  const user = await requireUser();
  try {
    await setDevicePushTeam(user.id, deviceId, teamId || null);
  } catch (e) {
    return failed(e);
  }
  refresh();
  return { ok: true };
}

// ---- pushes ----

export type PushResult = { ok: true; at: number } | { ok: false; error: string } | null;

// Put a message and/or GIF (and maybe a flash) on everyone's light, or picked people's.
export async function sendPushAction(teamId: string, _prev: PushResult, formData: FormData): Promise<PushResult> {
  const user = await requireUser();
  const input = pushInput.safeParse({
    gif: formData.get("gif") ?? "none",
    text: formData.get("text") ?? "",
    minutes: formData.get("minutes") ?? 15,
    flash: formData.get("flash") ?? "none",
    color: formData.get("color") ?? "",
    speed: formData.get("speed") ?? 2,
    flashFor: formData.get("flashFor") ?? 30,
    target: formData.get("target") ?? "all",
    users: formData.getAll("users").map(String),
  });
  if (!input.success) return { ok: false, error: "Something in the form didn't look right. Try again." };
  const { gif, text, minutes, target, users } = input.data;
  let choice: { assetId: string | null; builtin: string | null } = { assetId: null, builtin: null };
  if (gif !== "none") {
    const checked = await checkGifChoice(user.id, gif);
    if (!checked) return { ok: false, error: "That GIF isn't available any more. Pick another." };
    choice = checked;
  }
  try {
    await createPush(user.id, teamId, { ...choice, text, minutes, target, users, leds: pushLeds(input.data) });
  } catch (e) {
    return failed(e);
  }
  refresh();
  return { ok: true, at: nowSeconds() };
}

export async function endPushAction(teamId: string, pushId: string): Promise<TeamResult> {
  const user = await requireUser();
  try {
    await endPush(user.id, teamId, pushId);
  } catch (e) {
    return failed(e);
  }
  refresh();
  return { ok: true };
}
