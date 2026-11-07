import { describe, it, expect } from "vitest";
import { parseThinkingMode, thinkingHidden, THINKING_LABEL } from "../extensions/tutor/thinking.js";

describe("thinking visibility", () => {
  it("auto hides on every band (learner-session fixes §4); show and hide win over the band", () => {
    expect(thinkingHidden("auto", "pro")).toBe(true);
    expect(thinkingHidden("auto", "intermediate")).toBe(true);
    expect(thinkingHidden("auto", "beginner")).toBe(true);
    expect(thinkingHidden("show", "pro")).toBe(false);
    expect(thinkingHidden("hide", "beginner")).toBe(true);
  });
  it("parses the three modes, trimmed and case-insensitive, and nothing else", () => {
    expect(parseThinkingMode(" Show ")).toBe("show");
    expect(parseThinkingMode("auto")).toBe("auto");
    expect(parseThinkingMode("hide")).toBe("hide");
    expect(parseThinkingMode("off")).toBeNull();
    expect(parseThinkingMode("")).toBeNull();
  });
  it("the label tells the learner how to bring thinking back", () => {
    expect(THINKING_LABEL).toContain("/tutor-thinking show");
    expect(Array.from(THINKING_LABEL).length).toBeLessThanOrEqual(40);
  });
});

describe("guarded turns (spec 2026-10-21 §6: the thinking is where a model works out the fix)", () => {
  it("hide thinking whatever the setting", () => {
    expect(thinkingHidden("show", "beginner", true)).toBe(true);
    expect(thinkingHidden("show", "beginner", false)).toBe(false);
    expect(thinkingHidden("show", "beginner")).toBe(false);
  });
});

describe("thinking hidden by default (learner-session fixes Task 5)", () => {
  it("auto hides thinking on every band; show shows it", () => {
    for (const band of ["beginner", "intermediate", "pro"] as const) expect(thinkingHidden("auto", band)).toBe(true);
    expect(thinkingHidden("show", "beginner")).toBe(false);
    expect(thinkingHidden("show", "beginner", true)).toBe(true); // a guarded turn still hides it
  });
});
