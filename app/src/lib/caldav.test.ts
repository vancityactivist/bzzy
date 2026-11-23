import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "17.0.0.1" }] }));

import { basicAuth, CalDavAuthFailed, calDavObjects, discoverCalDav } from "./caldav";

const ms = (body: string) => `<?xml version="1.0"?><multistatus xmlns="DAV:">${body}</multistatus>`;
const ok = (href: string, props: string) =>
  `<response><href>${href}</href><propstat><prop>${props}</prop><status>HTTP/1.1 200 OK</status></propstat></response>`;

type Call = { url: string; method: string; auth: string | null; body: string };

function fakeServer(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const c = { url: String(input), method: init.method ?? "GET", auth: headers.get("authorization"), body: String(init.body ?? "") };
    calls.push(c);
    return handler(c);
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const AUTH = basicAuth("me@icloud.com", "abcd-efgh-ijkl-mnop");

describe("discoverCalDav", () => {
  it("follows iCloud's redirect to its own host, finds the home and only event calendars", async () => {
    const calls = fakeServer((c) => {
      if (c.url === "https://caldav.icloud.com/") return new Response(null, { status: 301, headers: { location: "https://p42-caldav.icloud.com/" } });
      if (c.url === "https://p42-caldav.icloud.com/")
        return new Response(ms(ok("/", "<current-user-principal><href>/123/principal/</href></current-user-principal>")), { status: 207 });
      if (c.url.endsWith("/123/principal/"))
        return new Response(
          ms(ok("/123/principal/", '<calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href>https://p42-caldav.icloud.com/123/calendars/</href></calendar-home-set>')),
          { status: 207 },
        );
      return new Response(
        ms(
          ok("/123/calendars/", "<resourcetype><collection/></resourcetype>") +
            ok(
              "/123/calendars/home/",
              '<displayname>Home</displayname><resourcetype><collection/><C:calendar xmlns:C="urn:ietf:params:xml:ns:caldav"/></resourcetype><C:supported-calendar-component-set xmlns:C="urn:ietf:params:xml:ns:caldav"><C:comp name="VEVENT"/></C:supported-calendar-component-set>',
            ) +
            ok(
              "/123/calendars/tasks/",
              '<displayname>Reminders</displayname><resourcetype><collection/><C:calendar xmlns:C="urn:ietf:params:xml:ns:caldav"/></resourcetype><C:supported-calendar-component-set xmlns:C="urn:ietf:params:xml:ns:caldav"><C:comp name="VTODO"/></C:supported-calendar-component-set>',
            ),
        ),
        { status: 207 },
      );
    });
    const found = await discoverCalDav(new URL("https://caldav.icloud.com/"), AUTH);
    expect(found.homeUrl).toBe("https://p42-caldav.icloud.com/123/calendars/");
    expect(found.calendars).toEqual([{ url: "https://p42-caldav.icloud.com/123/calendars/home/", name: "Home", ctag: null, color: null }]);
    expect(calls.every((c) => c.auth === AUTH)).toBe(true);
  });

  it("doesn't send the login to a different site on redirect", async () => {
    const calls = fakeServer((c) =>
      new URL(c.url).host === "dav.example.com"
        ? new Response(null, { status: 302, headers: { location: "https://evil.example.org/" } })
        : new Response("", { status: 401 }),
    );
    await expect(discoverCalDav(new URL("https://dav.example.com/"), AUTH)).rejects.toBeInstanceOf(CalDavAuthFailed);
    expect(calls.find((c) => new URL(c.url).host === "evil.example.org")?.auth).toBeNull();
  });

  it("says when the password is refused", async () => {
    fakeServer(() => new Response("", { status: 401 }));
    await expect(discoverCalDav(new URL("https://caldav.icloud.com/"), AUTH)).rejects.toBeInstanceOf(CalDavAuthFailed);
  });
});

describe("calDavObjects", () => {
  it("asks for a time range and returns the calendar data", async () => {
    const calls = fakeServer(
      () =>
        new Response(
          ms(ok("/123/calendars/home/a.ics", '<C:calendar-data xmlns:C="urn:ietf:params:xml:ns:caldav">BEGIN:VCALENDAR\nEND:VCALENDAR</C:calendar-data>')),
          { status: 207 },
        ),
    );
    const out = await calDavObjects(new URL("https://p42-caldav.icloud.com/123/calendars/home/"), AUTH, new Date("2026-11-23T08:00:00Z"), new Date("2026-12-01T08:00:00Z"));
    expect(out).toEqual(["BEGIN:VCALENDAR\nEND:VCALENDAR"]);
    expect(calls[0].method).toBe("REPORT");
    expect(calls[0].body).toContain('start="20261123T080000Z"');
  });
});
