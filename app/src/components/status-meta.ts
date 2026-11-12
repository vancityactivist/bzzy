import type { Status } from "@/lib/protocol";

// Per-status labels and Tailwind classes. Class names are written out in full so
// Tailwind sees them.
//   bg      solid fill (dots, swatches)        ring     ring colour
//   tint    a light wash for a selected card    soft     border + faint wash, for "previewing"
//   hover   the same as soft, on hover only
export const STATUS_META: Record<
  Status,
  { label: string; bg: string; ring: string; tint: string; soft: string; hover: string }
> = {
  free: {
    label: "Free",
    bg: "bg-free",
    ring: "ring-free",
    tint: "bg-free/10",
    soft: "border-free/45 bg-free/[0.06]",
    hover: "hover:border-free/45 hover:bg-free/[0.06]",
  },
  busy: {
    label: "Busy",
    bg: "bg-busy",
    ring: "ring-busy",
    tint: "bg-busy/10",
    soft: "border-busy/45 bg-busy/[0.06]",
    hover: "hover:border-busy/45 hover:bg-busy/[0.06]",
  },
  dnd: {
    label: "Do not disturb",
    bg: "bg-dnd",
    ring: "ring-dnd",
    tint: "bg-dnd/10",
    soft: "border-dnd/45 bg-dnd/[0.06]",
    hover: "hover:border-dnd/45 hover:bg-dnd/[0.06]",
  },
  away: {
    label: "Away",
    bg: "bg-away",
    ring: "ring-away",
    tint: "bg-away/10",
    soft: "border-away/45 bg-away/[0.06]",
    hover: "hover:border-away/45 hover:bg-away/[0.06]",
  },
};
