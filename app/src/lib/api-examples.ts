// Example requests and responses for the API docs page (app/docs/api). Keyed by
// "METHOD /path" as in the OpenAPI document; lib/api-examples.test.ts checks that every
// operation has one and that the bodies pass the routes' own schemas.

const status = {
  status: "busy",
  source: "manual",
  text: "On a call",
  until: "2026-11-16T18:45:00.000Z",
  manual: { status: "busy", text: "On a call", until: "2026-11-16T18:45:00.000Z", setAt: "2026-11-16T18:00:00.000Z", setBy: "api:Stream Deck" },
  meeting: null,
  next: { status: "busy", text: "Council meeting", start: "2026-11-16T21:00:00.000Z", end: "2026-11-16T22:00:00.000Z" },
  offHours: false,
};

const show = {
  text: "Back at 2",
  gif: { id: "builtin:busy-pulse", name: "Pulse" },
  ring: { pattern: "pulse", color: "#2979ff" },
  until: "2026-11-16T18:30:00.000Z",
  setAt: "2026-11-16T18:00:00.000Z",
  hiddenByPush: false,
};

const delivery = { at: "2026-11-16T18:00:01.000Z", id: "msg_2bXq7RkVd3pT9mWc4LhN8sJy", type: "status.changed", ok: true, code: 200, error: null, tries: 1, ms: 143 };

const webhook = {
  id: "0b6f…",
  url: "https://ha.example.com/api/webhook/bzzy-7f3k2q",
  description: "Home Assistant",
  events: ["button.pressed", "show.changed", "status.changed"],
  enabled: true,
  failures: 0,
  createdAt: "2026-11-16T17:40:00.000Z",
  lastDelivery: delivery,
};

export type ApiExample = { request?: unknown; response: unknown };

export const API_EXAMPLES: Record<string, ApiExample> = {
  "GET /me": {
    response: {
      user: { id: "8c1d…", name: "Adam", timeZone: "America/Vancouver" },
      token: { id: "f3a9…", name: "Stream Deck", scopes: ["read", "show", "status"], expiresAt: "2027-11-16T18:00:00.000Z" },
    },
  },
  "GET /status": {
    response: {
      ...status,
      source: "calendar",
      text: "Standup",
      until: "2026-11-16T17:30:00.000Z",
      manual: null,
      meeting: { status: "busy", text: "Standup", start: "2026-11-16T17:00:00.000Z", end: "2026-11-16T17:30:00.000Z" },
    },
  },
  "PUT /status": {
    request: { status: "busy", text: "On a call", minutes: 45 },
    response: { ...status, changed: true },
  },
  "DELETE /status": {
    response: { ...status, status: "free", source: "default", text: "", until: "2026-11-16T21:00:00.000Z", manual: null, changed: true },
  },
  "GET /show": { response: { show } },
  "PUT /show": {
    request: { text: "Back at 2", gif: "builtin:busy-pulse", ring: { pattern: "pulse", color: "#2979ff" }, minutes: 30 },
    response: { show, changed: true },
  },
  "DELETE /show": { response: { show: null, changed: true } },
  "GET /lights": {
    response: {
      lights: [
        {
          id: "bz-k7qf2m",
          name: "Desk",
          online: true,
          lastSeenAt: "2026-11-16T18:00:12.000Z",
          firmwareVersion: "0.2.0",
          dark: false,
          screen: { layout: "show-gif", status: "busy", text: "Back at 2", until: "2026-11-16T18:30:00.000Z" },
          ring: { pattern: "pulse", color: "#2979ff" },
          push: null,
        },
      ],
    },
  },
  "GET /gifs": {
    response: {
      gifs: [
        { id: "asset:5b0e…", name: "Coffee run", kind: "upload", status: null, addedAt: "2026-11-12T19:04:00.000Z" },
        { id: "builtin:busy-pulse", name: "Pulse", kind: "builtin", status: "busy", addedAt: null },
      ],
    },
  },
  "GET /webhooks": { response: { webhooks: [webhook] } },
  "POST /webhooks": {
    request: { url: webhook.url, events: ["status.changed", "show.changed", "button.pressed"], description: "Home Assistant" },
    response: { webhook: { ...webhook, lastDelivery: null }, secret: "whsec_Qm9vZ…" },
  },
  "GET /webhooks/{id}": { response: { webhook: { ...webhook, recentDeliveries: [delivery] } } },
  "PATCH /webhooks/{id}": { request: { enabled: false }, response: { webhook: { ...webhook, enabled: false } } },
  "DELETE /webhooks/{id}": { response: { deleted: true } },
  "POST /webhooks/{id}/test": { response: { delivery: { ...delivery, type: "ping", ms: 98 } } },
};

// The events bzzy sends, as the docs page shows them (lib/webhooks.ts).
export const WEBHOOK_EXAMPLES: Record<string, unknown> = {
  "status.changed": {
    type: "status.changed",
    timestamp: "2026-11-16T17:00:04.000Z",
    version: "1",
    data: {
      status: API_EXAMPLES["GET /status"].response,
      previous: { ...status, status: "free", source: "default", text: "", until: "2026-11-16T17:00:00.000Z", manual: null, meeting: null },
    },
  },
  "show.changed": { type: "show.changed", timestamp: "2026-11-16T18:00:00.000Z", version: "1", data: { show, previous: null } },
  "button.pressed": {
    type: "button.pressed",
    timestamp: "2026-11-16T18:10:00.000Z",
    version: "1",
    data: { light: { id: "bz-k7qf2m", name: "Desk" }, status: "dnd", pressedAt: "2026-11-16T18:09:59.000Z" },
  },
  ping: {
    type: "ping",
    timestamp: "2026-11-16T17:40:05.000Z",
    version: "1",
    data: { webhook: { id: "0b6f…", url: webhook.url }, message: "A test from bzzy. If you can read this, it works." },
  },
};
