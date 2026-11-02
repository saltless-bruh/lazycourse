import { describe, it, expect } from "vitest";
import { stepUpOffered, missingForStepUp } from "../extensions/tutor/step-up.js";
import { GATE_HABITS } from "../extensions/tutor/levels.js";

const DAY = 86_400_000;
describe("stepUpOffered (spec 2026-10-26 §6.2)", () => {
  const all = () => true;
  it("offered when every counted habit of the band is solid in this language", () => {
    expect(stepUpOffered({ band: "beginner", habitsSolidIn: all, lastOffer: null, now: 10 * DAY })).toBe(true);
    expect(stepUpOffered({ band: "beginner", habitsSolidIn: (h) => h !== "own-fixes", lastOffer: null, now: 10 * DAY })).toBe(false);
  });
  it("not twice within a day", () => {
    expect(stepUpOffered({ band: "beginner", habitsSolidIn: all, lastOffer: 10 * DAY - 1000, now: 10 * DAY })).toBe(false);
    expect(stepUpOffered({ band: "beginner", habitsSolidIn: all, lastOffer: 9 * DAY - 1, now: 10 * DAY })).toBe(true);
  });
  it("never above pro", () => {
    expect(stepUpOffered({ band: "pro", habitsSolidIn: all, lastOffer: null, now: 10 * DAY })).toBe(false);
  });
  it("missingForStepUp names the habits still to turn solid", () => {
    expect(missingForStepUp("beginner", (h) => h !== "own-fixes" && h !== "small-runs")).toEqual(["small-runs", "own-fixes"]); // the band's order
    expect(missingForStepUp("beginner", () => true)).toEqual([]);
    expect(GATE_HABITS.beginner).toContain("own-fixes");
  });
});
