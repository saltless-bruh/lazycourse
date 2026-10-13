import { describe, it, expect } from "vitest";
import { FEEDBACK_KINDS, activeFeedback, feedbackRung, formatFeedback } from "../extensions/tutor/feedback.js";

describe("/tutor-feedback (spec 2026-10-13 §7 #7)", () => {
  it("has exactly the four kinds", () => {
    expect(FEEDBACK_KINDS).toEqual(["too-long", "too-vague", "too-much-help", "good"]);
  });
  it("folds history: kinds stay active until good clears them", () => {
    expect(activeFeedback(["too-long", "too-vague", "too-long"])).toEqual(["too-long", "too-vague"]);
    expect(activeFeedback(["too-long", "good", "too-much-help"])).toEqual(["too-much-help"]);
    expect(activeFeedback([])).toEqual([]);
  });
  it("too-much-help lowers the rung, too-vague raises it, both within 1..cap", () => {
    expect(feedbackRung("too-much-help", 3, 5)).toBe(2);
    expect(feedbackRung("too-much-help", 1, 5)).toBe(1);
    expect(feedbackRung("too-vague", 4, 4)).toBe(4);
    expect(feedbackRung("too-vague", 2, 5)).toBe(3);
    expect(feedbackRung("too-long", 3, 5)).toBe(3);
    expect(feedbackRung("good", 3, 5)).toBe(3);
  });
  it("renders one [tutor-feedback] note per active kind, or null", () => {
    expect(formatFeedback([])).toBeNull();
    const n = formatFeedback(["too-long", "too-much-help"])!;
    expect(n.startsWith("[tutor-feedback]")).toBe(true);
    expect(n).toMatch(/too long/);
    expect(n).toMatch(/work things out/);
    expect(n).toMatch(/complete/i); // shorter never means dropping needed detail (spec §2 "Complete")
  });
});
