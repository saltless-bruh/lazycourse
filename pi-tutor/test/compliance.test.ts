import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { taskTerms } from "../extensions/tutor/similarity.js";
import { fixInWords, cleanReply, proseFixLeak, functionLines, hasReasoning, guardJudgment, checkReply, formatCheck, DIAGRAM_COLS, replyReminder, scrubInternals, diagramCols, ownNames, checkTurn, foldPreamble, hideJudgment } from "../extensions/tutor/compliance.js";
import { parseJudgment, type Judgment } from "../extensions/tutor/judgment.js";
import type { TurnStep } from "../extensions/tutor/ladder.js";
import { turnInstruction } from "../extensions/tutor/turns.js";

const j = (judgment: Judgment["judgment"], step_done = false): Judgment => ({ judgment, concept_tags: ["t"], task_done_ids: [], episode_closed: false, step_done });
const fence = (tag: string, lines: string[]) => "```" + tag + "\n" + lines.join("\n") + "\n```";
const JUDGED = "\n" + fence("tutor-judgment", ['{"judgment":"none"}']); // a fence opens on its own line
const ok = { band: "intermediate" as const, step: "why" as TurnStep | null, judged: true, noCode: false };

describe("prose fix leaks (spec 2026-10-26 §5.3)", () => {
  const ref = ["    return total / people"], src = ["    return total * people"];
  it("before the fix step, telling the learner the exact change in words is a leak", () => {
    expect(proseFixLeak("Use `/` instead of `*` so each person gets a share.", { referenceLines: ref, sourceLines: src, words: true })).toBe(true);
    expect(proseFixLeak("True division is needed here.", { referenceLines: ref, sourceLines: src, words: true })).toBe(true);
    expect(proseFixLeak("Think about what splitting a bill means for the size of each share.", { referenceLines: ref, sourceLines: src, words: true })).toBe(false);
  });
  it("at the why step words are allowed, the exact symbol is not", () => {
    expect(proseFixLeak("It needs division, not multiplication.", { referenceLines: ref, sourceLines: src, words: false })).toBe(false);
    expect(proseFixLeak("Change `*` to `/`.", { referenceLines: ref, sourceLines: src, words: false })).toBe(true);
  });
  it("checkTurn flags it before the fix step only, and only with a spot to compare", () => {
    const o = { names: new Set<string>(), sourceLines: src, referenceLines: ref, proseScope: { referenceLines: ref, sourceLines: src } };
    expect(checkTurn("Use `/` instead of `*`. What do you think?", { ...o, step: "hint" })).toContain("prose-fix");
    expect(checkTurn("Use `/` instead of `*`.", { ...o, step: "fix" })).not.toContain("prose-fix");
    // Live check 2026-11-10: with no spot to compare, the swap is still recognised against the learner's own line
    // (fixInWords); what final review C1 ruled out — whole-program comparison flagging ordinary teaching — stays out.
    expect(checkTurn("Use `/` instead of `*`. What do you think?", { ...o, proseScope: undefined, step: "hint" })).toContain("prose-fix");
    expect(checkTurn("You can use print to see what a variable holds.", { ...o, proseScope: undefined, step: "hint" })).not.toContain("prose-fix");
  });
  it("final review C1: ordinary teaching about other constructs is never a prose fix", () => {
    const reference = "def split_amount(total, people):\n    return total / people\n\nt = float(input('Total: '))\nprint(split_amount(t, 3))\n".split("\n");
    const learner = "def split_amount(total, people):\n    return total * people\n".split("\n");
    const scope = { referenceLines: functionLines(reference, "split_amount"), sourceLines: functionLines(learner, "split_amount") };
    for (const ok of ["You can use print to see what a variable holds.", "Try adding a print call before the return.", "In Python you use input() to read what someone types.", "Reading needs input, turning text to a number needs float."]) {
      expect(proseFixLeak(ok, { ...scope, words: true }), ok).toBe(false);
    }
    expect(proseFixLeak("Use `/` instead of `*`.", { ...scope, words: true })).toBe(true);
  });
  it("functionLines: a function's own lines, in Python, Rust and Go", () => {
    expect(functionLines(["def a():", "    return 1", "", "def b(x):", "    y = x", "    return y", "print(b(1))"], "b")).toEqual(["def b(x):", "    y = x", "    return y"]);
    expect(functionLines(["fn b(x: u32) -> u32 {", "    x / 2", "}", "fn main() {}"], "b")).toEqual(["fn b(x: u32) -> u32 {", "    x / 2", "}"]);
    expect(functionLines(["func b(x int) int {", "\treturn x / 2", "}"], "b")).toEqual(["func b(x int) int {", "\treturn x / 2", "}"]);
    expect(functionLines(["x = 1"], "b")).toEqual([]);
  });
});

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
  it("a role that never writes code gets its own reminder, not the coding tutor's five parts (live check 2026-11-10)", () => {
    const r = replyReminder(null, false, { noCode: true });
    expect(r.startsWith("[tutor-reply]")).toBe(true);
    expect(r).not.toContain("\n");
    expect(r).not.toMatch(/What's happening|What to try|This turn:/);
    expect(r).toMatch(/no code/i);
    expect(r).toMatch(/do not state the fix/i);
    expect(r).toContain("tutor-judgment");
    expect(replyReminder(null)).toContain("What's happening"); // the coding tutor's is unchanged
  });
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

// Spec 2026-10-21 §6, §10: code checks a reply against this turn (strings from the 2026-10-20/21 spike).
const names = ownNames({ tasksMd: "- [ ] P2.T2 add `split_amount(total, people)` = total / people", sources: ["def tip_rate(generous):\n    return 0.1\n"] });
describe("ownNames", () => {
  it("task signatures with their parameters, and the learner's function names (final review I6: not every parameter)", () => {
    expect([...names].sort()).toEqual(["people", "split_amount", "tip_rate", "total"]);
  });
  it("reads function names in other languages, and leaves out main, short names and self", () => {
    const n = ownNames({ tasksMd: null, sources: ["fn split(total: f64, people: u32) -> f64 {}", "func (r Bill) Share(amount float64) float64 {}", "function M.ask_number(read) end", "def area(self, w, height=2): pass", "def main(value, items): pass"] });
    expect([...n].sort()).toEqual(["Share", "area", "ask_number", "split"]);
  });
});
describe("checkTurn (spec 2026-10-21 §6)", () => {
  const src = ["def split_amount(total, people):", "    return total * people"];
  it("nemotron attempt 1, run 1: the fix in the summary is own code", () => {
    expect(checkTurn("Look at the operator.\n\n**In short**: Change `*` to `/` in `return total / people`.", { step: "hint", names, sourceLines: src })).toContain("own-code");
  });
  it("Review Focus #1: quoting the learner's own current line with a marker is allowed", () => {
    const glm = "Look at the operator in this slot:\n\n```\nreturn total * people\n             ^\n```\nWhich one did you type?";
    expect(checkTurn(glm, { step: "hint", names, sourceLines: src })).not.toContain("own-code");
  });
  it("quoting what the learner already saw passes: part of their line, or the run's own error text (live audit 2026-10-21)", () => {
    const seen = [...src, "lua: split_amount(48, 3) gave 144.0, expected 16.0"];
    expect(checkTurn("The function `split_amount(48, 3)` gives 144.0, not 16.0.", { step: "why", names, sourceLines: seen })).not.toContain("own-code");
    expect(checkTurn("Your `total * people` grows the bill.", { step: "why", names, sourceLines: seen })).not.toContain("own-code");
    expect(checkTurn("It should be `total / people`.", { step: "why", names, sourceLines: seen })).toContain("own-code");
  });
  it("an unrelated example passes; naming a function alone passes", () => {
    expect(checkTurn("Try it on `12 / 4`, then look at `split_amount`.", { step: "hint", names, sourceLines: src })).toEqual([]);
  });
  it("a fenced block with the learner's names is own code", () => {
    expect(checkTurn("Like this:\n```python\ndef split_amount(total, people):\n    return total / people\n```", { step: "why", names, sourceLines: src })).toContain("own-code");
  });
  it("hint: too long; ask: needs a question", () => {
    expect(checkTurn("One. Two. Three.", { step: "hint", names, sourceLines: src })).toContain("too-long");
    expect(checkTurn("Tell me your thinking.", { step: "ask", names, sourceLines: src })).toContain("no-question");
  });
  it("the fix step may show their line", () => {
    expect(checkTurn("```python\nreturn total / people\n```\nOne slash keeps the decimals.", { step: "fix", names, sourceLines: src })).toEqual([]);
  });
  it("machinery: third person, attempt notes, the half-scrubbed rung", () => {
    expect(checkTurn("The learner asks how to divide.", { step: "why", names, sourceLines: src })).toContain("machinery");
    expect(checkTurn("You're at this stage/5 (pointer).", { step: "why", names, sourceLines: src })).toContain("machinery");
    expect(checkTurn("[attempt 2] says so.", { step: "why", names, sourceLines: src })).toContain("machinery");
  });
});
describe("foldPreamble (C)", () => {
  it("planning before the first heading goes; a reply without headings stays", () => {
    expect(foldPreamble("The user wants a lesson. We need to ask.\n\n**What's happening**: x")).toBe("**What's happening**: x");
    expect(foldPreamble("What were you thinking?")).toBe("What were you thinking?");
    expect(foldPreamble("```python\nx = 1\n```\n**Why**: y")).toBe("```python\nx = 1\n```\n**Why**: y");
  });
});
describe("scrubInternals rung forms (spike run 2)", () => {
  it("'hint rung 3/5 (pointer)' is reworded whole", () => {
    expect(scrubInternals("You're at hint rung 3/5 (pointer) of the Map step.")).toBe("You're at this stage of the Map step.");
  });
});

describe("hideJudgment (final review C1: a diagram fence before the judgment must survive)", () => {
  it("removes only the judgment block, never a diagram or the parts after it", () => {
    const reply = "**What's happening**:\n```\nbill\n  |\n  v\nshare\n```\n**Why**: dividing.\n**In short**: divide.\n```tutor-judgment\n{\"judgment\":\"none\"}\n```";
    const shown = hideJudgment(reply);
    expect(shown).toContain("share");
    expect(shown).toContain("**Why**: dividing.");
    expect(shown).toContain("**In short**: divide.");
    expect(shown).not.toMatch(/tutor-judgment|"judgment"/);
  });
  it("also hides a json fence or a bare trailing object that carries the judgment", () => {
    expect(hideJudgment("Hi.\n```json\n{\"judgment\":\"none\"}\n```")).toBe("Hi.");
    expect(hideJudgment("Hi.\n{\"judgment\":\"none\",\"step_done\":false}")).toBe("Hi.");
  });
});

describe("checkTurn after the final review (I1, I6, I7)", () => {
  const src = ["local M = {}", "function M.split_amount(total, people)", "  local share = total * people", "  return share", "end"];
  it("I1: a ```markdown fence is checked like any other; an exact quote in it still passes", () => {
    expect(checkTurn("Try this:\n```markdown\nlocal share = total / people\n```", { step: "hint", names, sourceLines: src })).toContain("own-code");
    expect(checkTurn("Your line:\n```markdown\nlocal share = total * people\n```", { step: "hint", names, sourceLines: src })).not.toContain("own-code");
  });
  it("I6: a line-numbered quote and a labelled caret are quotes; an example with a common name is not own code", () => {
    expect(checkTurn("```\n   3|   local share = total * people\n      ^ total times people\n```\nWhich one?", { step: "hint", names, sourceLines: src })).not.toContain("own-code");
    const n = ownNames({ tasksMd: null, sources: ["def main(value, items):\n    return value\n"] });
    expect(checkTurn("```python\nfor value in [1, 2, 3]:\n    print(value)\n```", { step: "teach", names: n, sourceLines: [] })).not.toContain("own-code");
  });
  it("I7: a bare JSON judgment after a clean hint is not machinery", () => {
    expect(checkTurn('Look at line 3.\n{"judgment":"none","concept_tags":[],"step_done":false}', { step: "hint", names, sourceLines: src })).toEqual([]);
  });
});

describe("final review I5: the prompt never asks for what the check rejects", () => {
  it("hint and ask turns are plain sentences, not the five bold parts", () => {
    for (const s of ["hint", "ask"] as const) {
      expect(replyReminder(s)).not.toMatch(/Use the bold parts/);
      expect(replyReminder(s)).toMatch(/plain sentences/);
    }
    expect(replyReminder("teach")).toMatch(/Use the bold parts/);
  });
});

describe("checkTurn and the hidden reference (spec 2026-10-21 §6, §7)", () => {
  const reference = ["def split_amount(total, people):", "    return total / people"];
  it("a line of the reference before the fix step is own code, even with no task names known", () => {
    expect(checkTurn("Try this: `return total / people`.", { step: "hint", names: new Set(), sourceLines: [], referenceLines: reference })).toContain("own-code");
    expect(checkTurn("Look:\n```python\n    return total / people\n```\nWhat changes?", { step: "ask", names: new Set(), sourceLines: [], referenceLines: reference })).toContain("own-code");
  });
  it("not when the learner already has that line, when it is short, or at the fix step", () => {
    expect(checkTurn("Your `return total / people` is right.", { step: "hint", names: new Set(), sourceLines: ["    return total / people"], referenceLines: reference })).not.toContain("own-code");
    expect(checkTurn("Use `x`.", { step: "hint", names: new Set(), sourceLines: [], referenceLines: ["x"] })).not.toContain("own-code");
    expect(checkTurn("Change it to `return total / people`.", { step: "fix", names: new Set(), sourceLines: [], referenceLines: reference })).not.toContain("own-code");
  });
});

// Learner-session fixes Task 5 (spec §4): a reply the model wrapped whole in a markdown fence showed raw.
describe("cleanReply", () => {
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/replies/${name}`, import.meta.url), "utf8");
  it("unwraps an outer markdown fence (a real nemotron reply from the learner session)", () => {
    const out = cleanReply(fixture("outer-markdown-fence.md"));
    expect(out.trimStart().startsWith("**What's happening**")).toBe(true);
    expect(out).not.toContain("```markdown");
    expect(out).toContain("**In short**");
  });
  it("leaves a reply whose only fence is an inner one-line quote alone (Review Focus 5)", () => {
    const reply = "**What's happening**: look at this line:\n\n```markdown\ntotal = price * qty\n```\n\n**In short**: the star multiplies.";
    expect(cleanReply(reply)).toBe(reply);
  });
  it("a reply that only starts with a fence but goes on after it is not unwrapped", () => {
    const reply = "```markdown\nquote\n```\nThen prose follows.";
    expect(cleanReply(reply)).toBe(reply);
  });
  it("re-run finding: an untagged fence opened before the reply's first heading is dropped (a real nemotron reply)", () => {
    const out = cleanReply(fixture("untagged-outer-fence.md"));
    expect(out.trimStart().startsWith("# Sentence Word Reverser")).toBe(true);
    expect((out.match(/^\s*```/gm) ?? []).length % 2).toBe(0);
    expect(out).toContain("```python\ntext = ");
    expect(out).toContain("```tutor-judgment");
  });
  it("a reply that starts with a real code fence keeps it", () => {
    const reply = "```\nx = 1\n```\n\n# What's happening\nx holds one.";
    expect(cleanReply(reply)).toBe(reply);
  });
  it("review I1: a reply that opens with a quote fence keeps everything after it", () => {
    const j = "\n\n```tutor-judgment\n{\"judgment\":\"none\"}\n```";
    const quote = "```markdown\n> it takes the total and gives back each share\n```\n\n**What's happening**: you named both inputs.\n\n**In short**: good shape." + j;
    expect(cleanReply(quote)).toBe(quote);
    const code = "```\n# a comment\nx = 1\n```\nEverything after # is ignored." + j;
    expect(cleanReply(code)).toBe(code);
  });
  it("review I1: an outer fence closed at the end, before or after the judgment, is still unwrapped", () => {
    const j = "```tutor-judgment\n{}\n```";
    expect(cleanReply("```markdown\n# Title\nbody\n```\n\n" + j)).toBe("# Title\nbody\n\n" + j);
    expect(cleanReply("```\n# Title\nbody\n" + j + "\n```")).toBe("# Title\nbody\n" + j);
  });
  it("the reminder states no column count", () => {
    expect(replyReminder("teach")).not.toMatch(/\d+ characters/);
  });
});

// Learner-session fixes Task 6 (spec §5): an example that is the task, renamed, is held outside the fix step.
describe("checkTurn: structural leaks", () => {
  const terms = taskTerms("generate a random secret number"); // through the real stem, as index.ts builds them
  const base = { names: new Set<string>(), sourceLines: [] as string[] };
  const reply = (code: string) => `**Example**: a small unrelated example:\n\n\`\`\`python\n${code}\n\`\`\`\n\nWhat would you write? ` + "```tutor-judgment\n{}\n```";
  it("holds an 'unrelated' example that uses the task's words", () => {
    expect(checkTurn(reply("number = random.randint(1, 100)"), { ...base, step: "teach", taskTerms: terms })).toContain("own-code");
  });
  it("holds an example whose structure is the hidden solution's", () => {
    const ref = "secret_number = random.randint(1, 100)\nguess = int(input('Enter: '))";
    expect(checkTurn(reply("x = random.randint(1, 100)\ny = int(input('Go: '))"), { ...base, step: "teach", referenceCode: ref })).toContain("own-code");
  });
  it("lets a concept example on another domain through, and never holds the fix step", () => {
    expect(checkTurn(reply("die = random.randint(1, 6)"), { ...base, step: "teach", taskTerms: terms })).not.toContain("own-code");
    expect(checkTurn(reply("number = random.randint(1, 100)"), { ...base, step: "fix", taskTerms: terms })).not.toContain("own-code");
  });
  it("a diagram that names the task's words is not code", () => {
    const diagram = "**What's happening**:\n\n```\npick a random secret number\n  v\nstore it\n```\n\nWhat comes next? ```tutor-judgment\n{}\n```";
    expect(checkTurn(diagram, { ...base, step: "teach", taskTerms: terms })).not.toContain("own-code");
  });
});

describe("re-run finding: a builtin the plan names is no name of the learner's", () => {
  it("`split()` in a task line is the language's, `reverse_words(text)` is the learner's", () => {
    const names = ownNames({ tasksMd: "- [ ] P2.T1 Split `sentence` into words using `split()`; print with `print()`; then `len()`\n- [ ] P2.T2 write `reverse_words(text)`", sources: [] });
    for (const b of ["split", "print", "len"]) expect(names.has(b), b).toBe(false);
    expect(names.has("reverse_words")).toBe(true);
  });
});

describe("re-run finding: the plan's named variables are the learner's names", () => {
  const tasksMd = "- [ ] P1.T1 Ask for a sentence and store in variable `sentence`\n- [ ] P1.T2 Validate `sentence` contains a word; store it in `is_ok`\n- [ ] P2.T1 Split with `split()`";
  it("`sentence` and `is_ok` from the plan are names; `split` is not", () => {
    const names = ownNames({ tasksMd, sources: [] });
    expect(names.has("sentence")).toBe(true);
    expect(names.has("is_ok")).toBe(true);
    expect(names.has("split")).toBe(false);
  });
  it("a prose answer that uses the plan's variable is held; naming it alone is not", () => {
    const names = ownNames({ tasksMd, sources: [] });
    const turn = (t: string) => checkTurn(t + "\n\nWhat would you try? ```tutor-judgment\n{}\n```", { step: "teach", names, sourceLines: [] });
    expect(turn("Consider the constraint `sentence.strip() != ''`.")).toContain("own-code");
    expect(turn("Look at where `sentence` gets its value.")).not.toContain("own-code");
  });
});

describe("checkTurn at the design step: the architect's replies are held to no code (live check 2026-11-10)", () => {
  const o = { step: "design" as const, names: new Set(["split_amount"]), sourceLines: ["def main():", "    main()", "def split_amount(total, people):", "    share = total * people", "    return share"] };
  it("a code fence of any language is role-code; so is an untagged fence that holds a definition or their own line changed", async () => {
    for (const fence of ["```python\nreturn a / b\n```", "```sql\nCREATE TABLE users (id INT);\n```", "```bash\npip install requests\n```", "```toml\nname = \"x\"\n```",
      "```\ndef part(a, b):\n    return a / b\n```", "```text\nshare = total / people\n```"]) expect([fence, checkTurn(fence, o)]).toEqual([fence, ["role-code"]]);
    const { fallbackReply, TURN_LIMITS, turnInstruction } = await import("../extensions/tutor/turns.js");
    expect(fallbackReply("design")).not.toMatch(/[`=*]/);
    expect(TURN_LIMITS.design).toMatchObject({ ownCode: true, noCode: true });
    expect(turnInstruction("design")).toMatch(/no code/i);
  });
  it("their own line with the change in it, in backticks, is the fix told (prose-fix)", () => {
    expect(checkTurn("The expression would be `total / people`.", o)).toEqual(["prose-fix"]);
    expect(checkTurn("Make it `share = total / people`.", o)).toEqual(["prose-fix"]);
  });
  it("the learner's names, a quote of their own line, one operator pointed at, and a plain diagram are how an architect talks", () => {
    expect(checkTurn("`split_amount` is the pure part. Line 2 computes `share = total * people`, which grows with more people.\n\n```\ninput\n  |\nsplit_amount --> print\n+------+\n```", o)).toEqual([]);
    expect(checkTurn("The `*` on line 4 is where the part stops doing what its name says.", o)).toEqual([]);
    expect(checkTurn("calc.py holds the arithmetic: the addition of the tip and the division among people.", o)).toEqual([]);
  });
  it("review I3: ordinary architecture wording in backticks is not code", () => {
    for (const span of ["O(n * m)", "n + 1 queries", "4xx - 5xx", "key = value", "timeout = 30", "PYTHONPATH=src", "DEBUG=1 python main.py", "for each", "if x", "from a to b", "let it crash", "const correctness", "import order", "1 + 1", "a -> b", "GET /users", "(total, people) -> float", "pip install -r requirements.txt"])
      expect([span, checkTurn(`Think about \`${span}\` here.`, o)]).toEqual([span, []]);
  });
  it("review I4: the graded-check comparison is the coding tutor's; it never holds a design answer", () => {
    const proseScope = { referenceLines: ["    return total - people"], sourceLines: ["    return total * people"] };
    expect(checkTurn("The core part - split_amount - should be pure and tested alone.", { ...o, proseScope })).toEqual([]);
  });
});

describe("fixInWords: a fix told with no hidden solution to compare against (live check 2026-11-10)", () => {
  const src = ["def add_tip(total, percent):", "    return total + total * percent / 100", "def split_amount(total, people):", "    share = total * people", "    return share"];
  const w = { sourceLines: src, words: true }, t = { sourceLines: src, words: false };
  it("two operators set against each other, one of them in the learner's code, is the swap", () => {
    expect(fixInWords("In split_amount, change the `*` to `/` and run it.", t)).toBe("swap");
    expect(fixInWords("Splitting an amount should use division, not multiplication.", w)).toBe("swap");
    expect(fixInWords("The name suggests it should divide, but the body performs multiplication.", w)).toBe("swap");
    expect(fixInWords("Each person gets 48 ÷ 3 = 16, not 48 × 3 = 144.", t)).toBe("swap");
    expect(fixInWords("Splitting an amount should use division, not multiplication.", t)).toBeNull(); // by name only where words count
  });
  it("teaching one operator, the verb add, or operators the learner's code does not have is no swap (the false alarm in 68 real replies)", () => {
    expect(fixInWords("In your own function, add an `if` that checks whether the divisor is zero before the division.", w)).toBeNull();
    expect(fixInWords("`/` always gives a float in Python.", w)).toBeNull();
    expect(fixInWords("Use `<=` rather than `>=` in a countdown.", { sourceLines: ["x = 1"], words: true })).toBeNull();
    expect(fixInWords("Look at line 4 again: what does that operation do to the total as more people join?", w)).toBeNull();
    // Two operators named side by side with nothing set against anything describe the code; they tell no change.
    expect(fixInWords("calc.py holds the arithmetic: the addition of the tip and the division among people.", w)).toBeNull();
    expect(fixInWords("Both `*` and `/` appear in add_tip.", t)).toBeNull();
  });
  it("the nemotron architect's own sentences from the live run are caught: no word like 'not' is needed, only a plain listing is exempt", () => {
    const calc = { sourceLines: ["    return total + total * percent / 100", "    share = total * people"], words: true };
    expect(fixInWords("Consider whether the `*` operator matches the intended sharing logic, or if `/` would better reflect splitting the amount across the group.", calc)).toBe("swap");
    expect(fixInWords("In distribution scenarios, dividing a total by the count of recipients yields each person's share; multiplying by the count inflates the total.", calc)).toBe("swap");
    expect(fixInWords("Consider whether the multiplication construct matches the intended sharing behavior, or if a division construct would better reflect partitioning the total.", calc)).toBe("swap");
    expect(fixInWords("add_tip uses both multiplication and division to turn a percent into an amount.", calc)).toBeNull();
  });
  it("other kinds of bug (side note 2026-11-10: not only multiply/divide): comparisons, off-by-one, sign, operand order, index", () => {
    const f = (line: string) => ({ sourceLines: [line], words: true });
    expect(fixInWords("It should be greater than or equal, not just greater than.", f("    return age > 18"))).toBe("swap");
    expect(fixInWords("Use `>=` rather than `>` so 18 counts.", f("    return age > 18"))).toBe("swap");
    expect(fixInWords("Write `age >= 18` there.", f("    return age > 18"))).toBe("edited-line");
    expect(fixInWords("Make the loop `range(1, n + 1)`.", f("    for i in range(1, n):"))).toBe("edited-line");
    expect(fixInWords("Change is `paid - price`.", f("    return paid + price"))).toBe("edited-line");
    expect(fixInWords("You need subtraction here, not addition.", f("    return paid + price"))).toBe("swap");
    expect(fixInWords("It should be `sum(numbers) / len(numbers)`.", f("    return len(numbers) / sum(numbers)"))).toBe("edited-line");
    expect(fixInWords("The last one is `items[len(items) - 1]`.", f("    return items[len(items)]"))).toBe("edited-line");
    // pointing and asking stay free
    expect(fixInWords("Which ages should count: is 18 itself inside or outside what `>` accepts?", f("    return age > 18"))).toBeNull();
    expect(fixInWords("Trace `range(1, n)` by hand for n = 4: which numbers does the loop visit?", f("    for i in range(1, n):"))).toBeNull();
    expect(fixInWords("Think about the `n + 1 queries` problem.", f("    for i in range(1, n):"))).toBeNull();
  });
  it("a swap told over two neighbouring sentences needs an explicit contrast (the architect's live reply)", () => {
    const calc = { sourceLines: ["    return total + total * percent / 100", "    share = total * people"], words: true };
    expect(fixInWords("When the intent is to split a fixed amount among several people, the typical operator is division (total ÷ people), which produces individual shares. Multiplication, by contrast, produces a value that grows with the number of people.", calc)).toBe("swap");
    expect(fixInWords("add_tip handles the multiplication by the percent. The division by 100 turns the percent into a fraction.", calc)).toBeNull();
    expect(fixInWords("The part multiplies its two inputs. Its name, however, promises a share: what should happen to a share as more people join?", calc)).toBeNull();
  });
  it("live check 2026-11-18: \"does the opposite\" sets two operators apart over neighbouring sentences", () => {
    const best = { sourceLines: ["    for x in xs:", "        if x < best:", "            best = x"], words: true };
    expect(fixInWords("A `>` gate lets newer, larger values replace the current leader, so the running `best` climbs toward the maximum. A `<` gate does the opposite, keeping the smallest.", best)).toBe("swap");
    expect(fixInWords("`>` keeps larger values. A `<` gate does the opposite.", best)).toBe("swap");
    // one operator, or an opposite that is not about operators, stays free
    expect(fixInWords("Your `<` gate decides who stays. What does the loop do with the opposite case?", best)).toBeNull();
  });
  it("live check 2026-11-18: a strict comparison told to include equality is the fix in words", () => {
    const adult = { sourceLines: ["def is_adult(age):", "    return age > 18"], words: true };
    expect(fixInWords("If the intent is \"18 and older,\" the operator should include equality.", adult)).toBe("swap");
    expect(fixInWords("The comparison needs to be inclusive so 18 counts.", adult)).toBe("swap");
    expect(fixInWords("Change the check so that it also allows equality.", adult)).toBe("swap");
    // asking, and a comparison already inclusive, stay free
    expect(fixInWords("Does your comparison include 18 itself? Try `is_adult(18)` by hand.", adult)).toBeNull();
    expect(fixInWords("Does the comparison include equality?", adult)).toBeNull();
    const already = { sourceLines: ["def is_adult(age):", "    return age >= 18"], words: true };
    expect(fixInWords("The operator should include equality, and it does: 18 counts.", already)).toBeNull();
    // only when wording counts (teach, hint, design)
    expect(fixInWords("The operator should include equality.", { ...adult, words: false })).toBeNull();
    expect(fixInWords("The comparison should be greater-than-or-equal.", adult)).toBe("swap");
    expect(fixInWords("Your check should also include values equal to 18.", adult)).toBe("swap");
  });
  it("review of leak-words: equality told only about their comparison, and never their own question", () => {
    const loop = { sourceLines: ["    while i < n:", "        i += 1"], words: true };
    expect(fixInWords("`range(1, n)` is not inclusive of `n`, so you need to think about where it stops.", loop)).toBeNull();
    expect(fixInWords("Python slices make the start inclusive and the end exclusive.", loop)).toBeNull();
    expect(fixInWords("Your loop stops before n. Does the task say the sum should be inclusive of n?", loop)).toBeNull();
    expect(fixInWords("Your function should accept equal values for both arguments.", loop)).toBeNull();
    expect(fixInWords("The loop should count equal steps each time; trace it with n = 3.", loop)).toBeNull();
    expect(fixInWords("Your signature should accept equal-length arrays.", { sourceLines: ["function first(xs: Array<number>) {"], words: true })).toBeNull();
    const mixed = { sourceLines: ["    if x > hi:", "    if i <= 3:"], words: true };
    expect(fixInWords("Your `<=` on line 5 should include 3 itself: less than or equal.", mixed)).toBeNull();
    const adult = { sourceLines: ["    return age > 18"], words: true };
    expect(fixInWords("Use `>=` when you want greater than or equal.", { ...adult, asked: "what does >= mean?" })).toBeNull();
    // Re-check: "check", "compare" and "condition" as hint words are not their comparison
    expect(fixInWords("Check whether `range()` is inclusive: should the loop reach n?", loop)).toBeNull();
    expect(fixInWords("Compare your loop with the task: should the total be inclusive of n?", loop)).toBeNull();
    expect(fixInWords("The task's condition says the sum should be inclusive of n; trace your loop with n = 3.", loop)).toBeNull();
    expect(fixInWords("Before you change anything, check the spec: does it make the upper bound inclusive?", loop)).toBeNull();
    expect(fixInWords("Use a check like `is_adult(18)`; the spec says adults include those equal to 18 — what does yours return?", adult)).toBeNull();
    expect(fixInWords("Your date-range check should be inclusive on both ends.", { sourceLines: ["function first(xs: Array<number>) {"], words: true })).toBeNull();
    // re-check N2: "is the opposite" describes their own code
    expect(fixInWords("Line 2 uses `-`. Line 3 uses `<`, which is the opposite of what you might expect.", { sourceLines: ["    return paid - price", "    if paid < price:"], words: true })).toBeNull();
  });
  it("live check 2026-11-19: the fix offered as a choice between their code and the changed code", () => {
    const loop = { sourceLines: ["def sum_to(n):", "    for i in range(1, n):"], words: true };
    expect(fixInWords("Look at the `range()` call in your function. Ask yourself whether the stop value should be `n` or `n + 1` to include the number you mean to sum.", loop)).toBe("swap");
    expect(fixInWords("Should it be `range(1, n)` or `range(1, n + 1)`?", loop)).toBe("swap");
    const adult = { sourceLines: ["    return age > 18"], words: true };
    expect(fixInWords("Should the limit be `18` or `17`?", adult)).toBe("swap");
    // two of their own names, a name for a name, and one expression alone stay free
    expect(fixInWords("Which one does the loop add last: `i` or `n`?", loop)).toBeNull();
    expect(fixInWords("Is the stop value `n` or `total`?", loop)).toBeNull();
    expect(fixInWords("What does `range(1, n)` give for n = 4?", loop)).toBeNull();
    expect(fixInWords("Should the stop value be `n` or `n + 1`?", { ...loop, words: false })).toBeNull();
    // review of leak-choice I1/I2: a trace question about what the code does now, and the learner's own question
    expect(fixInWords("Does `i` reach `n` or `n - 1`?", loop)).toBeNull();
    expect(fixInWords("Does `total += i` add `i` or `i + 1`?", { sourceLines: ["    for i in range(1, n):", "        total += i"], words: true })).toBeNull();
    expect(fixInWords("Does `i` end at `10` or `9`?", { sourceLines: ["    for i in range(10):"], words: true })).toBeNull();
    expect(fixInWords("Does the list index start at `0` or `1`?", { sourceLines: ["    best = xs[0]"], words: true })).toBeNull();
    expect(fixInWords("You're asking whether it should be `n` or `n + 1`; trace it with n = 3.", { ...loop, asked: "should it be n or n + 1?" })).toBeNull();
    // re-check M-1/M-4: "should" in another clause, and their question spaced differently
    expect(fixInWords("You should trace it: does `i` end at `10` or `9`?", { sourceLines: ["    for i in range(10):"], words: true })).toBeNull();
    expect(fixInWords("Should it be `n` or `n + 1`?", { ...loop, asked: "should it be n or n+1?" })).toBeNull();
  });
  it("live check 2026-11-19: the comparison told to go the opposite way, with no operator named", () => {
    const best = { sourceLines: ["        if x < best:"], words: true };
    expect(fixInWords("To select the maximum, the condition needs to test the opposite relationship.", best)).toBe("swap");
    expect(fixInWords("Ask yourself whether changing the operator would make the loop prefer larger numbers instead of smaller ones.", best)).toBe("swap");
    expect(fixInWords("Try flipping the comparison.", best)).toBe("swap");
    expect(fixInWords("What happens if you reverse the comparison on line 4?", best)).toBe("swap");
    // the opposite case, a question about what it does, and code with no comparison stay free
    expect(fixInWords("Your condition should also handle the opposite case, when the list is empty.", best)).toBeNull();
    expect(fixInWords("The comparison on line 4 decides which numbers replace `best`. Which ones does it let through?", best)).toBeNull();
    expect(fixInWords("To select the maximum, the condition needs to test the opposite relationship.", { sourceLines: ["    return a + b"], words: true })).toBeNull();
    expect(fixInWords("Try flipping the comparison.", { ...best, asked: "what does < do vs >?" })).toBeNull();
    // review of leak-choice I3/I4/I5: other tests, directions of a walk, condition order, sort order, generics
    for (const hint of [
      "Use the other test case, where the list is sorted, and see what the check returns.",
      "You should run the other test too; what does the check give for `[5, 1]`?",
      "Think about it the other way: what does the check need to keep?",
      "The loop should walk the list in the opposite direction; what does the condition do then?",
      "Make sure the condition handles the reverse direction of the list.",
      "The other way to make the check is a `while` loop; you need to decide.",
      "Flip the condition order so the empty case is checked first.",
      "Reverse the check: return early when the list is empty.",
      "Invert the condition with `not` to return early.",
      "Try reversing the comparison of the sort order.",
      "Flip the comparison in your sort key so it goes descending.",
      "Changing the check order would help larger lists too.",
      "If you change the condition, what happens with larger inputs?",
    ]) expect(fixInWords(hint, best), hint).toBeNull();
    expect(fixInWords("You need to think of the other test: what should the check do for an empty vec?", { sourceLines: ["fn total(xs: &Vec<i32>) -> i32 {"], words: true })).toBeNull();
    expect(fixInWords("Flip the comparison.", { sourceLines: ["fn total(xs: &Vec<i32>) -> i32 {"], words: true })).toBeNull();
    // re-check I-A: "in the list" and "return early" said beside a real turn of the comparison
    for (const leak of [
      "To find the biggest number in the list, the condition needs to test the opposite relationship.",
      "Try flipping the comparison so it keeps the biggest item of the list.",
      "You need the opposite operator to find the largest value in the list.",
      "Flip the comparison and return early if nothing is bigger.",
    ]) expect(fixInWords(leak, best), leak).toBe("swap");
    // re-check I-B: two comparisons on one line are no generic
    expect(fixInWords("Flip the comparison.", { sourceLines: ["    return a < b and c > b"], words: true })).toBe("swap");
    expect(fixInWords("Flip the comparison.", { sourceLines: ["    if (a<b && c>d) {"], words: true })).toBe("swap");
    expect(fixInWords("Flip the comparison.", { sourceLines: ["fn f(m: HashMap<String, Vec<i32>>) -> bool {"], words: true })).toBeNull();
    // re-check M-3: swapping lines or blocks
    expect(fixInWords("Swap the check and the assignment lines.", best)).toBeNull();
    expect(fixInWords("Swap the condition with the one in the `while` loop.", best)).toBeNull();
    // review M3: plainer ways of saying it
    for (const leak of ["Swap the comparison.", "Turn the comparison around.", "The condition is backwards.", "You need the opposite comparison.", "Use the opposite operator.", "Flip the `<`."])
      expect(fixInWords(leak, best), leak).toBe("swap");
  });
  it("leak-minors: the rewordings the leak-words review found still missed", () => {
    const best = { sourceLines: ["        if x < best:"], words: true };
    expect(fixInWords("A `>` gate climbs toward the maximum. A `<` gate does just the opposite.", best)).toBe("swap");
    expect(fixInWords("A `>` gate climbs toward the maximum. A `<` gate has the opposite effect.", best)).toBe("swap");
    expect(fixInWords("A `>` gate climbs toward the maximum. A `<` gate works in the opposite direction.", best)).toBe("swap");
    const adult = { sourceLines: ["def is_adult(age):", "    return age > 18"], words: true };
    expect(fixInWords("Your check should also include ages that are equal to 18.", adult)).toBe("swap");
    expect(fixInWords("The comparison should let equality through.", adult)).toBe("swap");
    expect(fixInWords("Make the comparison non-strict.", adult)).toBe("swap");
    expect(fixInWords("Change it so the age has to be at least 18.", adult)).toBe("swap");
    expect(fixInWords("It should accept 18 or older.", adult)).toBe("swap");
    expect(fixInWords("The comparison should be ≥.", adult)).toBe("swap");
    // a number that is not their boundary, a test request, and a question about the task stay free
    expect(fixInWords("The list should have at least 3 items before you call it.", adult)).toBeNull();
    expect(fixInWords("Use the condition you wrote and test whether the output includes the equal case.", { sourceLines: ["    while i < n:"], words: true })).toBeNull();
    expect(fixInWords("Is someone who is exactly 18 at least 18? Trace `is_adult(18)` by hand.", adult)).toBeNull();
    // review of leak-minors: the task's own words, counts, maths notation, and their own two operators stay free
    expect(fixInWords("The task says a user must be at least 18. What does your function return for exactly 18?", adult)).toBeNull();
    expect(fixInWords("The loop should run at most 10 times.", { sourceLines: ["    i = 0", "    while i < 10:"], words: true })).toBeNull();
    expect(fixInWords("The user should get no more than 3 tries.", { sourceLines: ["    while attempts < 3:"], words: true })).toBeNull();
    expect(fixInWords("The input can hold 0 or more numbers, so make sure your code handles an empty list.", { sourceLines: ["    if len(nums) > 0:"], words: true })).toBeNull();
    expect(fixInWords("Each test should check that the function returns at least 1 result.", { sourceLines: ["    return n > 1"], words: true })).toBeNull();
    const loop = { sourceLines: ["    while i < n:"], words: true };
    expect(fixInWords("The task says n ≥ 1, so you don't need to handle an empty list.", loop)).toBeNull();
    expect(fixInWords("Make sure your loop works for any n ≥ 0.", loop)).toBeNull();
    const sum = { sourceLines: ["    total = total + x", "    total = total - y"], words: true };
    expect(fixInWords("Line 2's `+` and line 3's `-` have the opposite effect on the total.", sum)).toBeNull();
    expect(fixInWords("Your `+` on line 2 has the opposite effect of the `-` on line 3, so the total goes up then down.", sum)).toBeNull();
    expect(fixInWords("Your comparison should, as a result, include equality.", adult)).toBe("swap");
    // re-check of leak-minors: ≥ between two operands is maths; ≥ after "use", "to", "be" is the operator named
    expect(fixInWords("Make sure your loop handles i ≥ start and stops at the end.", { sourceLines: ["    while i < end:"], words: true })).toBeNull();
    expect(fixInWords("The task says n ≥ len(xs), so you don't need to handle an empty list.", loop)).toBeNull();
    expect(fixInWords("Switch to ≥ instead.", adult)).toBe("swap");
    expect(fixInWords("Your check should use ≥ instead.", adult)).toBe("swap");
    expect(fixInWords("Use ≥ here.", adult)).toBe("swap");
    expect(fixInWords("The comparison should be ≥ 18.", adult)).toBe("swap");
    expect(fixInWords("Make it ≥ so 18 passes.", adult)).toBe("swap");
    expect(fixInWords("Use **≥** here.", adult)).toBe("swap");
    // confirming their strict check names ≥ only to reject it
    expect(fixInWords("The task says over 18, so your check should be >, not ≥.", adult)).toBeNull();
    // "the problem is" is the tutor talking about the bug, not quoting the task
    expect(fixInWords("The problem is that the age should be at least 18, not above it.", adult)).toBe("swap");
  });
  it("review of leak-words: \"does the opposite\" in one sentence; an opposite sign or case is no operator contrast", () => {
    const best = { sourceLines: ["        if x < best:"], words: true };
    expect(fixInWords("A `>` gate climbs toward the maximum, and a `<` gate does the opposite.", best)).toBe("swap");
    expect(fixInWords("A `>` gate climbs toward the maximum. A `<` gate does the reverse.", best)).toBe("swap");
    const change = { sourceLines: ["    return paid - price", "    if paid < price:"], words: true };
    expect(fixInWords("Your `-` gives the change. If the customer paid less than the price, the result has the opposite sign.", change)).toBeNull();
    expect(fixInWords("Line 2 uses `-` to find the change. Then line 3 uses `<` to check the opposite case, when they paid too little.", change)).toBeNull();
  });
  it("operators the learner asked about themselves are their topic, not a leak (side note 2026-11-10)", () => {
    const answer = "`//` drops the fractional part, but `/` keeps it.";
    expect(fixInWords(answer, t)).toBe("swap");
    expect(fixInWords(answer, { ...t, asked: "what is the difference between / and // ?" })).toBeNull();
    expect(fixInWords("Floor division drops the fraction, but division keeps it.", { ...w, asked: "how is floor division different from normal division?" })).toBeNull();
    expect(fixInWords("In split_amount, change the `*` to `/`.", { ...t, asked: "why is my answer too big? it is off-by-one maybe" })).toBe("swap");
    expect(checkTurn(answer, { step: "teach", names: new Set(), sourceLines: src, asked: "what is the difference between `/` and `//`?" })).toEqual([]);
  });
  it("their own line with a change in it is the fix; a quote of it, or an unrelated example, is not", () => {
    expect(fixInWords("Try `share = total / people` there.", t)).toBe("edited-line");
    expect(fixInWords("The expression would be `total / people`.", t)).toBe("edited-line");
    expect(fixInWords("Line 4 computes `share = total * people`.", t)).toBeNull();
    expect(fixInWords("On another problem: `tip = bill / guests` splits a bill.", t)).toBeNull();
    expect(fixInWords("`split_amount(total, people)` is called from main.", t)).toBeNull();
  });
  it("checkTurn holds it as prose-fix before the fix step, and lets the fix step say it", () => {
    const o = { names: new Set(["split_amount"]), sourceLines: src };
    expect(checkTurn("In your function, change the `*` to `/`.", { ...o, step: "teach" })).toEqual(["prose-fix"]);
    expect(checkTurn("Splitting should use division, not multiplication.", { ...o, step: "hint" })).toEqual(["prose-fix"]);
    expect(checkTurn("The part should use division where it multiplies.", { ...o, step: "design" })).toEqual(["prose-fix"]);
    expect(checkTurn("You multiply where the task divides: that is why the share grows.", { ...o, step: "why" })).toEqual([]); // why may name the kind of change in words
    expect(checkTurn("Change the `*` to `/`: a share is the total divided by the people.", { ...o, step: "fix" })).toEqual([]);
  });
});

describe("second review 2026-11-11: code with no learner line to compare, diagrams, and ordinary teaching sentences", () => {
  const bare = { step: "design" as const, names: new Set<string>(), sourceLines: [] as string[] };
  const mine = { step: "design" as const, names: new Set(["split_amount"]), sourceLines: ["def split_amount(total, people):", "    share = total * people", "    return share"] };
  it("I1: the architect writing a statement is role-code even when the learner has no code yet", () => {
    for (const r of ["Write it as `share = total / people` inside `split_bill`.", "Start with `def split_bill(total, people): return total / people`.",
      "Like this:\n```\nshare = total / people\nreturn round(share, 2)\n```", "End it with `return total / people`."]) expect([r, checkTurn(r, bare)]).toEqual([r, ["role-code"]]);
    expect(checkTurn("Line 2 computes `share = total * people`.", mine)).toEqual([]); // a quote of their line
  });
  it("I5: a diagram fence under a diagram tag, and a fenced quote of their own lines, are not code", () => {
    for (const tag of ["txt", "plaintext", "plain", "ascii", "diagram", "mermaid"]) expect([tag, checkTurn("```" + tag + "\n[ Bill ] --> [ Split ]\n```", bare)]).toEqual([tag, []]);
    expect(checkTurn("Your part today:\n```python\n    share = total * people\n    return share\n```", mine)).toEqual([]);
    expect(checkTurn("```python\n    share = total / people\n```", mine)).toEqual(["role-code"]);
    expect(checkTurn("```txt\nshare = total / people\n```", mine)).toEqual(["role-code"]);
    // M3: a flow line that passes through their expression is a diagram
    expect(checkTurn("```\nprice, qty --> total --> total * people --> share\n```", mine)).toEqual([]);
  });
  it("I4: describing what each part does, listing operators, and naming a pair without setting them apart are teaching", () => {
    const both = { sourceLines: ["total = price * qty", "share = total / people"], words: true };
    expect(fixInWords("The bill part multiplies price by quantity, while the split part divides the total among people.", both)).toBeNull();
    expect(fixInWords("Python's arithmetic operators are `+`, `-`, `*`, `/`. Which one does your line use?", both)).toBeNull();
    expect(fixInWords("Each of `*` or `/` takes two numbers. What does your line give for 10 and 2?", both)).toBeNull();
    const one = { sourceLines: ["share = total * people"], words: true };
    expect(fixInWords("Python's arithmetic operators are `+`, `-`, `*`, `/`. Which one does your line use?", one)).toBeNull();
    expect(fixInWords("Either `*` or `/` takes two numbers.", one)).toBeNull();
    // still the fix: the operator their code lacks, set against theirs
    expect(fixInWords("The split part multiplies, while a share divides.", one)).toBe("swap");
    expect(fixInWords("It multiplies; it should divide.", both)).toBe("swap");
  });
});

describe("re-measure 2026-11-11: a fix inside a question, a value named in passing, and the everyday word remainder", () => {
  const f = (...lines: string[]) => ({ sourceLines: lines, words: true });
  const adult = f("def is_adult(age):", "    return age > 18"), avg = f("def average(numbers):", "    return len(numbers) / sum(numbers)"), change = f("def change(paid, price):", "    return paid + price");
  it("an operator their code does not have, named as the thing to change to or use, is the fix even inside a question", () => {
    expect(fixInWords("What do you think changing the operator to `>=` would do, and would that align with the intended definition of \"adult\"?", adult)).toBe("swap");
    expect(fixInWords("The `>` operator checks for strictly greater than, so 18 itself returns `False`. Using `>=` will include 18 as an adult.", adult)).toBe("swap");
    expect(fixInWords("What should the function use instead of `+`, and what would the correct output be?", change)).toBeNull(); // points at theirs, names nothing new
    expect(fixInWords("Python also has `//`; what does using it on 7 and 2 give?", { ...adult, asked: "what does // do?" })).toBeNull();
    expect(fixInWords("The `>` here is strict. Which numbers does it let through?", adult)).toBeNull();
  });
  it("saying the two sides of a division or subtraction go the other way round is the fix", () => {
    expect(fixInWords("The average should divide the total by the count, not the other way around.", avg)).toBe("swap");
    expect(fixInWords("An average is calculated by dividing the total sum by how many numbers there are. What do you think would happen if we swapped the order of the division?", avg)).toBe("swap");
    expect(fixInWords("How would you reorder the division to calculate the average correctly?", avg)).toBe("swap");
    expect(fixInWords("Division is not commutative: what does that mean for which value goes on top?", avg)).toBeNull();
    expect(fixInWords("What would happen if we swapped the order of the addition?", change)).toBeNull(); // their code divides and subtracts nothing
    expect(fixInWords("How would you reorder the division to calculate the average correctly?", { ...avg, words: false })).toBeNull(); // why may name the kind of change
  });
  it("live check 2026-11-17: the two sides named in one sentence and the swap told in the next is the fix", () => {
    expect(fixInWords("Ask whether you're dividing the total by the count or the count by the total. Try swapping the order and see what you get.", avg)).toBe("swap");
    expect(fixInWords("Your function adds two numbers. Try swapping the order of your notes.", change)).toBeNull(); // addition has no sides to swap
    expect(fixInWords("Look at what you divide. Then read the error message again.", avg)).toBeNull();
    // Review 2026-11-18 I1: a swap of something else after a sentence about their division is ordinary teaching.
    const avg2 = f("def average(count, total):", "    return count / total"), off = f("def off(discount, price):", "    return discount - price");
    for (const r of ["Your function divides one number by another. Now try swapping the two test values you call it with and compare.",
      "Line 2 divides. Reverse the numbers in your list of test cases and run it again.",
      "Good, that line divides. Next, switch the order of the two print lines so the heading comes first.",
      "Division gives a float here. Try swapping the order of your test inputs to see edge cases.",
      "Your function divides two numbers. Think of it the other way round: what would a caller expect back?"]) expect([r, fixInWords(r, avg2)]).toEqual([r, null]);
    const sub = "Your line subtracts one value from another. Swap the values in your second test call and check the output.";
    expect([sub, fixInWords(sub, off)]).toEqual([sub, null]);
    expect(fixInWords("Are you subtracting the price from the discount or the discount from the price? Try the other way round.", off)).toBe("swap");
    // Re-check 2026-11-18: the same leak in other words is still held; one idiom said twice is not two sides.
    expect(fixInWords("Is it the total divided by the count, or the count divided by the total? Try swapping the order.", avg2)).toBe("swap");
    expect(fixInWords("Is it the count over the total, or vice versa? Try swapping the order.", avg2)).toBe("swap");
    expect(fixInWords("Is it price minus discount or discount minus price? Try the other way round.", off)).toBe("swap");
    expect(fixInWords("Divide it step by step, or step by step with prints. Try swapping the two numbers.", avg2)).toBeNull();
    // Re-check 2026-11-18: "from" between the two sides, both ways round, is subtraction.
    expect(fixInWords("Is it the price from the discount or the discount from the price? Swap the order and see.", off)).toBe("swap");
    expect(fixInWords("Is it the count from the total or the total from the count? Swap the order.", avg2)).toBeNull(); // their code only divides
    // Review of dc517a6: "from" is everyday direction; only the two sides repeated in the other order make it subtraction.
    const loop = f("def gaps(xs):", "    for i in range(len(xs) - 1):", "        print(xs[i + 1] - xs[i])");
    for (const r of ["Data flows from the caller, or vice versa. Swap the two test values you call it with.",
      "Do you read the values from the file, or the other way round? Swap the two values in your test.",
      "Copy the items from the list, or vice versa. Reverse the numbers in your test list.",
      "The loop runs from zero, or the other way round. Try swapping the numbers in your test.",
      "The result comes from the function, or the other way round? Swap the order of the two print lines."]) {
      expect([r, fixInWords(r, loop)]).toEqual([r, null]);
      expect([r, fixInWords(r, off)]).toEqual([r, null]);
    }
    expect(fixInWords("Ask whether you're dividing the total by the count. Try swapping the order.", { ...avg, words: false })).toBeNull();
  });
  it("a value named in passing (`age = 18`) is not their line edited", () => {
    expect(fixInWords("The line `return age > 18` uses a strict greater-than operator. With `age = 18`, the expression `18 > 18` evaluates to `False` because 18 is not greater than itself.", adult)).toBeNull();
    expect(fixInWords("Set `share = people` there.", f("    share = total * people"))).toBe("edited-line"); // their own assignment, changed
  });
  it("remainder as an everyday word names no operator; the modulo operator does", () => {
    const r = "Calling it with `20` and `15` produces `35`, which is the total of those values rather than a remainder. This means the output reflects addition, not what is left after the price is accounted for.";
    expect(fixInWords(r, change)).toBeNull();
    expect(fixInWords("You want the modulo here, not addition.", change)).toBe("swap");
    expect(fixInWords("Use the remainder operator rather than addition.", change)).toBe("swap");
  });
});

describe("fresh batch 2026-11-11: their line with one token changed, short names, and explaining an operator", () => {
  const f = (...lines: string[]) => ({ sourceLines: lines, words: true });
  it("their line with exactly one token changed is the fix, however short its names", () => {
    expect(fixInWords("Try changing it to `x > best`.", f("        if x < best:"))).toBe("edited-line");
    expect(fixInWords("Try changing it to `n % 2 == 0`.", f("    return n % 2 == 1"))).toBe("edited-line");
    expect(fixInWords("Change it to `n -= 1` to count down.", f("        n += 1"))).toBe("edited-line");
    // a value put in for a name is working the line through, not changing it
    expect(fixInWords("With `n = 5`, `range(1, 5)` generates the numbers 1, 2, 3, 4.", f("    for i in range(1, n):"))).toBeNull();
    expect(fixInWords("The expression `18 > 18` evaluates to `False`.", f("    return age > 18"))).toBeNull();
    expect(fixInWords("Think about the `n + 1 queries` problem, or `key = value` pairs.", f("    share = total * people", "    for i in range(1, n):"))).toBeNull();
  });
  it("a worked value, an unrelated string, and a bare call name are not their line changed", () => {
    expect(fixInWords("For `n = 4`, `4 % 2` is `0`, and `0 == 1` evaluates to `False`.", f("    return n % 2 == 1"))).toBeNull();
    expect(fixInWords("For an unrelated example, `'Hi' + 'There'` gives `'HiThere'`, not `'Hi There'`.", f("    return first + last", "print(full_name('Ada', 'Lovelace'))"))).toBeNull();
    expect(fixInWords("Remember that Python's `range()` stops before the second argument.", f("    for i in range(1, n):"))).toBeNull();
  });
  it("a keyword shared with their line is not one of their names", () => {
    expect(fixInWords("A classic way this happens is writing `while score > 0: score += 1`.", f("    while n > 0:", "        n += 1"))).toBeNull();
  });
  it("explaining the remainder operator by division is its meaning, not a swap", () => {
    const even = f("    return n % 2 == 1");
    expect(fixInWords("Think of the `%` operator as asking \"what's left over after dividing by 2?\"", even)).toBeNull();
    expect(fixInWords("`7 % 2` is `1` (7 divided by 2 leaves remainder 1), while `8 % 2` is `0`.", even)).toBeNull();
    expect(fixInWords("Use `/` rather than `%` here.", even)).toBe("swap");
  });
  it("before the fix step, a code fence holding their line with one token changed is their own code fixed", () => {
    const o = { step: "teach" as const, names: new Set(["countdown"]), sourceLines: ["def countdown(n):", "    while n > 0:", "        print(n)", "        n += 1", "", "countdown(3)"] };
    expect(checkTurn("Count down instead:\n```python\ndef countdown(n):\n    while n > 0:\n        print(n)\n        n -= 1   # counts down, not up\ncountdown(3)\n```\nWhat changes?", o)).toContain("own-code");
    expect(checkTurn("Your loop today:\n```python\n    while n > 0:\n        n += 1\n```\nWhat happens to n each time round?", o)).toEqual([]);
    expect(checkTurn("```python\n        n -= 1\n```", { ...o, step: "fix" })).toEqual([]);
  });
  it("live check 2026-11-19: an \"unrelated\" example that is their function renamed, with the fix in it, is their own code", () => {
    const o = { step: "hint" as const, names: new Set(["double_all"]), sourceLines: ["def double_all(nums):", "    result = []", "    for x in nums:", "        result.append(x * 2)", "", "", "print(double_all([1, 2, 3]))  # expected [2, 4, 6]"] };
    const live = "**Example** (unrelated — using a string instead of numbers):\n```python\ndef double_chars(s):\n    result = []\n    for ch in s:\n        result.append(ch * 2)\n    return result\n```\nWhat does yours give back?";
    expect(checkTurn(live, o)).toContain("own-code");
    // with a call after it, or a docstring, it is still their function plus the missing line
    expect(checkTurn("```python\ndef double_chars(s):\n    \"\"\"Double each char.\"\"\"\n    result = []\n    for ch in s:\n        result.append(ch * 2)\n    return result\n\nprint(double_chars(\"ab\"))\n```", o)).toContain("own-code");
    // the same shape with the bug kept, a different shape, and a short example stay free
    expect(checkTurn("```python\ndef triple_chars(s):\n    out = []\n    for ch in s:\n        out.append(ch * 3)\n```\nWhat does this give back for \"ab\"?", o)).toEqual([]);
    expect(checkTurn("```python\ndef shout(words):\n    return [w.upper() for w in words]\n```\nWhat comes back?", o)).toEqual([]);
    expect(checkTurn("```python\nfor ch in \"ab\":\n    print(ch * 2)\n```\nWhat prints?", o)).toEqual([]);
    // review of leak-example: the same bug with a call line, the body varied, another accumulator, a 4-line check
    // changed, tiny brace functions, and a partial quote of theirs stay free
    expect(checkTurn("```python\ndef triple_chars(s):\n    out = []\n    for ch in s:\n        out.append(ch * 3)\n\nprint(triple_chars(\"ab\"))\n```", o)).toEqual([]);
    expect(checkTurn("```python\ndef shout_all(words):\n    out = []\n    for w in words:\n        out.append(w.upper())\n```", o)).toEqual([]);
    const total = { step: "hint" as const, names: new Set(["total"]), sourceLines: ["def total(nums):", "    s = 0", "    for n in nums:", "        s += n", "    return s"] };
    expect(checkTurn("```python\ndef long_words(words):\n    count = 0\n    for w in words:\n        if len(w) > 3:\n            count += 1\n    return count\n```", total)).toEqual([]);
    expect(checkTurn("```python\ndef product(vals):\n    p = 1\n    for v in vals:\n        p *= v\n    return p\n```", total)).toEqual([]);
    const adult = { step: "hint" as const, names: new Set(["is_adult"]), sourceLines: ["def is_adult(age):", "    if age >= 18:", "        return True", "    return False"] };
    expect(checkTurn("```python\ndef is_teen(age):\n    if age >= 13 and age <= 19:\n        return True\n    return False\n```", adult)).toEqual([]);
    expect(checkTurn("```python\ndef is_positive(n):\n    if n > 0:\n        return True\n    return False\n\nprint(is_positive(-3))\n```", adult)).toEqual([]);
    const square = { step: "hint" as const, names: new Set(["square"]), sourceLines: ["function square(n) {", "  return n * n;", "}"] };
    expect(checkTurn("```js\nfunction area(w) {\n  const h = 2;\n  return w * h;\n}\n```", square)).toEqual([]);
    expect(checkTurn("Your function so far:\n```python\ndef double_all(nums):\n    result = []\n    for x in nums:\n        ...\n```\nWhat does it hand back?", o)).toEqual([]);
    // at the fix step their code may be shown
    expect(checkTurn(live, { ...o, step: "fix" })).not.toContain("own-code");
  });
});

describe("review of leak-shapes 2026-11-11: the new rules must not hold everyday teaching", () => {
  const f = (...lines: string[]) => ({ sourceLines: lines, words: true });
  it("C1: saying what an operator is used for is a lesson; the swap needs an operator of the same family in their code", () => {
    expect(fixInWords("In Python you use `+` to join two strings.", f("    return first.upper()"))).toBeNull();
    expect(fixInWords("Remember that you use `==` to compare two values. Which line compares?", f("    if age > 18:"))).toBeNull();
    expect(fixInWords("Python uses `*` for multiplying. What does your line do?", f("    return a + b"))).toBeNull();
    expect(fixInWords("We use `%` to test evenness because it gives the remainder.", f("    return n / 2"))).toBeNull();
    expect(fixInWords("Rust uses `!=` for not equal, just like Python.", f("    if a == b {"))).toBeNull();
    expect(fixInWords("Change the comparison to `>=` there.", f("    total = a + b"))).toBeNull(); // no comparison of theirs to change
    expect(fixInWords("Using `>=` will include 18 as an adult.", f("    return age > 18"))).toBe("swap");
  });
  it("C2: an unrelated example one name away from their line is an example, inline or fenced", () => {
    const teach = (src: string[]) => ({ step: "teach" as const, names: new Set<string>(), sourceLines: src });
    for (const [fence, line] of [["```python\nprint(name)\n```", "print(total)"], ["```python\nfound = False\n```", "done = False"], ["```rust\nlet mut y = 0;\n```", "let mut x = 0;"],
      ["```go\nfmt.Println(y)\n```", "fmt.Println(x)"], ["```js\nconsole.log(name);\n```", "console.log(total);"], ["```python\nfrom math import sqrt\n```", "from math import floor"]]) expect([fence, checkTurn(fence + "\nWhat does it print?", teach([line]))]).toEqual([fence, []]);
    expect(fixInWords("You can print a value with `print(name)`.", f("print(total)"))).toBeNull();
    // M1: a quote of their line with a trailing comment of another language is still a quote
    expect(checkTurn("```rust\nlet avg = total / count; // here\n```\nWhat is count?", teach(["let avg = total / count; // TODO"]))).toEqual([]);
    expect(checkTurn("```rust\nlet avg = total * count; // here\n```\nWhat is count?", teach(["let avg = total / count; // TODO"]))).toEqual(["own-code"]);
  });
  it("C3: reverse, flip and swap about lists, strings or signs say nothing about their division", () => {
    expect(fixInWords("`s[::-1]` reverses the string, and subtracting 1 from the length gives the last index.", f("    return s[len(s) - 1]"))).toBeNull();
    expect(fixInWords("To reverse a list, step through it with a minus one step.", f("    return a - b"))).toBeNull();
    expect(fixInWords("To flip the sign of a number, put a `-` in front of it.", f("    return a - b"))).toBeNull();
    expect(fixInWords("A reverse proxy divides traffic between the two servers.", f("    return total / servers"))).toBeNull();
    expect(fixInWords("`.rev()` reverses an iterator, so counting down needs no subtraction.", f("fn count(n: u32) -> u32 {", "    n + 1"))).toBeNull();
    expect(fixInWords("What would the output be if the order of the values in the division were reversed?", f("    return len(numbers) / sum(numbers)"))).toBe("swap");
  });
  it("I1, I2, I4: fixes the old rules held are still held", () => {
    expect(fixInWords("Use division instead of `%` here.", f("    return n % 2"))).toBe("swap");
    expect(fixInWords("You want integer division here, not `%`.", f("    return n % 2"))).toBe("swap");
    expect(fixInWords("You need the remainder here, not division.", f("    return n / 2"))).toBe("swap");
    expect(fixInWords("What is the remainder of 7 divided by 2?", f("    return n % 2 == 1"))).toBeNull();
    expect(fixInWords("Try `while i <= n - 1 do`.", f("while i < n do"))).toBe("edited-line");
  });
});

describe("a reply that only repeats the tutor's own placeholder is no reply (live run 2026-11-11)", () => {
  it("checkTurn calls it empty, so it is asked again or replaced, never shown", async () => {
    const { HOLD_TEXT, REWRITE_TEXT, EMPTY_TEXT } = await import("../extensions/tutor/turns.js");
    const o = { step: "teach" as const, names: new Set<string>(), sourceLines: ["x = 1"] };
    for (const t of ["**(tutor is rewriting this reply…)**", REWRITE_TEXT, HOLD_TEXT, EMPTY_TEXT, "(tutor is rewriting this reply...)\n```tutor-judgment\n{\"judgment\":\"none\"}\n```"])
      expect([t, checkTurn(t, o)]).toEqual([t, ["empty"]]);
    expect(checkTurn("The tutor is rewriting this reply because the first one was unclear: look at line 1 again.", o)).toEqual([]);
  });
});
