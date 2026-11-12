import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import type { Adapter, AdapterAuthenticator } from "next-auth/adapters";
import GitHub from "next-auth/providers/github";
import Passkey from "next-auth/providers/passkey";

import { db, schema } from "@/db";
import { passkeyLabel } from "@/lib/passkey-label";
import { ensurePersonalTeam } from "@/lib/teams";

// Sign in with GitHub first, then add a passkey from Settings. More providers
// (email magic links, Google, Microsoft for org sign-in) drop in here later.
export const { handlers, auth, signIn, signOut } = NextAuth((req) => ({
  adapter: adapter(req?.headers.get("user-agent")),
  providers: [GitHub, Passkey],
  experimental: { enableWebAuthn: true },
  session: { strategy: "database" },
  events: {
    async createUser({ user }) {
      if (user.id) await ensurePersonalTeam(user.id, user.name ?? user.email ?? "My team");
    },
  },
}));

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
