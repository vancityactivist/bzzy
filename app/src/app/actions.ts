"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { addCalendar, deleteCalendar, ownCalendar, refreshCalendar, setShowTitles } from "@/lib/calendar";
import {
  canManageDevice,
  createDevice,
  deleteDevice,
  deviceTeam,
  requestUpdate,
  rotateDeviceToken,
  setAutoUpdate,
} from "@/lib/devices";
import { GifError } from "@/lib/gif-process";
import { checkGifChoice, deleteGif, importGifFromLink, setDeviceGif, uploadGif } from "@/lib/gifs";
import { setPresence } from "@/lib/presence";
import { clipText, nowSeconds, STATUSES } from "@/lib/protocol";
import { requireUser } from "@/lib/session";
import { clearShow, setShow } from "@/lib/show";

export async function signInWithGitHub() {
  await signIn("github", { redirectTo: "/" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

// ---- status ----

const statusInput = z.object({
  status: z.enum(STATUSES),
  minutes: z.coerce.number().int().min(0).max(24 * 60),
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
  // Changing the status takes down "show now", like a press on the device does.
  await Promise.all([
    setPresence(
      user.id,
      {
        active: true,
        status: input.status,
        text: clipText(input.text.trim()),
        until: input.minutes > 0 ? now + input.minutes * 60 : 0,
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
  await setShowTitles(cal.id, showTitles);
  refresh();
}

export async function removeCalendarAction(id: string) {
  const user = await requireUser();
  const cal = await ownCalendar(user.id, id);
  if (!cal) return;
  await deleteCalendar(cal.id);
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
