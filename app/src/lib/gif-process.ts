// Turning an upload into a GIF the device can play: 240 px wide at most, 200 px tall
// at most (the screen's GIF area), small enough for its flash. No database or storage
// here, so it can be tested on its own.

import { createHash } from "node:crypto";

import sharp from "sharp";

export const GIF_W = 240;
export const GIF_H = 200;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB
export const MAX_GIF_BYTES = 600 * 1024; // four of these fit easily in the device's flash
const MAX_FRAMES = 200; // what the device gets
const MAX_INPUT_FRAMES = 600; // longer ones are thinned out to MAX_FRAMES

export class GifError extends Error {}

export const shaOf = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

// Links are fetched by the server, so they can be bigger than an upload through Vercel.
export const MAX_LINK_BYTES = 12 * 1024 * 1024;

export async function processUpload(
  input: Uint8Array,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<{ gif: Buffer; sha: string; frames: number }> {
  if (input.byteLength > maxBytes) {
    throw new GifError(`That file is over ${Math.round(maxBytes / 1024 / 1024)} MB. Try a shorter or smaller GIF.`);
  }

  let meta;
  try {
    meta = await sharp(input, { animated: true, limitInputPixels: 4096 * 4096 }).metadata();
  } catch {
    throw new GifError("That isn't an image we can read. Upload a GIF, PNG, JPEG or WebP.");
  }
  if (!meta.format || !["gif", "png", "jpeg", "webp"].includes(meta.format)) {
    throw new GifError("Upload a GIF, PNG, JPEG or WebP.");
  }
  const frames = meta.pages ?? 1;
  if (frames > MAX_INPUT_FRAMES) throw new GifError(`That GIF has ${frames} frames. Keep it under ${MAX_INPUT_FRAMES}.`);

  // Fewer colours until it fits: most GIFs fit first time, long ones need squeezing.
  if (frames <= MAX_FRAMES) {
    for (const colours of [128, 64, 32]) {
      const gif = await sharp(input, { animated: true, limitInputPixels: 4096 * 4096 })
        .resize({ width: GIF_W, height: GIF_H, fit: "inside" })
        .gif({ colours, effort: 7, loop: 0 })
        .toBuffer();
      if (gif.byteLength <= MAX_GIF_BYTES) return { gif, sha: shaOf(gif), frames };
    }
  }
  if (frames > 1) {
    const thinned = await thinFrames(input, frames, meta.delay);
    if (thinned) return thinned;
  }
  throw new GifError("That GIF is too long to fit on the device, even shrunk. Try a shorter one.");
}

// Still too big: keep every 2nd (then 3rd, 4th…) frame, holding each one for the frames it
// replaces, so the GIF runs at the same speed but choppier. GIPHY GIFs often need this.
async function thinFrames(input: Uint8Array, frames: number, delays: number[] | undefined) {
  const { data, info } = await sharp(input, { animated: true, limitInputPixels: 4096 * 4096 })
    .resize({ width: GIF_W, height: GIF_H, fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pageHeight = info.pageHeight ?? Math.round(info.height / frames);
  const frameBytes = info.width * pageHeight * 4;
  const delayOf = (i: number) => delays?.[i] ?? delays?.[0] ?? 100;

  for (let step = Math.max(2, Math.ceil(frames / MAX_FRAMES)); step <= 8; step++) {
    const kept: Buffer[] = [];
    const delay: number[] = [];
    for (let i = 0; i < frames; i += step) {
      kept.push(data.subarray(i * frameBytes, (i + 1) * frameBytes));
      let d = 0;
      for (let j = i; j < Math.min(i + step, frames); j++) d += delayOf(j);
      delay.push(Math.min(d, 65535));
    }
    for (const colours of [64, 32]) {
      const gif = await sharp(Buffer.concat(kept), {
        raw: { width: info.width, height: pageHeight * kept.length, channels: 4, pageHeight },
      })
        .gif({ colours, effort: 7, loop: 0, delay })
        .toBuffer();
      if (gif.byteLength <= MAX_GIF_BYTES) return { gif, sha: shaOf(gif), frames: kept.length };
    }
  }
  return null;
}
