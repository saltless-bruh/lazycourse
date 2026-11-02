import { describe, it, expect } from "vitest";
import { stepUpOffered, missingForStepUp, parsePlan, piecesMatch, referencePieces, talkPassed, unfamiliarModule } from "../extensions/tutor/step-up.js";
import { GATE_HABITS } from "../extensions/tutor/levels.js";

const DAY = 86_400_000;
describe("stepUpOffered (spec 2026-10-26 §6.2)", () => {
  const all = () => true;
  it("offered when every counted habit of the band is solid in this language", () => {
    expect(stepUpOffered({ band: "beginner", habitsSolidIn: all, lastOffer: null, now: 10 * DAY })).toBe(true);
    expect(stepUpOffered({ band: "beginner", habitsSolidIn: (h) => h !== "own-fixes", lastOffer: null, now: 10 * DAY })).toBe(false);
  });
  it("not twice within a day", () => {
    expect(stepUpOffered({ band: "beginner", habitsSolidIn: all, lastOffer: 10 * DAY - 1000, now: 10 * DAY })).toBe(false);
    expect(stepUpOffered({ band: "beginner", habitsSolidIn: all, lastOffer: 9 * DAY - 1, now: 10 * DAY })).toBe(true);
  });
  it("never above pro", () => {
    expect(stepUpOffered({ band: "pro", habitsSolidIn: all, lastOffer: null, now: 10 * DAY })).toBe(false);
  });
  it("missingForStepUp names the habits still to turn solid", () => {
    expect(missingForStepUp("beginner", (h) => h !== "own-fixes" && h !== "small-runs")).toEqual(["small-runs", "own-fixes"]); // the band's order
    expect(missingForStepUp("beginner", () => true)).toEqual([]);
    expect(GATE_HABITS.beginner).toContain("own-fixes");
  });
});

describe("the talking test (spec 2026-10-26 §6.3)", () => {
  it("parsePlan reads numbered steps and one pieces: line; free talk alone is not a plan", () => {
    expect(parsePlan("1. read the file\n2. split into words\n3. count each word\npieces: open, split, dict")).toEqual({ steps: ["read the file", "split into words", "count each word"], pieces: ["open", "split", "dict"] });
    expect(parsePlan("I would read the file, then split it and count with a dict")).toBeNull();
    expect(parsePlan("1. read\n2. count")).toBeNull();
  });
  it("referencePieces: calls and the main keywords of the hidden solution", () => {
    const ref = "from collections import Counter\ndef top_words(path, n):\n    with open(path) as f:\n        words = f.read().lower().split()\n    return Counter(words).most_common(n)\n";
    expect(referencePieces(ref, "python")).toEqual(expect.arrayContaining(["open", "split", "lower", "counter", "most_common", "with", "return"]));
  });
  it("piecesMatch counts named pieces found in the reference; close substitutes count", () => {
    const ref = "from collections import Counter\ndef top_words(path, n):\n    with open(path) as f:\n        words = f.read().split()\n    return Counter(words).most_common(n)\n";
    expect(piecesMatch(["open", "split", "dict", "sorted"], ref, "python")).toEqual({ matched: 4, total: 4 });
    expect(piecesMatch(["open", "regex", "socket"], ref, "python")).toEqual({ matched: 1, total: 3 });
  });
  it("talkPassed: at least 3 of every 4 named pieces, and at least 2 named", () => {
    expect(talkPassed({ matched: 3, total: 4 })).toBe(true);
    expect(talkPassed({ matched: 2, total: 4 })).toBe(false);
    expect(talkPassed({ matched: 1, total: 1 })).toBe(false);
  });
});

describe("unfamiliarModule", () => {
  it("a module from the language's list the learner's code has not imported", () => {
    expect(unfamiliarModule("python", new Set(["datetime"]))).not.toBe("datetime");
    expect(unfamiliarModule("python", new Set())).toBe("datetime");
    expect(unfamiliarModule("cobol", new Set())).toBeNull();
  });
});
