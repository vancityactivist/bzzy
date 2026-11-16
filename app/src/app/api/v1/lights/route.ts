import { after } from "next/server";

import { apiOptions, apiRoute } from "@/lib/api-http";
import { apiSnapshot, lightsFrom, refreshDueCalendars } from "@/lib/api-snapshot";

// The person's lights and what each one shows right now (the live preview, as data).

export const GET = apiRoute({ scope: "read", kind: "read" }, async ({ token, now }) => {
  const snap = await apiSnapshot(token.userId);
  after(() => refreshDueCalendars(snap));
  return { data: { lights: await lightsFrom(snap, now) } };
});

export const OPTIONS = apiOptions;
