import { describe, expect, it } from "vitest";

import { dollars, parseShopBatch, SHOP_URL, shortDate } from "./shop-batch";

const open = {
  state: "open",
  number: 1,
  name: "First batch",
  reserved: 14,
  capacity: 25,
  minimum: 10,
  priceCents: 12900,
  depositCents: 500,
  currency: "CAD",
  closesAt: "2026-12-16T07:59:00.000Z",
  shipsBy: "2027-01-26",
  full: false,
  reserveUrl: `${SHOP_URL}/`,
  notifyUrl: `${SHOP_URL}/notify`,
};

describe("parseShopBatch", () => {
  it("keeps a good open batch", () => {
    expect(parseShopBatch(open)).toMatchObject({ state: "open", reserved: 14, capacity: 25, priceCents: 12900, shipsBy: "2027-01-26" });
  });
  it("falls back to soon on anything odd", () => {
    for (const bad of [null, "x", { state: "soon" }, { ...open, capacity: 0 }, { ...open, reserved: -1 }, { ...open, priceCents: 1.5 }, { ...open, currency: "USD" }]) {
      expect(parseShopBatch(bad)).toEqual({ state: "soon", notifyUrl: `${SHOP_URL}/notify` });
    }
  });
  it("never links off the shop", () => {
    const b = parseShopBatch({ ...open, reserveUrl: "https://evil.example/", notifyUrl: "javascript:alert(1)" });
    expect(b.state === "open" && [b.reserveUrl, b.notifyUrl]).toEqual([`${SHOP_URL}/`, `${SHOP_URL}/notify`]);
  });
  it("drops bad dates and caps reserved at capacity", () => {
    const b = parseShopBatch({ ...open, closesAt: "soon", shipsBy: "January", reserved: 30 });
    expect(b).toMatchObject({ closesAt: null, shipsBy: null, reserved: 25 });
  });
});

describe("formatting", () => {
  it("says dollars without needless cents", () => {
    expect(dollars(12900)).toBe("$129");
    expect(dollars(500)).toBe("$5");
    expect(dollars(12950)).toBe("$129.50");
  });
  it("says dates short, closing time in Vancouver", () => {
    expect(shortDate("2027-01-26")).toBe("Jan 26");
    expect(shortDate("2026-12-16T05:59:00.000Z")).toBe("Dec 15");
  });
});
