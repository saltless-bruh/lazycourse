import { describe, it, expect } from "vitest";
import { parseThinkingMode, thinkingHidden, THINKING_LABEL } from "../extensions/tutor/thinking.js";

describe("thinking visibility", () => {
  it("auto hides only at pro; show and hide win over the band", () => {
    expect(thinkingHidden("auto", "pro")).toBe(true);
    expect(thinkingHidden("auto", "intermediate")).toBe(false);
    expect(thinkingHidden("auto", "beginner")).toBe(false);
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
