import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Passkey from "next-auth/providers/passkey";

import { db, schema } from "@/db";
import { ensurePersonalTeam } from "@/lib/teams";

// Sign in with GitHub first, then add a passkey from Settings. More providers
// (email magic links, Google, Microsoft for org sign-in) drop in here later.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(db(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
    authenticatorsTable: schema.authenticators,
  }),
  providers: [GitHub, Passkey],
  experimental: { enableWebAuthn: true },
  session: { strategy: "database" },
  events: {
    async createUser({ user }) {
      if (user.id) await ensurePersonalTeam(user.id, user.name ?? user.email ?? "My team");
    },
  },
}));
