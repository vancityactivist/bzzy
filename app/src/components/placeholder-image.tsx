// A stand-in for an image that hasn't been made yet. Each one says what should
// go there and at what shape, so swapping in the real image is a one-line change
// to a next/image <Image> with the same aspect ratio.

type Props = {
  label: string;
  hint?: string;
  aspect?: "video" | "square" | "portrait" | "wide";
  className?: string;
};

const ASPECT = {
  video: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  wide: "aspect-[21/9]",
} as const;

export function PlaceholderImage({ label, hint, aspect = "video", className = "" }: Props) {
  return (
    <figure
      role="img"
      aria-label={`Placeholder: ${label}`}
      data-placeholder={label}
      className={`flex ${ASPECT[aspect]} flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-card p-4 text-center ${className}`}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-muted">Image</span>
      <span className="mt-1 text-sm font-medium">{label}</span>
      {hint && <span className="mt-1 max-w-xs text-xs text-muted">{hint}</span>}
    </figure>
  );
}
