import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isPrivateAddress, normalizeCalendarUrl } = await import("./safe-fetch");

describe("normalizeCalendarUrl", () => {
  it("turns webcal links into https", () => {
    expect(normalizeCalendarUrl("webcal://p01-caldav.icloud.com/published/2/abc").toString()).toBe(
      "https://p01-caldav.icloud.com/published/2/abc",
    );
  });
  it("refuses plain http, odd ports and embedded passwords", () => {
    expect(() => normalizeCalendarUrl("http://example.com/cal.ics")).toThrow(/https/);
    expect(() => normalizeCalendarUrl("https://example.com:8443/cal.ics")).toThrow(/port/);
    expect(() => normalizeCalendarUrl("https://me:pw@example.com/cal.ics")).toThrow(/password/);
    expect(() => normalizeCalendarUrl("not a link")).toThrow(/link/);
  });
});

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])(
    "blocks %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["52.96.0.1", "142.250.69.206", "2603:1036::1"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});
