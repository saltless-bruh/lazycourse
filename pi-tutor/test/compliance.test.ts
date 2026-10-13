import { describe, it, expect } from "vitest";
import { hasReasoning, guardJudgment, checkReply, formatCheck, DIAGRAM_COLS, replyReminder } from "../extensions/tutor/compliance.js";
import type { Judgment } from "../extensions/tutor/judgment.js";

const j = (judgment: Judgment["judgment"], step_done = false): Judgment => ({ judgment, concept_tags: ["t"], task_done_ids: [], episode_closed: false, step_done });
const fence = (tag: string, lines: string[]) => "```" + tag + "\n" + lines.join("\n") + "\n```";
const JUDGED = "\n" + fence("tutor-judgment", ['{"judgment":"none"}']); // a fence opens on its own line
const ok = { band: "intermediate" as const, rung: 2, judged: true, noCode: false };

describe("hasReasoning", () => {
  it("a bare question or a [tutor] nudge is not reasoning", () => {
    for (const t of ["what does KeyError mean?", "why?", "[tutor] stuck signal: idle at a.py:3", "", "help"]) expect(hasReasoning(t)).toBe(false);
  });
  it("a reason or a statement is reasoning", () => {
    for (const t of ["I think range stops one early", "it fails because x is None", "the fix is to check the key first", "x is a string not an int"]) expect(hasReasoning(t)).toBe(true);
  });
});

describe("guardJudgment", () => {
  it("a bare question never yields correct (live: rung jumped on a plain question)", () => {
    expect(guardJudgment(j("correct"), "what does this error mean?").judgment).toBe("none");
    expect(guardJudgment(j("correct"), "I think the key is missing because the dict is empty").judgment).toBe("correct");
  });
  it("partial, wrong and none pass through", () => {
    for (const v of ["partial", "wrong", "none"] as const) expect(guardJudgment(j(v), "huh?").judgment).toBe(v);
  });
  it("a [tutor] nudge never finishes a workflow step", () => {
    expect(guardJudgment(j("none", true), "[tutor] design recipe started").step_done).toBe(false);
    expect(guardJudgment(j("none", true), "inputs: a list of strings, output: a Command").step_done).toBe(true);
  });
});

describe("checkReply", () => {
  it("a clean structured reply has no issues", () => {
    const text = ["**What's happening**", fence("", ["argv", " │", " ▼", "parse() ──▶ Command"]), "**Why**", "x", "**What to try**", "y", "**In short**", "z", JUDGED].join("\n");
    expect(checkReply(text, ok)).toEqual([]);
  });
  it("flags a missing judgment", () => {
    expect(checkReply("**In short** hi", { ...ok, judged: false })).toContain("missing-judgment");
  });
  it("flags a diagram line wider than 40 columns, not a wide code line", () => {
    expect(checkReply(fence("", ["a".repeat(DIAGRAM_COLS + 1)]) + JUDGED, ok)).toContain("wide-diagram");
    expect(checkReply(fence("text", ["┌" + "─".repeat(DIAGRAM_COLS - 2) + "┐"]) + JUDGED, ok)).not.toContain("wide-diagram");
    expect(checkReply(fence("python", ["x = " + "1".repeat(50)]) + JUDGED, { ...ok, rung: 5 })).not.toContain("wide-diagram");
  });
  it("code above the rung: none for pro or architect, ≤3 lines for a beginner below rung 4, any at 4-5", () => {
    const code3 = fence("python", ["a = 1", "b = 2", "c = 3"]) + JUDGED;
    const code4 = fence("python", ["a = 1", "b = 2", "c = 3", "d = 4"]) + JUDGED;
    expect(checkReply(code3, { ...ok, band: "beginner", rung: 3 })).not.toContain("code-above-rung");
    expect(checkReply(code4, { ...ok, band: "beginner", rung: 3 })).toContain("code-above-rung");
    expect(checkReply(code3, { ...ok, rung: 3 })).toContain("code-above-rung");
    expect(checkReply(code4, { ...ok, rung: 4 })).not.toContain("code-above-rung");
    expect(checkReply(code3, { ...ok, band: "pro", rung: 4, noCode: true })).toContain("code-above-rung");
    expect(checkReply(code3, { ...ok, rung: null, noCode: true })).toContain("code-above-rung");
  });
  it("flags internals in prose (live: 'line 4597 in INDEX.md')", () => {
    expect(checkReply("See line 4597 in INDEX.md.\n" + JUDGED, ok)).toContain("internals");
    expect(checkReply("You are on rung 3 now.\n" + JUDGED, ok)).toContain("internals");
    expect(checkReply("The index of a list starts at 0.\n" + JUDGED, ok)).not.toContain("internals");
  });
  it("flags a long reply with no In short line", () => {
    const long = Array.from({ length: 8 }, (_, i) => `line ${i}`).join("\n") + "\n" + JUDGED;
    expect(checkReply(long, ok)).toContain("no-summary");
    expect(checkReply("one line\n" + JUDGED, ok)).not.toContain("no-summary");
  });
});

