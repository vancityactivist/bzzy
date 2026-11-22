import { describe, expect, it } from "vitest";

import { calendarsForLight, personCalendars } from "./calendar-lights";

const all: { id: string; lightIds: string[] | null } = { id: "all", lightIds: null };
const office = { id: "office", lightIds: ["desk", "room"] };
const room = { id: "room", lightIds: ["room"] };
const old: { id: string; lightIds?: string[] | null } = { id: "old" }; // cached before light lists existed
const cals = [all, office, room, old];

describe("calendarsForLight", () => {
  it("gives a following light every unlisted calendar plus the ones naming it", () => {
    expect(calendarsForLight(cals, { id: "desk", followsOwner: true }).map((c) => c.id)).toEqual(["all", "office", "old"]);
    expect(calendarsForLight(cals, { id: "home", followsOwner: true }).map((c) => c.id)).toEqual(["all", "old"]);
  });

  it("gives an own-status light only the calendars naming it", () => {
    expect(calendarsForLight(cals, { id: "room", followsOwner: false }).map((c) => c.id)).toEqual(["office", "room"]);
    expect(calendarsForLight(cals, { id: "lobby", followsOwner: false })).toEqual([]);
  });
});

describe("personCalendars", () => {
  it("leaves out calendars picked only for own-status lights", () => {
    expect(personCalendars(cals, ["desk"]).map((c) => c.id)).toEqual(["all", "office", "old"]);
    expect(personCalendars(cals, []).map((c) => c.id)).toEqual(["all", "old"]);
  });
});
