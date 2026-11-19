import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge has to be told about bzzy's own theme values, or it can't see that
// `shadow-card` and `shadow-pop` are shadows (rather than shadow colours) and keeps both.
const twMerge = extendTailwindMerge({
  extend: { theme: { shadow: ["card", "pop"] } },
});

/** Joins class names and lets later Tailwind classes win over earlier ones (shadcn/ui's helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
