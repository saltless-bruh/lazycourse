import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseExamArgs, checkExam, renderBrief, nextExamId, makeExam, LIMIT_MIN } from "../extensions/tutor/exam/make.js";
import { loadPack, vocabOf } from "../extensions/tutor/packs.js";
import { realExec } from "./fake-pi.js";
import { BWRAP_PROBE, SANDBOX_MISSING } from "../extensions/tutor/exam/sandbox.js";
import { PY_EXAM } from "./exam-fixtures.js";

const vocab = vocabOf(loadPack("python"));

describe("parseExamArgs", () => {
  it("parses the sandbox switch", () => {
    expect(parseExamArgs("sandbox")).toEqual({ kind: "sandbox", mode: null });
    expect(parseExamArgs("sandbox off")).toEqual({ kind: "sandbox", mode: "off" });
    expect(parseExamArgs(" sandbox  on ")).toEqual({ kind: "sandbox", mode: "on" });
    expect(parseExamArgs("sandbox maybe")).toEqual({ kind: "usage" });
  });
  it("defaults to small; a size word, then a topic; check and off", () => {
    expect(parseExamArgs("")).toEqual({ kind: "start", size: "small", topic: null });
    expect(parseExamArgs("medium")).toEqual({ kind: "start", size: "medium", topic: null });
    expect(parseExamArgs("medium list comprehensions")).toEqual({ kind: "start", size: "medium", topic: "list comprehensions" });
    expect(parseExamArgs("dicts")).toEqual({ kind: "start", size: "small", topic: "dicts" });
    expect(parseExamArgs(" check ")).toEqual({ kind: "check" });
    expect(parseExamArgs("off")).toEqual({ kind: "off" });
    expect(LIMIT_MIN).toEqual({ small: 20, medium: 45 });
  });
});

describe("checkExam", () => {
  it("accepts a well-formed exam and maps its concepts to the vocabulary", () => {
    expect(checkExam({ ...PY_EXAM, concepts: ["KeyError", "strings"] }, vocab).concepts).toEqual(["dicts", "strings"]);
  });
  it("rejects ids out of order, a requirement no test names, unknown concepts, empty fields", () => {
    expect(() => checkExam({ ...PY_EXAM, requirements: [{ id: "R2", text: "x" }, { id: "R1", text: "y" }] }, vocab)).toThrow(/R1, R2/);
    expect(() => checkExam({ ...PY_EXAM, tests: PY_EXAM.tests.replace("test_r2", "test_x") }, vocab)).toThrow(/no test for R2/);
    expect(() => checkExam({ ...PY_EXAM, concepts: ["monads"] }, vocab)).toThrow(/Concept tags/);
    expect(() => checkExam({ ...PY_EXAM, stub: "" }, vocab)).toThrow(/stub/);
    expect(() => checkExam({ ...PY_EXAM, requirements: [PY_EXAM.requirements[0]] }, vocab)).toThrow(/2 to 6/);
  });
});

describe("renderBrief and nextExamId", () => {
  it("the brief names the files, the commands and the grading, never 'rung'", () => {
    const b = renderBrief(PY_EXAM, { id: "01-word-frequency", language: "python", size: "small", minutes: 20, topic: "dicts" });
    expect(b).toMatch(/^# Exam 01-word-frequency: Word frequency\n/);
    expect(b).toContain("python · small · 20 minutes · topic: dicts");
    expect(b).toContain("- **R2** words are compared lowercase");
    expect(b).toContain("`exam/01-word-frequency/solution.py`");
    expect(b).toContain(":TutorExam check");
    expect(b).toContain(":TutorSubmit");
    expect(b).not.toMatch(/rung/i);
  });
  it("numbers exams after the highest existing one", () => {
    const root = mkdtempSync(join(tmpdir(), "exid-"));
    expect(nextExamId(root, "Word frequency")).toBe("01-word-frequency");
    mkdirSync(join(root, "exam", "07-old"), { recursive: true });
    expect(nextExamId(root, "Parse CSV!")).toBe("08-parse-csv");
  });
});

describe("makeExam (D5: the tests must fail, not break, against the stub)", () => {
  const deps = (replies: string[], root = mkdtempSync(join(tmpdir(), "mk-"))) => ({
    root, complete: async () => replies.shift() ?? "", exec: realExec, system: "s", prompt: "p",
    language: "python", vocab, size: "small" as const, topic: null,
  });
  it("writes the brief, stub and tests, probes them, returns the exam", async () => {
    const d = deps([JSON.stringify(PY_EXAM)]);
    const m = await makeExam(d);
    expect(m.id).toBe("01-word-frequency");
    expect(m.dir).toBe("exam/01-word-frequency");
    expect(readdirSync(join(d.root, m.dir)).filter((f) => f !== "__pycache__").sort()).toEqual(["brief.md", "solution.py", "test_examples.py"]);
    expect(readFileSync(join(d.root, m.dir, "brief.md"), "utf8")).toContain("Word frequency");
  });
  it("a broken test file is removed and asked for again (Review Focus #1)", async () => {
    const broken = { ...PY_EXAM, tests: PY_EXAM.tests.replace("from solution import count_words", "from solution import nope") };
    const seen: string[] = [];
    const d = { ...deps([]), complete: async (_s: string, u: string) => { seen.push(u); return seen.length === 1 ? JSON.stringify(broken) : JSON.stringify(PY_EXAM); } };
    const m = await makeExam(d);
    expect(seen[1]).toMatch(/do not compile or load/);
    expect(readdirSync(join(d.root, "exam"))).toEqual([m.id]);
  });
  it("two bad exams: a clear error and no folder left (Review Focus #1)", async () => {
    const solved = { ...PY_EXAM, stub: "def count_words(text):\n    out = {}\n    for w in text.lower().split():\n        out[w] = out.get(w, 0) + 1\n    return out\n" };
    const d = deps([JSON.stringify(solved), JSON.stringify(solved)]);
    await expect(makeExam(d)).rejects.toThrow(/rejected twice: .*pass against the stub/);
    expect(existsSync(join(d.root, "exam")) ? readdirSync(join(d.root, "exam")) : []).toEqual([]);
  });
  it("a missing toolchain fails at once with a clear message, without asking the model again (final review I1)", async () => {
    let calls = 0;
    const d = { ...deps([]), complete: async () => { calls++; return JSON.stringify(PY_EXAM); }, exec: async () => ({ stdout: "", stderr: "", code: 1, killed: false }) };
    await expect(makeExam(d)).rejects.toThrow(/could not run python3/);
    expect(calls).toBe(1);
    expect(existsSync(join(d.root, "exam"))).toBe(false);
  });
  it("hands the sandbox to the probe run: bwrap is checked first (plan 2026-10-16)", async () => {
    const ran: [string, string[]][] = [];
    const exec = async (c: string, a: string[]) => { ran.push([c, a]); return { stdout: "", stderr: "", code: 1, killed: false }; };
    const d = { ...deps([JSON.stringify(PY_EXAM)]), exec, sandbox: { env: process.env, home: "/home/nobody", cacheDir: mkdtempSync(join(tmpdir(), "sbx-cache-")) } };
    await expect(makeExam(d)).rejects.toThrow(SANDBOX_MISSING);
    expect(ran[0]).toEqual(BWRAP_PROBE);
  });
});
