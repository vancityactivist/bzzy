// bzzy's mark: the four status colours as dots on a rounded tile (docs/brand/README.md).
// Plain SVG with no Tailwind, so the landing page (which keeps Tailwind off) can use it too.
// The tile takes its colours from --mark-tile and --mark-line when set, otherwise from the
// app's card and line-strong tokens, so it is white on light pages and near-black on dark.
const DOTS = [
  { cx: 20.5, cy: 20.5, fill: "#16a34a" }, // free
  { cx: 43.5, cy: 20.5, fill: "#dc2626" }, // busy
  { cx: 20.5, cy: 43.5, fill: "#7c3aed" }, // do not disturb
  { cx: 43.5, cy: 43.5, fill: "#ea580c" }, // away
];

export function BzzyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="15"
        fill="var(--mark-tile, var(--card, #171717))"
        stroke="var(--mark-line, var(--line-strong, rgb(255 255 255 / 0.14)))"
        strokeWidth="1.5"
      />
      {DOTS.map((d) => (
        <circle key={d.fill} cx={d.cx} cy={d.cy} r="6.75" fill={d.fill} />
      ))}
    </svg>
  );
}
