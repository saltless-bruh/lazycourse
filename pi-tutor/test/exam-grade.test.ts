import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { learnerFiles, checkGrade, score, renderGrade, gradePrompt, type Grade } from "../extensions/tutor/exam/grade.js";

const files = [{ rel: "solution.py", lines: ["def count_words(text):", "    out = {}", "    return out"] }];
const G: Grade = {
  requirements: [{ id: "R1", met: true, evidence: "solution.py:2 — builds a dict" }, { id: "R2", met: false, evidence: "solution.py:1 — never lowercases" }],
  idioms: [{ ok: true, note: "plain dict counting", evidence: "solution.py:2" }],
  next_fixes: ["lowercase each word", "use dict.get", "name the loop variable"], in_short: "Counting works; case does not.",
};
const ctx = { ids: ["R1", "R2"], files, testsPassed: false };

describe("learnerFiles", () => {
  it("sends the learner's text files, not the brief, grade, tests, build output or links out", () => {
    const dir = mkdtempSync(join(tmpdir(), "lf-"));
    for (const [p, t] of [["solution.py", "x = 1\n"], ["helpers.py", "y = 2\n"], ["brief.md", "b"], ["grade.md", "g"], ["test_examples.py", "t"], ["__pycache__/s.pyc", "\0bin"]] as const) {
      mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), t);
    }
    symlinkSync("/etc/hostname", join(dir, "leak.py"));
    expect(learnerFiles(dir, "python").map((f) => f.rel).sort()).toEqual(["helpers.py", "solution.py"]);
  });
});

describe("checkGrade (Review Focus #4)", () => {
  it("accepts a grade with one entry per requirement and real file:line evidence", () => {
    expect(checkGrade(G, ctx)).toEqual(G);
  });
  it("rejects a missing or extra requirement, a file or line that does not exist, and all-met with failing tests", () => {
    expect(() => checkGrade({ ...G, requirements: [G.requirements[0]] }, ctx)).toThrow(/R1, R2/);
    expect(() => checkGrade({ ...G, requirements: [G.requirements[0], { ...G.requirements[1], evidence: "main.py:1 — x" }] }, ctx)).toThrow(/main\.py:1 is not/);
    expect(() => checkGrade({ ...G, requirements: [G.requirements[0], { ...G.requirements[1], evidence: "solution.py:99 — x" }] }, ctx)).toThrow(/solution\.py:99 is not/);
    expect(() => checkGrade({ ...G, requirements: G.requirements.map((r) => ({ ...r, met: true })) }, ctx)).toThrow(/tests fail/);
    expect(() => checkGrade({ ...G, next_fixes: ["one"] }, ctx)).toThrow(/three/);
  });
});

describe("score and grade.md (D3)", () => {
  it("80 for requirements met, 20 for idioms; no idiom checks counts as full", () => {
    expect(score(G)).toBe(60); // 80 × 1/2 + 20 × 1/1
    expect(score({ ...G, idioms: [] })).toBe(60);
    expect(score({ ...G, requirements: G.requirements.map((r) => ({ ...r, met: true })) })).toBe(100);
  });
  it("grade.md has the score, ✔/✘ per requirement with evidence, the test run, late, fixes and In short", () => {
    const md = renderGrade(G, { id: "01-word-frequency", score: 60, minutes: 22.4, limit: 20, test: { code: 1, out: "FAILED (failures=1)", killed: false, broken: false } });
    expect(md).toMatch(/^# Grade: exam 01-word-frequency\n\n\*\*60\/100\*\* · 22\.4 of 20 minutes · late\n/);
    expect(md).toContain("- ✔ **R1** solution.py:2 — builds a dict");
    expect(md).toContain("- ✘ **R2** solution.py:1 — never lowercases");
    expect(md).toContain("The example tests failed (exit 1).");
    expect(md).toContain("FAILED (failures=1)");
    expect(md).toMatch(/## Next fixes\n\n1\. lowercase each word\n2\. use dict\.get\n3\. name the loop variable/);
    expect(md).toMatch(/## In short\n\nCounting works; case does not\./);
  });
  it("a timed-out run says so in the prompt and in grade.md (Review Focus #2)", () => {
    const killed = { code: 143, out: "", killed: true, broken: false };
    expect(gradePrompt({ brief: "b", files, test: killed, checklist: "c", minutes: 5, limit: 20 })).toMatch(/timed out after 120 s/);
    expect(renderGrade(G, { id: "01-x", score: 60, minutes: 5, limit: 20, test: killed })).toContain("The example tests timed out after 120 s");
  });
});
