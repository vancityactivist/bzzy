import { describe, expect, it } from "vitest";

import { decodeState, encodeState, forwardTarget } from "./google-oauth-state";

describe("connect state", () => {
  it("round-trips and rejects junk", () => {
    const s = { n: "abc", o: "https://bzzy.ca" };
    expect(decodeState(encodeState(s))).toEqual(s);
    expect(decodeState("not-base64-json")).toBeNull();
    expect(decodeState(null)).toBeNull();
  });

  it("forwards only to this project's preview hosts", () => {
    const here = "https://bzzy.ca";
    const preview =
      "https://bzzy-git-claude-x-vancityactivists-projects.vercel.app";
    expect(forwardTarget({ n: "x", o: here }, here)).toBeNull();
    expect(forwardTarget({ n: "x", o: preview }, here)?.origin).toBe(preview);
    expect(
      forwardTarget({ n: "x", o: "https://evil.example" }, here),
    ).toBeNull();
    expect(
      forwardTarget(
        { n: "x", o: "https://bzzy-x-someoneelse.vercel.app" },
        here,
      ),
    ).toBeNull();
    expect(
      forwardTarget(
        { n: "x", o: "http://bzzy-git-x-vancityactivists-projects.vercel.app" },
        here,
      ),
    ).toBeNull();
  });
});
