import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import type { Adapter, AdapterAuthenticator } from "next-auth/adapters";
import GitHub from "next-auth/providers/github";
import Passkey from "next-auth/providers/passkey";

import { db, schema } from "@/db";
import { passkeyLabel } from "@/lib/passkey-label";
import { ensurePersonalTeam, lookupInvite } from "@/lib/teams";

// Sign in with GitHub, or with a passkey. A brand-new account can be made with a
// passkey alone only from a live team invite link (/join), so the site isn't open to
// anonymous passkey sign-ups. Email magic links (Resend) drop in here later.
export const { handlers, auth, signIn, signOut } = NextAuth((req) => ({
  adapter: adapter(req?.headers.get("user-agent")),
  providers: [GitHub, Passkey({ getUserInfo: passkeyUserInfo })],
  experimental: { enableWebAuthn: true },
  session: { strategy: "database" },
  events: {
    async createUser({ user }) {
      if (user.id) await ensurePersonalTeam(user.id, user.name ?? user.email ?? "My team");
    },
  },
}));

// Who a passkey request is for. Signed-in people adding a passkey never get here (Auth.js
// uses the session). With an email: an existing account signs in with its passkeys; a new
// one is only allowed alongside a live invite token. Without one: a plain passkey sign-in.
type PasskeyUserInfo = NonNullable<Parameters<typeof Passkey>[0]>["getUserInfo"];
const passkeyUserInfo: PasskeyUserInfo = async (_options, request) => {
  const params = (request.method === "POST" ? request.body : request.query) ?? {};
  const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  if (!email) return null;
  const existing = await db().select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing[0]) return { user: existing[0], exists: true };
  const invite = typeof params.invite === "string" ? await lookupInvite(params.invite) : null;
  if (invite?.state !== "live") return null;
  const name = typeof params.name === "string" ? params.name.trim().slice(0, 80) : "";
  return { user: { email, name: name || null }, exists: false };
};

// The stock Drizzle adapter, plus the passkey details Settings shows: a name taken
// from the browser that registered it, and when it was last used to sign in.
function adapter(userAgent: string | null | undefined): Adapter {
  const base = DrizzleAdapter(db(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
    authenticatorsTable: schema.authenticators,
  });
  const a = schema.authenticators;
  return {
    ...base,
    async createAuthenticator(data) {
      const [row] = await db()
        .insert(a)
        .values({ ...data, name: passkeyLabel(userAgent) })
        .returning();
      return row as AdapterAuthenticator;
    },
    async updateAuthenticatorCounter(credentialID, counter) {
      const [row] = await db()
        .update(a)
        .set({ counter, lastUsedAt: new Date() })
        .where(eq(a.credentialID, credentialID))
        .returning();
      if (!row) throw new Error("Authenticator not found");
      return row as AdapterAuthenticator;
    },
  };
}
