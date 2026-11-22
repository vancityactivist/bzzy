// The OpenAPI 3.1 description of /api/v1, served at /api/v1/openapi.json. Request bodies
// come from the same zod schemas the routes check them with, so the two can't drift.
// Responses are written out by hand; keep them in step with lib/api-snapshot.ts.

import { z } from "zod";

import { LIMITS, pushBody, SCOPES, showBody, statusBody } from "./api-rules";
import { EVENT_INFO, FAILURES_TO_DISABLE, WEBHOOK_EVENTS, webhookInput, webhookPatch } from "./webhook-rules";
import { PATTERNS } from "./push-rules";
import { STATUSES } from "./protocol";

const body = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input" });

const status = { type: "string", enum: [...STATUSES], description: "The status's key. It never changes: use it in code." };
const label = {
  type: "string",
  description: 'What the person calls this status ("Free" unless they renamed it, say to "Come in"). For display only; it can change at any time.',
};
const time = { type: ["string", "null"], format: "date-time" };
const block = {
  type: ["object", "null"],
  properties: { status, label, text: { type: "string" }, start: { type: "string", format: "date-time" }, end: { type: "string", format: "date-time" } },
  required: ["status", "label", "text", "start", "end"],
};
const ring = {
  type: ["object", "null"],
  description: "How the ring moves. null: the status's own style.",
  properties: {
    pattern: { type: "string", enum: [...PATTERNS] },
    color: { type: "string", pattern: "^(#[0-9a-fA-F]{6}|rainbow)$" },
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
      label,
      source: { type: "string", enum: ["manual", "calendar", "default"] },
      text: { type: "string" },
      until: { ...time, description: "When this status ends. null: no end known." },
      manual: {
        type: ["object", "null"],
        properties: {
          status,
          label,
          text: { type: "string" },
          until: time,
          setAt: time,
          setBy: { type: "string", description: '"app", "light", or "api:<token name>"' },
        },
        required: ["status", "label", "text", "until", "setAt", "setBy"],
      },
      meeting: block,
      next: block,
      offHours: { type: "boolean", description: "Outside working hours, when the lights are dark." },
    },
    required: ["status", "label", "source", "text", "until", "manual", "meeting", "next", "offHours"],
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
      follows: { type: "boolean", description: "Shows your status. false: it has its own status, like a boardroom light." },
      online: { type: "boolean" },
      lastSeenAt: time,
      firmwareVersion: { type: ["string", "null"] },
      dark: { type: "boolean", description: "Screen and ring off (outside working hours)." },
      screen: {
        type: "object",
        properties: {
          layout: { type: "string", enum: ["status", "show-gif", "show-text"] },
          status,
          label: { ...label, description: "What this light calls the status: its owner's name for it, or its own." },
          text: { type: "string" },
          until: time,
        },
        required: ["layout", "status", "label", "text", "until"],
      },
      ring,
      push: {
        type: ["object", "null"],
        properties: { id: { type: "string" }, text: { type: "string" }, gif: gifRef },
        required: ["id", "text", "gif"],
      },
    },
    required: ["id", "name", "follows", "online", "lastSeenAt", "firmwareVersion", "dark", "screen", "ring", "push"],
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
  Delivery: {
    type: "object",
    properties: {
      at: { type: "string", format: "date-time" },
      id: { type: "string", description: "The webhook-id it was sent with." },
      type: { type: "string", enum: [...WEBHOOK_EVENTS, "ping"] },
      ok: { type: "boolean" },
      code: { type: ["integer", "null"], description: "The receiver's HTTP status, or null if it never answered." },
      error: { type: ["string", "null"] },
      tries: { type: "integer" },
      ms: { type: "integer" },
    },
    required: ["at", "id", "type", "ok", "code", "error", "tries", "ms"],
  },
  Webhook: {
    type: "object",
    properties: {
      id: { type: "string" },
      url: { type: "string" },
      description: { type: "string" },
      events: { type: "array", items: { type: "string", enum: [...WEBHOOK_EVENTS] } },
      enabled: { type: "boolean", description: `false: turned off, by hand or after ${FAILURES_TO_DISABLE} failed deliveries in a row.` },
      failures: { type: "integer", description: "Failed deliveries in a row." },
      createdAt: { type: "string", format: "date-time" },
      lastDelivery: { anyOf: [{ $ref: "#/components/schemas/Delivery" }, { type: "null" }] },
    },
    required: ["id", "url", "description", "events", "enabled", "failures", "createdAt", "lastDelivery"],
  },
  Team: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      role: { type: "string", enum: ["owner", "admin", "member"] },
      members: { type: "integer" },
      canPush: { type: "boolean", description: "Owners and admins can send and end pushes." },
    },
    required: ["id", "name", "role", "members", "canPush"],
  },
  Push: {
    type: "object",
    properties: {
      id: { type: "string" },
      teamId: { type: "string" },
      text: { type: "string" },
      gif: gifRef,
      ring,
      until: { ...time, description: "When it ends. null: until someone ends it." },
      sentAt: time,
      sentBy: { type: "object", properties: { id: { type: ["string", "null"] }, name: { type: ["string", "null"] } } },
      to: { type: "string", enum: ["everyone", "people"] },
      people: { type: "array", items: { type: "string" }, description: 'User ids, when `to` is "people".' },
      dismissedBy: { type: "array", items: { type: "string" }, description: "User ids who dismissed it on their light." },
      live: { type: "boolean" },
    },
    required: ["id", "teamId", "text", "gif", "ring", "until", "sentAt", "sentBy", "to", "people", "dismissedBy", "live"],
  },
  StatusInput: body(statusBody),
  ShowInput: body(showBody),
  WebhookInput: body(webhookInput),
  WebhookPatch: body(webhookPatch),
  PushInput: body(pushBody),
};

