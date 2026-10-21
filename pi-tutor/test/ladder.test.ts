import { describe, it, expect } from "vitest";
import { easeDelay, attemptScore, yieldsTo, openEpisode, applyJudgment, closeEpisode, describeTrigger, stepFor, recordAttempt, restoreAttempts, STAGES, type CloseReason, type Episode } from "../extensions/tutor/ladder.js";
import type { Judgment } from "../extensions/tutor/judgment.js";
import type { Band } from "../extensions/tutor/policy.js";

const j = (judgment: Judgment["judgment"], over: Partial<Judgment> = {}): Judgment =>
  ({ judgment, concept_tags: [], task_done_ids: [], episode_closed: false, step_done: false, ...over });
const err = { kind: "error" as const, path: "/p/src/a.py", line: 3, msg: "boom" };

describe("openEpisode", () => {
  it("starts with no failed attempts and no turns", () => {
    expect(openEpisode(err, "beginner", 1000)).toEqual({ id: "ep-1000", trigger: err, band: "beginner", attempts: 0, opened: 1000, turns: 0, concept_tags: [] });
  });
});

describe("stepFor (spec 2026-10-21 §5)", () => {
  const ep = (band: Band, attempts: number, extra: Partial<Episode> = {}) => ({ ...openEpisode({ kind: "chat" }, band, 0), attempts, ...extra });
  it("beginner: teach, hint, why, ask, then the fix", () => {
    expect([0, 1, 2, 3, 4, 7].map((n) => stepFor(ep("beginner", n), { exam: false }))).toEqual(["teach", "hint", "why", "ask", "fix", "fix"]);
  });
  it("intermediate takes longer to reach the fix", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => stepFor(ep("intermediate", n), { exam: false }))).toEqual(["hint", "hint", "why", "why", "ask", "fix"]);
  });
  it("pro: after the question it keeps explaining; the fix only when asked for", () => {
    expect([1, 2, 3, 4, 9].map((n) => stepFor(ep("pro", n), { exam: false }))).toEqual(["hint", "why", "ask", "why", "why"]);
    expect(stepFor(ep("pro", 4, { fixAsked: true }), { exam: false })).toBe("fix");
  });
  it("a well-known concept (delay 1) reaches each later step one attempt later", () => {
    expect([1, 2, 3, 4, 5].map((n) => stepFor(ep("beginner", n, { delay: 1 }), { exam: false }))).toEqual(["hint", "hint", "why", "ask", "fix"]);
  });
  it("during an exam nothing goes past why", () => {
    expect(stepFor(ep("beginner", 6), { exam: true })).toBe("why");
    expect(stepFor(ep("beginner", 3), { exam: true })).toBe("why");
    expect(stepFor(null, { exam: true })).toBe("teach");
  });
  it("the stage table is the spec's", () => {
    expect(STAGES).toEqual({ beginner: { hint: 1, why: 2, ask: 3, fix: 4 }, intermediate: { hint: 1, why: 3, ask: 5, fix: 6 }, pro: { hint: 1, why: 2, ask: 3, fix: null } });
  });
});

describe("recordAttempt", () => {
  const base = { ...openEpisode({ kind: "chat" }, "beginner", 0), attempts: 0 };
  it("counts changed code on the same spot, ignores an unchanged rerun, restarts on a new spot", () => {
    const a = recordAttempt(base, { spot: "ZeroDivisionError", hash: "h1" });
    expect(a.attempts).toBe(1);
    expect(recordAttempt(a, { spot: "ZeroDivisionError", hash: "h1" }).attempts).toBe(1);
    expect(recordAttempt(a, { spot: "ZeroDivisionError", hash: "h2" }).attempts).toBe(2);
    expect(recordAttempt(a, { spot: "NameError", hash: "h3" })).toMatchObject({ attempts: 1, spot: "NameError" });
  });
});

describe("attemptScore", () => {
  it("1 without failed attempts, lower the more it took, null when superseded", () => {
    const e = (attempts: number, closeReason?: CloseReason) => ({ ...openEpisode({ kind: "chat" }, "beginner", 0), attempts, closeReason });
    expect(attemptScore(e(0, "run_passed"))).toBe(1);
    expect(attemptScore(e(4, "run_passed"))).toBeCloseTo(0.2);
    expect(attemptScore(e(2, "superseded"))).toBeNull();
  });
});

describe("restoreAttempts (Review Focus #3)", () => {
  it("an episode saved with a rung and no attempts loads as attempts 0", () => {
    expect(restoreAttempts({ id: "ep-1", trigger: { kind: "chat" }, band: "beginner", rung: 3, opened: 1, turns: 2, concept_tags: [] })).toMatchObject({ attempts: 0 });
    expect(restoreAttempts({ id: "ep-1", trigger: { kind: "chat" }, band: "beginner", rung: 3, opened: 1, turns: 2, concept_tags: [], closed: 5 })).toBeNull();
    expect(restoreAttempts({ id: "ep-2", trigger: { kind: "chat" }, band: "pro", attempts: 2, opened: 1, turns: 0, concept_tags: [] })).toMatchObject({ attempts: 2 });
    expect(restoreAttempts({ nonsense: true })).toBeNull();
  });
});

