import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Encrypting a calendar account's secret (a Google refresh token, a CalDAV password)
// before it's stored. AES-256-GCM with a key that only lives in Vercel's environment
// (CALENDAR_KEY, 32 random bytes as base64), so a copy of the database alone gives
// nothing away. The account id is bound in as associated data: a sealed value moved onto
// another row won't open.
//
// Rotating: put the new key in CALENDAR_KEY and the old one in CALENDAR_KEY_PREVIOUS.
// Rows say which key sealed them (`keyId`); reading one with the old key re-seals it.
// Production and Preview use different keys, so a preview never opens production rows.

export class CalendarKeyMissing extends Error {}

type Key = { id: string; bytes: Buffer };

function parse(raw: string | undefined): Key | null {
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32)
    throw new CalendarKeyMissing(
      "CALENDAR_KEY must be 32 bytes, base64-encoded.",
    );
  return {
    id: createHash("sha256").update(bytes).digest("hex").slice(0, 8),
    bytes,
  };
}

function keys(): { current: Key; previous: Key | null } {
  const current = parse(process.env.CALENDAR_KEY);
  if (!current)
    throw new CalendarKeyMissing(
      "Set CALENDAR_KEY to connect calendar accounts.",
    );
  return { current, previous: parse(process.env.CALENDAR_KEY_PREVIOUS) };
}

export function calendarKeyConfigured(): boolean {
  try {
    keys();
    return true;
  } catch {
    return false;
  }
}

export function sealSecret(
  plain: string,
  accountId: string,
): { secret: string; keyId: string } {
  const { current } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
  cipher.setAAD(Buffer.from(accountId, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    secret: Buffer.concat([iv, cipher.getAuthTag(), body]).toString(
      "base64url",
    ),
    keyId: current.id,
  };
}

// Null when no configured key matches, or the value was tampered with or moved.
// `stale` means it opened with the previous key and should be sealed again.
export function openSecret(
  secret: string,
  keyId: string,
  accountId: string,
): { plain: string; stale: boolean } | null {
  const { current, previous } = keys();
  const key =
    keyId === current.id ? current : keyId === previous?.id ? previous : null;
  if (!key) return null;
  try {
    const raw = Buffer.from(secret, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key.bytes,
      raw.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(accountId, "utf8"));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
    return { plain, stale: key !== current };
  } catch {
    return null;
  }
}
