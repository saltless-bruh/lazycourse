import { describe, it, expect } from "vitest";
import { parseChecks, liveChecks, renderChecksMd, openTaskIds, tickedIds, shortNumber, type Check } from "../extensions/tutor/checks.js";

const ids = ["P2.T1", "P2.T2", "P2.T3", "P3.T2"];

describe("parseChecks (spec 2026-10-21 §7: strict form)", () => {
  it("parses value and io lines; rejects unknown ids and stray text", () => {
    const r = parseChecks('check P2.T2: tip_amount(40, 0.2) == 8.0\nrun P2.T3: stdin "48\\nn\\n" -> stdout contains "17.6"\ncheck P9.T1: x() == 1\nLet me write the checks:', { language: "python", taskIds: ids, milestone: 2 });
    expect(r.checks).toEqual([
      { task: "P2.T2", kind: "value", expr: "tip_amount(40, 0.2)", expected: "8.0", milestone: 2, status: "unverified" },
      { task: "P2.T3", kind: "io", stdin: "48\nn\n", contains: "17.6", milestone: 2, status: "unverified" },
    ]);
    expect(r.rejected).toEqual(["check P9.T1: x() == 1", "Let me write the checks:"]);
  });
  it("takes the arrow as →, a bullet or a fence around the lines, and skips blank lines", () => {
    const r = parseChecks('```\n- check P2.T1: tip_rate(True) == 0.2\n\nrun P3.T2: stdin "" → stdout contains "Total"\n```', { language: "lua", taskIds: ids, milestone: 3 });
    expect(r.checks.map((c) => c.task)).toEqual(["P2.T1", "P3.T2"]);
    expect(r.checks[1]).toMatchObject({ stdin: "", contains: "Total" });
    expect(r.rejected).toEqual([]);
  });
  it("splits a value line on its last ==, so the expression may compare too", () => {
    expect(parseChecks('check P2.T1: is_even(4) == (2 == 2)', { language: "python", taskIds: ids, milestone: 2 }).checks[0]).toMatchObject({ expr: "is_even(4)", expected: "(2 == 2)" });
    expect(parseChecks('check P2.T1: greet("a == b") == "hi a == b"', { language: "python", taskIds: ids, milestone: 2 }).checks[0]).toMatchObject({ expr: 'greet("a == b")', expected: '"hi a == b"' });
  });
  it("Rust and Go get value lines too (spec 2026-10-22 §5.2)", () => {
    expect(parseChecks("check P2.T2: split_amount(50.0, 3) == 16.67", { language: "rust", taskIds: ids, milestone: 2 }).checks[0]).toMatchObject({ kind: "value", expr: "split_amount(50.0, 3)", expected: "16.67" });
    expect(parseChecks("check P2.T2: splitAmount(50, 3) == 16.67", { language: "go", taskIds: ids, milestone: 2 }).checks[0]).toMatchObject({ kind: "value", expr: "splitAmount(50, 3)" });
  });
  // Habits Task 23: every supported language now has function checks; C stands for one that does not.
  it("Review Focus #5: value lines are rejected in a language without function checks; io lines are kept", () => {
    const r = parseChecks('check P2.T2: tipAmount(40, 0.2) == 8.0\nrun P2.T3: stdin "48\\n" -> stdout contains "16"', { language: "c", taskIds: ids, milestone: 2 });
    expect(r.checks.map((c) => c.kind)).toEqual(["io"]);
    expect(r.rejected).toEqual(["check P2.T2: tipAmount(40, 0.2) == 8.0"]);
  });
});

describe("liveChecks (spec §7: checks belong to a milestone)", () => {
  const c = (task: string, expr: string, expected: string, milestone: number): Check => ({ task, kind: "value", expr, expected, milestone, status: "trusted" });
  it("a later milestone's check on the same function retires the earlier one (tip_rate 0.15 → 0.2/0.1)", () => {
    const all = [c("P1.T2", "tip_rate(True)", "0.15", 1), c("P2.T1", "tip_rate(True)", "0.2", 2), c("P1.T3", "include_tip(True, False)", "True", 1)];
    expect(liveChecks(all, 2).map((x) => x.task)).toEqual(["P2.T1", "P1.T3"]);
    expect(liveChecks(all, 1).map((x) => x.task)).toEqual(["P1.T2", "P1.T3"]);
  });
  it("io checks are never retired; a milestone not reached yet is not live", () => {
    const io: Check = { task: "P1.T4", kind: "io", stdin: "1\n", contains: "1", milestone: 1, status: "trusted" };
    expect(liveChecks([io, c("P3.T1", "f()", "1", 3)], 2)).toEqual([io]);
  });
});

