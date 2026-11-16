// The OpenAPI 3.1 description of /api/v1, served at /api/v1/openapi.json. Request bodies
// come from the same zod schemas the routes check them with, so the two can't drift.
// Responses are written out by hand; keep them in step with lib/api-snapshot.ts.

import { z } from "zod";

import { LIMITS, SCOPES, showBody, statusBody } from "./api-rules";
import { PATTERNS } from "./push-rules";
import { STATUSES } from "./protocol";

const body = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input" });

const status = { type: "string", enum: [...STATUSES] };
const time = { type: ["string", "null"], format: "date-time" };
const block = {
  type: ["object", "null"],
  properties: { status, text: { type: "string" }, start: { type: "string", format: "date-time" }, end: { type: "string", format: "date-time" } },
  required: ["status", "text", "start", "end"],
};
const ring = {
  type: ["object", "null"],
  description: "How the ring moves. null: the status's own style.",
  properties: {
    pattern: { type: "string", enum: [...PATTERNS] },
    color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
    speed: { type: "integer", minimum: 1, maximum: 3 },
    for: { type: "integer", minimum: 0, maximum: 3600, description: "Seconds of flashing before the ring goes steady." },
  },
  required: ["pattern"],
};
const gifRef = { type: ["object", "null"], properties: { id: { type: "string" }, name: { type: "string" } }, required: ["id", "name"] };

const schemas = {
  Error: {
    type: "object",
    properties: {
      error: {
        type: "object",
        properties: { code: { type: "string" }, message: { type: "string" }, field: { type: ["string", "null"] } },
        required: ["code", "message", "field"],
      },
    },
    required: ["error"],
  },
  Status: {
    type: "object",
    properties: {
      status,
      source: { type: "string", enum: ["manual", "calendar", "default"] },
      text: { type: "string" },
      until: { ...time, description: "When this status ends. null: no end known." },
      manual: {
        type: ["object", "null"],
        properties: {
          status,
          text: { type: "string" },
          until: time,
          setAt: time,
          setBy: { type: "string", description: '"app", "light", or "api:<token name>"' },
        },
        required: ["status", "text", "until", "setAt", "setBy"],
      },
      meeting: block,
      next: block,
      offHours: { type: "boolean", description: "Outside working hours, when the lights are dark." },
    },
    required: ["status", "source", "text", "until", "manual", "meeting", "next", "offHours"],
  },
  Show: {
    type: ["object", "null"],
    properties: {
      text: { type: "string" },
      gif: gifRef,
      ring,
      until: time,
      setAt: time,
      hiddenByPush: { type: "boolean", description: "A team push is on the lights in its place for now." },
    },
    required: ["text", "gif", "ring", "until", "setAt", "hiddenByPush"],
  },
  Light: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      online: { type: "boolean" },
      lastSeenAt: time,
      firmwareVersion: { type: ["string", "null"] },
      dark: { type: "boolean", description: "Screen and ring off (outside working hours)." },
      screen: {
        type: "object",
        properties: {
          layout: { type: "string", enum: ["status", "show-gif", "show-text"] },
          status,
          text: { type: "string" },
          until: time,
        },
        required: ["layout", "status", "text", "until"],
      },
      ring,
      push: {
        type: ["object", "null"],
        properties: { id: { type: "string" }, text: { type: "string" }, gif: gifRef },
        required: ["id", "text", "gif"],
      },
    },
    required: ["id", "name", "online", "lastSeenAt", "firmwareVersion", "dark", "screen", "ring", "push"],
  },
  Gif: {
    type: "object",
    properties: {
      id: { type: "string", description: '"builtin:<id>" or "asset:<id>", for PUT /v1/show' },
      name: { type: "string" },
      kind: { type: "string", enum: ["builtin", "upload"] },
      status: { type: ["string", "null"], enum: [...STATUSES, null] },
      addedAt: time,
    },
    required: ["id", "name", "kind", "status", "addedAt"],
  },
  StatusInput: body(statusBody),
  ShowInput: body(showBody),
};

