// Draws the built-in GIFs (simple original animations, 240x200) into public/gifs/
// and writes src/lib/builtin-gifs.json with their hashes.
// Run: node scripts/make-builtin-gifs.mjs
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

import sharp from "sharp";

const W = 240;
const H = 200;
const BG = "#0b0b0c";
const COLORS = { free: "#16a34a", busy: "#dc2626", dnd: "#7c3aed", away: "#ea580c" };
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${BG}"/>${body}</svg>`;
const ease = (t) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t); // 0 -> 1 -> 0 over one loop

const designs = {
  // Rings rippling outward from a steady dot.
  "free-ripple": { status: "free", name: "Ripple", frames: 20, delay: 70, draw: (t) => {
    const c = COLORS.free;
    let s = "";
    for (let k = 0; k < 3; k++) {
      const p = (t + k / 3) % 1;
      s += `<circle cx="120" cy="100" r="${18 + p * 70}" fill="none" stroke="${c}" stroke-width="6" opacity="${(1 - p).toFixed(2)}"/>`;
    }
    return s + `<circle cx="120" cy="100" r="22" fill="${c}"/>`;
  }},
  // Slow heartbeat-style pulse.
  "busy-pulse": { status: "busy", name: "Pulse", frames: 20, delay: 70, draw: (t) => {
    const r = 46 + 14 * ease(t);
    return `<circle cx="120" cy="100" r="${r + 18}" fill="${COLORS.busy}" opacity="${(0.25 * ease(t)).toFixed(2)}"/><circle cx="120" cy="100" r="${r}" fill="${COLORS.busy}"/>`;
  }},
  // A no-entry sign that breathes.
  "dnd-sign": { status: "dnd", name: "No entry", frames: 20, delay: 80, draw: (t) => {
    const r = 62 + 6 * ease(t);
    return `<circle cx="120" cy="100" r="${r}" fill="${COLORS.dnd}"/><rect x="${120 - r * 0.62}" y="88" width="${r * 1.24}" height="24" rx="6" fill="#fff"/>`;
  }},
  // A dot orbiting an empty ring: back soon.
  "away-orbit": { status: "away", name: "Orbit", frames: 24, delay: 60, draw: (t) => {
    const a = 2 * Math.PI * t - Math.PI / 2;
    return `<circle cx="120" cy="100" r="60" fill="none" stroke="${COLORS.away}" stroke-width="6" opacity="0.35"/><circle cx="${120 + 60 * Math.cos(a)}" cy="${100 + 60 * Math.sin(a)}" r="16" fill="${COLORS.away}"/>`;
  }},
  // Three dots bouncing in turn: works for any status.
  "any-dots": { status: null, name: "Dots", frames: 18, delay: 60, draw: (t) => {
    let s = "";
    for (let k = 0; k < 3; k++) {
      const y = 100 - 26 * Math.max(0, Math.sin(2 * Math.PI * (t - k / 6)));
      s += `<circle cx="${80 + k * 40}" cy="${y}" r="14" fill="#e5e5e5"/>`;
    }
    return s;
  }},
};

const manifest = [];
for (const [id, d] of Object.entries(designs)) {
  const frames = await Promise.all(
    Array.from({ length: d.frames }, (_, i) => sharp(Buffer.from(svg(d.draw(i / d.frames)))).png().toBuffer()),
  );
  const gif = await sharp(frames, { join: { animated: true } })
    .gif({ delay: Array(d.frames).fill(d.delay), loop: 0, colours: 32, effort: 10 })
    .toBuffer();
  writeFileSync(`public/gifs/${id}.gif`, gif);
  const sha = createHash("sha256").update(gif).digest("hex").slice(0, 16);
  manifest.push({ id, name: d.name, status: d.status, path: `/gifs/${id}.gif`, sha, bytes: gif.length });
  console.log(id, gif.length, "bytes");
}
writeFileSync("src/lib/builtin-gifs.json", JSON.stringify(manifest, null, 2) + "\n");
