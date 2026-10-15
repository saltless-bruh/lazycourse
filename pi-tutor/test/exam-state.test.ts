import { describe, it, expect } from "vitest";
import { examLabel, formatExamContext, restoreExam, type ExamState } from "../extensions/tutor/exam/state.js";

const E: ExamState = { id: "01-word-frequency", dir: "exam/01-word-frequency", language: "python", topic: null, size: "small", started: 0, limit: 20, concepts: [] };

describe("exam state", () => {
  it("labels the time left as mm:ss, and late time with a +", () => {
    expect(examLabel(E, 0)).toBe("exam 01 20:00 left");
    expect(examLabel(E, 65_000)).toBe("exam 01 18:55 left");
    expect(examLabel(E, 20 * 60_000 + 3_000)).toBe("exam 01 +00:03 late");
  });
  it("the context line caps hints and points at the brief", () => {
    const c = formatExamContext(E, 60_000);
    expect(c).toMatch(/^\[exam\] timed exam 01-word-frequency in progress \(19:00 left\)/);
    expect(c).toContain("exam/01-word-frequency/brief.md");
    expect(c).toMatch(/never write, complete or fix the learner's solution/);
  });
  it("restores the last open exam from the branch; submitted or abandoned ones stay closed (Review Focus #3)", () => {
    const entry = (data: object) => ({ type: "custom", customType: "tutor_exam", data });
    expect(restoreExam([entry(E)])).toEqual(E);
    expect(restoreExam([entry(E), entry({ ...E, submitted: 5, score: 80 })])).toBeNull();
    expect(restoreExam([entry({ ...E, abandoned: 5 })])).toBeNull();
    expect(restoreExam([])).toBeNull();
  });
});
