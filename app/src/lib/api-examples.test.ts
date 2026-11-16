import { describe, expect, it } from "vitest";

import { API_EXAMPLES } from "./api-examples";
import { openApiDocument } from "./api-openapi";
import { showBody, statusBody } from "./api-rules";

describe("the docs page's examples", () => {
  const doc = openApiDocument("https://bzzy.ca");
  const ops = Object.entries(doc.paths).flatMap(([path, methods]) => Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`));

  it("cover every operation, and nothing else", () => {
    expect(Object.keys(API_EXAMPLES).sort()).toEqual(ops.sort());
  });

  it("send bodies the routes accept", () => {
    expect(statusBody.safeParse(API_EXAMPLES["PUT /status"].request).success).toBe(true);
    expect(showBody.safeParse(API_EXAMPLES["PUT /show"].request).success).toBe(true);
  });
});
