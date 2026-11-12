// Working out which GIF a pasted GIPHY or Tenor link points at. No network here, so it
// can be tested on its own; lib/gifs.ts does the fetching.
//
// This deliberately doesn't use either service's API: their API terms forbid storing
// copies, which the device has to do to work offline. A link someone copied from the
// site or a share sheet is the same as saving the GIF and uploading it.

export class GifLinkError extends Error {}

export type Provider = "giphy" | "tenor";

export type GifLink = {
  provider: Provider;
  // Media URLs to try in order (smaller fallbacks last), or a page to read the media URL from.
  media: URL[];
  page: URL | null;
  name: string;
};

const GIPHY_HOST = /^(?:www\.|i\.|media\d*\.)?giphy\.com$/;
const GIPHY_SHORT = /^gph\.is$/;
const TENOR_HOST = /^(?:www\.|c\.|media\d*\.)?tenor\.com$/;

// Every hop (redirects included) has to stay on these hosts.
export function isGifHost(host: string): boolean {
  const h = host.toLowerCase();
  return GIPHY_HOST.test(h) || GIPHY_SHORT.test(h) || TENOR_HOST.test(h);
}

const isTenorMediaHost = (h: string) => /^(?:c\.|media\d*\.)tenor\.com$/.test(h);
const GIPHY_ID = /^[A-Za-z0-9]{5,40}$/;

// "cat-funny-JIX9t2j0ZTN9S" -> "Cat funny"; "cat-gif-25209547" -> "Cat"
export function nameFromSlug(slug: string): string {
  const words = decodeURIComponent(slug)
    .split(/[-_]+/)
    .filter(Boolean);
  words.pop(); // the id
  if (words.at(-1)?.toLowerCase() === "gif") words.pop();
  const s = words.join(" ").slice(0, 60).trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

export function giphyMediaUrls(id: string): URL[] {
  // The original first, then GIPHY's "downsized" rendition (under 2 MB) if that's too big.
  return [`https://media.giphy.com/media/${id}/giphy.gif`, `https://media.giphy.com/media/${id}/giphy-downsized.gif`].map(
    (u) => new URL(u),
  );
}

function giphyIdFrom(url: URL): { id: string; slug: string } | null {
  const parts = url.pathname.split("/").filter(Boolean);
  // i.giphy.com/<id>.gif or i.giphy.com/media/<id>/giphy.gif
  if (url.hostname.startsWith("i.") && parts.length === 1) {
    const id = parts[0].replace(/\.(gif|webp|mp4)$/i, "");
    return GIPHY_ID.test(id) ? { id, slug: "" } : null;
  }
  // media*.giphy.com/media/[v1.xxx/]<id>/<file>
  const m = parts.indexOf("media");
  if (m !== -1) {
    const rest = parts.slice(m + 1).filter((p) => !p.startsWith("v1."));
    const id = rest.length >= 2 ? rest[rest.length - 2] : rest[0];
    return id && GIPHY_ID.test(id) ? { id, slug: "" } : null;
  }
  // giphy.com/gifs/<slug>-<id>, /stickers/<slug>-<id>, /embed/<id>, /clips is video and not supported
  if (["gifs", "stickers", "embed"].includes(parts[0]) && parts[1]) {
    const last = parts[1].split("-").pop()!;
    return GIPHY_ID.test(last) ? { id: last, slug: parts[1] } : null;
  }
  return null;
}

export function parseGifLink(raw: string): GifLink {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new GifLinkError("That doesn't look like a link. Copy it from GIPHY or Tenor and paste it here.");
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new GifLinkError("That doesn't look like a GIPHY or Tenor link.");
  }
  const host = url.hostname.toLowerCase();
  if (!isGifHost(host)) throw new GifLinkError("Only GIPHY and Tenor links work here. For anything else, save the GIF and upload it.");

  if (GIPHY_SHORT.test(host)) {
    // gph.is short links redirect to the GIF's page.
    return { provider: "giphy", media: [], page: url, name: "" };
  }
  if (GIPHY_HOST.test(host)) {
    if (url.pathname.startsWith("/clips/")) throw new GifLinkError("GIPHY Clips are videos with sound. Pick a GIF or sticker instead.");
    const found = giphyIdFrom(url);
    if (!found) throw new GifLinkError("Couldn't find a GIF in that GIPHY link. Open the GIF itself and copy its link.");
    return { provider: "giphy", media: giphyMediaUrls(found.id), page: null, name: nameFromSlug(found.slug) };
  }

  // Tenor
  if (isTenorMediaHost(host)) {
    if (!/\.gif$/i.test(url.pathname)) throw new GifLinkError("That Tenor link isn't a GIF. Copy the GIF's page link instead.");
    return { provider: "tenor", media: [url], page: null, name: "" };
  }
  // tenor.com/view/<slug>-<id>, or a short tenor.com/<code>.gif link that redirects there
  const parts = url.pathname.split("/").filter(Boolean);
  const slug = parts[0] === "view" ? (parts[1] ?? "") : "";
  if (parts.length === 0) throw new GifLinkError("Open a GIF on Tenor and copy its link.");
  return { provider: "tenor", media: [], page: url, name: nameFromSlug(slug) };
}

// A GIF's page -> the GIF itself. Tenor puts it in og:image; GIPHY pages list the GIF's
// media URLs. Only URLs on the GIF hosts are accepted.
export function mediaFromPage(provider: Provider, pageUrl: URL, html: string): URL[] {
  if (provider === "giphy") {
    const found = giphyIdFrom(pageUrl);
    if (found) return giphyMediaUrls(found.id);
  }
  const candidates: string[] = [];
  for (const m of html.matchAll(/<meta[^>]+>/gi)) {
    const tag = m[0];
    if (!/(?:property|name)\s*=\s*["'](?:og:image|twitter:image)(?::url)?["']/i.test(tag)) continue;
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (content) candidates.push(content.replace(/&amp;/g, "&"));
  }
  if (provider === "tenor") {
    candidates.push(...(html.match(/https:\/\/media\d*\.tenor\.com\/[^"'\s<>\\]+?\.gif/g) ?? []));
  }
  for (const c of candidates) {
    let u: URL;
    try {
      u = new URL(c, pageUrl);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || !isGifHost(u.hostname) || !/\.gif$/i.test(u.pathname)) continue;
    if (provider === "giphy") {
      const found = giphyIdFrom(u);
      if (found) return giphyMediaUrls(found.id);
      continue;
    }
    return [u];
  }
  throw new GifLinkError("Couldn't find the GIF on that page. Try copying the GIF's own link.");
}
