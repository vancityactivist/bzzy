import { describe, expect, it } from "vitest";

import { calendarData, has, hrefIn, responses, text } from "./dav-xml";

const home = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/123/calendars/</href>
    <propstat><prop><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat>
  </response>
  <response>
    <href>/123/calendars/home/</href>
    <propstat>
      <prop>
        <displayname>Home &amp; Family</displayname>
        <resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
        <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/></supported-calendar-component-set>
        <getctag xmlns="http://calendarserver.org/ns/">HwoQEgwAAA</getctag>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
    <propstat><prop><calendar-color/></prop><status>HTTP/1.1 404 Not Found</status></propstat>
  </response>
</multistatus>`;

describe("dav-xml", () => {
  it("reads responses, props and nested hrefs whatever the prefix", () => {
    const r = responses(home);
    expect(r.map((x) => x.href)).toEqual(["/123/calendars/", "/123/calendars/home/"]);
    expect(has(r[1].props, "calendar")).toBe(true);
    expect(has(r[0].props, "calendar")).toBe(false);
    expect(text(r[1].props, "displayname")).toBe("Home & Family");
    expect(text(r[1].props, "getctag")).toBe("HwoQEgwAAA");
    expect(has(r[1].props, "calendar-color")).toBe(false); // only in the 404 propstat

    const principal = `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop>
      <d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
    expect(hrefIn(responses(principal)[0].props, "current-user-principal")).toBe("/123/principal/");
  });

  it("gets calendar data out of a REPORT, CDATA or escaped", () => {
    const cdata = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><href>/a.ics</href>
      <propstat><prop><C:calendar-data><![CDATA[BEGIN:VCALENDAR
END:VCALENDAR]]></C:calendar-data></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
    expect(calendarData(responses(cdata)[0].props)).toBe("BEGIN:VCALENDAR\nEND:VCALENDAR");
    const escaped = cdata.replace("<![CDATA[BEGIN:VCALENDAR\nEND:VCALENDAR]]>", "BEGIN:VCALENDAR\nSUMMARY:A &amp; B\nEND:VCALENDAR");
    expect(calendarData(responses(escaped)[0].props)).toContain("SUMMARY:A & B");
  });
});
