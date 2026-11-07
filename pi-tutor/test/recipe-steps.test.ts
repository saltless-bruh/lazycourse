import { describe, it, expect } from "vitest";
import { recognize, examplesToChecks, recipeIntent, isAttempt } from "../extensions/tutor/recipe-steps.js";

const py = { language: "python", task: "P1.T1" };
describe("recognize: code decides when a recipe step's artifact is there (spec 2026-10-26 §5.1)", () => {
  it("Find: the task named", () => {
    expect(recognize(1, "P1.T1 is the split box in the design map", py)).toBe(true);
    expect(recognize(1, "ok, ready", py)).toBe(false);
  });
  it("Shape: a typed signature in the project's language", () => {
    expect(recognize(2, "total: float, people: int → float", py)).toBe(true);
    expect(recognize(2, "fn split_amount(total: f64, people: u32) -> f64", { language: "rust", task: "P1.T1" })).toBe(true);
    expect(recognize(2, "func splitAmount(total float64, people int) float64", { language: "go", task: "P1.T1" })).toBe(true);
    expect(recognize(2, "it takes the total and the people", py)).toBe(false);
  });
  it("final review I2: Python's own signature forms count; arrow chat does not", () => {
    expect(recognize(2, "def split_bill(total: float, people: int) -> float:", py)).toBe(true);
    expect(recognize(2, "split_bill(total: float, people: int) → float", py)).toBe(true);
    expect(recognize(2, "words: list[str] → dict[str, int]", py)).toBe(true);
    expect(recognize(2, "idea: read the file -> count words", py)).toBe(false);
    expect(recognize(2, "Error: x -> y happens when I run it", py)).toBe(false);
  });
  it("Examples: two or more input → output rows, one of them an edge case", () => {
    expect(recognize(3, "split_amount(48, 3) → 16.0\nsplit_amount(50, 3) → 16.67\nedge: split_amount(0, 3) → 0.0", py)).toBe(true);
    expect(recognize(3, "split_amount(48, 3) → 16.0\nsplit_amount(50, 3) → 16.67", py)).toBe(false);
    expect(recognize(3, "edge: split_amount(0, 3) → 0.0", py)).toBe(false);
  });
  it("Steps: two or more numbered plain sentences, no code", () => {
    expect(recognize(4, "1. take the total\n2. divide it by the number of people\n3. give the share back", py)).toBe(true);
    expect(recognize(4, "1. total / people\n2. return round(x)", py)).toBe(false);
    expect(recognize(4, "divide the total", py)).toBe(false);
  });
  it("Map: two or more steps paired with a construct", () => {
    expect(recognize(5, "divide the total by people → `/`\ngive the share back → return", py)).toBe(true);
    expect(recognize(5, "divide → /", py)).toBe(false);
  });
  it("Build is never recognised from text; the task's checks decide it", () => {
    expect(recognize(6, "done, it works", py)).toBe(false);
  });
});

describe("examplesToChecks: the learner's Examples rows become value checks", () => {
  it("parses f(args) → value rows, with or without an edge: label, and skips the rest", () => {
    const c = examplesToChecks("split_amount(50, 3) → 16.666666666666668\nedge: split_amount(0, 3) -> 0.0\nit should round", "P1.T1", "python", 1);
    expect(c.map((x) => [x.task, x.kind, x.expr, x.expected, x.status])).toEqual([
      ["P1.T1", "value", "split_amount(50, 3)", "16.666666666666668", "unverified"],
      ["P1.T1", "value", "split_amount(0, 3)", "0.0", "unverified"],
    ]);
  });
  it("gives nothing for a language without value checks", () => {
    expect(examplesToChecks("splitAmount(50, 3) → 16.67", "P1.T1", "c", 1)).toEqual([]); // habits Task 23: JS/TS have function checks now
  });
});

describe("Phase 8 A15: steps recognised more exactly", () => {
  it("numbered questions are not Steps", () => {
    expect(recognize(4, "1. what do I take first?\n2. should I divide it?", py)).toBe(false);
    expect(recognize(4, "1. take the total\n2. what next?", py)).toBe(false);
  });
  it("`f(x) = y` and `f(x) == y` are Examples rows, and become checks", () => {
    expect(recognize(3, "split_amount(48, 3) = 16.0\nedge: split_amount(0, 3) == 0.0", py)).toBe(true);
    expect(examplesToChecks("split_amount(48, 3) = 16.0\nedge: split_amount(0, 3) == 0.0", "P1.T1", "python", 1).map((c) => [c.expr, c.expected]))
      .toEqual([["split_amount(48, 3)", "16.0"], ["split_amount(0, 3)", "0.0"]]);
  });
});

describe("learner-session fixes §6: plain words and beginner wording", () => {
  it("recipeIntent: skip and explain in plain words; anything else is no intent", () => {
    for (const t of ["skip", "can I just try writing the code?", "just let me code"]) expect(recipeIntent(t), t).toBe("skip");
    for (const t of ["I don't know what a map diagram is", "what is a step?", "what does shape mean?"]) expect(recipeIntent(t), t).toBe("explain");
    for (const t of ["the first task is P1.T1", "what is a list in python?", "I skipped breakfast and then wrote the loop"]) expect(recipeIntent(t), t).toBeNull();
  });
  it("isAttempt: not a question, not an intent, at least 4 words", () => {
    expect(isAttempt("the bill comes in first and then the friends")).toBe(true);
    for (const t of ["what does shape mean?", "skip", "just let me code", "ok sure", "I don't understand this step"]) expect(isAttempt(t), t).toBe(false);
  });
  it("beginner wording is recognized", () => {
    const o = { language: "python", task: "P1.T1" };
    expect(recognize(1, "I'm doing P1.T1, it makes the secret number", o)).toBe(true);
    expect(recognize(2, "it takes the total and the people and gives back each share", o)).toBe(true);
    expect(recognize(3, "if the total is 48 and 3 people it should give 16, and with 0 people it should say error", o)).toBe(true);
    expect(recognize(4, "first I divide the total, then I round it, then I give it back", o)).toBe(true);
    expect(recognize(5, "dividing is the slash, rounding is round()", o)).toBe(true);
  });
  it("the wider recognizers still turn down what is no artifact", () => {
    const o = { language: "python", task: "P1.T1" };
    expect(recognize(2, "it takes a while", o)).toBe(false);
    expect(recognize(3, "if the total is 48 it should give 16", o)).toBe(false); // one case, no edge
    expect(recognize(4, "first I am confused", o)).toBe(false);
    expect(recognize(5, "this is hard", o)).toBe(false);
  });
});
