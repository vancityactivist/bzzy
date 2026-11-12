import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { GIF_H, GIF_W, MAX_GIF_BYTES, processUpload } from "./gif-process";

async function animated(w: number, h: number, frames: number, noise = false) {
  const imgs = await Promise.all(
    Array.from({ length: frames }, (_, i) => {
      const raw = Buffer.alloc(w * h * 3);
      for (let p = 0; p < raw.length; p++) raw[p] = noise ? Math.floor(Math.random() * 256) : (p + i * 40) % 256;
      return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    }),
  );
  return sharp(imgs, { join: { animated: true } }).gif().toBuffer();
}

describe("processUpload", () => {
  it("shrinks a big animated GIF to fit the screen and keeps every frame", async () => {
    const out = await processUpload(await animated(480, 270, 6));
    const meta = await sharp(out.gif, { animated: true }).metadata();
    expect(meta.format).toBe("gif");
    expect(meta.width).toBeLessThanOrEqual(GIF_W);
    expect(meta.pageHeight).toBeLessThanOrEqual(GIF_H);
    expect(meta.pages).toBe(6);
    expect(out.sha).toMatch(/^[0-9a-f]{16}$/);
  });

  it("turns a still PNG into a one-frame GIF", async () => {
    const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#f00" } }).png().toBuffer();
    const out = await processUpload(png);
    expect((await sharp(out.gif).metadata()).format).toBe("gif");
  });

  it("rejects things that aren't images", async () => {
    await expect(processUpload(Buffer.from("hello"))).rejects.toThrow(/image/);
  });

  it("never returns more than the device can hold", async () => {
    const big = await animated(240, 200, 30, true); // pure noise compresses terribly
    await processUpload(big).then(
      (out) => expect(out.gif.byteLength).toBeLessThanOrEqual(MAX_GIF_BYTES),
      (err) => expect(String(err)).toMatch(/too long/),
    );
  }, 60_000);

  it("drops frames from a long GIF instead of refusing it, keeping its speed", async () => {
    const long = await sharp(await animated(240, 200, 60, true), { animated: true }).gif({ delay: 50 }).toBuffer();
    const out = await processUpload(long);
    expect(out.gif.byteLength).toBeLessThanOrEqual(MAX_GIF_BYTES);
    const meta = await sharp(out.gif, { animated: true }).metadata();
    expect(meta.pages).toBe(out.frames);
    expect(out.frames).toBeLessThan(60);
    const total = (meta.delay ?? []).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(60 * 50 - 50);
  }, 120_000);

  it("thins a GIF with more frames than the device takes", async () => {
    const frames = await Promise.all(
      Array.from({ length: 250 }, (_, i) =>
        sharp({ create: { width: 60, height: 50, channels: 3, background: { r: i, g: 0, b: 255 - i } } }).png().toBuffer(),
      ),
    );
    const out = await processUpload(await sharp(frames, { join: { animated: true } }).gif().toBuffer());
    expect(out.frames).toBeLessThanOrEqual(200);
    expect((await sharp(out.gif, { animated: true }).metadata()).pages).toBe(out.frames);
  }, 120_000);
});
