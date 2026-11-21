import { describe, expect, it } from "vitest";

import { autoText, contrast, parseShowColors } from "./show-colors";

describe("parseShowColors", () => {
  it("is null for the default, so nothing extra is sent", () => {
    expect(parseShowColors("#000000", "")).toBeNull();
    expect(parseShowColors(null, null)).toBeNull();
    expect(parseShowColors("#000000", "#FFFFFF")).toBeNull();
  });

  it("picks black or white text when it's left automatic", () => {
    expect(parseShowColors("#ffd400", "")).toEqual({ bg: "#ffd400", fg: "#000000" });
    expect(parseShowColors("#1e5bff", "auto")).toEqual({ bg: "#1e5bff", fg: "#ffffff" });
  });

  it("gives the status colour white text, like the light's status cards", () => {
    expect(parseShowColors("status", "")).toEqual({ bg: "status", fg: "#ffffff" });
  });

  it("keeps a picked text colour, lower-cased", () => {
    expect(parseShowColors("#FFFFFF", "#FF3D8B")).toEqual({ bg: "#ffffff", fg: "#ff3d8b" });
  });

  it("ignores anything that isn't a colour", () => {
    expect(parseShowColors("red", "javascript:")).toBeNull();
    expect(parseShowColors("#12345", "#ffd400")).toEqual({ bg: "#000000", fg: "#ffd400" });
  });
});

describe("contrast", () => {
  it("matches WCAG", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("autoText picks the more readable of black and white", () => {
    expect(autoText("#ffffff")).toBe("#000000");
    expect(autoText("#000000")).toBe("#ffffff");
  });
});
