import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/auth";

export type CurrentUser = { id: string; name: string; image: string | null };

// Null when signed out. Reads the request, so call it inside a <Suspense> boundary.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Mark this as request-time before Auth.js runs: it generates random values
  // (crypto.getRandomValues) that Cache Components refuses to prerender.
  await connection();
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return { id: u.id, name: u.name ?? u.email ?? "you", image: u.image ?? null };
}

// For Server Actions and pages that only make sense signed in.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return user;
}
