import { describe, expect, it } from "vitest";

import { openApiDocument } from "./api-openapi";

describe("the OpenAPI document", () => {
  const doc = openApiDocument("https://bzzy.ca");

  it("lists every route", () => {
    expect(Object.keys(doc.paths).sort()).toEqual(["/gifs", "/lights", "/me", "/show", "/status"]);
    expect(doc.servers[0].url).toBe("https://bzzy.ca/api/v1");
  });

  it("builds request bodies from the route schemas", () => {
    const input = doc.components.schemas.StatusInput as { properties: Record<string, { enum?: string[] }>; required?: string[] };
    expect(input.properties.status.enum).toEqual(["free", "busy", "dnd", "away"]);
    expect(input.required).toEqual(["status"]);
    expect(Object.keys(input.properties).sort()).toEqual(["minutes", "status", "text", "until"]);
  });

  it("is plain JSON", () => {
    expect(() => JSON.parse(JSON.stringify(doc))).not.toThrow();
  });
});
