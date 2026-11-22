// Just enough WebDAV XML reading for CalDAV multistatus answers, without an XML library.
// Namespace prefixes vary by server (d:, D:, none), so tags are matched by local name.
// Pure, so it can be tested against real server answers.

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

const tag = (name: string) => `(?:[A-Za-z][\\w.-]*:)?${name}`;

// Every <name>...</name> body (or empty for <name/>) in `xml`.
export function elements(xml: string, name: string): string[] {
  const re = new RegExp(`<${tag(name)}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tag(name)}\\s*>)`, "g");
  return [...xml.matchAll(re)].map((m) => m[1] ?? "");
}

export function text(xml: string, name: string): string | null {
  const first = elements(xml, name)[0];
  return first === undefined ? null : decode(first).trim();
}

export function has(xml: string, name: string): boolean {
  return new RegExp(`<${tag(name)}[\\s/>]`).test(xml);
}

export type DavResponse = { href: string; props: string };

// The <response>s of a multistatus, each with its href and the props from its 200 propstat.
export function responses(xml: string): DavResponse[] {
  return elements(xml, "response").map((r) => {
    const ok = elements(r, "propstat").filter((p) => /\s200\s/.test(` ${text(p, "status") ?? ""} `));
    return { href: decode(text(r, "href") ?? ""), props: ok.join("\n") };
  });
}

// The href inside a property, such as <current-user-principal><href>/123/principal/</href>.
export function hrefIn(props: string, property: string): string | null {
  const inner = elements(props, property)[0];
  return inner === undefined ? null : text(inner, "href");
}

export function calendarData(props: string): string | null {
  const v = elements(props, "calendar-data")[0];
  return v === undefined ? null : decode(v);
}
