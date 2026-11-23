// Device ids and tokens. The token is shown to the person once, typed into the
// device's setup page, and only its SHA-256 is stored.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

// No 0/O/1/l/I so it's easy to type on a phone.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

// randomInt is uniform: a byte % 31 would favour the first 8 symbols.
function randomString(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function newDeviceId(): string {
  return `bz-${randomString(6)}`;
}

export function newDeviceToken(): string {
  // 32 chars from a 31-symbol alphabet is ~158 bits: plenty, still typeable.
  return randomString(32);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}
