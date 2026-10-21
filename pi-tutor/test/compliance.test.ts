import { describe, it, expect } from "vitest";
import { hasReasoning, guardJudgment, checkReply, formatCheck, DIAGRAM_COLS, replyReminder, scrubInternals, diagramCols } from "../extensions/tutor/compliance.js";
import { parseJudgment, type Judgment } from "../extensions/tutor/judgment.js";
import type { TurnStep } from "../extensions/tutor/ladder.js";
import { turnInstruction } from "../extensions/tutor/turns.js";

const j = (judgment: Judgment["judgment"], step_done = false): Judgment => ({ judgment, concept_tags: ["t"], task_done_ids: [], episode_closed: false, step_done });
const fence = (tag: string, lines: string[]) => "```" + tag + "\n" + lines.join("\n") + "\n```";
const JUDGED = "\n" + fence("tutor-judgment", ['{"judgment":"none"}']); // a fence opens on its own line
const ok = { band: "intermediate" as const, step: "why" as TurnStep | null, judged: true, noCode: false };

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
    expect(checkReply(fence("python", ["x = " + "1".repeat(50)]) + JUDGED, { ...ok, step: "fix" })).not.toContain("wide-diagram");
  });
  it("code before the fix step: none for pro or architect, ≤3 lines for a beginner, any at the fix", () => {
    const code3 = fence("python", ["a = 1", "b = 2", "c = 3"]) + JUDGED;
    const code4 = fence("python", ["a = 1", "b = 2", "c = 3", "d = 4"]) + JUDGED;
    expect(checkReply(code3, { ...ok, band: "beginner", step: "why" })).not.toContain("code-above-rung");
    expect(checkReply(code4, { ...ok, band: "beginner", step: "why" })).toContain("code-above-rung");
    expect(checkReply(code3, { ...ok, step: "why" })).toContain("code-above-rung");
    expect(checkReply(code4, { ...ok, step: "fix" })).not.toContain("code-above-rung");
    expect(checkReply(code3, { ...ok, band: "pro", step: "fix", noCode: true })).toContain("code-above-rung");
    expect(checkReply(code3, { ...ok, step: null, noCode: true })).toContain("code-above-rung");
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
    expect(checkReply(quote, { ...ok, step: "why" })).toEqual([]);
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

describe("checkReply at the real pane width", () => {
  it("a diagram that fits the learner's pane is not wide; one past it is", () => {
    const line = "a".repeat(60);
    expect(checkReply(fence("", [line]) + JUDGED, ok)).toContain("wide-diagram"); // no width known: 40
    expect(checkReply(fence("", [line]) + JUDGED, { ...ok, cols: 66 })).not.toContain("wide-diagram");
    expect(checkReply(fence("", ["a".repeat(67)]) + JUDGED, { ...ok, cols: 66 })).toContain("wide-diagram");
  });
  it("diagramCols: Pi indents code blocks by 2 inside the Markdown width; unknown width falls back to 40", () => {
    expect(diagramCols(68)).toBe(66); // probe: a 70-column terminal gives availableWidth 68
    expect(diagramCols(undefined)).toBe(DIAGRAM_COLS);
    expect(diagramCols(2)).toBe(1);
  });
});

describe("scrubInternals (golden leaks, 2026-10-13)", () => {
  const cases: [string, string][] = [
    ["At rung 1, I'll ask a question to help you identify the cause.", "I'll ask a question to help you identify the cause."],
    ["**What to try** (pointer, rung 3): Look at your project files.", "**What to try** (pointer): Look at your project files."],
    ["**Pointer** (rung 3): Look at `spec/tasks.md:1`.", "**Pointer**: Look at `spec/tasks.md:1`."],
    ["Rung 2: think about the keys.", "Think about the keys."],
    ["Since we're at rung 2, I won't show code.", "Since we're at this stage, I won't show code."],
    ["Check `skills/tutor-python-ref/INDEX.md:12` for dict methods.", "Check the language reference for dict methods."],
    ["The INDEX.md file lists them.", "The language reference lists them."],
    ["SKILL.md says to use get.", "The language reference says to use get."],
    ["See line 4597 in INDEX.md.", "See line 4597 in the language reference."],
    ["Pinned in .devdocs.json, version 3.12.", "Pinned in the language reference, version 3.12."],
    ["Look at /home/u/.pi/skills/tutor-py/INDEX.md for it.", "Look at the language reference for it."],
    ["Look at ~/.pi/agent/skills/tutor-py/SKILL.md first.", "Look at the language reference first."],
    ["[episode] You seem stuck on line 3.", "You seem stuck on line 3."],
    ["The [workflow] says step 2.", "The design recipe says step 2."],
  ];
  it.each(cases)("%s", (input, want) => {
    expect(scrubInternals(input)).toBe(want);
    expect(checkReply(scrubInternals(input) + JUDGED, ok)).not.toContain("internals");
  });
  it("drops lines that talk about the judgment block or the tutor's notes", () => {
    const t = ["Good thinking.", "When you finish, I'll set `step_done: true`.", "I'll add the tutor-judgment block below.", "Per [tutor-check], fixed.", "Try it."].join("\n");
    expect(scrubInternals(t)).toBe("Good thinking.\nTry it.");
  });
});

describe("scrubInternals never costs a judgment or touches the learner's things (review 4dbf4f4)", () => {
  const J = '{"judgment":"correct","concept_tags":["loops"],"episode_closed":false,"step_done":true}';
  it.each([
    ["bare trailing object", `Good work.\n\n${J}`],
    ["fence opened mid-line", "Good. ```tutor-judgment\n" + J + "\n```"],
    ["json fence opened mid-line", "Judgment: ```json\n" + J + "\n```"],
    ["fence indented 4 spaces", "Good.\n\n    ```tutor-judgment\n    " + J + "\n    ```"],
    ["pretty-printed bare object", 'Good.\n\n{\n  "judgment": "correct",\n  "step_done": true\n}'],
    ["pretty-printed, step_done in the middle", 'Good.\n\n{\n  "judgment": "correct",\n  "step_done": true,\n  "concept_tags": []\n}'],
    ["prose mention", 'Here is my tutor-judgment: {"judgment":"partial"}'],
  ])("%s: parseJudgment reads the same judgment after the scrub", (_name, text) => {
    expect(parseJudgment(scrubInternals(text))).toEqual(parseJudgment(text));
    expect(parseJudgment(text)).not.toBeNull();
  });
  it("keeps the judgment even when the same reply also leaks a rung", () => {
    const text = `At rung 2, try again.\n${J}`;
    expect(parseJudgment(scrubInternals(text))).toEqual(parseJudgment(text));
  });
  it("leaves code in a fence indented 4 spaces (inside a list item)", () => {
    const t = '- Steps:\n  - Read the file:\n\n    ```python\n    path = "skills/tutor-python-ref/INDEX.md"\n    step_done = False\n    ```';
    expect(scrubInternals(t)).toBe(t);
  });
  it.each([
    "Edit content/_index.md for the home page.",
    "Compare reindex.md and myskill.md.",
    "Open `docs/INDEX.md` and add a link.",
    "The index.md of a website is its home page.",
    "Write your own SKILL.md for the plugin.",
    "See https://example.com/docs/INDEX.md for more.",
    "Read [the docs](docs/INDEX.md).",
    "Rename index.md file to README.",
    "Set `step_done = True` when the loop finishes.",
    "The top rung 2 output energizes the coil.",
    "The rung 1-2 transition is slow.",
    "Your SKILL.md needs a name field.",
    "Put our INDEX.md at the root.",
    "Create SKILL.md in the skill folder.",
    "We moved from rung 1 to rung 2.",
  ])("leaves the learner's names and prose alone: %s", (t) => {
    expect(scrubInternals(t)).toBe(t);
  });
  it("stays fast on a long unbroken token while a reply streams", () => {
    const t0 = performance.now();
    scrubInternals("x".repeat(30000) + " " + "a/".repeat(30000));
    expect(performance.now() - t0).toBeLessThan(200);
  });
  it("leaves fences alone (code, diagrams, the judgment block) but cleans a markdown quote", () => {
    const code = fence("python", ["# rung 3 INDEX.md", "x = 1"]);
    const diagram = fence("", ["rung 3 ──▶ INDEX.md"]);
    expect(scrubInternals(code + "\n" + diagram + JUDGED)).toBe(code + "\n" + diagram + JUDGED);
    expect(scrubInternals(fence("markdown", ["At rung 2, read INDEX.md."]))).toBe(fence("markdown", ["Read the language reference."]));
  });
  it("returns clean text unchanged (the same string)", () => {
    const t = "**What's happening**: the index of a list starts at 0.\n**In short**: count from 0." + JUDGED;
    expect(scrubInternals(t)).toBe(t);
  });
  it("cleans a reply still streaming (an unclosed fence runs to the end)", () => {
    expect(scrubInternals("At rung 1, look here:\n```\nrung 1")).toBe("Look here:\n```\nrung 1");
  });
});

describe("formatCheck", () => {
  it("is a [tutor-check] block naming each break", () => {
    const t = formatCheck(["wide-diagram", "missing-judgment"]);
    expect(t.startsWith("[tutor-check]")).toBe(true);
    expect(t).toMatch(/40 characters/);
    expect(t).toMatch(/tutor-judgment/);
  });
  it("names the learner's real pane width when it is known", () => {
    expect(formatCheck(["wide-diagram"], 66)).toMatch(/66 characters/);
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
  it("before the fix step it forbids stating the fix (golden round 2: the fix leaked in words); never says rung", () => {
    expect(replyReminder("why")).toMatch(/do not state the fix/i);
    expect(replyReminder("fix")).not.toMatch(/do not state the fix/i);
    for (const s of [null, "hint", "fix"] as const) expect(replyReminder(s)).not.toMatch(/rung/);
  });
  it("ends with this turn's instruction when there is a step (spec 2026-10-21 §6)", () => {
    expect(replyReminder("why").endsWith(`This turn: ${turnInstruction("why")}`)).toBe(true);
    expect(replyReminder(null)).not.toContain("This turn:");
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
    const issues = checkReply(wrapped, { ...ok, step: "why" });
    expect(issues).toContain("internals");
    expect(issues).toContain("code-above-rung");
    expect(checkReply(fence("markdown", ["- [ ] P1.T1 Parse the command line into a Command"]) + JUDGED, ok)).toEqual([]);
  });
  it("I3: an unclosed fence runs to the end of the reply", () => {
    expect(checkReply("**In short**: x\n```python\na = 1\nb = 2", { ...ok, step: "why" })).toContain("code-above-rung");
  });
  it("I2: the reminder keeps the hold during a workflow even at the fix step", () => {
    expect(replyReminder("fix", true)).toMatch(/do not state the fix/);
    expect(replyReminder("fix", false)).not.toMatch(/do not state the fix/i);
  });
});

describe("M6a minors: fence forms", () => {
  it("an indented fence inside a list item and a ~~~ fence are checked", () => {
    const listed = ["1. Try this:", "   ```python", "   a = 1", "   ```", JUDGED].join("\n");
    expect(checkReply(listed, { ...ok, step: "why" })).toContain("code-above-rung");
    expect(checkReply(["~~~", "x".repeat(DIAGRAM_COLS + 1), "~~~", JUDGED].join("\n"), ok)).toContain("wide-diagram");
  });
});

describe("M6c: closing fence length (M6b #61)", () => {
  it("a longer closing fence closes the block", () => {
    expect(checkReply(["```", "a", "`````", "See INDEX.md.", JUDGED].join("\n"), ok)).toEqual(["internals"]); // prose after the fence is still checked
  });
});
