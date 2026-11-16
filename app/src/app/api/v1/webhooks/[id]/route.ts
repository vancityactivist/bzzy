import { ApiError, apiOptions, apiRoute, readBody } from "@/lib/api-http";
import { webhookPatch } from "@/lib/webhook-rules";
import { deleteWebhook, getWebhook, updateWebhook, WebhookError, webhookOut } from "@/lib/webhooks";

// One webhook. See docs/api.md.

const notFound = () => new ApiError(404, "not_found", "No such webhook.");

export const GET = apiRoute({ scope: "webhooks", kind: "read" }, async ({ token, params }) => {
  const w = await getWebhook(token.userId, params.id);
  if (!w) throw notFound();
  return { data: { webhook: webhookOut(w, true) } };
});

export const PATCH = apiRoute({ scope: "webhooks", kind: "write" }, async ({ req, token, params }) => {
  const body = await readBody(req, webhookPatch);
  try {
    const w = await updateWebhook(token.userId, params.id, body);
    if (!w) throw notFound();
    return { data: { webhook: webhookOut(w) } };
  } catch (err) {
    if (err instanceof WebhookError) throw new ApiError(400, "invalid_request", err.message, "url");
    throw err;
  }
});

export const DELETE = apiRoute({ scope: "webhooks", kind: "write" }, async ({ token, params }) => {
  if (!(await deleteWebhook(token.userId, params.id))) throw notFound();
  return { data: { deleted: true } };
});

export const OPTIONS = apiOptions;
