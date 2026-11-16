import { ApiError, apiOptions, apiRoute, readBody } from "@/lib/api-http";
import { webhookInput } from "@/lib/webhook-rules";
import { createWebhook, WebhookError, webhookOut, webhooksForUser } from "@/lib/webhooks";

// The person's webhooks: where bzzy sends their events. See docs/api.md.

export const GET = apiRoute({ scope: "webhooks", kind: "read" }, async ({ token }) => {
  return { data: { webhooks: (await webhooksForUser(token.userId)).map((w) => webhookOut(w)) } };
});

export const POST = apiRoute({ scope: "webhooks", kind: "write" }, async ({ req, token }) => {
  const body = await readBody(req, webhookInput);
  try {
    const { webhook, secret } = await createWebhook(token.userId, body);
    return { data: { webhook: webhookOut(webhook), secret }, status: 201 };
  } catch (err) {
    if (err instanceof WebhookError) throw new ApiError(400, "invalid_request", err.message, "url");
    throw err;
  }
});

export const OPTIONS = apiOptions;
