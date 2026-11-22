// What people call their four statuses. The keys (free, busy, dnd, away) never change:
// the calendar rules, the button, the API and webhooks all run on them. A name is only
// what's shown, in the app and (on firmware with the "labels" feature) on the light.
// Pure, so the app, the previews, the API and the tests agree.

import { z } from "zod";

import { type Status, STATUSES } from "./protocol";

// Only the statuses someone renamed; the rest use the standard word. null: none renamed.
export type StatusLabels = Partial<Record<Status, string>>;

export const STANDARD_LABEL: Record<Status, string> = {
  free: "Free",
  busy: "Busy",
  dnd: "Do not disturb",
  away: "Away",
};

export const LABEL_MAX = 16;

/** The name to show for a status. */
export function statusLabel(status: Status, labels?: StatusLabels | null): string {
  return labels?.[status] || STANDARD_LABEL[status];
}

/** All four names. */
export function allLabels(labels?: StatusLabels | null): Record<Status, string> {
  return Object.fromEntries(STATUSES.map((s) => [s, statusLabel(s, labels)])) as Record<Status, string>;
}

// Tidied as it's saved: spaces collapsed and trimmed.
export function tidyLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Why a name can't be used, or null when it can. Expects tidyLabel() output. */
export function labelProblem(label: string): string | null {
  if (!label) return "Give it a name.";
  if (label.length > LABEL_MAX) return `Up to ${LABEL_MAX} characters.`;
  // The light's fonts only have printable ASCII; anything else wouldn't be drawn.
  if (!/^[\x20-\x7e]+$/.test(label)) return "Letters, numbers and simple punctuation only (the light can't draw accents or emoji).";
  return null;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Renames to save, from what was typed for each status. A blank or standard name goes back
 * to the standard word (no entry). Two statuses can't share a name, or the light would
 * show two statuses that read alike.
 */
export function parseLabels(
  input: Partial<Record<Status, string>>,
): { ok: true; labels: StatusLabels | null } | { ok: false; status: Status; error: string } {
  const out: StatusLabels = {};
  for (const s of STATUSES) {
    const label = tidyLabel(input[s] ?? "");
    if (!label || label === STANDARD_LABEL[s]) continue;
    const problem = labelProblem(label);
    if (problem) return { ok: false, status: s, error: problem };
    out[s] = label;
  }
  const names = allLabels(out);
  for (const [i, a] of STATUSES.entries()) {
    const clash = STATUSES.slice(0, i).find((b) => sameName(names[a], names[b]));
    if (clash) return { ok: false, status: a, error: `${names[clash]} already has that name.` };
  }
  return { ok: true, labels: Object.keys(out).length ? out : null };
}

export const labelsInput = z.object(Object.fromEntries(STATUSES.map((s) => [s, z.string().max(200).optional()])) as Record<Status, z.ZodOptional<z.ZodString>>);

/** A saved value read back, ignoring anything that's no longer valid. */
export function readLabels(saved: unknown): StatusLabels | null {
  if (!saved || typeof saved !== "object") return null;
  const out: StatusLabels = {};
  for (const s of STATUSES) {
    const v = (saved as Record<string, unknown>)[s];
    if (typeof v === "string" && !labelProblem(v)) out[s] = v;
  }
  return Object.keys(out).length ? out : null;
}

// What the light draws: the name in capitals (the firmware upper-cases it the same way).
export function screenLabel(status: Status, labels?: StatusLabels | null): string {
  return statusLabel(status, labels).toUpperCase();
}

/** The name mid-sentence ("busy at 3:30"): standard words in lower case, own names as typed. */
export function labelInSentence(status: Status, labels?: StatusLabels | null): string {
  return labels?.[status] || STANDARD_LABEL[status].toLowerCase();
}
