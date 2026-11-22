// bzzy's mark: the four status colours as dots on a rounded tile (docs/brand/README.md).
// The tile takes its colours from --mark-tile and --mark-line when set, otherwise from the
// app's card and line-strong tokens (Console's paper-2 and rule-2), so it follows the colourway.
const DOTS = [
  { cx: 20.5, cy: 20.5, fill: "var(--color-status-free)" }, // free
  { cx: 43.5, cy: 20.5, fill: "var(--color-status-busy)" }, // busy
  { cx: 20.5, cy: 43.5, fill: "var(--color-status-dnd)" }, // do not disturb
  { cx: 43.5, cy: 43.5, fill: "var(--color-status-away)" }, // away
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
        fill="var(--mark-tile, var(--card))"
        stroke="var(--mark-line, var(--line-strong))"
        strokeWidth="1.5"
      />
      {DOTS.map((d) => (
        <circle key={d.fill} cx={d.cx} cy={d.cy} r="6.75" fill={d.fill} />
      ))}
    </svg>
  );
}
