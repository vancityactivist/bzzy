import { describe, expect, it } from "vitest";

import { GifLinkError, isGifHost, mediaFromPage, nameFromSlug, parseGifLink } from "./gif-link";

const giphyOriginal = (id: string) => `https://media.giphy.com/media/${id}/giphy.gif`;

describe("parseGifLink", () => {
  it.each([
    ["https://giphy.com/gifs/cat-funny-JIX9t2j0ZTN9S", "JIX9t2j0ZTN9S", "Cat funny"],
    ["https://giphy.com/gifs/JIX9t2j0ZTN9S", "JIX9t2j0ZTN9S", ""],
    ["https://giphy.com/stickers/hello-wave-abc123XYZ", "abc123XYZ", "Hello wave"],
    ["https://giphy.com/embed/JIX9t2j0ZTN9S", "JIX9t2j0ZTN9S", ""],
    ["https://i.giphy.com/JIX9t2j0ZTN9S.gif", "JIX9t2j0ZTN9S", ""],
    ["https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/JIX9t2j0ZTN9S/giphy.gif", "JIX9t2j0ZTN9S", ""],
    ["https://media.giphy.com/media/JIX9t2j0ZTN9S/200.gif?cid=123", "JIX9t2j0ZTN9S", ""],
    ["http://giphy.com/gifs/cat-funny-JIX9t2j0ZTN9S", "JIX9t2j0ZTN9S", "Cat funny"],
  ])("reads the GIPHY id from %s", (raw, id, name) => {
    const link = parseGifLink(raw);
    expect(link.provider).toBe("giphy");
    expect(link.media.map(String)).toEqual([giphyOriginal(id), `https://media.giphy.com/media/${id}/giphy-downsized.gif`]);
    expect(link.page).toBeNull();
    expect(link.name).toBe(name);
  });

  it("follows gph.is short links", () => {
    const link = parseGifLink("https://gph.is/g/abc123");
    expect(link.media).toEqual([]);
    expect(link.page?.toString()).toBe("https://gph.is/g/abc123");
  });

  it("uses Tenor media links as they are", () => {
    const link = parseGifLink("https://media1.tenor.com/m/AbCdEfAAAAC/cat.gif");
    expect(link.media.map(String)).toEqual(["https://media1.tenor.com/m/AbCdEfAAAAC/cat.gif"]);
  });

  it("reads Tenor pages to find the GIF", () => {
    const link = parseGifLink("https://tenor.com/view/happy-cat-dance-gif-25209547");
    expect(link.media).toEqual([]);
    expect(link.page?.hostname).toBe("tenor.com");
    expect(link.name).toBe("Happy cat dance");
  });

  it.each([
    ["not a link", /doesn't look like a link/],
    ["https://example.com/cat.gif", /Only GIPHY and Tenor/],
    ["https://giphy.com.evil.com/gifs/x-abc123", /Only GIPHY and Tenor/],
    ["ftp://giphy.com/gifs/x-abc123", /GIPHY or Tenor/],
    ["https://user:pw@giphy.com/gifs/x-abc123", /GIPHY or Tenor/],
    ["https://giphy.com/clips/some-clip-abc123", /Clips/],
    ["https://giphy.com/explore/cats", /Couldn't find a GIF/],
    ["https://media1.tenor.com/m/AbCdEfAAAPo/cat.mp4", /isn't a GIF/],
    ["https://tenor.com/", /Open a GIF/],
  ])("refuses %s", (raw, message) => {
    expect(() => parseGifLink(raw)).toThrow(GifLinkError);
    expect(() => parseGifLink(raw)).toThrow(message);
  });
});

describe("isGifHost", () => {
  it.each(["giphy.com", "media4.giphy.com", "i.giphy.com", "gph.is", "tenor.com", "media1.tenor.com", "c.tenor.com"])(
    "allows %s",
    (h) => expect(isGifHost(h)).toBe(true),
  );
  it.each(["giphy.com.evil.com", "evilgiphy.com", "example.com", "tenor.co", "api.tenor.com.attacker.net"])("refuses %s", (h) =>
    expect(isGifHost(h)).toBe(false),
  );
});

describe("mediaFromPage", () => {
  const tenorPage = new URL("https://tenor.com/view/happy-cat-gif-25209547");

  it("takes Tenor's og:image", () => {
    const html = `<head><meta property="og:image" content="https://media1.tenor.com/m/AbCdEfAAAAC/happy-cat.gif"></head>`;
    expect(mediaFromPage("tenor", tenorPage, html).map(String)).toEqual(["https://media1.tenor.com/m/AbCdEfAAAAC/happy-cat.gif"]);
  });

  it("falls back to a Tenor GIF URL in the page", () => {
    const html = `<meta property="og:image" content="https://media1.tenor.com/m/x/happy.png"><script>{"url":"https://media.tenor.com/AbCdEfAAAAC/happy-cat.gif"}</script>`;
    expect(mediaFromPage("tenor", tenorPage, html).map(String)).toEqual(["https://media.tenor.com/AbCdEfAAAAC/happy-cat.gif"]);
  });

  it("ignores images on other hosts", () => {
    const html = `<meta property="og:image" content="https://evil.example/x.gif">`;
    expect(() => mediaFromPage("tenor", tenorPage, html)).toThrow(/Couldn't find the GIF/);
  });

  it("uses the GIPHY id from the page we landed on", () => {
    expect(mediaFromPage("giphy", new URL("https://giphy.com/gifs/cat-JIX9t2j0ZTN9S"), "").map(String)[0]).toBe(
      giphyOriginal("JIX9t2j0ZTN9S"),
    );
  });
});

describe("nameFromSlug", () => {
  it.each([
    ["cat-funny-JIX9t2j0ZTN9S", "Cat funny"],
    ["happy-cat-dance-gif-25209547", "Happy cat dance"],
    ["JIX9t2j0ZTN9S", ""],
    ["", ""],
  ])("%s -> %s", (slug, name) => expect(nameFromSlug(slug)).toBe(name));
});