const ref = (name: keyof typeof schemas) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const ok = (description: string, schema: object) => ({ description, content: json(schema) });
const errors = {
  "400": { description: "A field is missing or wrong (`field` names it).", content: json(ref("Error")) },
  "401": { description: "No token, or it was revoked or has expired.", content: json(ref("Error")) },
  "403": { description: "The token doesn't have the scope this needs.", content: json(ref("Error")) },
  "429": { description: "Rate limited. Wait `Retry-After` seconds.", content: json(ref("Error")) },
};
const changed = { changed: { type: "boolean", description: "false: it was already like this, so nothing was saved." } };
const op = (o: { summary: string; scope: string; tag: string; description?: string; request?: keyof typeof schemas; response: object }) => ({
  summary: o.summary,
  ...(o.description ? { description: o.description } : {}),
  tags: [o.tag],
  security: [{ token: [] }],
  "x-bzzy-scope": o.scope,
  ...(o.request ? { requestBody: { required: true, content: json(ref(o.request)) } } : {}),
  responses: { "200": o.response, ...errors },
});

export function openApiDocument(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "bzzy API",
      version: "1",
      description: `Set and read a person's status and Show now, and see what their lights show. Authenticate with a personal token from Settings (Authorization: Bearer bzzy_pat_…). Scopes: ${SCOPES.join(", ")}. Limits per token: ${LIMITS.read} reads and ${LIMITS.write} writes a minute. Times are ISO 8601 in UTC.`,
      license: { name: "PolyForm Noncommercial 1.0.0", url: "https://polyformproject.org/licenses/noncommercial/1.0.0/" },
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    components: {
      securitySchemes: { token: { type: "http", scheme: "bearer", description: "A personal access token from Settings, bzzy_pat_…" } },
      schemas,
    },
    paths: {
      "/me": {
        get: op({
          summary: "Who the token belongs to",
          scope: "any",
          tag: "Account",
          response: ok("The person and the token.", {
            type: "object",
            properties: {
              user: { type: "object", properties: { id: { type: "string" }, name: { type: ["string", "null"] }, timeZone: { type: "string" } } },
              token: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  scopes: { type: "array", items: { type: "string", enum: [...SCOPES] } },
                  expiresAt: time,
                },
              },
            },
          }),
        }),
      },
      "/status": {
        get: op({ summary: "The status the lights show now, and why", scope: "read", tag: "Status", response: ok("The status.", ref("Status")) }),
        put: op({
          summary: "Set a manual status",
          description: "Send `minutes` or `until` to end it (up to 7 days ahead), or neither to keep it until cleared. Takes down Show now, as a press on the light does.",
          scope: "status",
          tag: "Status",
          request: "StatusInput",
          response: ok("The status after the change.", { allOf: [ref("Status"), { type: "object", properties: changed }] }),
        }),
        delete: op({
          summary: "Clear the manual status",
          description: "Back to the calendar, or the light's default. Also takes down Show now.",
          scope: "status",
          tag: "Status",
          response: ok("The status after the change.", { allOf: [ref("Status"), { type: "object", properties: changed }] }),
        }),
      },
      "/show": {
        get: op({ summary: "The current Show now", scope: "read", tag: "Show now", response: ok("Show now, or null.", { type: "object", properties: { show: ref("Show") } }) }),
        put: op({
          summary: "Put a message and/or GIF on the lights",
          description: "`gif` is an id from GET /gifs. Text is cut to what the screen holds (47 bytes).",
          scope: "show",
          tag: "Show now",
          request: "ShowInput",
          response: ok("Show now after the change.", { type: "object", properties: { show: ref("Show"), ...changed } }),
        }),
        delete: op({
          summary: "Take Show now down",
          scope: "show",
          tag: "Show now",
          response: ok("Show now after the change.", { type: "object", properties: { show: ref("Show"), ...changed } }),
        }),
      },
      "/lights": {
        get: op({
          summary: "The lights and what each one shows",
          scope: "read",
          tag: "Lights",
          response: ok("The person's lights.", { type: "object", properties: { lights: { type: "array", items: ref("Light") } } }),
        }),
      },
      "/gifs": {
        get: op({
          summary: "GIFs that Show now can use",
          scope: "read",
          tag: "Show now",
          response: ok("Built-in GIFs and the uploads of the person's teams.", { type: "object", properties: { gifs: { type: "array", items: ref("Gif") } } }),
        }),
      },
    },
  };
}
