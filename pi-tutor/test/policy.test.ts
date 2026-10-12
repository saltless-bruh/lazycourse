import { describe, it, expect } from "vitest";
import { bandFor, startRung, thresholds, DEFAULT_LEVEL } from "../extensions/tutor/policy.js";

describe("bandFor", () => {
  it("splits 0-33 / 34-66 / 67-100", () => {
    expect(bandFor(0)).toBe("beginner");
    expect(bandFor(33)).toBe("beginner");
    expect(bandFor(34)).toBe("intermediate");
    expect(bandFor(66)).toBe("intermediate");
    expect(bandFor(67)).toBe("pro");
    expect(bandFor(100)).toBe("pro");
  });
  it("clamps out-of-range input", () => {
    expect(bandFor(-5)).toBe("beginner");
    expect(bandFor(140)).toBe("pro");
  });
  it("defaults to intermediate", () => {
    expect(bandFor(DEFAULT_LEVEL)).toBe("intermediate");
  });
});

describe("startRung", () => {
  it("is 3 / 2 / 1 by band", () => {
    expect(startRung("beginner")).toBe(3);
    expect(startRung("intermediate")).toBe(2);
    expect(startRung("pro")).toBe(1);
  });
});

describe("thresholds", () => {
  const MIN = 60_000;
  it("returns the band table values at band midpoints", () => {
    expect(thresholds(17)).toEqual({ errorMs: 0, idleMs: 2 * MIN });
    expect(thresholds(50)).toEqual({ errorMs: 1 * MIN, idleMs: 5 * MIN });
    expect(thresholds(83)).toEqual({ errorMs: 3 * MIN, idleMs: 10 * MIN });
  });
  it("interpolates linearly between midpoints and clamps outside", () => {
    expect(thresholds(0)).toEqual({ errorMs: 0, idleMs: 2 * MIN });
    expect(thresholds(100)).toEqual({ errorMs: 3 * MIN, idleMs: 10 * MIN });
    const mid = thresholds(33.5); // halfway between 17 and 50
    expect(mid.errorMs).toBe(0.5 * MIN);
    expect(mid.idleMs).toBe(3.5 * MIN);
  });
});
