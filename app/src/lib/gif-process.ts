// Turning an upload into a GIF the device can play: 240 px wide at most, 200 px tall
// at most (the screen's GIF area), small enough for its flash. No database or storage
// here, so it can be tested on its own.

import { createHash } from "node:crypto";

import sharp from "sharp";

export const GIF_W = 240;
export const GIF_H = 200;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB
export const MAX_GIF_BYTES = 600 * 1024; // four of these fit easily in the device's flash
const MAX_FRAMES = 200;

export class GifError extends Error {}

export const shaOf = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

export async function processUpload(input: Uint8Array): Promise<{ gif: Buffer; sha: string; frames: number }> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new GifError("That file is over 4 MB. Try a shorter or smaller GIF.");

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
  if (frames > MAX_FRAMES) throw new GifError(`That GIF has ${frames} frames. Keep it under ${MAX_FRAMES}.`);

  // Fewer colours until it fits: most GIFs fit first time, long ones need squeezing.
  for (const colours of [128, 64, 32]) {
    const gif = await sharp(input, { animated: true, limitInputPixels: 4096 * 4096 })
      .resize({ width: GIF_W, height: GIF_H, fit: "inside" })
      .gif({ colours, effort: 7, loop: 0 })
      .toBuffer();
    if (gif.byteLength <= MAX_GIF_BYTES) return { gif, sha: shaOf(gif), frames };
  }
  throw new GifError("That GIF is too long to fit on the device, even shrunk. Try a shorter one.");
}