describe("applyJudgment", () => {
  it("counts the turn and merges concept tags; correct no longer moves help", () => {
    const ep = { ...openEpisode(err, "intermediate", 1), attempts: 2 };
    const a = applyJudgment(ep, j("correct", { concept_tags: ["types"] }), 2);
    const b = applyJudgment(a, j("wrong", { concept_tags: ["types", "casts"] }), 3);
    expect([a.attempts, b.attempts]).toEqual([2, 2]);
    expect(b.turns).toBe(2);
    expect(b.concept_tags).toEqual(["types", "casts"]);
    expect(b.closed).toBeUndefined();
  });
  it("closes the episode when the model sets episode_closed", () => {
    expect(applyJudgment(openEpisode(err, "pro", 1), j("correct", { episode_closed: true }), 9)).toMatchObject({ turns: 1, closed: 9, closeReason: "judged" });
  });
});

describe("run episodes close only when a run passes (live check 2026-10-21)", () => {
  it("the model's episode_closed does not close a run episode", () => {
    const run = { ...openEpisode({ kind: "run", cmd: ["lua", "check.lua"], code: 1, trace: "x" }, "beginner", 1), attempts: 4 };
    expect(applyJudgment(run, j("correct", { episode_closed: true }), 9).closed).toBeUndefined();
  });
});

describe("closeEpisode", () => {
  it("stamps close time and reason", () => {
    expect(closeEpisode(openEpisode(err, "pro", 1), "cleared", 5)).toMatchObject({ closed: 5, closeReason: "cleared" });
  });
});

describe("describeTrigger", () => {
  it("names the trigger with the file's basename", () => {
    expect(describeTrigger(err)).toBe('error "boom" at a.py:3');
    expect(describeTrigger({ kind: "idle", path: "/p/b.rs", line: 7 })).toBe("idle at b.rs:7");
    expect(describeTrigger({ kind: "churn", path: "/p/c.go", region: [21, 40] })).toBe("rewriting c.go:21-40");
    expect(describeTrigger({ kind: "chat" })).toBe("learner question");
  });
});

describe("yieldsTo (pane review I1)", () => {
  it("lets an editor trigger replace no episode, a chat, an idle or a churn episode, but not an error one", () => {
    expect(yieldsTo(null)).toBe(true);
    expect(yieldsTo(openEpisode({ kind: "chat" }, "pro", 1))).toBe(true);
    expect(yieldsTo(openEpisode({ kind: "idle", path: "/p/a.py", line: 1 }, "pro", 1))).toBe(true);
    expect(yieldsTo(openEpisode({ kind: "churn", path: "/p/a.py", region: [1, 20] }, "pro", 1))).toBe(true);
    expect(yieldsTo(openEpisode(err, "pro", 1))).toBe(false);
  });
});

describe("easeDelay (spec 2026-10-21 §11a: well-known concepts reach later steps one attempt later)", () => {
  const ease = (m: Record<string, number>) => (t: string) => m[t];
  const ep0 = openEpisode({ kind: "chat" }, "beginner", 1);
  it("sets delay 1 at the first judgment when every tag is well known", () => {
    expect(easeDelay(ep0, ["traits", "generics"], ease({ traits: 0.9, generics: 0.7 })).delay).toBe(1);
  });
  it("leaves it for a weak or unknown tag, no tags, or a later turn", () => {
    expect(easeDelay(ep0, ["traits", "lifetimes"], ease({ traits: 0.9, lifetimes: 0.4 })).delay).toBeUndefined();
    expect(easeDelay(ep0, ["traits", "new"], ease({ traits: 0.9 })).delay).toBeUndefined();
    expect(easeDelay(ep0, [], ease({})).delay).toBeUndefined();
    expect(easeDelay({ ...ep0, turns: 1 }, ["traits"], ease({ traits: 1 })).delay).toBeUndefined();
  });
});

describe("run episodes", () => {
  const run = { kind: "run" as const, cmd: ["cargo", "run"], code: 101, trace: "thread 'main' panicked at src/main.rs:4:5" };
  it("hold their place against editor triggers and describe the failed command", () => {
    expect(yieldsTo(openEpisode(run, "beginner", 1))).toBe(false);
    expect(describeTrigger(run)).toBe("run failed (exit 101): cargo run");
  });
  it("a failed check names the task and what it gave (spec 2026-10-21 §7)", () => {
    expect(describeTrigger({ kind: "run", cmd: ["/tutor-done", "P2.T2"], code: 1, trace: "check P2.T2: split_amount(48, 3) gave 144, expected 16.0" }))
      .toBe("run failed (check P2.T2): split_amount(48, 3) gave 144, expected 16.0");
  });
});
