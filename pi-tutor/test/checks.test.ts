import { describe, it, expect } from "vitest";
import { parseChecks, liveChecks, renderChecksMd, type Check } from "../extensions/tutor/checks.js";

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
  it("Review Focus #5: value lines are rejected outside Python and Lua; io lines are kept", () => {
    const r = parseChecks('check P2.T2: tipAmount(40, 0.2) == 8.0\nrun P2.T3: stdin "48\\n" -> stdout contains "16"', { language: "typescript", taskIds: ids, milestone: 2 });
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
    expect(renderChecksMd([c], new Set(["P2.T2"]), { how: { "P2.T2": "self" } })).toContain("## P2.T2 (done, self-checked)");
  });
});
