import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A stand-in for Vercel's runtime cache with tag expiry, so the read-through and
// invalidation rules can be checked without Vercel.
const store = new Map<string, { value: unknown; tags: string[] }>();
let failing = false;
vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: async (key: string) => {
      if (failing) throw new Error("cache down");
      return store.get(key)?.value ?? null;
    },
    set: async (key: string, value: unknown, opts?: { tags?: string[] }) => {
      if (failing) throw new Error("cache down");
      store.set(key, { value, tags: opts?.tags ?? [] });
    },
    expireTag: async (tags: string | string[]) => {
      if (failing) throw new Error("cache down");
      const list = Array.isArray(tags) ? tags : [tags];
      for (const [k, v] of store) if (v.tags.some((t) => list.includes(t))) store.delete(k);
    },
  }),
}));

const { cached, cacheGet, expire, tag } = await import("./cache");

beforeEach(() => {
  store.clear();
  failing = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cached", () => {
  it("loads once, then answers from the cache", async () => {
    const load = vi.fn(async () => ({ value: { at: new Date(5) }, tags: [tag.user("u1")] }));
    expect(await cached("k", 60, load)).toEqual({ at: new Date(5) });
    expect(await cached("k", 60, load)).toEqual({ at: new Date(5) });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads again after one of its tags is expired", async () => {
    let n = 0;
    const load = async () => ({ value: ++n, tags: [tag.device("d1"), tag.user("u1")] });
    await cached("k", 60, load);
    await expire(tag.team("other"));
    expect(await cached("k", 60, load)).toBe(1);
    await expire(tag.user("u1"));
    expect(await cached("k", 60, load)).toBe(2);
  });

  it("doesn't save a miss", async () => {
    const load = vi.fn(async () => null);
    expect(await cached("k", 60, load)).toBeNull();
    expect(await cached("k", 60, load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("falls back to the database when the cache is down", async () => {
    failing = true;
    const load = vi.fn(async () => ({ value: "fresh", tags: [] }));
    expect(await cached("k", 60, load)).toBe("fresh");
    expect(await cacheGet("k")).toBeNull();
    await expect(expire(tag.release)).resolves.toBeUndefined();
  });
});
