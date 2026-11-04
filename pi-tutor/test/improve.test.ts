import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { codeMetrics, improveResult } from "../extensions/tutor/improve.js";
import type { SandboxHost } from "../extensions/tutor/exam/sandbox.js";
import { realExec } from "./fake-pi.js";

const bwrapReady = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0;
const host = (): SandboxHost => ({ env: process.env, home: homedir(), cacheDir: mkdtempSync(join(tmpdir(), "imp-cache-")) });
function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "imp-proj-"));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }
  return root;
}

// Habits spec 2026-10-26 §8, Task 17: "code" is measured by the language's own parser (Python ast), in the sandbox.
describe.skipIf(!bwrapReady)("codeMetrics", () => {
  it("a nested function: its length, how deep it nests, how many branches it has", async () => {
    const src = "def f(xs):\n    total = 0\n    for x in xs:\n        if x > 0 and x < 9:\n            while x:\n                x -= 1\n    return total\n\n\ndef g():\n    return 1\n";
    expect(await codeMetrics(realExec, { root: project({ "src/main.py": src }), entry: "src/main.py", sandbox: host() }))
      .toEqual({ longestFunction: 7, maxNesting: 3, branches: 4 });
  }, 60_000);
  it("an elif chain is one level, not a staircase", async () => {
    const src = "def grade(n):\n    if n > 90:\n        return 'A'\n    elif n > 80:\n        return 'B'\n    elif n > 70:\n        return 'C'\n    return 'D'\n";
    expect(await codeMetrics(realExec, { root: project({ "src/main.py": src }), entry: "src/main.py", sandbox: host() }))
      .toEqual({ longestFunction: 8, maxNesting: 1, branches: 3 });
  }, 60_000);
  it("only the named functions, when given; a file that does not parse gives null", async () => {
    const root = project({ "src/main.py": "def a():\n    if 1:\n        pass\n\n\ndef b():\n    return 2\n" });
    expect(await codeMetrics(realExec, { root, entry: "src/main.py", sandbox: host(), functions: ["b"] })).toEqual({ longestFunction: 2, maxNesting: 0, branches: 0 });
    expect(await codeMetrics(realExec, { root: project({ "src/main.py": "def a(:\n" }), entry: "src/main.py", sandbox: host() })).toBeNull();
  }, 60_000);
});

describe("improveResult (logic, speed, code; design is notes only)", () => {
  const base = { longestFunction: 30, maxNesting: 4, branches: 9, edgePassed: 1, ms: 800 };
  it("names what got better and what got worse", () => {
    expect(improveResult(base, { ...base, maxNesting: 2, branches: 6, ms: 40 })).toEqual({
      better: ["speed: 800 ms → 40 ms", "nesting: 4 → 2", "branches: 9 → 6"], worse: [],
    });
    expect(improveResult(base, { ...base, edgePassed: 3, longestFunction: 34 })).toEqual({
      better: ["edge cases passed: 1 → 3"], worse: ["longest function: 30 → 34 lines"],
    });
  });
  it("timing noise is neither better nor worse; no timed check means no speed at all", () => {
    expect(improveResult(base, { ...base, ms: 830 })).toEqual({ better: [], worse: [] });
    // full-suite flake: the same code timed again under load ran 25–40 % faster; only 2× or more counts
    expect(improveResult(base, { ...base, ms: 500 })).toEqual({ better: [], worse: [] });
    expect(improveResult(base, { ...base, ms: 1300 })).toEqual({ better: [], worse: [] });
    expect(improveResult(base, { ...base, ms: 1700 })).toEqual({ better: [], worse: ["speed: 800 ms → 1700 ms"] });
    expect(improveResult({ ...base, ms: 3 }, { ...base, ms: 1 })).toEqual({ better: [], worse: [] });
    expect(improveResult({ ...base, ms: null }, { ...base, ms: 5 })).toEqual({ better: [], worse: [] });
  });
});
