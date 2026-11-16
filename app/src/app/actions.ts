"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import {
  addCalendar,
  deleteCalendar,
  ownCalendar,
  refreshCalendar,
  saveUserClock,
  setShowTitles,
  validTimeZone,
} from "@/lib/calendar";
import {
  canManageDevice,
  createDevice,
  deleteDevice,
  deviceTeam,
  requestUpdate,
  rotateDeviceToken,
  setAutoUpdate,
  setDeviceRing,
} from "@/lib/devices";
import { isAdmin, setSuperadmin } from "@/lib/admin";
import { newTokenInput } from "@/lib/api-rules";
import { createApiToken, revokeApiToken, setApiBlocked, TokenError } from "@/lib/api-tokens";
import { GifError } from "@/lib/gif-process";
import { checkGifChoice, deleteGif, importGifFromLink, setDeviceGif, uploadGif } from "@/lib/gifs";
import { PasskeyError, renamePasskey, revokePasskey } from "@/lib/passkeys";
import { getPresence, setPresence } from "@/lib/presence";
import { clipText, nowSeconds, STATUSES } from "@/lib/protocol";
import { pushInput, pushLeds } from "@/lib/push-rules";
import { ringFromInput, type RingInput, ringInput } from "@/lib/ring";
import { requireUser } from "@/lib/session";
import { clearShow, setShow } from "@/lib/show";
import { parseClock, parseWorkHours } from "@/lib/work-hours";

export async function signInWithGitHub() {
  await signIn("github", { redirectTo: "/" });
}

