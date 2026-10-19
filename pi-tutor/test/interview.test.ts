import { describe, it, expect } from "vitest";
import { EXPERIENCE } from "../extensions/tutor/interview.js";

describe("experience bands (spec 2026-10-19 §6)", () => {
  it("are the four bands the onboarding note and the fallback question use", () => {
    expect([...EXPERIENCE]).toEqual(["none yet", "under a year", "1-3 years", "over 3 years"]);
  });
});
