"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { canManageDevice, createDevice, deleteDevice, rotateDeviceToken } from "@/lib/devices";
import { setPresence } from "@/lib/presence";
import { clipText, nowSeconds, STATUSES } from "@/lib/protocol";
import { requireUser } from "@/lib/session";

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
  await setPresence(
    user.id,
    {
      active: true,
      status: input.status,
      text: clipText(input.text.trim()),
      until: input.minutes > 0 ? now + input.minutes * 60 : 0,
      updatedAt: now,
    },
    "web",
  );
  refresh();
}

export async function clearStatus() {
  const user = await requireUser();
  await setPresence(user.id, { active: false, status: "free", text: "", until: 0, updatedAt: nowSeconds() }, "web");
  refresh();
}

// ---- devices ----

export type NewDeviceResult = { ok: true; id: string; token: string } | { ok: false; error: string } | null;

export async function addDevice(_prev: NewDeviceResult, formData: FormData): Promise<NewDeviceResult> {
  const user = await requireUser();
  const name = z.string().trim().min(1).max(60).safeParse(formData.get("name"));
  if (!name.success) return { ok: false, error: "Give the device a name (up to 60 characters)." };
  const { id, token } = await createDevice(user.id, user.name, name.data);
  refresh();
  return { ok: true, id, token };
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
