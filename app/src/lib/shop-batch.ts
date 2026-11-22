// The shop's current batch, for the landing page's "Get one built" section. The shop
// (shop.bzzy.ca, a separate private app) publishes only public facts at
// GET /api/public/batch; nothing about orders or buyers ever comes here. Any failure is
// "soon", so the landing page never breaks or shows a number it can't stand behind.

export const SHOP_URL = (process.env.SHOP_URL || "https://shop.bzzy.ca").replace(/\/+$/, "");

export type ShopBatch =
  | { state: "soon"; notifyUrl: string }
  | {
      state: "open";
      number: number;
      name: string;
      reserved: number;
      capacity: number;
      minimum: number;
      priceCents: number;
      depositCents: number;
      closesAt: string | null;
      shipsBy: string | null;
      full: boolean;
      reserveUrl: string;
      notifyUrl: string;
    };

export function soon(): ShopBatch {
  return { state: "soon", notifyUrl: `${SHOP_URL}/notify` };
}

const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const str = (v: unknown): v is string => typeof v === "string";
// Links only ever point at the shop, whatever the feed says.
const onShop = (v: unknown, fallback: string) => (str(v) && v.startsWith(`${SHOP_URL}/`) ? v : fallback);

// Pure, unit-tested: anything odd in the answer falls back to "soon".
export function parseShopBatch(body: unknown): ShopBatch {
  if (!body || typeof body !== "object") return soon();
  const b = body as Record<string, unknown>;
  if (b.state !== "open") return soon();
  if (![b.number, b.reserved, b.capacity, b.minimum, b.priceCents, b.depositCents].every(int) || !(b.capacity as number)) return soon();
  if (b.currency !== "CAD") return soon();
  return {
    state: "open",
    number: b.number as number,
    name: str(b.name) ? b.name.slice(0, 80) : `Batch ${b.number}`,
    reserved: Math.min(b.reserved as number, b.capacity as number),
    capacity: b.capacity as number,
    minimum: b.minimum as number,
    priceCents: b.priceCents as number,
    depositCents: b.depositCents as number,
    closesAt: str(b.closesAt) && !Number.isNaN(Date.parse(b.closesAt)) ? b.closesAt : null,
    shipsBy: str(b.shipsBy) && /^\d{4}-\d{2}-\d{2}$/.test(b.shipsBy) ? b.shipsBy : null,
    full: b.full === true,
    reserveUrl: onShop(b.reserveUrl, `${SHOP_URL}/`),
    notifyUrl: onShop(b.notifyUrl, `${SHOP_URL}/notify`),
  };
}

// Cached for 5 minutes, like the shop's own edge cache; 2 seconds at most on a miss.
export async function shopBatch(): Promise<ShopBatch> {
  try {
    const res = await fetch(`${SHOP_URL}/api/public/batch`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(2000) });
    if (!res.ok) return soon();
    return parseShopBatch(await res.json());
  } catch {
    return soon();
  }
}

// "$129", "$129.50": the price as the landing page says it, always with CAD nearby.
export function dollars(cents: number): string {
  return `$${cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)}`;
}

// "Dec 15" in Vancouver time (closing time), or "Jan 26" for a plain date (ships by).
export function shortDate(value: string): string {
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = plain ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: plain ? "UTC" : "America/Vancouver" });
}
