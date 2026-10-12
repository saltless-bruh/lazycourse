import { describe, it, expect } from "vitest";
import { openEpisode, nextRung, applyJudgment, closeEpisode, rebandEpisode, rungCap, describeTrigger, RUNG_NAMES } from "../extensions/tutor/ladder.js";
import type { Judgment } from "../extensions/tutor/judgment.js";

const j = (judgment: Judgment["judgment"], over: Partial<Judgment> = {}): Judgment =>
  ({ judgment, concept_tags: [], task_done_ids: [], episode_closed: false, ...over });
const err = { kind: "error" as const, path: "/p/src/a.py", line: 3, msg: "boom" };

describe("openEpisode", () => {
  it("starts at the band's start rung with no turns", () => {
    expect(openEpisode(err, "beginner", 1000)).toEqual({ id: "ep-1000", trigger: err, band: "beginner", rung: 3, opened: 1000, turns: 0, concept_tags: [] });
    expect(openEpisode({ kind: "chat" }, "intermediate", 1).rung).toBe(2);
    expect(openEpisode({ kind: "chat" }, "pro", 1).rung).toBe(1);
  });
});

describe("nextRung", () => {
  it("advances one rung only on correct", () => {
    expect(nextRung(2, "correct", "intermediate")).toBe(3);
    for (const v of ["partial", "wrong", "none"] as const) expect(nextRung(2, v, "intermediate")).toBe(2);
  });
  it("caps at 5, and at 4 for pro", () => {
    expect(rungCap("beginner")).toBe(5);
    expect(rungCap("intermediate")).toBe(5);
    expect(rungCap("pro")).toBe(4);
    expect(nextRung(5, "correct", "beginner")).toBe(5);
    expect(nextRung(4, "correct", "pro")).toBe(4);
  });
  it("never reaches rung 5 from wrong", () => {
    expect(nextRung(4, "wrong", "beginner")).toBe(4);
  });
});

describe("applyJudgment", () => {
  it("counts the turn, merges concept tags, advances on correct, holds otherwise", () => {
    const ep = openEpisode(err, "intermediate", 1);
    const a = applyJudgment(ep, j("correct", { concept_tags: ["types"] }), 2);
    const b = applyJudgment(a, j("wrong", { concept_tags: ["types", "casts"] }), 3);
    expect([a.rung, b.rung]).toEqual([3, 3]);
    expect(b.turns).toBe(2);
    expect(b.concept_tags).toEqual(["types", "casts"]);
    expect(b.closed).toBeUndefined();
    expect(ep.rung).toBe(2); // input not mutated
  });
  it("closes the episode when the model sets episode_closed", () => {
    const c = applyJudgment(openEpisode(err, "pro", 1), j("correct", { episode_closed: true }), 9);
    expect(c).toMatchObject({ rung: 2, turns: 1, closed: 9, closeReason: "judged" });
  });
});

describe("closeEpisode / rebandEpisode", () => {
  it("stamps close time and reason", () => {
    expect(closeEpisode(openEpisode(err, "pro", 1), "cleared", 5)).toMatchObject({ closed: 5, closeReason: "cleared" });
  });
  it("re-caps the rung when the level moves into pro", () => {
    const ep = { ...openEpisode(err, "beginner", 1), rung: 5 };
    expect(rebandEpisode(ep, "pro")).toMatchObject({ band: "pro", rung: 4 });
    expect(rebandEpisode({ ...ep, rung: 2 }, "pro").rung).toBe(2);
  });
});

describe("describeTrigger", () => {
  it("names the trigger with the file's basename", () => {
    expect(describeTrigger(err)).toBe('error "boom" at a.py:3');
    expect(describeTrigger({ kind: "idle", path: "/p/b.rs", line: 7 })).toBe("idle at b.rs:7");
    expect(describeTrigger({ kind: "churn", path: "/p/c.go", region: [21, 40] })).toBe("rewriting c.go:21-40");
    expect(describeTrigger({ kind: "chat" })).toBe("learner question");
    expect(RUNG_NAMES).toEqual(["question", "concept", "pointer", "pseudocode", "reveal"]);
  });
});
