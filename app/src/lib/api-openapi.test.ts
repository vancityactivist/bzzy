import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openApiDocument } from "./api-openapi";

describe("the OpenAPI document", () => {
  const doc = openApiDocument("https://bzzy.ca");

  it("lists every route", () => {
    expect(Object.keys(doc.paths).sort()).toEqual(["/gifs", "/lights", "/me", "/show", "/status", "/webhooks", "/webhooks/{id}", "/webhooks/{id}/test"]);
    expect(doc.servers[0].url).toBe("https://bzzy.ca/api/v1");
  });

  it("builds request bodies from the route schemas", () => {
    const input = doc.components.schemas.StatusInput as { properties: Record<string, { enum?: string[] }>; required?: string[] };
    expect(input.properties.status.enum).toEqual(["free", "busy", "dnd", "away"]);
    expect(input.required).toEqual(["status"]);
    expect(Object.keys(input.properties).sort()).toEqual(["minutes", "status", "text", "until"]);
  });

  it("has a route file for every path, with every method", () => {
    for (const [path, methods] of Object.entries(doc.paths)) {
      const file = join(__dirname, "../app/api/v1", path.replace("{id}", "[id]"), "route.ts");
      const src = readFileSync(file, "utf8");
      for (const m of Object.keys(methods)) expect(src, `${m.toUpperCase()} ${path}`).toContain(`export const ${m.toUpperCase()} =`);
    }
  });

  it("describes every webhook event", () => {
    expect(Object.keys(doc.webhooks).sort()).toEqual(["button.pressed", "ping", "show.changed", "status.changed"]);
    const input = doc.components.schemas.WebhookInput as { required?: string[] };
    expect(input.required).toEqual(["url", "events"]);
  });

  it("is plain JSON", () => {
    expect(() => JSON.parse(JSON.stringify(doc))).not.toThrow();
  });
});