// From an invite page: come back to it after GitHub.
export async function signInWithGitHubToInvite(token: string) {
  if (!/^[a-z0-9]{16,64}$/.test(token)) return;
  await signIn("github", { redirectTo: `/join/${token}` });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

// ---- status ----

const statusInput = z.object({
  status: z.enum(STATUSES),
  // -1: keep the end time the status you set has now (the form's "Until 3:15 PM" chip).
  minutes: z.coerce.number().int().min(-1).max(24 * 60),
  text: z.string().max(200).default(""),
});

export async function setStatus(formData: FormData) {
  const user = await requireUser();
  const input = statusInput.parse({
    status: formData.get("status"),
    minutes: formData.get("minutes") ?? 0,
    text: formData.get("text") ?? "",
  });
  const now = nowSeconds();
  let until = input.minutes > 0 ? now + input.minutes * 60 : 0;
  if (input.minutes === -1) {
    const p = await getPresence(user.id);
    until = p?.active && p.until > now ? p.until : 0;
  }
  // Changing the status takes down "show now", like a press on the device does.
  await Promise.all([
    setPresence(
      user.id,
      {
        active: true,
        status: input.status,
        text: clipText(input.text.trim()),
        until,
        updatedAt: now,
      },
      "web",
    ),
    clearShow(user.id, now),
  ]);
  refresh();
}

export async function clearStatus() {
  const user = await requireUser();
  const now = nowSeconds();
  await Promise.all([
    setPresence(user.id, { active: false, status: "free", text: "", until: 0, updatedAt: now }, "web"),
    clearShow(user.id, now),
  ]);
  refresh();
}

// ---- show now ----

export type ShowNowResult = { ok: true; at: number } | { ok: false; error: string } | null;

const showInput = z.object({
  gif: z.string().max(100).default("none"),
  link: z.string().trim().max(2000).default(""),
  text: z.string().max(200).default(""),
  minutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  // The ring, like a push's flash (pushInput).
  ...pushInput.pick({ flash: true, color: true, speed: true, flashFor: true }).shape,
});

// Put a GIF and/or message on the screen. The GIF can be one from the library, a
// pasted GIPHY/Tenor link or a file, and the last two are saved to the library too.
export async function showNowAction(_prev: ShowNowResult, formData: FormData): Promise<ShowNowResult> {
  const user = await requireUser();
  const input = showInput.safeParse({
    gif: formData.get("gif") ?? "none",
    link: formData.get("link") ?? "",
    text: formData.get("text") ?? "",
    minutes: formData.get("minutes") ?? 60,
    flash: formData.get("flash") ?? undefined,
    color: formData.get("color") ?? undefined,
    speed: formData.get("speed") ?? undefined,
    flashFor: formData.get("flashFor") ?? undefined,
  });
  if (!input.success)
    return {
      ok: false,
      error: "Something in the form didn't look right. Try again.",
    };
  const { gif, link, minutes } = input.data;
  const text = clipText(input.data.text.trim());
  const file = formData.get("file");

  let choice: { assetId: string | null; builtin: string | null } = {
    assetId: null,
    builtin: null,
  };
  try {
    if (file instanceof File && file.size > 0) {
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "My GIF";
      choice.assetId = await uploadGif(user.id, user.name, name, new Uint8Array(await file.arrayBuffer()));
    } else if (link) {
      choice.assetId = (await importGifFromLink(user.id, user.name, "", link)).id;
    } else if (gif !== "none") {
      const checked = await checkGifChoice(user.id, gif);
      if (!checked)
        return {
          ok: false,
          error: "That GIF isn't available any more. Pick another.",
        };
      choice = checked;
    }
  } catch (err) {
    if (err instanceof GifError) return { ok: false, error: err.message };
    console.error("Show now: adding the GIF failed", err);
    return {
      ok: false,
      error: "Couldn't add that GIF. If this keeps happening, the GIF storage may not be set up yet.",
    };
  }
  if (!choice.assetId && !choice.builtin && !text) return { ok: false, error: "Pick a GIF or type a message first." };

  const now = nowSeconds();
  await setShow(user.id, {
    ...choice,
    text,
    leds: pushLeds(input.data),
    until: minutes > 0 ? now + minutes * 60 : 0,
    updatedAt: now,
  });
  refresh();
  return { ok: true, at: now };
}

export async function clearShowAction() {
  const user = await requireUser();
  await clearShow(user.id, nowSeconds());
  refresh();
}

// ---- devices ----

export type NewDeviceResult = { ok: true; id: string; token: string } | { ok: false; error: string } | null;

export async function addDevice(_prev: NewDeviceResult, formData: FormData): Promise<NewDeviceResult> {
  const user = await requireUser();
  const name = z.string().trim().min(1).max(60).safeParse(formData.get("name"));
  if (!name.success) return { ok: false, error: "Give the device a name (up to 60 characters)." };
  // Auto-update is on unless the box was unticked (docs/ota.md).
  const autoUpdate = formData.get("autoUpdate") === "on";
  const { id, token } = await createDevice(user.id, user.name, name.data, autoUpdate);
  refresh();
  return { ok: true, id, token };
}

export async function setAutoUpdateAction(deviceId: string, autoUpdate: boolean) {
  const user = await requireUser();
  if (!(await canManageDevice(user.id, deviceId))) return;
  await setAutoUpdate(deviceId, autoUpdate);
  refresh();
}

export async function updateNowAction(deviceId: string) {
  const user = await requireUser();
  if (!(await canManageDevice(user.id, deviceId))) return;
  await requestUpdate(deviceId, nowSeconds());
  refresh();
}

export async function newDeviceToken(deviceId: string): Promise<NewDeviceResult> {
  const user = await requireUser();
  if (!(await canManageDevice(user.id, deviceId))) return { ok: false, error: "You can't manage that device." };
  const token = await rotateDeviceToken(deviceId);
  return { ok: true, id: deviceId, token };
}

export async function removeDevice(deviceId: string) {
  const user = await requireUser();
  if (!(await canManageDevice(user.id, deviceId))) return;
  await deleteDevice(deviceId);
  refresh();
}

// ---- calendars ----

export type CalendarFormResult = { ok: true } | { ok: false; error: string } | null;

const calendarInput = z.object({
  name: z.string().trim().min(1, "Give the calendar a name.").max(60),
  url: z.string().trim().min(1, "Paste the calendar's ICS link.").max(2000),
});

export async function addCalendarAction(_prev: CalendarFormResult, formData: FormData): Promise<CalendarFormResult> {
  const user = await requireUser();
  const input = calendarInput.safeParse({ name: formData.get("name"), url: formData.get("url") });
  if (!input.success) return { ok: false, error: input.error.issues[0].message };
  const error = await addCalendar(user.id, input.data.name, input.data.url);
  if (error) return { ok: false, error };
  refresh();
  return { ok: true };
}

export async function refreshCalendarAction(id: string) {
  const user = await requireUser();
  const cal = await ownCalendar(user.id, id);
  if (cal) await refreshCalendar(cal);
  refresh();
}

export async function setCalendarTitlesAction(id: string, showTitles: boolean) {
  const user = await requireUser();
  const cal = await ownCalendar(user.id, id);
  if (!cal) return;
  await setShowTitles(cal, showTitles);
  refresh();
}

export async function removeCalendarAction(id: string) {
  const user = await requireUser();
  const cal = await ownCalendar(user.id, id);
  if (!cal) return;
  await deleteCalendar(cal);
  refresh();
}

// ---- working hours ----

export type WorkHoursResult = { ok: true } | { ok: false; error: string } | null;

export async function saveWorkHoursAction(_prev: WorkHoursResult, formData: FormData): Promise<WorkHoursResult> {
  const user = await requireUser();
  const timeZone = String(formData.get("timeZone") ?? "");
  if (!validTimeZone(timeZone)) return { ok: false, error: "Pick a time zone." };
  let hours = null;
  if (formData.get("enabled") === "on") {
    const days = formData.getAll("day").map(Number);
    const start = parseClock(String(formData.get("start") ?? ""));
    const end = parseClock(String(formData.get("end") ?? ""));
    if (days.length === 0) return { ok: false, error: "Pick at least one day." };
    if (start === null || end === null) return { ok: false, error: "Enter a start and end time." };
    if (start >= end) return { ok: false, error: "The day has to end after it starts (overnight hours aren't supported yet)." };
    hours = parseWorkHours({ days, start, end });
    if (!hours) return { ok: false, error: "Those hours don't look right." };
  }
  await saveUserClock(user.id, timeZone, hours);
  refresh();
  return { ok: true };
}

// ---- Passkeys ----

export async function revokePasskeyAction(credentialID: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await revokePasskey(user.id, credentialID);
  } catch (err) {
    if (err instanceof PasskeyError) return { error: err.message };
    throw err;
  }
  refresh();
  return {};
}

