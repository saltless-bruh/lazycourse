import { describe, it, expect } from "vitest";
import { roundingWeakTasks, slipMutants } from "../extensions/tutor/near-miss.js";
import type { Check } from "../extensions/tutor/checks.js";

const v = (task: string, expr: string, expected: string): Check => ({ task, kind: "value", expr, expected, milestone: 1, status: "trusted" });

describe("roundingWeakTasks (spec 2026-10-22 §5.5)", () => {
  it("a task whose numeric checks all expect whole numbers would let a rounded answer through", () => {
    expect(roundingWeakTasks([v("P1.T1", "split_amount(48, 3)", "16.0")])).toEqual(["P1.T1"]);
    expect(roundingWeakTasks([v("P1.T1", "split_amount(48, 3)", "16.0"), v("P1.T1", "split_amount(50, 3)", "16.666666666666668")])).toEqual([]);
  });
  it("text, boolean and unverified checks do not count", () => {
    expect(roundingWeakTasks([v("P1.T2", "greet()", '"hi"'), v("P1.T3", "is_even(2)", "True")])).toEqual([]);
    expect(roundingWeakTasks([{ ...v("P1.T1", "f(1)", "1"), status: "unverified" }])).toEqual([]);
  });
});

describe("slipMutants", () => {
  it("swaps one spaced operator at a time, never inside strings or comments", () => {
    expect(slipMutants("return total / people  # a / b\n")).toEqual(["return total * people  # a / b\n"]);
    expect(slipMutants('s = "a + b"\nx = a + b\n')).toEqual(['s = "a + b"\nx = a - b\n']);
    expect(slipMutants("if age < 18:\n")).toEqual(["if age <= 18:\n"]);
  });
  it("leaves arrows, generics and unspaced operators alone; at most max copies", () => {
    expect(slipMutants("fn f(v: Vec<u32>) -> u32 { 1 }\n")).toEqual([]);
    expect(slipMutants("a + b + c + d\n", 2)).toHaveLength(2);
  });
});

describe("roundingWeakTasks with the reference's value types (spec 2026-10-26 §5.3)", () => {
  it("a task whose function returns integers is never rounding-weak; a float one still is", () => {
    const checks = [v("P1.T1", "count_words('a b a')", "3"), v("P1.T1", "count_words('x')", "1")];
    expect(roundingWeakTasks(checks, new Map([["count_words('a b a')", "int"], ["count_words('x')", "int"]]))).toEqual([]);
    expect(roundingWeakTasks(checks, new Map([["count_words('a b a')", "float"], ["count_words('x')", "float"]]))).toEqual(["P1.T1"]);
    expect(roundingWeakTasks(checks)).toEqual(["P1.T1"]);
  });
});
