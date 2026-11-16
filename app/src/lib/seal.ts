import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Encrypting a value that has to be read back (a webhook's signing secret, which can't
// be hashed like a token because every send needs it). AES-256-GCM, with a key derived
// from AUTH_SECRET, so a copy of the database alone doesn't give the secrets away.
// WEBHOOK_SEAL_KEY, if set, is used instead, so AUTH_SECRET can be rotated without
// losing them.

const VERSION = "s1";

function key(): Buffer {
  const secret = process.env.WEBHOOK_SEAL_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Set AUTH_SECRET (or WEBHOOK_SEAL_KEY) to store webhook secrets.");
  return Buffer.from(hkdfSync("sha256", secret, "bzzy", "webhook-secret", 32));
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

// Null if it was sealed with another key or has been tampered with.
export function unseal(sealed: string): string | null {
  const [version, data] = sealed.split(".");
  if (version !== VERSION || !data) return null;
  try {
    const raw = Buffer.from(data, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
