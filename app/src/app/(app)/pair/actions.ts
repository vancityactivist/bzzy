"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn } from "@/auth";
import { normalizePairCode } from "@/lib/pair-rules";
import { claimPairing, PairingError } from "@/lib/pairing";
import { requireUser } from "@/lib/session";

export type PairResult = { ok: false; error: string } | null;

// From /pair: the code typed off the light's screen.
export async function goToPairCode(_prev: PairResult, formData: FormData): Promise<PairResult> {
  const code = normalizePairCode(String(formData.get("code") ?? ""));
  if (!code) return { ok: false, error: "That's not a code from a light. It's six letters and numbers, like K7Q-F2M." };
  redirect(`/pair/${code}`);
}

// Signed out on a pair page: GitHub, then straight back to it.
export async function signInWithGitHubToPair(code: string) {
  const c = normalizePairCode(code);
  if (!c) return;
  await signIn("github", { redirectTo: `/pair/${c}` });
}

const claimInput = z.object({
  name: z.string().trim().min(1, "Give the light a name.").max(60, "Keep the name to 60 characters."),
  teamId: z.string().min(1).max(64),
});

export async function claimPairingAction(code: string, _prev: PairResult, formData: FormData): Promise<PairResult> {
  const user = await requireUser();
  const c = normalizePairCode(code);
  if (!c) return { ok: false, error: "That code doesn't work." };
  const input = claimInput.safeParse({ name: formData.get("name"), teamId: formData.get("teamId") });
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Check the form." };
  let deviceId: string;
  try {
    deviceId = await claimPairing(user, c, { ...input.data, autoUpdate: formData.get("autoUpdate") === "on" });
  } catch (e) {
    if (e instanceof PairingError) return { ok: false, error: e.message };
    throw e;
  }
  refresh();
  redirect(`/lights/${deviceId}?added=1`);
}
