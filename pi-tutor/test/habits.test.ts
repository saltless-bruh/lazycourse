import { describe, it, expect } from "vitest";
import { habitState, solidIn, BAND_HABITS, type HabitEvent } from "../extensions/tutor/habits.js";

let t = 0;
const ev = (ok: boolean, project = "/p/a", language = "python"): HabitEvent => ({ habit: "own-fixes", ok, language, project, at: ++t, evidence: `ep-${t}` });

describe("habitState (spec 2026-10-26 §3)", () => {
  it("not yet → showing after 2 qualifying events", () => {
    expect(habitState([ev(true)])).toBe("not yet");
    expect(habitState([ev(true), ev(true)])).toBe("showing");
  });
  it("solid needs 5 across at least 2 projects, the last 3 qualifying", () => {
    expect(habitState([ev(true), ev(true), ev(true), ev(true), ev(true)])).toBe("showing");
    expect(habitState([ev(true), ev(true), ev(true, "/p/b"), ev(true), ev(true)])).toBe("solid");
    expect(habitState([ev(true), ev(true), ev(true, "/p/b"), ev(true), ev(false), ev(true)])).toBe("showing"); // last 3 not all qualifying
    expect(habitState([ev(true), ev(true), ev(true, "/p/b"), ev(true), ev(true), ev(false)])).toBe("solid"); // one miss does not drop it
  });
  it("a solid habit whose last 3 of 5 miss drops to showing", () => {
    const solid = [ev(true), ev(true, "/p/b"), ev(true), ev(true), ev(true)];
    expect(habitState(solid)).toBe("solid");
    expect(habitState([...solid, ev(false), ev(true), ev(false), ev(false)])).toBe("showing");
  });
});

describe("solidIn and the band habits", () => {
  it("solid overall counts in a language only after one qualifying event there", () => {
    const es = [ev(true), ev(true, "/p/b"), ev(true), ev(true), ev(true)];
    expect(solidIn(es, "python")).toBe(true);
    expect(solidIn(es, "rust")).toBe(false);
    expect(solidIn([...es, ev(true, "/p/r", "rust")], "rust")).toBe(true);
  });
  it("beginner has the eight habits of §3; intermediate two; pro optimizing", () => {
    expect(BAND_HABITS.beginner).toEqual(["steps-first", "reads-errors", "looks-up", "small-runs", "own-fixes", "ideas-to-code", "right-direction", "right-question"]);
    expect(BAND_HABITS.intermediate).toEqual(["tests-that-fail", "complex"]);
    expect(BAND_HABITS.pro).toEqual(["optimizes"]);
  });
});