const ref = (name: keyof typeof schemas) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const ok = (description: string, schema: object) => ({ description, content: json(schema) });
const errors = {
  "400": { description: "A field is missing or wrong (`field` names it).", content: json(ref("Error")) },
  "401": { description: "No token, or it was revoked or has expired.", content: json(ref("Error")) },
  "403": { description: "The token doesn't have the scope this needs (`missing_scope`), or you can't do this in that team (`not_allowed`).", content: json(ref("Error")) },
  "429": { description: "Rate limited. Wait `Retry-After` seconds.", content: json(ref("Error")) },
};
const changed = { changed: { type: "boolean", description: "false: it was already like this, so nothing was saved." } };
const notFound = { description: "Not found (`not_found`).", content: json(ref("Error")) };
const op = (o: {
  summary: string;
  scope: string;
  tag: string;
  description?: string;
  request?: keyof typeof schemas;
  response: object;
  created?: boolean;
  // Path parameters: name → description.
  params?: Record<string, string>;
}) => ({
  summary: o.summary,
  ...(o.description ? { description: o.description } : {}),
  tags: [o.tag],
  security: [{ token: [] }],
  "x-bzzy-scope": o.scope,
  ...(o.params
    ? { parameters: Object.entries(o.params).map(([name, description]) => ({ name, in: "path", required: true, description, schema: { type: "string" } })) }
    : {}),
  ...(o.request ? { requestBody: { required: true, content: json(ref(o.request)) } } : {}),
  responses: { [o.created ? "201" : "200"]: o.response, ...errors, ...(o.params ? { "404": notFound } : {}) },
});

