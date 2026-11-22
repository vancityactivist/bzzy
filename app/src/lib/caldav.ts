import "server-only";

import { calendarData, has, hrefIn, responses, text } from "./dav-xml";
import { davRequest, FetchRefused } from "./safe-fetch";

// A small CalDAV client (RFC 4791), read-only: find someone's calendars, then read a
// week of events. Works with iCloud, Fastmail, Nextcloud and most other servers.

export const PRESETS = {
  icloud: { label: "iCloud", url: "https://caldav.icloud.com/" },
  fastmail: { label: "Fastmail", url: "https://caldav.fastmail.com/dav/" },
} as const;

// The login was refused: a wrong or revoked (app-specific) password.
export class CalDavAuthFailed extends Error {}
export class CalDavError extends Error {}

export function basicAuth(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

const PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
const HOME = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
const LIST = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">
  <d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/><cs:getctag/><a:calendar-color/></d:prop>
</d:propfind>`;
const CTAG = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"><d:prop><cs:getctag/></d:prop></d:propfind>`;

const davTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const query = (from: Date, to: Date) => `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${davTime(from)}" end="${davTime(to)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;

async function dav(url: URL, auth: string, method: string, body: string, depth: "0" | "1") {
  const res = await davRequest(url, { method, body, depth, authorization: auth });
  if (res.status === 401) throw new CalDavAuthFailed("The calendar server didn't accept that login.");
  if (res.status === 404) throw new CalDavError("The calendar server couldn't find that calendar.");
  if (res.status !== 207 && res.status !== 200) throw new CalDavError(`The calendar server answered with an error (${res.status}).`);
  return res;
}

export type CalDavCalendar = { url: string; name: string; ctag: string | null; color: string | null };

export type CalDavDiscovery = { principalUrl: string; homeUrl: string; calendars: CalDavCalendar[] };

// From a server address and login to the person's calendar home and its event calendars.
// Tries the address as given, then /.well-known/caldav.
export async function discoverCalDav(server: URL, auth: string): Promise<CalDavDiscovery> {
  let principal: URL | null = null;
  for (const start of [server, new URL("/.well-known/caldav", server)]) {
    try {
      const res = await dav(start, auth, "PROPFIND", PRINCIPAL, "0");
      const href = responses(res.text).map((r) => hrefIn(r.props, "current-user-principal")).find(Boolean);
      if (href) {
        principal = new URL(href, res.url);
        break;
      }
    } catch (err) {
      if (err instanceof CalDavAuthFailed || err instanceof FetchRefused) throw err;
    }
  }
  if (!principal) throw new CalDavError("That doesn't look like a CalDAV server. Check the address.");
  const homeRes = await dav(principal, auth, "PROPFIND", HOME, "0");
  const homeHref = responses(homeRes.text).map((r) => hrefIn(r.props, "calendar-home-set")).find(Boolean);
  if (!homeHref) throw new CalDavError("The server didn't say where your calendars are.");
  const home = new URL(homeHref, homeRes.url);
  return { principalUrl: principal.toString(), homeUrl: home.toString(), calendars: await listCalDav(home, auth) };
}

// The event calendars in a calendar home (not reminders or task lists).
export async function listCalDav(home: URL, auth: string): Promise<CalDavCalendar[]> {
  const res = await dav(home, auth, "PROPFIND", LIST, "1");
  const out: CalDavCalendar[] = [];
  for (const r of responses(res.text)) {
    if (!has(r.props, "calendar")) continue;
    const comps = r.props.match(/<(?:[\w-]+:)?comp\s+name=["'](\w+)["']/g);
    if (comps && !comps.some((c) => c.includes("VEVENT"))) continue;
    const url = new URL(r.href, res.url).toString();
    out.push({
      url,
      name: text(r.props, "displayname") || decodeURIComponent(url.replace(/\/$/, "").split("/").pop() ?? "Calendar"),
      ctag: text(r.props, "getctag"),
      color: text(r.props, "calendar-color"),
    });
  }
  return out;
}

export async function calDavCtag(calendar: URL, auth: string): Promise<string | null> {
  const res = await dav(calendar, auth, "PROPFIND", CTAG, "0");
  return responses(res.text).map((r) => text(r.props, "getctag")).find(Boolean) ?? null;
}

// The iCalendar objects with an event between `from` and `to` (recurring ones whole; the
// ICS reader expands them).
export async function calDavObjects(calendar: URL, auth: string, from: Date, to: Date): Promise<string[]> {
  const res = await dav(calendar, auth, "REPORT", query(from, to), "1");
  return responses(res.text)
    .map((r) => calendarData(r.props))
    .filter((d): d is string => !!d && d.includes("BEGIN:VCALENDAR"));
}
