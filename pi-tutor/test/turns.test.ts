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
  it("fallbacks hold no code and no fix", () => {
    for (const s of ["teach", "hint", "why", "ask", "fix"] as const) {
      expect(fallbackReply(s, "ZeroDivisionError")).not.toMatch(/`|```/);
      expect(fallbackReply(s)).not.toMatch(/`|```/);
    }
    expect(fallbackReply("ask")).toMatch(/\?$/);
  });
});
