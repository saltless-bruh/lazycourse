import { describe, it, expect } from "vitest";
import { runInterview, initialLevel, EXPERIENCE, FAMILIARITY, SIZES, type Ask, type InterviewAnswers } from "../extensions/tutor/interview.js";

/** Replays scripted answers in order and records every title asked. */
function scripted(answers: (string | undefined)[]) {
  const asked: string[] = [];
  const next = async (title: string) => { asked.push(title); return answers.shift(); };
  const ask: Ask = { select: (t) => next(t), input: (t) => next(t) };
  return { ask, asked };
}

describe("runInterview", () => {
  it("asks five questions naming the language and returns the answers", async () => {
    const { ask, asked } = scripted(["1-3 years", "python, js", "tried it a little", "a CLI todo app", "medium (half a day)"]);
    const a = await runInterview("rust", ask);
    expect(a).toEqual({ experience: "1-3 years", known: "python, js", familiarity: "tried it a little", goal: "a CLI todo app", size: "medium" });
    expect(asked).toHaveLength(5);
    expect(asked.some((t) => t.includes("rust"))).toBe(true);
  });
  it("returns null as soon as a choice is cancelled", async () => {
    const { ask, asked } = scripted(["1-3 years", undefined]);
    expect(await runInterview("rust", ask)).toBeNull();
    expect(asked).toHaveLength(2);
  });
  it("treats an empty free-text answer as 'not given', not as cancel", async () => {
    const { ask } = scripted(["none yet", "", "never used it", "", "small (1-2 h)"]);
    expect(await runInterview("go", ask)).toMatchObject({ known: "", goal: "", size: "small" });
  });
});

describe("initialLevel", () => {
  const a = (experience: string, familiarity: string): InterviewAnswers => ({ experience, familiarity, known: "", goal: "", size: "small" });
  it("maps familiarity to a band and nudges by experience, clamped to 0-100", () => {
    expect(initialLevel(a("none yet", "never used it"))).toBe(5);
    expect(initialLevel(a("over 3 years", "never used it"))).toBe(25);
    expect(initialLevel(a("under a year", "tried it a little"))).toBe(45);
    expect(initialLevel(a("over 3 years", "use it regularly"))).toBe(90);
  });
  it("exposes the choice lists it scores", () => {
    expect(EXPERIENCE).toEqual(["none yet", "under a year", "1-3 years", "over 3 years"]);
    expect(FAMILIARITY).toEqual(["never used it", "tried it a little", "use it regularly"]);
    expect(SIZES).toEqual(["small (1-2 h)", "medium (half a day)", "large (1-2 days)"]);
  });
});
