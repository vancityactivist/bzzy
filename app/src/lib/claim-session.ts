import "server-only";

import { randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";

import { db, schema } from "@/db";

// Signs someone in from a claim link (docs/provisioning.md): the link was emailed to
// them, so using it proves the address, like an email sign-in link. This writes the same
// database session Auth.js would, under the cookie name Auth.js reads, so everything
// after looks like any other sign-in. Auth.js uses the __Secure- name over https.
const SESSION_DAYS = 30;

export async function startSession(userId: string): Promise<void> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? (h.get("host")?.startsWith("localhost") ? "http" : "https");
  const secure = proto === "https";
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db().insert(schema.sessions).values({ sessionToken, userId, expires });
  const jar = await cookies();
  jar.set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
}
