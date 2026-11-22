import { afterEach, describe, expect, it, vi } from "vitest";

import { expectedHostnames, judgeSiteverify, verifyTurnstile } from "./turnstile";

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

const hosts = new Set(["bzzy.ca"]);

describe("judgeSiteverify", () => {
  it("passes a successful check for the right action and host", () => {
    expect(judgeSiteverify({ success: true, action: "contact", hostname: "bzzy.ca" }, "contact", hosts)).toEqual({ ok: true });
  });
  it("rejects a failed check", () => {
    expect(judgeSiteverify({ success: false, "error-codes": ["invalid-input-response"] }, "contact", hosts).ok).toBe(false);
  });
  it("rejects a token minted for another action, or none", () => {
    expect(judgeSiteverify({ success: true, action: "login", hostname: "bzzy.ca" }, "contact", hosts).ok).toBe(false);
    expect(judgeSiteverify({ success: true, hostname: "bzzy.ca" }, "contact", hosts).ok).toBe(false);
  });
  it("rejects a token solved on another host", () => {
    expect(judgeSiteverify({ success: true, action: "contact", hostname: "localhost" }, "contact", hosts).ok).toBe(false);
    expect(judgeSiteverify({ success: true, action: "contact" }, "contact", hosts).ok).toBe(false);
  });
});

describe("expectedHostnames", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("defaults to bzzy.ca", () => {
    vi.stubEnv("TURNSTILE_HOSTNAMES", "");
    expect([...expectedHostnames()]).toEqual(["bzzy.ca"]);
  });
  it("reads a comma-separated list", () => {
    vi.stubEnv("TURNSTILE_HOSTNAMES", " bzzy.ca, localhost ");
    expect([...expectedHostnames()]).toEqual(["bzzy.ca", "localhost"]);
  });
});

describe("verifyTurnstile", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets everything through when no secret is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile("", null, "contact")).toEqual({ ok: true });
  });

  it("needs a token once a secret is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    expect(await verifyTurnstile("", null, "contact")).toEqual({ ok: false, reason: "missing" });
  });

  it("sends the secret, token and IP to Siteverify", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const f = ok({ success: true, action: "contact", hostname: "bzzy.ca" });
    expect(await verifyTurnstile("tok", "1.2.3.4", "contact", f)).toEqual({ ok: true });
    const body = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("fails closed when Cloudflare can't be reached", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const f = vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", null, "contact", f)).toEqual({ ok: false, reason: "unreachable" });
  });
});
