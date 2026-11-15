// Pairing codes: what a new light shows on its screen so someone can add it from the
// app (docs/protocol.md, "Pairing"). Pure, so it's unit-tested; lib/pairing.ts does
// the database side.

// Upper case with no 0/O/1/I/L, so it reads cleanly off a small screen.
export const PAIR_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAIR_CODE_LENGTH = 6;
// A code works for 15 minutes; the light asks for a new one after that.
export const PAIR_TTL_SEC = 15 * 60;
// How often the light asks whether it's been claimed.
export const PAIR_POLL_SEC = 3;
// Live codes one network (IP address) may hold at once. A whole office setting up
// lights together is fine; a script filling the table isn't.
export const PAIR_MAX_PER_IP = 10;

export function newPairCode(random: (n: number) => Uint8Array): string {
  const bytes = random(PAIR_CODE_LENGTH);
  let out = "";
  // 256 isn't a multiple of 31, so the first few symbols are very slightly likelier.
  // Fine for a code that lives 15 minutes and only works for someone signed in.
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) out += PAIR_ALPHABET[bytes[i] % PAIR_ALPHABET.length];
  return out;
}

// What someone typed or scanned, as a code, or null. Case, spaces and dashes don't matter.
export function normalizePairCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== PAIR_CODE_LENGTH) return null;
  for (const c of s) if (!PAIR_ALPHABET.includes(c)) return null;
  return s;
}

// "K7QF2M" -> "K7Q-F2M", as the light shows it.
export function formatPairCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export type PairingRow = { expiresAt: Date; deviceId: string | null };
export type PairingState = "live" | "claimed" | "expired";

export function pairingState(row: PairingRow, now: Date): PairingState {
  if (row.deviceId) return "claimed";
  return row.expiresAt.getTime() > now.getTime() ? "live" : "expired";
}

// Seconds left on a live code, at least 0.
export function secondsLeft(row: PairingRow, now: Date): number {
  return Math.max(0, Math.round((row.expiresAt.getTime() - now.getTime()) / 1000));
}
