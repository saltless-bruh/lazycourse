import { describe, it, expect } from "vitest";
import { formatEditorContext, formatEpisodeContext, MAX_SNAPSHOT_LINES } from "../extensions/tutor/context.js";
import { openEpisode } from "../extensions/tutor/ladder.js";
import type { EditorSnapshot } from "../extensions/tutor/nvim.js";

const snap = (over: Partial<EditorSnapshot> = {}): EditorSnapshot => ({
  path: "/p/src/a.py", filetype: "python", cursor: 2, from: 1,
  lines: ["x = 1", "y = x +", "print(y)"],
  diagnostics: [{ line: 2, severity: 1, msg: "invalid syntax" }, { line: 3, severity: 2, msg: "unused" }],
  ...over,
});

describe("formatEditorContext", () => {
  it("renders header, diagnostics and numbered lines", () => {
    const out = formatEditorContext(snap());
    expect(out.split("\n")).toEqual([
      "[editor] /p/src/a.py (python), cursor line 2",
      "diagnostics:",
      "  L2 E: invalid syntax",
      "  L3 W: unused",
      "--- lines 1-3 ---",
      "   1| x = 1",
      "   2| y = x +",
      "   3| print(y)",
    ]);
  });
  it("says none when there are no diagnostics and numbers from `from`", () => {
    const out = formatEditorContext(snap({ diagnostics: [], from: 10, lines: ["a", "b"] }));
    expect(out).toContain("diagnostics: none");
    expect(out).toContain("--- lines 10-11 ---");
    expect(out).toContain("  10| a");
  });
  it("caps the buffer at MAX_SNAPSHOT_LINES and notes the truncation", () => {
    const lines = Array.from({ length: MAX_SNAPSHOT_LINES + 50 }, (_, i) => `l${i + 1}`);
    const out = formatEditorContext(snap({ lines, diagnostics: [] }));
    expect(out).toContain(`--- lines 1-${MAX_SNAPSHOT_LINES} (truncated, ${MAX_SNAPSHOT_LINES + 50} total) ---`);
    expect(out).not.toContain(`l${MAX_SNAPSHOT_LINES + 1}`);
  });
});

describe("formatEpisodeContext", () => {
  it("states the trigger, the rung with its name and cap, turns and concepts", () => {
    const ep = { ...openEpisode({ kind: "error", path: "/p/a.py", line: 3, msg: "boom" }, "pro", 1), turns: 2, concept_tags: ["types", "casts"] };
    expect(formatEpisodeContext(ep).split("\n")).toEqual([
      '[episode] stuck on: error "boom" at a.py:3',
      "hint rung 1/4 (question), 2 turn(s) so far",
      "concepts: types, casts",
    ]);
  });
  it("omits the concepts line when there are none", () => {
    expect(formatEpisodeContext(openEpisode({ kind: "chat" }, "beginner", 1)).split("\n")).toEqual([
      "[episode] stuck on: learner question",
      "hint rung 3/5 (pointer), 0 turn(s) so far",
    ]);
  });
});

describe("run episode context", () => {
  it("carries the trace and points at the stack-trace skill", () => {
    const ep = openEpisode({ kind: "run", cmd: ["python", "a.py"], code: 1, trace: "KeyError: 'x'" }, "beginner", 1);
    const c = formatEpisodeContext(ep);
    expect(c).toMatch(/^\[episode\] stuck on: run failed \(exit 1\): python a\.py/);
    expect(c).toContain("```text\nKeyError: 'x'\n```");
    expect(c).toContain("tutor-stack-traces");
  });
});
