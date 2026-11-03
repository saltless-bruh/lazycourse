import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { stepUpOffered, missingForStepUp, parsePlan, piecesMatch, referencePieces, talkPassed, unfamiliarModule, stepUpResult, brokenProgram, fixMutants, STEP_UP_LANGUAGES, backupStepUp } from "../extensions/tutor/step-up.js";
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
  it("a method passed as a value counts as a piece (key=words.count)", () => {
    expect(referencePieces("def top(text):\n    words = text.split()\n    return max(words, key=words.count)\n", "python")).toEqual(expect.arrayContaining(["split", "max", "count"]));
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

describe("the coding test and the result (spec 2026-10-26 §6.3)", () => {
  const ok = { passed: 4, total: 4 }, three = { passed: 3, total: 4 }, two = { passed: 2, total: 4 };
  it("passes when each part passes 3 of 4 checks and the talking marks pass", () => {
    expect(stepUpResult({ solve: ok, fix: three, plan: ok }, { matched: 3, total: 3 })).toEqual({ pass: true, practise: [] });
  });
  it("names what to practise when a part or the talk falls short", () => {
    expect(stepUpResult({ solve: two, fix: ok, plan: ok }, { matched: 3, total: 3 })).toEqual({ pass: false, practise: ["looks things up"] });
    expect(stepUpResult({ solve: ok, fix: two, plan: two }, { matched: 1, total: 3 })).toEqual({ pass: false, practise: ["fixes own bugs", "turns ideas into code", "breaks a problem into steps first"] });
  });
  it("a part with no checks cannot pass", () => {
    expect(stepUpResult({ solve: { passed: 0, total: 0 }, fix: ok, plan: ok }, { matched: 3, total: 3 }).pass).toBe(false);
  });
  it("brokenProgram: the first one-character slip of the reference that fails a check", async () => {
    const ref = "def tip(total):\n    return total * 0.15\n";
    const broken = await brokenProgram(ref, async (src) => src.includes("/ 0.15"));
    expect(broken).toBe("def tip(total):\n    return total / 0.15\n");
    expect(await brokenProgram(ref, async () => false)).toBeNull();
  });
});

describe("fixMutants: bugs to plant for the fix part (phase 3 live check)", () => {
  it("off-by-one numbers and indexes, flipped booleans and equality, and the operator slips", () => {
    expect(fixMutants("def first(items):\n    return items[0]\n")).toContain("def first(items):\n    return items[1]\n");
    expect(fixMutants("def f(x):\n    return x == 2\n")).toEqual(expect.arrayContaining(["def f(x):\n    return x != 2\n", "def f(x):\n    return x == 3\n"]));
    expect(fixMutants("def f():\n    return True\n")).toContain("def f():\n    return False\n");
    expect(fixMutants("def tip(t):\n    return t * 0.15\n")).toContain("def tip(t):\n    return t / 0.15\n");
  });
  it("never inside strings or comments", () => {
    expect(fixMutants("def f():\n    return 'item 0'  # take 0\n")).toEqual([]);
  });
  it("brokenProgram finds a bug for a one-line index solution", async () => {
    expect(await brokenProgram("def first(items):\n    return items[0]\n", async (src) => src.includes("items[1]"))).toBe("def first(items):\n    return items[1]\n");
  });
});

describe("final review (phase 3)", () => {
  const ref = "def top_word(text):\n    words = text.split()\n    best = None\n    for w in words:\n        if best is None or words.count(w) > words.count(best):\n            best = w\n    return best\n\n\nif __name__ == '__main__':\n    print(top_word(input()))\n";
  it("I3: control keywords alone never pass the talking test", () => {
    expect(talkPassed(piecesMatch(["for", "return"], ref, "python"))).toBe(false);
    expect(piecesMatch(["for", "if", "split", "count"], ref, "python")).toEqual({ matched: 2, total: 2 });
  });
  it("I3: names only used to run the file as a program are not pieces", () => {
    expect(referencePieces(ref, "python")).not.toContain("print");
    expect(referencePieces(ref, "python")).not.toContain("input");
  });
  it("I7: the step-up runs only where the coding test's files can be checked one by one", () => {
    expect([...STEP_UP_LANGUAGES].sort()).toEqual(["lua", "python"]);
  });
});

describe("backupStepUp (final review C1: never overwrite the learner's step-up work)", () => {
  it("moves an existing stepup/ aside and returns its new name; nothing to move gives null", () => {
    const root = mkdtempSync(join(tmpdir(), "su-"));
    expect(backupStepUp(root, 1000)).toBeNull();
    mkdirSync(join(root, "stepup"));
    writeFileSync(join(root, "stepup", "solve.py"), "mine\n");
    expect(backupStepUp(root, 1000)).toBe("stepup.before-1000");
    expect(existsSync(join(root, "stepup"))).toBe(false);
    expect(readFileSync(join(root, "stepup.before-1000", "solve.py"), "utf8")).toBe("mine\n");
  });
});