describe("renderChecksMd", () => {
  it("lists checks per task, marks unverified and ticked ones, and says the tutor rewrites the file", () => {
    const checks: Check[] = [
      { task: "P2.T2", kind: "value", expr: "tip_amount(40, 0.2)", expected: "8.0", milestone: 2, status: "trusted" },
      { task: "P2.T2", kind: "value", expr: "tip_amount(10, 0)", expected: "0", milestone: 2, status: "unverified" },
      { task: "P2.T3", kind: "io", stdin: "48\nn\n", contains: "17.6", milestone: 2, status: "trusted" },
    ];
    expect(renderChecksMd(checks, new Set(["P2.T3"]))).toBe([
      "<!-- The tutor rewrites this file from its own record; edits here are not kept. -->",
      "# Checks",
      "",
      "Run `:TutorDone <task>` when a task works. Checks marked (unverified) are shown but never block a tick.",
      "",
      "2 of 3 checks confirmed",
      "",
      "## P2.T2",
      "- tip_amount(40, 0.2) == 8.0",
      "- tip_amount(10, 0) == 0 (unverified)",
      "",
      "## P2.T3 (done)",
      '- type "48\\nn\\n" → output contains "17.6"',
      "",
    ].join("\n"));
  });
  it("adds a note under the heading when one is given", () => {
    expect(renderChecksMd([], new Set(), { note: "These could not be tried." }).split("\n").slice(3, 6)).toEqual(["Run `:TutorDone <task>` when a task works. Checks marked (unverified) are shown but never block a tick.", "", "These could not be tried."]);
  });
  it("labels how a done task was ticked", () => {
    const c: Check = { task: "P2.T2", kind: "value", expr: "f()", expected: "1", milestone: 1, status: "trusted" };
    expect(renderChecksMd([c], new Set(["P2.T2"]), { how: { "P2.T2": "you" } })).toContain("## P2.T2 (done, ticked by you)");
    expect(renderChecksMd([c], new Set(), { weak: new Set(["P2.T2"]) })).toContain("## P2.T2 (a near miss may pass these checks)");
    expect(renderChecksMd([c], new Set(["P2.T2"]), { how: { "P2.T2": "self" } })).toContain("## P2.T2 (done, self-checked)");
  });
});

describe("shortNumber (spec 2026-10-26 §5.3)", () => {
  it("long decimals shown to 4 places, whole floats and text unchanged", () => {
    expect(shortNumber("16.666666666666668")).toBe("16.6667");
    expect(shortNumber("16.0")).toBe("16.0");
    expect(shortNumber("144")).toBe("144");
    expect(shortNumber("'hi 1.23456789'")).toBe("'hi 1.23456789'");
  });
});

describe("task lines a weak model wrote loosely (final review I4)", () => {
  const md = "## Milestone 1: x\n- [x] **P1.T1** done\n- [ ] **P1.T2** open\n  - [ ] P1.T2.S1: sub\n* [ ] P1.T3: starred\n- [ ] P2.T1 later\n- [X] P2.T2. done too\n";
  it("open tasks are the unticked lines' task ids, subtasks left out, in order", () => {
    expect(openTaskIds(md)).toEqual(["P1.T2", "P1.T3", "P2.T1"]);
  });
  it("ticked ids include subtasks", () => {
    expect([...tickedIds(md)].sort()).toEqual(["P1.T1", "P2.T2"]);
    expect([...tickedIds("- [x] P1.T2.S1: sub\n")]).toEqual(["P1.T2.S1"]);
  });
});

describe("timed check lines (habits Task 17)", () => {
  it("parse for Python; other languages reject them", () => {
    expect(parseChecks("timed P1.T1: count_unique(list(range(20000)))", { language: "python", taskIds: ["P1.T1"], milestone: 1 }).checks)
      .toEqual([{ task: "P1.T1", kind: "timed", expr: "count_unique(list(range(20000)))", milestone: 1, status: "unverified" }]);
    expect(parseChecks("timed P1.T1: f(1)", { language: "lua", taskIds: ["P1.T1"], milestone: 1 }).rejected).toEqual(["timed P1.T1: f(1)"]);
  });
});

