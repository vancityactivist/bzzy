import { takeLimit } from "@/lib/api-limits";
import { ApiError, apiOptions, apiRoute } from "@/lib/api-http";
import { sendTest } from "@/lib/webhooks";

// Sends a ping to one webhook and says how it went. See docs/api.md.

export const POST = apiRoute({ scope: "webhooks", kind: "write" }, async ({ token, params }) => {
  const limit = await takeLimit("webhookTest", token.userId);
  if (!limit.ok)
    throw new ApiError(429, "rate_limited", `That's a lot of tests. Try again in ${limit.resetSec} s.`, null, { "Retry-After": String(limit.resetSec) });
  const delivery = await sendTest(token.userId, params.id);
  if (!delivery) throw new ApiError(404, "not_found", "No such webhook.");
  return { data: { delivery } };
});

export const OPTIONS = apiOptions;
