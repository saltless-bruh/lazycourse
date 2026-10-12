import { describe, it, expect } from "vitest";
import { extractJson, completeJson, type Complete } from "../extensions/tutor/llm.js";

describe("extractJson", () => {
  it("parses a bare object, a fenced object, and an object wrapped in prose", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here you go:\n{"a":{"b":[1,2]}}\nHope that helps.')).toEqual({ a: { b: [1, 2] } });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow(/no JSON object/);
    expect(() => extractJson("{ not json }")).toThrow();
  });
});

describe("completeJson", () => {
  const isA = (v: unknown) => {
    if (typeof v !== "object" || v === null || typeof (v as { a?: unknown }).a !== "number") throw new Error("a must be a number");
    return (v as { a: number }).a;
  };
  function replies(...texts: string[]) {
    const calls: { system: string; user: string }[] = [];
    const complete: Complete = async (system, user) => { calls.push({ system, user }); return texts.shift() ?? ""; };
    return { complete, calls };
  }

  it("returns the checked value on the first good reply", async () => {
    const { complete, calls } = replies('{"a":3}');
    expect(await completeJson(complete, "S", "U", isA)).toBe(3);
    expect(calls).toEqual([{ system: "S", user: "U" }]);
  });
  it("retries once with the rejection reason, then succeeds", async () => {
    const { complete, calls } = replies('{"a":"x"}', '{"a":4}');
    expect(await completeJson(complete, "S", "U", isA)).toBe(4);
    expect(calls).toHaveLength(2);
    expect(calls[1].user).toBe("U\n\nYour previous reply was rejected: a must be a number. Reply with only the corrected JSON object.");
  });
  it("gives up after the second bad reply with the last reason", async () => {
    const { complete, calls } = replies("nope", "still nope");
    await expect(completeJson(complete, "S", "U", isA)).rejects.toThrow(/rejected twice: no JSON object/);
    expect(calls).toHaveLength(2);
  });
  it("does not retry when the model call itself fails", async () => {
    let n = 0;
    const complete: Complete = async () => { n++; throw new Error("network down"); };
    await expect(completeJson(complete, "S", "U", isA)).rejects.toThrow("network down");
    expect(n).toBe(1);
  });
});
