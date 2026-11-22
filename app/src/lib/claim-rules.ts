// Light claims (docs/provisioning.md). Pure, so they're unit-tested.

import { z } from "zod";

// How long a "set up your account" link works. The caller can send a fresh one.
export const CLAIM_LINK_DAYS = 14;

export const claimInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(80).optional(),
  // The caller's own id for this claim, like an order number. Same ref, same claim.
  ref: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._:-]+$/, "ref uses letters, digits and . _ : -"),
  quantity: z.number().int().min(1).max(50),
});
export type ClaimInput = z.infer<typeof claimInput>;

export type ClaimLinkState = "live" | "used" | "expired" | "none";

export function claimLinkState(c: { tokenHash: string | null; tokenExpiresAt: Date | null }, now = new Date()): ClaimLinkState {
  if (!c.tokenHash) return "none";
  if (!c.tokenExpiresAt || c.tokenExpiresAt.getTime() <= now.getTime()) return "expired";
  return "live";
}

export function linkExpiry(now = new Date()): Date {
  return new Date(now.getTime() + CLAIM_LINK_DAYS * 86400_000);
}

// What the caller sees for each light on a claim. `onlineSinceShip` comes from the light
// saying it arrived (firmware "ship" feature), so it's never guessed from a poll that
// happened before it was unplugged at the bench.
export function lightReport(d: {
  id: string;
  name: string;
  firmwareVersion: string | null;
  lastSeenAt: Date | null;
  shipMode: boolean;
  shippedAt: Date | null;
  arrivedAt: Date | null;
}) {
  return {
    id: d.id,
    name: d.name,
    serial: d.id,
    firmwareVersion: d.firmwareVersion,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    shipMode: d.shipMode,
    shippedAt: d.shippedAt?.toISOString() ?? null,
    onlineSinceShip: !!d.arrivedAt,
    arrivedAt: d.arrivedAt?.toISOString() ?? null,
  };
}

// Label for the bench's "Assign to order" picker.
export function claimLabel(c: { ref: string; name: string | null; email: string | null; quantity: number; paired: number }): string {
  const who = c.name || c.email || "someone";
  return `${c.ref} · ${who} (${c.paired} of ${c.quantity} paired)`;
}