describe("timed checks in checks.md (habits Task 17)", () => {
  it("show the call and its time limit, and a later milestone's check on the function retires them", () => {
    const t: Check = { task: "P1.T1", kind: "timed", expr: "count_unique(list(range(20000)))", milestone: 1, status: "trusted", limitMs: 60 };
    expect(renderChecksMd([t], new Set())).toContain("- count_unique(list(range(20000))) finishes within 60 ms");
    expect(renderChecksMd([{ ...t, limitMs: undefined, status: "unverified" }], new Set())).toContain("- count_unique(list(range(20000))) is timed (unverified)");
    const later: Check = { task: "P2.T1", kind: "value", expr: "count_unique([1])", expected: "1", milestone: 2, status: "trusted" };
    expect(liveChecks([t, later], 2)).toEqual([later]);
    // final review M7: a later timed check never retires a function's value checks
    const value1: Check = { task: "P1.T1", kind: "value", expr: "count_unique([1])", expected: "1", milestone: 1, status: "trusted" };
    expect(liveChecks([value1, { ...t, milestone: 2 }], 2)).toEqual([value1, { ...t, milestone: 2 }]);
  });
});

describe("parseChecks rejects an expected value with an unclosed bracket (Rust/Go minor)", () => {
  it("one that would sink the reference run never becomes a check", () => {
    const r = parseChecks("check P1.T1: f(1) == [1, 2\ncheck P1.T1: f(2) == (3, 4\ncheck P1.T1: f(3) == [1, (2, 3)]", { language: "python", taskIds: ["P1.T1"], milestone: 1 });
    expect(r.checks.map((c) => c.expected)).toEqual(["[1, (2, 3)]"]);
    expect(r.rejected).toEqual(["check P1.T1: f(1) == [1, 2", "check P1.T1: f(2) == (3, 4"]);
  });
});

describe("check lines for JavaScript and TypeScript (habits Task 23)", () => {
  it("parse as function checks", () => {
    for (const language of ["javascript", "typescript"])
      expect(parseChecks("check P1.T1: splitAmount(50, 4) == 12.5", { language, taskIds: ["P1.T1"], milestone: 1 }).checks)
        .toEqual([{ task: "P1.T1", kind: "value", expr: "splitAmount(50, 4)", expected: "12.5", milestone: 1, status: "unverified" }]);
  });
});

describe("Phase 8 A6: brackets and == inside a JS template, a Go raw string or a Lua long string", () => {
  const one = (line: string, language: string) => parseChecks(line, { language, taskIds: ["P1.T1"], milestone: 1 }).checks[0];
  it("are text, not code", () => {
    expect(one("check P1.T1: wrap(`(a`) == `[(a]`", "javascript")).toMatchObject({ expr: "wrap(`(a`)", expected: "`[(a]`" });
    expect(one("check P1.T1: eq(`a == b`) == true", "typescript")).toMatchObject({ expr: "eq(`a == b`)", expected: "true" });
    expect(one("check P1.T1: Wrap(`(a`) == \"[(a]\"", "go")).toMatchObject({ expr: "Wrap(`(a`)", expected: "\"[(a]\"" });
    expect(one("check P1.T1: wrap([[(a]]) == [==[[(a]]==]", "lua")).toMatchObject({ expr: "wrap([[(a]])", expected: "[==[[(a]]==]" });
  });
  it("a Python nested list is still brackets, and an unclosed bracket is still dropped", () => {
    expect(one("check P1.T1: flat([[1, 2], [3]]) == [1, 2, 3]", "python")).toMatchObject({ expr: "flat([[1, 2], [3]])", expected: "[1, 2, 3]" });
    expect(one("check P1.T1: wrap(`(a`) == (1", "javascript")).toBeUndefined();
    expect(one("check P1.T1: wrap([[(a]] == 1", "lua")).toBeUndefined();
  });
});

describe("renderChecksMd confirmed count (learner-session fixes Task 4)", () => {
  it("says how many checks are confirmed", () => {
    const c = (status: "trusted" | "unverified"): Check => ({ task: "P1.T1", kind: "value", expr: "f()", expected: "1", milestone: 1, status });
    expect(renderChecksMd([c("unverified"), c("unverified")], new Set())).toContain("0 of 2 checks confirmed");
    expect(renderChecksMd([c("trusted"), c("unverified")], new Set())).toContain("1 of 2 checks confirmed");
  });
});
