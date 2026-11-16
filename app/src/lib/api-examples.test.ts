import { describe, expect, it } from "vitest";

import { API_EXAMPLES, WEBHOOK_EXAMPLES } from "./api-examples";
import { openApiDocument } from "./api-openapi";
import { showBody, statusBody } from "./api-rules";
import { webhookInput, webhookPatch } from "./webhook-rules";

describe("the docs page's examples", () => {
  const doc = openApiDocument("https://bzzy.ca");
  const ops = Object.entries(doc.paths).flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`));

  it("cover every operation, and nothing else", () => {
    expect(Object.keys(API_EXAMPLES).sort()).toEqual(ops.sort());
  });

  it("send bodies the routes accept", () => {
    expect(statusBody.safeParse(API_EXAMPLES["PUT /status"].request).success).toBe(true);
    expect(showBody.safeParse(API_EXAMPLES["PUT /show"].request).success).toBe(true);
    expect(webhookInput.safeParse(API_EXAMPLES["POST /webhooks"].request).success).toBe(true);
    expect(webhookPatch.safeParse(API_EXAMPLES["PATCH /webhooks/{id}"].request).success).toBe(true);
  });

  it("show every webhook event", () => {
    expect(Object.keys(WEBHOOK_EXAMPLES).sort()).toEqual(Object.keys(doc.webhooks).sort());
  });
});