// An event bzzy sends, for the document's `webhooks` section.
const event = (type: string, summary: string, data: object) => ({
  post: {
    summary,
    tags: ["Webhooks"],
    description:
      "Signed as Standard Webhooks: check webhook-signature (v1,<base64 HMAC-SHA256 of id.timestamp.body>) with the webhook's whsec_ secret, and drop anything whose webhook-timestamp is more than 5 minutes off.",
    parameters: ["webhook-id", "webhook-timestamp", "webhook-signature"].map((name) => ({ name, in: "header", required: true, schema: { type: "string" } })),
    requestBody: {
      required: true,
      content: json({
        type: "object",
        properties: {
          type: { type: "string", const: type },
          timestamp: { type: "string", format: "date-time" },
          version: { type: "string", const: "1" },
          data,
        },
        required: ["type", "timestamp", "version", "data"],
      }),
    },
    responses: { "2XX": { description: "Received. Anything else counts as a failure and is tried again (3 tries in all)." } },
  },
});
const hookId = { id: "The webhook's id." };
const teamId = { id: "The team's id, from GET /teams." };
const webhook = (extra: object = {}) => ({ type: "object", properties: { webhook: ref("Webhook"), ...extra } });

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
      "/webhooks": {
        get: op({
          summary: "Your webhooks",
          scope: "webhooks",
          tag: "Webhooks",
          response: ok("Every webhook you have.", { type: "object", properties: { webhooks: { type: "array", items: ref("Webhook") } } }),
        }),
        post: op({
          summary: "Add a webhook",
          description: "The answer has the signing secret (whsec_…). It's only shown this once.",
          scope: "webhooks",
          tag: "Webhooks",
          request: "WebhookInput",
          created: true,
          response: ok("The new webhook and its secret.", webhook({ secret: { type: "string" } })),
        }),
      },
      "/webhooks/{id}": {
        get: op({
          summary: "One webhook, with its recent deliveries",
          scope: "webhooks",
          tag: "Webhooks",
          params: hookId,
          response: ok("The webhook.", {
            type: "object",
            properties: { webhook: { allOf: [ref("Webhook"), { type: "object", properties: { recentDeliveries: { type: "array", items: ref("Delivery") } } }] } },
          }),
        }),
        patch: op({
          summary: "Change a webhook, or turn it off or on",
          scope: "webhooks",
          tag: "Webhooks",
          request: "WebhookPatch",
          params: hookId,
          response: ok("The webhook after the change.", webhook()),
        }),
        delete: op({
          summary: "Remove a webhook",
          scope: "webhooks",
          tag: "Webhooks",
          params: hookId,
          response: ok("It's gone.", { type: "object", properties: { deleted: { type: "boolean" } } }),
        }),
      },
      "/teams": {
        get: op({
          summary: "Your teams",
          description: "Shared teams you're in, with your role. Personal teams aren't listed.",
          scope: "read or push",
          tag: "Teams",
          response: ok("The teams.", { type: "object", properties: { teams: { type: "array", items: ref("Team") } } }),
        }),
      },
      "/teams/{id}": {
        get: op({
          summary: "One team: its people and live pushes",
          scope: "read or push",
          tag: "Teams",
          params: teamId,
          response: ok("The team.", {
            type: "object",
            properties: {
              team: ref("Team"),
              members: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "string" }, name: { type: ["string", "null"] }, role: { type: "string", enum: ["owner", "admin", "member"] } },
                },
              },
              pushes: { type: "array", items: ref("Push") },
            },
          }),
        }),
      },
      "/teams/{id}/pushes": {
        post: op({
          summary: "Send a team push",
          description:
            "Puts a message and/or GIF on the lights of everyone in the team, or of the `people` picked, until it ends, someone ends it, or each person dismisses it with their light's button. A newer push replaces an older one. Owners and admins only.",
          scope: "push",
          tag: "Teams",
          request: "PushInput",
          created: true,
          params: teamId,
          response: ok("The push.", { type: "object", properties: { push: ref("Push") } }),
        }),
      },
      "/teams/{id}/pushes/{pushId}": {
        delete: op({
          summary: "End a team push for everyone",
          scope: "push",
          tag: "Teams",
          params: { ...teamId, pushId: "The push's id." },
          response: ok("It's ended.", { type: "object", properties: { ended: { type: "boolean" } } }),
        }),
      },
      "/webhooks/{id}/test": {
        post: op({
          summary: "Send a test event",
          description: "Sends a ping event once and says how it went. Works on a webhook that's off, too. 5 a minute.",
          scope: "webhooks",
          tag: "Webhooks",
          params: hookId,
          response: ok("How the delivery went.", { type: "object", properties: { delivery: ref("Delivery") } }),
        }),
      },
    },
    webhooks: {
      "push.received": event("push.received", EVENT_INFO["push.received"].label, {
        type: "object",
        properties: { team: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } }, push: ref("Push") },
        required: ["team", "push"],
      }),
      "status.changed": event("status.changed", EVENT_INFO["status.changed"].label, {
        type: "object",
        properties: { status: ref("Status"), previous: { anyOf: [ref("Status"), { type: "null" }] } },
        required: ["status", "previous"],
      }),
      "show.changed": event("show.changed", EVENT_INFO["show.changed"].label, {
        type: "object",
        properties: { show: ref("Show"), previous: ref("Show") },
        required: ["show", "previous"],
      }),
      "button.pressed": event("button.pressed", EVENT_INFO["button.pressed"].label, {
        type: "object",
        properties: {
          light: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } }, required: ["id", "name"] },
          status: { type: ["string", "null"], enum: [...STATUSES, null], description: "The status the press chose. null: it went back to the calendar." },
          label: { type: ["string", "null"], description: "What the light calls that status, for display. null with status." },
          pressedAt: time,
        },
        required: ["light", "status", "label", "pressedAt"],
      }),
      ping: event("ping", "A test from Settings or POST /webhooks/{id}/test", {
        type: "object",
        properties: { webhook: { type: "object", properties: { id: { type: "string" }, url: { type: "string" } } }, message: { type: "string" } },
      }),
    },
  };
}