export async function renamePasskeyAction(credentialID: string, name: string) {
  const user = await requireUser();
  const parsed = z.string().trim().min(1).max(60).safeParse(name);
  if (!parsed.success) return;
  await renamePasskey(user.id, credentialID, parsed.data);
  refresh();
}

// ---- API tokens (docs/api.md) ----

export type NewTokenResult = { ok: true; token: string; name: string } | { ok: false; error: string } | null;

export async function createApiTokenAction(_prev: NewTokenResult, formData: FormData): Promise<NewTokenResult> {
  const user = await requireUser();
  const input = newTokenInput.safeParse({
    name: formData.get("name") ?? "",
    scopes: formData.getAll("scopes"),
    expiryDays: formData.get("expiryDays") ?? "",
  });
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Something in the form didn't look right." };
  try {
    const { token } = await createApiToken(user.id, input.data);
    refresh();
    return { ok: true, token, name: input.data.name };
  } catch (err) {
    if (err instanceof TokenError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function revokeApiTokenAction(tokenId: string) {
  const user = await requireUser();
  await revokeApiToken(user.id, tokenId);
  refresh();
}

// ---- GIFs ----

export type GifUploadResult = { ok: true } | { ok: false; error: string } | null;

export async function uploadGifAction(_prev: GifUploadResult, formData: FormData): Promise<GifUploadResult> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a GIF to upload." };
  const name = z.string().trim().max(60).safeParse(formData.get("name") || file.name.replace(/\.[^.]+$/, ""));
  try {
    await uploadGif(user.id, user.name, (name.success && name.data) || "My GIF", new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof GifError) return { ok: false, error: err.message };
    console.error("GIF upload failed", err);
    return { ok: false, error: "Upload failed. If this keeps happening, the GIF storage may not be set up yet." };
  }
  refresh();
  return { ok: true };
}

export async function importGifLinkAction(_prev: GifUploadResult, formData: FormData): Promise<GifUploadResult> {
  const user = await requireUser();
  const link = z.string().trim().min(1).max(2000).safeParse(formData.get("link"));
  if (!link.success) return { ok: false, error: "Paste a GIPHY or Tenor link." };
  const name = z.string().trim().max(60).safeParse(formData.get("name") ?? "");
  try {
    await importGifFromLink(user.id, user.name, (name.success && name.data) || "", link.data);
  } catch (err) {
    if (err instanceof GifError) return { ok: false, error: err.message };
    console.error("GIF link import failed", err);
    return { ok: false, error: "Couldn't add that GIF. If this keeps happening, the GIF storage may not be set up yet." };
  }
  refresh();
  return { ok: true };
}

export async function deleteGifAction(assetId: string) {
  const user = await requireUser();
  await deleteGif(user.id, assetId);
  refresh();
}

export async function setDeviceGifAction(deviceId: string, status: string, choice: string) {
  const user = await requireUser();
  const s = z.enum(STATUSES).safeParse(status);
  if (!s.success || !(await canManageDevice(user.id, deviceId))) return;
  const teamId = await deviceTeam(deviceId);
  if (!teamId) return;
  await setDeviceGif(deviceId, teamId, s.data, choice);
  refresh();
}

// The ring: a style per status, the meeting warning, and whether it may flash at all.
export async function setDeviceRingAction(deviceId: string, raw: RingInput): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const input = ringInput.safeParse(raw);
  if (!input.success || !(await canManageDevice(user.id, deviceId))) return { ok: false };
  await setDeviceRing(deviceId, ringFromInput(input.data));
  refresh();
  return { ok: true };
}

// ---- superadmin ----

export async function setSuperadminAction(userId: string, on: boolean) {
  const user = await requireUser();
  await setSuperadmin(user.id, userId, on);
  refresh();
}

// Turns a person's API tokens off (revoking them all) or lets them make tokens again.
export async function setApiBlockedAction(userId: string, blocked: boolean) {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) throw new Error("Not a superadmin");
  await setApiBlocked(userId, blocked);
  refresh();
}
