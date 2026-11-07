import { describe, it, expect } from "vitest";
import { TURN_LIMITS, turnInstruction, fallbackReply } from "../extensions/tutor/turns.js";

describe("turns (spec 2026-10-21 §6)", () => {
  it("each step has its limits and one instruction", () => {
    expect(TURN_LIMITS.hint).toEqual({ maxSentences: 2, ownCode: false, question: false });
    expect(TURN_LIMITS.why).toEqual({ maxSentences: 6, ownCode: false, question: false });
    expect(TURN_LIMITS.ask).toEqual({ maxSentences: 3, ownCode: false, question: true });
    expect(TURN_LIMITS.teach).toEqual({ maxSentences: null, ownCode: false, question: false });
    expect(TURN_LIMITS.fix).toEqual({ maxSentences: null, ownCode: true, question: false });
    for (const s of ["teach", "hint", "why", "ask", "fix"] as const) expect(turnInstruction(s)).not.toMatch(/rung/i);
    expect(turnInstruction("ask")).toMatch(/what they were thinking/);
    expect(turnInstruction("hint")).toBe("One small hint that points at the spot (the line or the value that is off). At most 2 sentences. No code with the learner's names and no fix.");
  });
  it("a fallback quotes the error line as the learner saw it (live check: '#' and stripped underscores)", () => {
    expect(fallbackReply("why", "split_amount(10, 4) gave 2, expected 2.5")).toContain("split_amount(10, 4) gave 2, expected 2.5");
    expect(fallbackReply("why", "use `x` here")).not.toMatch(/`/);
    // phase 1 minor M6: the spot is shown as plain text, so no other Markdown in an error renders either
    expect(fallbackReply("hint", "total * people * 2 in [main](x) _here_")).toContain("total \\* people \\* 2 in \\[main\\](x) \\_here\\_");
  });
  it("fallbacks hold no code and no fix", () => {
    for (const s of ["teach", "hint", "why", "ask", "fix"] as const) {
      expect(fallbackReply(s, "ZeroDivisionError")).not.toMatch(/`|```/);
      expect(fallbackReply(s)).not.toMatch(/`|```/);
    }
    expect(fallbackReply("ask")).toMatch(/\?$/);
  });
});

describe("re-run finding: the recipe's teach fallback", () => {
  it("names the step, explains it in its one sentence and asks for it, with no code marks", async () => {
    const { STEP_SPECS } = await import("../extensions/tutor/workflow.js");
    const t = fallbackReply("teach", undefined, { n: 1, ...STEP_SPECS[0] });
    expect(t).toContain("Step 1, Find");
    expect(t).toContain(STEP_SPECS[0].explain);
    expect(t).not.toMatch(/`/);
    expect(fallbackReply("teach")).toMatch(/^Tell me which step/);
  });
});
