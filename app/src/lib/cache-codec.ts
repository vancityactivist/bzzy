// How cached values are stored. Vercel's runtime cache keeps JSON, which would turn
// Dates into strings, so values are stored as a string with Dates marked and revived.

const DATE = "$bzzyDate";

export function encode(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key: string, v: unknown) {
    // JSON.stringify has already called Date#toJSON on `v`, so look at the original.
    const original = this[key];
    return original instanceof Date ? { [DATE]: original.getTime() } : v;
  });
}

export function decode<T>(text: unknown): T | null {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text, (_key, v: unknown) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const keys = Object.keys(v);
        if (keys.length === 1 && keys[0] === DATE) {
          const ms = (v as Record<string, unknown>)[DATE];
          if (typeof ms === "number") return new Date(ms);
        }
      }
      return v;
    }) as T;
  } catch {
    return null;
  }
}

// Cache tags. Every write that changes what a light shows expires the matching tag.
export const tag = {
  device: (id: string) => `d-${id}`,
  user: (id: string) => `u-${id}`,
  team: (id: string) => `t-${id}`,
  asset: (id: string) => `a-${id}`,
  release: "fw",
} as const;
