"use server";

import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { startSession } from "@/lib/claim-session";
import { redeemClaimLink } from "@/lib/provision";

export type ClaimResult = { ok: false; error: string } | null;

// The "Continue" button on /claim/<token>: uses the link and signs them in.
export async function redeemLink(token: string): Promise<ClaimResult> {
  const userId = await redeemClaimLink(token);
  if (!userId) return { ok: false, error: "This link has been used or has run out." };
  await startSession(userId);
  redirect("/claim/welcome");
}

// Signed in from the link: link GitHub to this account for next time.
export async function connectGitHub() {
  await signIn("github", { redirectTo: "/claim/welcome?github=1" });
}
