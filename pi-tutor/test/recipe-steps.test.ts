import { describe, it, expect } from "vitest";
import { recognize, examplesToChecks, mergeExampleChecks, recipeIntent, isAttempt } from "../extensions/tutor/recipe-steps.js";

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

describe("Find: a question about the task has not found it (deferred minor)", () => {
  const py = { language: "python", task: "P1.T1" };
  it("a question naming the task is no Find; a statement with a question after it still is", () => {
    expect(recognize(1, "what does P1.T1 mean?", py)).toBe(false);
    expect(recognize(1, "where is P1.T1 in the map?", py)).toBe(false);
    expect(recognize(1, "P1.T1 is the split box in the design map", py)).toBe(true);
    expect(recognize(1, "P1.T1 is the split box. Is that right?", py)).toBe(true);
    expect(recognize(1, "I'm doing P1.T1, it makes the secret number", py)).toBe(true);
  });
  it("an unsure answer still finds it: only asking what the task is does not (review I1, final review I4)", () => {
    for (const t of ["I found P1.T1, what do I do now?", "P1.T1 - is it the split box?", "ok P1.T1 is the split box?", "It's P1.T1 (the split box)?", "P1.T1?", "Is it P1.T1? It is the split box", "I'm on P1.T1, right?"])
      expect([t, recognize(1, t, py)]).toEqual([t, true]);
    for (const t of ["what does P1.T1 mean?", "where is P1.T1 in the map?", "ok, what is P1.T1?", "How do I start P1.T1?", "can you explain P1.T1?", "which one is P1.T1?"])
      expect([t, recognize(1, t, py)]).toEqual([t, false]);
  });
  it("mergeExampleChecks: an example said again is kept once; a trusted copy takes an unverified one's place (review minor 7)", () => {
    const c = (expr: string, status: "trusted" | "unverified") => ({ task: "P1.T1", kind: "value" as const, expr, expected: "1", milestone: 1, status });
    expect(mergeExampleChecks([c("f(1)", "unverified")], [c("f(1)", "unverified"), c("f(2)", "trusted"), c("f(2)", "trusted")])).toEqual([c("f(1)", "unverified"), c("f(2)", "trusted")]);
    expect(mergeExampleChecks([c("f(1)", "unverified"), c("f(3)", "trusted")], [c("f(1)", "trusted"), c("f(3)", "unverified")])).toEqual([c("f(1)", "trusted"), c("f(3)", "trusted")]);
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
    // side-agent note: casual sentences must not earn the steps-first habit
    expect(recognize(4, "the bill comes in first and then the friends", o)).toBe(false);
    expect(recognize(4, "first I tried it and then it broke", o)).toBe(false);
    expect(recognize(5, "this is a loop, that is print", o)).toBe(false);
    expect(recognize(5, "it is weird and there is a star", o)).toBe(false);
  });
});

describe("final review I3/I4: complaints earn nothing, real attempts are not taken as intents", () => {
  const o = { language: "python", task: "P1.T1" };
  it("I3: a complaint is no Shape, Steps or Map", () => {
    expect(recognize(2, "I get an error and it makes no sense", o)).toBe(false);
    expect(recognize(2, "I need help and then it returns nothing", o)).toBe(false);
    expect(recognize(5, "The error is in the loop and the problem is with the input", o)).toBe(false);
    expect(recognize(4, "first I was confused, then I read it, then I gave up again", o)).toBe(false);
  });
  it("I4: hedged or long attempts are no skip and no explain", () => {
    for (const t of [
      "let me start by listing the inputs: the total and the people",
      "could I write it as a loop instead",
      "I don't want to skip the edge case, zero people should say error",
      "I'm not sure this is right but my steps are: 1. read the sentence 2. split it 3. print each",
      "not sure, examples: share(10, 2) gives 5 and share(0, 2) gives error",
    ]) expect(recipeIntent(t), t).toBeNull();
    for (const t of ["skip", "can I just try writing the code?", "just let me code", "skip this step"]) expect(recipeIntent(t), t).toBe("skip");
    for (const t of ["I don't know what a map diagram is", "what is a step?", "what does shape mean?", "I don't understand this step", "I don't understand"]) expect(recipeIntent(t), t).toBe("explain");
  });
});
