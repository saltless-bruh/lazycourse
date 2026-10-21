import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checksPrompt, referencePrompt, crossCheck, extractCode, milestoneText, currentMilestone, writeMilestoneChecks, readChecksState } from "../extensions/tutor/check-job.js";
import type { Check } from "../extensions/tutor/checks.js";
import type { SandboxHost } from "../extensions/tutor/exam/sandbox.js";
import { realExec } from "./fake-pi.js";

const TASKS = [
  "# Tasks",
  "",
  "## Milestone 1: functions, arithmetic",
  "- [ ] P1.T1 Write `split_amount(total, people)` in src/main.py returning each share; done when: split_amount(48, 3) gives 16.0",
  "  - [ ] P1.T1.S1 Define the function; done when: it returns total / people",
  "## Milestone 2: input, f-strings",
  "- [ ] P2.T1 Ask for the total and print each share; done when: typing 48 prints $16.00",
  "",
].join("\n");

describe("milestones", () => {
  it("milestoneText is one milestone's section, or the milestones up to it, or the whole flat plan", () => {
    expect(milestoneText(TASKS, 2)).toBe("## Milestone 2: input, f-strings\n- [ ] P2.T1 Ask for the total and print each share; done when: typing 48 prints $16.00");
    expect(milestoneText(TASKS, 2, { upTo: true })).toContain("P1.T1");
    expect(milestoneText("- [ ] P1.T1 x\n- [ ] P1.T2 y\n", 1)).toBe("- [ ] P1.T1 x\n- [ ] P1.T2 y");
  });
  it("currentMilestone: the round being built, the last one once lessons end, 1 for a flat plan, 0 before any build", () => {
    const l = (round: number, building: boolean) => ({ rounds: [["a"], ["b"]], round, concept: "a", exercise: 0, fails: 0, stepBack: false, building, resume: null });
    expect(currentMilestone(TASKS, l(0, false))).toBe(0);
    expect(currentMilestone(TASKS, l(0, true))).toBe(1);
    expect(currentMilestone(TASKS, l(1, false))).toBe(1);
    expect(currentMilestone(TASKS, null)).toBe(2);
    expect(currentMilestone("- [ ] P1.T1 x\n", null)).toBe(1);
    expect(currentMilestone(TASKS, { ...l(0, false), resume: { round: 1, concept: "b", exercise: 0, building: true } })).toBe(2);
  });
});

describe("prompts (spec §7 cross-check)", () => {
  it("the checks prompt carries the milestone's tasks and the line forms; outside Python and Lua, run lines only", () => {
    const p = checksPrompt({ language: "python", tasksMd: TASKS, milestone: 1 });
    expect(p).toContain("P1.T1 Write `split_amount(total, people)`");
    expect(p).not.toContain("P2.T1");
    expect(p).toContain("check <task id>: <expression> == <expected value>");
    expect(checksPrompt({ language: "go", tasksMd: TASKS, milestone: 1 })).toMatch(/write only run lines/i);
  });
  it("the reference never sees a done-when or its expected values", () => {
    const p = referencePrompt({ language: "python", tasksMd: TASKS, milestone: 2, entry: "src/main.py" });
    expect(p).toContain("split_amount(total, people)");
    expect(p).toContain("P2.T1 Ask for the total");
    expect(p).not.toMatch(/done when/i);
    expect(p).not.toContain("16.0");
    expect(p).not.toContain("$16.00");
    expect(p).toContain("src/main.py");
  });
  it("extractCode takes the fenced file, or the whole reply", () => {
    expect(extractCode("Here:\n```python\ndef f():\n    return 1\n```\nDone.")).toBe("def f():\n    return 1\n");
    expect(extractCode("def f():\n    return 1")).toBe("def f():\n    return 1\n");
  });
});

describe("crossCheck", () => {
  it("agree → trusted, disagree → unverified", () => {
    const c = (expr: string): Check => ({ task: "P1.T1", kind: "value", expr, expected: "1", milestone: 1, status: "unverified" });
    expect(crossCheck([{ check: c("a()"), pass: true }, { check: c("b()"), pass: false, got: "2" }]).map((x) => x.status)).toEqual(["trusted", "unverified"]);
  });
});

describe("readChecksState", () => {
  it("empty for nothing or junk", () => {
    expect(readChecksState(undefined)).toEqual({ milestones: {} });
    expect(readChecksState("{nope")).toEqual({ milestones: {} });
  });
});

const bwrapReady = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0;
const host = (): SandboxHost => ({ env: process.env, home: homedir(), cacheDir: mkdtempSync(join(tmpdir(), "job-cache-")) });

describe.skipIf(!bwrapReady || spawnSync("python3", ["--version"]).status !== 0)("writeMilestoneChecks against a real reference in the sandbox", () => {
  it("a check the reference agrees with (within decimal tolerance) is trusted; one it contradicts is unverified", async () => {
    const replies = [
      [
        "check P2.T1: split_amount(52.8, 3) == 17.6",
        'run P2.T1: stdin "52.8\\n" -> stdout contains "$13.20"',
        'run P2.T1: stdin "52.8\\n" -> stdout contains "$17.60"',
      ].join("\n"),
      "```python\ndef split_amount(total, people):\n    return total / people\n\nif __name__ == '__main__':\n    t = float(input('total: '))\n    print(f'each: ${split_amount(t, 3):.2f}')\n```",
    ];
    const asked: string[] = [];
    const m = await writeMilestoneChecks({
      complete: async (_s, u) => { asked.push(u); return replies.shift()!; },
      exec: realExec, sandbox: host(), language: "python", tasksMd: TASKS, milestone: 2, entry: "src/main.py", runCmd: "python3 src/main.py",
    });
    expect(m.checks.map((c) => [c.kind, c.status])).toEqual([["value", "trusted"], ["io", "unverified"], ["io", "trusted"]]);
    expect(m.ran).toBe(true);
    expect(m.reference).toContain("def split_amount");
    expect(asked[1]).not.toMatch(/done when/i);
  }, 60_000);
});

describe("writeMilestoneChecks without a sandbox (spec §11a)", () => {
  it("stores the checks unverified and runs nothing", async () => {
    const ran: string[] = [];
    const replies = ["check P1.T1: split_amount(48, 3) == 16.0", "```python\ndef split_amount(t, p):\n    return t / p\n```"];
    const m = await writeMilestoneChecks({
      complete: async () => replies.shift()!, exec: async (c) => { ran.push(c); return { stdout: "", stderr: "", code: 0, killed: false }; },
      sandbox: null, language: "python", tasksMd: TASKS, milestone: 1, entry: "src/main.py", runCmd: "python3 src/main.py",
    });
    expect(m.checks.map((c) => c.status)).toEqual(["unverified"]);
    expect(m.ran).toBe(false);
    expect(ran).toEqual([]);
  });
  it("asks once more when no line was usable, saying which were rejected", async () => {
    const asked: string[] = [];
    const replies = ["Sure! Here are checks:", "check P1.T1: split_amount(48, 3) == 16.0", "def split_amount(t, p):\n    return t / p"];
    const m = await writeMilestoneChecks({
      complete: async (_s, u) => { asked.push(u); return replies.shift()!; }, exec: realExec, sandbox: null,
      language: "python", tasksMd: TASKS, milestone: 1, entry: "src/main.py", runCmd: null,
    });
    expect(m.checks).toHaveLength(1);
    expect(asked[1]).toContain("Sure! Here are checks:");
  });
});
