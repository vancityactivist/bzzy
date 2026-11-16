import { apiOptions, apiRoute } from "@/lib/api-http";
import { apiSnapshot } from "@/lib/api-snapshot";

// Who the token belongs to and what it can do. Any live token may ask.

export const GET = apiRoute({ scope: null, kind: "read" }, async ({ token }) => {
  const snap = await apiSnapshot(token.userId);
  return {
    data: {
      user: { id: token.userId, name: snap.name, timeZone: snap.timeZone },
      token: { id: token.id, name: token.name, scopes: token.scopes, expiresAt: token.expiresAt?.toISOString() ?? null },
    },
  };
});

export const OPTIONS = apiOptions;