describe("checkReply after golden round 1 (nemotron, 2026-10-13)", () => {
  it("a markdown fence is a quote of a file, neither a diagram nor code", () => {
    const quote = fence("markdown", ["- [ ] P1.T1 Parse the command line into a Command"]) + JUDGED;
    expect(checkReply(quote, { ...ok, rung: 2 })).toEqual([]);
    expect(checkReply(fence("md", ["x".repeat(60)]) + JUDGED, { ...ok, noCode: true })).toEqual([]);
  });
  it("step_done and the [workflow] / [tutor-check] lines are internals", () => {
    for (const t of ["When you finish, I'll set `step_done: true`.", "The [workflow] says step 2.", "Per [tutor-check], fixed."]) {
      expect(checkReply(t + "\n" + JUDGED, ok)).toContain("internals");
    }
  });
});

describe("checkReply after golden round 2", () => {
  it("only fences that start a line count; an inline ``` in a sentence does not shift the pairing", () => {
    const text = ["**What to try**: draw it in a ``` markdown block, as above.", "```", "a", "│", "▼", "b", "```", "**In short**: draw it.", JUDGED].join("\n");
    expect(checkReply(text, ok)).toEqual([]);
  });
});

describe("formatCheck", () => {
  it("is a [tutor-check] block naming each break", () => {
    const t = formatCheck(["wide-diagram", "missing-judgment"]);
    expect(t.startsWith("[tutor-check]")).toBe(true);
    expect(t).toMatch(/40 characters/);
    expect(t).toMatch(/tutor-judgment/);
  });
  it("says the breaks are the tutor's own and must not reach the learner (live: model blamed the learner)", () => {
    const t = formatCheck(["wide-diagram"]);
    expect(t).toMatch(/your own previous reply/i);
    expect(t).toMatch(/not the learner's/i);
    expect(t).toMatch(/do not mention this note/i);
  });
});

describe("replyReminder", () => {
  it("is one short line naming the structure and the judgment block", () => {
    const r = replyReminder(null);
    expect(r.startsWith("[tutor-reply]")).toBe(true);
    expect(r).not.toContain("\n");
    expect(r).toContain("In short");
    expect(r).toContain("tutor-judgment");
  });
  it("below rung 5 it names the rung and forbids stating the fix (golden round 2: fix leaked in words at rung 2)", () => {
    expect(replyReminder(2)).toMatch(/rung 2 \(concept\): do not state the fix/);
    expect(replyReminder(5)).not.toMatch(/do not state the fix/);
    expect(replyReminder(null)).not.toMatch(/rung/);
  });
});

describe("final review fixes", () => {
  it("I1: questions and requests count as reasoning only with a strong marker", () => {
    for (const t of ["what should I do?", "why is it's failing?", "how do I fix this", "help me with this error", "can you show me the answer", "just give me the code now"]) {
      expect(hasReasoning(t), t).toBe(false);
    }
    for (const t of ["how about this: I think range stops early", "why does it fail? because x is None", "x is a string not an int", "I think range stops one early"]) {
      expect(hasReasoning(t), t).toBe(true);
    }
  });
  it("I3: a reply wrapped in a markdown fence is still checked, including code nested inside it", () => {
    const wrapped = ["```markdown", "**What's happening**: see INDEX.md", "```python", "a = 1", "```", "**In short**: x", "```", JUDGED].join("\n");
    const issues = checkReply(wrapped, { ...ok, rung: 2 });
    expect(issues).toContain("internals");
    expect(issues).toContain("code-above-rung");
    expect(checkReply(fence("markdown", ["- [ ] P1.T1 Parse the command line into a Command"]) + JUDGED, ok)).toEqual([]);
  });
  it("I3: an unclosed fence runs to the end of the reply", () => {
    expect(checkReply("**In short**: x\n```python\na = 1\nb = 2", { ...ok, rung: 2 })).toContain("code-above-rung");
  });
  it("I2: the reminder keeps the hold during a workflow even at rung 5", () => {
    expect(replyReminder(5, true)).toMatch(/do not state the fix/);
    expect(replyReminder(5, false)).not.toMatch(/do not state the fix/);
  });
});

describe("M6a minors: fence forms", () => {
  it("an indented fence inside a list item and a ~~~ fence are checked", () => {
    const listed = ["1. Try this:", "   ```python", "   a = 1", "   ```", JUDGED].join("\n");
    expect(checkReply(listed, { ...ok, rung: 2 })).toContain("code-above-rung");
    expect(checkReply(["~~~", "x".repeat(DIAGRAM_COLS + 1), "~~~", JUDGED].join("\n"), ok)).toContain("wide-diagram");
  });
});
