import type { Status } from "@/lib/protocol";

export const STATUS_META: Record<Status, { label: string; bg: string; ring: string }> = {
  free: { label: "Free", bg: "bg-free", ring: "ring-free" },
  busy: { label: "Busy", bg: "bg-busy", ring: "ring-busy" },
  dnd: { label: "Do not disturb", bg: "bg-dnd", ring: "ring-dnd" },
  away: { label: "Away", bg: "bg-away", ring: "ring-away" },
};
