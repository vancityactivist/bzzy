import { describe, expect, it } from "vitest";

import type { ApiShow, ApiStatus } from "./api-rules";
import {
  changesToSend,
  checkWebhookUrl,
  decodeEvents,
  deliveryError,
  encodeEvents,
  envelope,
  newMessageId,
  newWebhookSecret,
  type Seen,
  signWebhook,
  webhookInput,
  webhookPatch,
} from "./webhook-rules";
import { seal, unseal } from "./seal";

const bytes = (seed: number) => (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 97 + seed) % 256);

describe("signing", () => {
  it("matches the Standard Webhooks reference signature", () => {
    // The example from the Standard Webhooks libraries' own tests.
    const sig = signWebhook("whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", "msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, '{"test": 2432232314}');
    expect(sig).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("makes whsec_ secrets of 32 bytes and msg_ ids", () => {
    const s = newWebhookSecret(bytes(1));
    expect(s).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/);
    expect(Buffer.from(s.slice(6), "base64")).toHaveLength(32);
    expect(newMessageId(bytes(2))).toMatch(/^msg_[0-9A-Za-z]{24}$/);
  });

  it("wraps events the same way every time", () => {
    expect(envelope("ping", { a: 1 }, Date.UTC(2026, 10, 16, 18))).toEqual({
      type: "ping",
      timestamp: "2026-11-16T18:00:00.000Z",
      version: "1",
      data: { a: 1 },
    });
  });
});

describe("secrets at rest", () => {
  it("round-trips, and refuses tampering or another key", () => {
    process.env.AUTH_SECRET = "test-secret";
    const sealed = seal("whsec_abc");
    expect(sealed).not.toContain("whsec_abc");
    expect(unseal(sealed)).toBe("whsec_abc");
    expect(seal("whsec_abc")).not.toBe(sealed);
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);
    expect(unseal(flipped)).toBeNull();
    process.env.AUTH_SECRET = "another";
    expect(unseal(sealed)).toBeNull();
  });
});

describe("webhook input", () => {
  it("takes https links only", () => {
    expect(checkWebhookUrl("https://example.com/hook")).toBeNull();
    expect(checkWebhookUrl("http://example.com/hook")).toMatch(/https/);
    expect(checkWebhookUrl("https://me:pw@example.com/")).toMatch(/password/);
    expect(checkWebhookUrl("not a link")).toMatch(/link/);
  });

  it("needs a URL and at least one event", () => {
    expect(webhookInput.safeParse({ url: "https://example.com", events: ["status.changed"] }).success).toBe(true);
    expect(webhookInput.safeParse({ url: "https://example.com", events: [] }).success).toBe(false);
    expect(webhookInput.safeParse({ url: "https://example.com", events: ["push.received"] }).success).toBe(false);
    expect(webhookInput.safeParse({ url: "http://example.com", events: ["status.changed"] }).success).toBe(false);
    expect(webhookPatch.safeParse({ enabled: true }).success).toBe(true);
    expect(webhookPatch.safeParse({ secret: "x" }).success).toBe(false);
  });

  it("stores events sorted, and drops ones it doesn't know", () => {
    expect(encodeEvents(["status.changed", "button.pressed", "status.changed"])).toBe("button.pressed,status.changed");
    expect(decodeEvents("status.changed,nope,show.changed")).toEqual(["show.changed", "status.changed"]);
  });
});

const status = (over: Partial<ApiStatus> = {}): ApiStatus => ({
  status: "free",
  source: "default",
  text: "",
  until: null,
  manual: null,
  meeting: null,
  next: null,
  offHours: false,
  ...over,
});
const show = (over: Partial<ApiShow> = {}): ApiShow => ({
  text: "Back at 2",
  gif: null,
  ring: null,
  until: null,
  setAt: "2026-11-16T18:00:00.000Z",
  hiddenByPush: false,
  ...over,
});
const seen = (s: ApiStatus, sh: ApiShow | null = null, stamp = 100): Seen => ({ status: s, show: sh, stamp });

describe("what's worth sending", () => {
  it("sends a status that changed, and nothing when it didn't", () => {
    const busy = seen(status({ status: "busy", source: "calendar", text: "Standup" }));
    expect(changesToSend(seen(status()), busy, "poll")).toEqual({ status: true, show: false, save: true });
    expect(changesToSend(busy, busy, "poll")).toEqual({ status: false, show: false, save: false });
  });

  it("doesn't count the meeting list moving on, or a push hiding Show now", () => {
    const a = seen(status({ next: { status: "busy", text: "A", start: "x", end: "y" } }), show());
    const b = seen(status({ next: null }), show({ hiddenByPush: true }));
    expect(changesToSend(a, b, "poll")).toEqual({ status: false, show: false, save: false });
  });

  it("counts working hours starting or ending", () => {
    expect(changesToSend(seen(status()), seen(status({ offHours: true })), "poll").status).toBe(true);
  });

  it("sends Show now going up and coming down", () => {
    expect(changesToSend(seen(status()), seen(status(), show()), { status: false, show: true }).show).toBe(true);
    expect(changesToSend(seen(status(), show()), seen(status(), null), "poll").show).toBe(true);
  });

  it("with nothing to compare, a poll only notes where things are", () => {
    expect(changesToSend(null, seen(status()), "poll")).toEqual({ status: false, show: false, save: true });
    // A write says what it changed; an empty Show now isn't news.
    expect(changesToSend(null, seen(status({ status: "busy" })), { status: true, show: true })).toEqual({ status: true, show: false, save: true });
  });

  it("doesn't let a poll working from an older copy undo a newer write", () => {
    const newer = seen(status({ status: "busy", source: "manual" }), null, 200);
    const older = seen(status(), null, 150);
    expect(changesToSend(newer, older, "poll")).toEqual({ status: false, show: false, save: false });
  });
});

describe("delivery results", () => {
  it("says why a delivery failed", () => {
    expect(deliveryError(204)).toBeNull();
    expect(deliveryError(500)).toBe("Answered 500.");
    expect(deliveryError(301)).toMatch(/Redirected/);
    const timeout = Object.assign(new Error("x"), { name: "TimeoutError" });
    expect(deliveryError(null, timeout)).toMatch(/No answer within 5 s/);
    expect(deliveryError(null)).toBe("Couldn't connect.");
  });
});
