import { describe, it, expect } from "vitest";
import { newOnboarding, parseIntake, applyTurn, missing, needsFallback, levelFrom, onboardPrompt, selfScoreNeeded, checkInOnboarding, stripIntake, type Onboarding } from "../extensions/tutor/onboard.js";
import { scrubInternals } from "../extensions/tutor/compliance.js";

const fence = (o: object) => "Nice to meet you! What would you like to build?\n\n```tutor-intake\n" + JSON.stringify(o) + "\n```\n";

describe("the hidden intake note (spec 2026-10-19 §6)", () => {
  it("reads the last tutor-intake fence and keeps only known, valid fields", () => {
    expect(parseIntake(fence({ experience: "none yet", known: ["Python"], selfScore: 7, extra: 1 }))).toEqual({ experience: "none yet", known: ["python"], selfScore: 7 });
    expect(parseIntake(fence({ experience: "a" }) + fence({ experience: "1-3 years" }))).toEqual({ experience: "1-3 years" });
  });
  it("drops a target that is not one of the six languages (the pytutor-architect case)", () => {
    expect(parseIntake(fence({ target: "pytutor-architect" }))).toEqual({});
    expect(parseIntake(fence({ target: "Rust" }))).toEqual({ target: "rust" });
  });
  it("drops a self-score that is not a whole number from 1 to 10", () => {
    expect(parseIntake(fence({ selfScore: 11 }))).toEqual({});
    expect(parseIntake(fence({ selfScore: 6.5 }))).toEqual({});
  });
  it("normalises experience to the four bands", () => {
    expect(parseIntake(fence({ experience: "I have never coded" }))).toEqual({ experience: "none yet" });
    expect(parseIntake(fence({ experience: "about 6 months" }))).toEqual({ experience: "under a year" });
    expect(parseIntake(fence({ experience: "over 5 years" }))).toEqual({ experience: "over 3 years" });
  });
  it("broken JSON or no fence is no note", () => {
    expect(parseIntake("```tutor-intake\n{\"experience\":\n```")).toBeNull();
    expect(parseIntake("just chatting")).toBeNull();
  });
  it("the fence never reaches the learner; the judgment fence is left alone", () => {
    const shown = scrubInternals(fence({ experience: "none yet" }) + "\n```tutor-judgment\n{\"judgment\":\"none\"}\n```\n");
    expect(shown).not.toMatch(/tutor-intake|experience/);
    expect(shown).toContain("```tutor-judgment");
  });
});

