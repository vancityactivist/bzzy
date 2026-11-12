import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Fetching a URL someone pasted in: HTTPS only, public addresses only, small and quick.
// Stops a calendar link from being pointed at anything inside Vercel's network.

export class FetchRefused extends Error {}

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export function isPrivateAddress(ip: string): boolean {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

// webcal:// is what Outlook and Apple hand out; it's the same feed over HTTPS.
export function normalizeCalendarUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new FetchRefused("That doesn't look like a link.");
  }
  if (url.protocol !== "https:") throw new FetchRefused("Use the https:// (or webcal://) link for your calendar.");
  if (url.username || url.password) throw new FetchRefused("Links with a username or password in them aren't supported.");
  if (url.port && url.port !== "443") throw new FetchRefused("Calendar links on unusual ports aren't supported.");
  return url;
}

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new FetchRefused("That address isn't reachable from the internet.");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new FetchRefused(`Couldn't find ${host}. Check the link.`);
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new FetchRefused("That address isn't reachable from the internet.");
}

export async function fetchPublicText(start: URL): Promise<string> {
  let url = start;
  for (let hop = 0; ; hop++) {
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "user-agent": "bzzy-calendar/1.0" },
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= MAX_REDIRECTS) throw new FetchRefused("The calendar link redirected too many times.");
      url = normalizeCalendarUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new FetchRefused("The calendar server said no. Make sure the calendar is published and the link is the full ICS link.");
    }
    if (res.status === 404) throw new FetchRefused("The calendar server couldn't find that calendar. Was it unpublished?");
    if (!res.ok) throw new FetchRefused(`The calendar server answered with an error (${res.status}).`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new FetchRefused("That calendar file is too big.");

    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new FetchRefused("That calendar file is too big.");
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
}

// Fetching a file from a link someone pasted, where every hop (redirects too) has to stay
// on hosts the caller allows. Errors are FetchRefused with a message fit to show.
export async function fetchPublicBytes(
  start: URL,
  opts: { allowHost: (host: string) => boolean; maxBytes: number; accept: string },
): Promise<{ bytes: Uint8Array; contentType: string; url: URL }> {
  let url = start;
  for (let hop = 0; ; hop++) {
    if (url.protocol !== "https:" || !opts.allowHost(url.hostname)) throw new FetchRefused("That link went somewhere unexpected.");
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: opts.accept, "user-agent": "bzzy/1.0" },
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= MAX_REDIRECTS) throw new FetchRefused("That link redirected too many times.");
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (res.status === 404 || res.status === 410) throw new FetchRefused("That GIF couldn't be found. It may have been removed.");
    if (!res.ok) throw new FetchRefused(`The GIF site answered with an error (${res.status}).`);
    const tooBig = () => new FetchRefused(`That file is over ${Math.round(opts.maxBytes / 1024 / 1024)} MB.`);
    if (Number(res.headers.get("content-length") ?? 0) > opts.maxBytes) throw tooBig();

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        await reader.cancel();
        throw tooBig();
      }
      chunks.push(value);
    }
    return { bytes: new Uint8Array(Buffer.concat(chunks)), contentType: res.headers.get("content-type") ?? "", url };
  }
}
