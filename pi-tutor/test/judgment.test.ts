import { describe, it, expect } from "vitest";
import { parseJudgment, toJudgment, isJudgmentTool } from "../extensions/tutor/judgment.js";

const block = (json: string) => "Some explanation.\n\n```tutor-judgment\n" + json + "\n```\n";

describe("parseJudgment", () => {
  it("parses a well-formed trailing block", () => {
    const j = parseJudgment(block('{"judgment":"correct","concept_tags":["ownership"],"task_done_ids":["P1.T1"],"episode_closed":true}'));
    expect(j).toEqual({ judgment: "correct", concept_tags: ["ownership"], task_done_ids: ["P1.T1"], episode_closed: true, step_done: false });
  });
  it("fills missing optional fields with defaults", () => {
    expect(parseJudgment(block('{"judgment":"partial"}'))).toEqual({ judgment: "partial", concept_tags: [], task_done_ids: [], episode_closed: false, step_done: false });
  });
  it("returns null when there is no block", () => {
    expect(parseJudgment("just prose")).toBeNull();
    expect(parseJudgment("```python\n{\"judgment\":\"correct\"}\n```")).toBeNull(); // a code block is not a judgment (json/untagged fences are: fallbacks)
  });
  it("returns null on malformed JSON; an unknown judgment value reads as none (iteration 4)", () => {
    expect(parseJudgment(block("{judgment: correct}"))).toBeNull();
    expect(parseJudgment(block('{"judgment":"excellent"}'))?.judgment).toBe("none");
    expect(parseJudgment(block('"a string"'))).toBeNull();
  });
  it("uses the last block when there are several", () => {
    const text = block('{"judgment":"wrong"}') + "more\n" + block('{"judgment":"none"}');
    expect(parseJudgment(text)?.judgment).toBe("none");
  });
  it("drops non-string entries from the tag arrays", () => {
    const j = parseJudgment(block('{"judgment":"correct","concept_tags":["a",1,null],"task_done_ids":[2,"P1.T2"]}'));
    expect(j?.concept_tags).toEqual(["a"]);
    expect(j?.task_done_ids).toEqual(["P1.T2"]);
  });
});

describe("judgment fallbacks (live findings: nemotron)", () => {
  it("reads step_done, defaulting to false", () => {
    expect(parseJudgment(block('{"judgment":"none","step_done":true}'))?.step_done).toBe(true);
    expect(parseJudgment(block('{"judgment":"none"}'))?.step_done).toBe(false);
  });
  it("accepts a json fence or an untagged fence holding the judgment object", () => {
    expect(parseJudgment('hint\n```json\n{"judgment":"partial","concept_tags":["a"]}\n```')?.judgment).toBe("partial");
    expect(parseJudgment('hint\n```\n{"judgment":"wrong"}\n```')?.judgment).toBe("wrong");
  });
  it("accepts a bare trailing JSON object with a judgment key", () => {
    expect(parseJudgment('Try printing x.\n{"judgment":"none","concept_tags":["debugging"]}\n')?.concept_tags).toEqual(["debugging"]);
  });
  it("prefers the tagged fence over the fallbacks, and ignores unrelated JSON", () => {
    expect(parseJudgment('```json\n{"judgment":"wrong"}\n```\n' + block('{"judgment":"none"}'))?.judgment).toBe("none");
    expect(parseJudgment('```json\n{"name":"x"}\n```')).toBeNull();
    expect(parseJudgment('a dict like {"a": 1} in prose')).toBeNull();
  });
  it("turns a tool call's arguments into a judgment", () => {
    expect(isJudgmentTool("tutor-judgment")).toBe(true);
    expect(isJudgmentTool("tutor_judgment")).toBe(true);
    expect(isJudgmentTool("read")).toBe(false);
    expect(toJudgment({ judgment: "partial", concept_tags: ["x"] })).toEqual({ judgment: "partial", concept_tags: ["x"], task_done_ids: [], episode_closed: false, step_done: false });
  });
});

describe("an invented judgment value reads as none (skill-eval iteration 4, user 2026-10-15)", () => {
  it("keeps the block's tags and flags instead of dropping it", () => {
    expect(toJudgment({ judgment: "concept", concept_tags: ["borrowing"], episode_closed: true })).toEqual({ judgment: "none", concept_tags: ["borrowing"], task_done_ids: [], episode_closed: true, step_done: false });
    expect(toJudgment({ judgment: "great" })?.judgment).toBe("none");
  });
  it("parses the real iteration-4 block", () => {
    const text = 'In short: an immutable borrow blocks a later mutable one.\n\n```tutor-judgment\n{"judgment":"concept","concept_tags":["borrowing","lifetimes"],"task_done_ids":[],"episode_closed":false,"step_done":false}\n```';
    expect(parseJudgment(text)).toMatchObject({ judgment: "none", concept_tags: ["borrowing", "lifetimes"] });
  });
  it("still rejects a block with no judgment string at all", () => {
    expect(toJudgment({ concept_tags: ["x"] })).toBeNull();
    expect(toJudgment({ judgment: 3 })).toBeNull();
    expect(toJudgment(null)).toBeNull();
  });
});

describe("M6c: judgment fence parity", () => {
  it("reads a ~~~ or indented tutor-judgment fence like compliance does", () => {
    expect(parseJudgment('x\n~~~tutor-judgment\n{"judgment":"wrong"}\n~~~\n')?.judgment).toBe("wrong");
    expect(parseJudgment('1. x\n   ```tutor-judgment\n   {"judgment":"partial"}\n   ```\n')?.judgment).toBe("partial");
  });
  it("still reads the sloppy forms weak models emit (M6c I3 regression)", () => {
    expect(parseJudgment('ok\n```tutor-judgment\n{"judgment":"none"}```')?.judgment).toBe("none"); // closing fence on the JSON line
    expect(parseJudgment('ok ```tutor-judgment\n{"judgment":"partial"}\n```')?.judgment).toBe("partial"); // fence opened mid-line
    expect(parseJudgment('ok ```json\n{"judgment":"wrong"}```')?.judgment).toBe("wrong"); // untagged, both sloppy
  });
  it("prefers a well-formed tagged fence over a sloppy one", () => {
    const t = 'a ```tutor-judgment\n{"judgment":"wrong"}```\n```tutor-judgment\n{"judgment":"correct"}\n```\n';
    expect(parseJudgment(t)?.judgment).toBe("correct");
  });
});