describe("onboarding state (spec 2026-10-19 §5, §6, Q1, Q6)", () => {
  it("someone who knows no language gets Python from the code, and no self-score is asked", () => {
    const o = applyTurn(newOnboarding(null), { experience: "none yet", known: [] });
    expect(o.fields.target).toBe("python");
    expect(o.targetByCode).toBe(true);
    expect(missing(o)).toEqual(["idea"]);
  });
  it("someone who names a language is asked for a self-score", () => {
    const o = applyTurn(newOnboarding(null), { experience: "1-3 years", known: ["python"], target: "rust" });
    expect(missing(o)).toEqual(["selfScore", "idea"]);
    expect(missing(applyTurn(newOnboarding("rust"), { experience: "none yet", known: [] }))).toContain("selfScore");
  });
  it("two missing notes or six exchanges hand over to the code's own questions (Review Focus #1)", () => {
    let o = newOnboarding(null);
    o = applyTurn(applyTurn(o, null), null);
    expect(o.badNotes).toBe(2);
    expect(needsFallback(o)).toBe(true);
    let p = newOnboarding(null);
    for (let i = 0; i < 6; i++) p = applyTurn(p, {});
    expect(needsFallback(p)).toBe(true);
    expect(needsFallback(applyTurn(newOnboarding(null), {}))).toBe(false);
  });
  it("the build/learn choice is asked only at the choose stage", () => {
    const o: Onboarding = { ...applyTurn(newOnboarding(null), { experience: "none yet", known: [], idea: null }) };
    expect(missing(o)).toEqual([]);
    expect(missing({ ...o, stage: "choose" })).toEqual(["path"]);
  });
  it("the level rises with experience, self-score and a passed check", () => {
    const base = (f: Onboarding["fields"], check: boolean | null = null) => levelFrom({ ...newOnboarding(null), fields: f, levelCheck: check === null ? null : { task: "1-leap", passed: check } });
    expect(base({ experience: "none yet" })).toBeLessThan(base({ experience: "over 3 years" }));
    expect(base({ experience: "1-3 years", selfScore: 3 })).toBeLessThan(base({ experience: "1-3 years", selfScore: 8 }));
    expect(base({ experience: "1-3 years", selfScore: 6 }, false)).toBeLessThan(base({ experience: "1-3 years", selfScore: 6 }, true));
    for (const l of [base({ experience: "none yet", selfScore: 1 }, false), base({ experience: "over 3 years", selfScore: 10 }, true)]) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(100);
    }
  });
  it("the per-turn section names what is known, what is missing and the note format", () => {
    const o = applyTurn(newOnboarding(null), { experience: "none yet", known: [] });
    const s = onboardPrompt(o);
    expect(s).toMatch(/experience: none yet/);
    expect(s).toMatch(/still to find out: idea/);
    expect(s).toMatch(/```tutor-intake/);
    expect(s).toMatch(/python/i);
  });
  it("a learner below 5 on their named language gets technical questions, not a coding task (Q7)", () => {
    const low = applyTurn(newOnboarding("rust"), { experience: "under a year", known: ["rust"], selfScore: 3 });
    expect(onboardPrompt(low)).toMatch(/one or two short technical questions/i);
    const high = applyTurn(newOnboarding("rust"), { experience: "1-3 years", known: ["rust"], selfScore: 7 });
    expect(onboardPrompt(high)).not.toMatch(/technical questions/i);
  });
});

describe("onboarding, Task 6 additions (Q7, Q9)", () => {
  it("a self-score below 5 keeps the talk open for two exchanges of technical questions", () => {
    let o = applyTurn(newOnboarding("rust"), { experience: "under a year", known: ["rust"], selfScore: 3, idea: null });
    expect(missing(o)).toEqual(["probe"]);
    o = applyTurn(o, {});
    expect(missing(o)).toEqual(["probe"]);
    o = applyTurn(o, {});
    expect(missing(o)).toEqual([]);
  });
  it("a learner at 5 or above has no probe; the level task replaces it", () => {
    const o = applyTurn(newOnboarding("rust"), { experience: "1-3 years", known: ["rust"], selfScore: 6, idea: null });
    expect(missing(o)).toEqual([]);
    expect(selfScoreNeeded(o)).toBe(true);
  });
  it("a check-in (second /tutor-start) asks only for what to do next", () => {
    const o = checkInOnboarding("python", { level: 40, known: ["python"], last: "Monthly Expense Logger", due: ["loops"] });
    expect(missing(o)).toEqual(["idea"]);
    expect(o.level).toBe(40);
    const s = onboardPrompt(o);
    expect(s).toMatch(/check-in/i);
    expect(s).toContain("Monthly Expense Logger");
    expect(s).toContain("loops");
  });
  it("the check stage tells the model where the task is and how to run it", () => {
    const o = { ...applyTurn(newOnboarding("rust"), { experience: "1-3 years", known: ["rust"], selfScore: 7, idea: null }), stage: "check" as const, levelCheck: { task: "2-raindrops", passed: null } };
    expect(onboardPrompt(o)).toMatch(/\/tutor-start check/);
  });
});

describe("live check 2026-10-19: a weak model copies the example note", () => {
  it("the note example carries no sample answers to copy", () => {
    const s = onboardPrompt(newOnboarding(null));
    expect(s).not.toMatch(/"selfScore":\s*\d|"path":\s*"(learn|build)"|"idea":\s*null|"confidence":\s*"/);
    expect(s).toMatch(/only what the learner told you/i);
  });
  it("ignores fields the code did not ask for: path before the choose stage, a self-score nobody needs", () => {
    const o = applyTurn(newOnboarding(null), { experience: "none yet", known: [], selfScore: 6, path: "learn" });
    expect(o.fields.path).toBeUndefined();
    expect(o.fields.selfScore).toBeUndefined();
    expect(applyTurn({ ...o, stage: "choose" }, { path: "build" }).fields.path).toBe("build");
  });
  it("python written by the model for someone who knows no language stays the code's pick (no self-score)", () => {
    const o = applyTurn(newOnboarding(null), { experience: "none yet", known: [], target: "python" });
    expect(o.targetByCode).toBe(true);
    expect(missing(o)).toEqual(["idea"]);
    const rust = applyTurn(newOnboarding(null), { experience: "none yet", known: [], target: "rust" });
    expect(rust.targetByCode).toBe(false);
    expect(missing(rust)).toContain("selfScore");
  });
});

describe("malformed notes from the live check (2026-10-19)", () => {
  const tagOnNextLine = "Does that sound right?\n```\n  tutor-intake\n  {\"experience\": \"none yet\"}\n```\n";
  const singleBacktick = "Build now or learn first?\n`tutor-intake\n{\"path\": \"learn\", \"note\": \"a {brace} in text\"}\n";
  it("reads a note whose tag sits on the line after the fence, or that opens with one backtick", () => {
    expect(parseIntake(tagOnNextLine)).toEqual({ experience: "none yet" });
    expect(parseIntake(singleBacktick)).toEqual({ path: "learn" });
  });
  it("the learner sees neither shape", () => {
    expect(scrubInternals(tagOnNextLine)).toBe("Does that sound right?\n");
    expect(scrubInternals(singleBacktick)).toBe("Build now or learn first?\n");
  });
});

describe("more note shapes from the live check (2026-10-19, round 3)", () => {
  it("a bare tag line, or [tutor-intake], followed by the object", () => {
    expect(parseIntake("Build now or learn first?\ntutor-intake\n{\"path\": \"learn\"}\n")).toEqual({ path: "learn" });
    expect(stripIntake("Questions?\n[tutor-intake]\n{}\n")).toBe("Questions?\n");
    expect(stripIntake("End every reply with the tutor-intake note.\n")).toBe("End every reply with the tutor-intake note.\n");
  });
});

describe("final review", () => {
  it("'none' in the known list means no language (minor 2 → Important: Q1's Python pick)", () => {
    for (const w of ["none", "nothing", "no", "n/a"]) expect(parseIntake(fence({ known: [w] }))).toEqual({ known: [] });
    const o = applyTurn(newOnboarding(null), parseIntake(fence({ experience: "none yet", known: ["None"] })));
    expect(o.fields.target).toBe("python");
  });
});
