import { describe, it, expect } from "vitest";
import { levelInBand, stepDownSuggested, bandProgress, habitReport, GATE_HABITS } from "../extensions/tutor/levels.js";
import type { HabitEvent, HabitId } from "../extensions/tutor/habits.js";

let t = 0;
const solid = (habit: HabitId, language = "python"): HabitEvent[] =>
  [0, 1, 2, 3, 4].map((i) => ({ habit, ok: true, language, project: i % 2 ? "/p/a" : "/p/b", at: ++t, evidence: `e${t}` }));

describe("levelInBand (spec 2026-10-26 §4)", () => {
  it("rises toward the band's top as its habits turn solid, with a reason", () => {
    expect(levelInBand({ level: 10, band: "beginner", solid: 4, total: 8, fixStepStreak: 0, newest: "own-fixes" })).toEqual({ level: 17, reason: "you fixed your own bugs without the handed line" });
    expect(levelInBand({ level: 10, band: "beginner", solid: 8, total: 8, fixStepStreak: 0, newest: "own-fixes" })?.level).toBe(33);
  });
  it("habits Review Focus #3: never pulls a placed level down; unchanged is null", () => {
    expect(levelInBand({ level: 50, band: "intermediate", solid: 0, total: 2, fixStepStreak: 0 })).toBeNull();
    expect(levelInBand({ level: 20, band: "beginner", solid: 4, total: 8, fixStepStreak: 0 })).toBeNull();
  });
  it("a fix-step streak of 2 or more lowers it 3, never below the band's floor", () => {
    expect(levelInBand({ level: 20, band: "beginner", solid: 0, total: 8, fixStepStreak: 2 })).toEqual({ level: 17, reason: "the last tasks needed the handed line" });
    expect(levelInBand({ level: 35, band: "intermediate", solid: 0, total: 2, fixStepStreak: 3 })?.level).toBe(34);
  });
  it("a step down is suggested after 3 tasks in a row reached the fix step", () => {
    expect(stepDownSuggested(3)).toBe(true);
    expect(stepDownSuggested(2)).toBe(false);
  });
});

describe("bandProgress: which habits count, per language", () => {
  it("habits Review Focus #2: habits solid in Python do not count in Rust until shown there once", () => {
    const events = [...solid("own-fixes"), ...solid("small-runs")];
    expect(bandProgress(events, "beginner", "python")).toMatchObject({ solid: 2, total: GATE_HABITS.beginner.length });
    expect(bandProgress(events, "beginner", "rust").solid).toBe(0);
    expect(bandProgress([...events, { ...solid("own-fixes", "rust")[0] }], "beginner", "rust").solid).toBe(1);
  });
  it("looks-up is not counted until the step-up can show it (Task 7 ruling)", () => {
    expect(GATE_HABITS.beginner).not.toContain("looks-up");
    expect(GATE_HABITS.beginner).toHaveLength(7);
  });
});

describe("habitReport", () => {
  it("lists the band's habits with their state and the latest evidence", () => {
    const r = habitReport([...solid("own-fixes"), { habit: "small-runs", ok: true, language: "python", project: "/p/a", at: ++t, evidence: "check:P1.T1" }], "beginner", "python");
    expect(r).toContain("Habits (beginner)");
    expect(r).toMatch(/fixes own bugs.*solid/);
    expect(r).toMatch(/runs small pieces.*not yet.*check:P1\.T1/);
    expect(r).toMatch(/looks things up.*shown in the step-up/);
  });
});
