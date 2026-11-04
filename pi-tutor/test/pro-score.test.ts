import { describe, it, expect } from "vitest";
import { proScore, doneWhenCalls, coveredCalls, scoreLine, levelSuggestion } from "../extensions/tutor/pro-score.js";

// Spec 2026-10-21 §8, habits Task 16: the pro score counts only facts code can check.
describe("proScore", () => {
  it("25 for each of the first three facts, 25 × covered/total for the edge cases", () => {
    expect(proScore({ checksPass: true, ownTestsPass: true, ownTestsCanFail: true, edgeCasesCovered: 2, edgeCasesTotal: 2 })).toBe(100);
    expect(proScore({ checksPass: true, ownTestsPass: false, ownTestsCanFail: false, edgeCasesCovered: 0, edgeCasesTotal: 2 })).toBe(25);
    expect(proScore({ checksPass: true, ownTestsPass: true, ownTestsCanFail: false, edgeCasesCovered: 1, edgeCasesTotal: 3 })).toBe(58);
    expect(proScore({ checksPass: true, ownTestsPass: true, ownTestsCanFail: true, edgeCasesCovered: 0, edgeCasesTotal: 0 })).toBe(75);
  });
});

describe("done-when edge cases", () => {
  it("are the calls in backticks on the task's done-when", () => {
    const md = "- [ ] P1.T1 In `src/main.py`, write `split_amount(total, people)`. done when: `split_amount(48, 3)` is 16.0 and `split_amount(50, 3)` is 16.666666666666668\n- [ ] P1.T2 print\n";
    expect(doneWhenCalls(md, "P1.T1")).toEqual(["split_amount(48, 3)", "split_amount(50, 3)"]);
    expect(doneWhenCalls(md, "P1.T2")).toEqual([]);
  });
  it("are covered when an own test's body makes the same call, spaces ignored", () => {
    expect(coveredCalls(["split_amount(48, 3)", "split_amount(50, 3)"], ["    assert split_amount(48,3) == 16\n"])).toBe(1);
    expect(coveredCalls(["split_amount(48, 3)"], ["    assert split_amount(480, 3) == 160\n"])).toBe(0);
  });
});

describe("the score line shows every point", () => {
  it("names each fact, so the learner sees where points came from", () => {
    expect(scoreLine({ checksPass: true, ownTestsPass: true, ownTestsCanFail: false, edgeCasesCovered: 1, edgeCasesTotal: 2 }))
      .toBe("pro score 63/100: checks pass 25 · your tests pass 25 · your tests catch a broken version 0 · done-when cases covered 1/2 13");
  });
});

describe("levelSuggestion (spec 2026-10-21 §8: the tutor suggests, the learner decides)", () => {
  it("suggests a higher level after three scores well above it, a lower one after three well below, else nothing", () => {
    expect(levelSuggestion([100, 95, 100], 70)).toBe(80);
    expect(levelSuggestion([40, 25, 30], 75)).toBe(65);
    expect(levelSuggestion([100, 95], 70)).toBeNull();
    expect(levelSuggestion([80, 75, 70], 70)).toBeNull();
    expect(levelSuggestion([100, 100, 100], 100)).toBeNull();
  });
});
