import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadLessons, levelTasks, writeExercise, checkExercise, textProblems, planRounds, type Lesson } from "../extensions/tutor/lessons.js";
import { realExec } from "./fake-pi.js";

const has = (cmd: string) => spawnSync(cmd, ["--version"]).status === 0;
function put(root: string, rel: string, text: string) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }
const STUB = "def leap(year):\n    raise NotImplementedError('write leap')\n";
const GOOD = "def leap(year):\n    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)\n";
const TESTS = "import unittest\nfrom solution import leap\n\nclass T(unittest.TestCase):\n    def test_2000(self):\n        self.assertTrue(leap(2000))\n    def test_1900(self):\n        self.assertFalse(leap(1900))\n";
function exercise(root: string, rel: string) {
  put(root, `${rel}/instructions.md`, "# Leap\nReturn whether a year is a leap year.\n");
  put(root, `${rel}/solution.py`, STUB);
  put(root, `${rel}/test_examples.py`, TESTS);
  put(root, `${rel}/.exemplar/solution.py`, GOOD);
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lessons-"));
  put(root, "python/loops/lesson.md", "---\nconcept: loops\ntitle: Loops\ntags: [loops]\nsource: exercism/python\nchecked: doctest\norder: 2\n---\nA loop repeats.\n");
  put(root, "python/basics/lesson.md", "---\nconcept: basics\ntitle: Basics\ntags: [variables]\nsource: exercism/python\norder: 1\n---\nValues have names.\n");
  exercise(root, "python/loops/1-count");
  put(root, "python/loops/2-broken/instructions.md", "no exemplar here\n");
  put(root, "python/loops/2-broken/solution.py", STUB);
  put(root, "python/loops/2-broken/test_examples.py", TESTS);
  exercise(root, "python/_levels/1-leap");
  return root;
}

describe("lessons (spec 2026-10-19 §7, §7a)", () => {
  it("loads lessons in their order, with front matter parsed and text kept", () => {
    const ls = loadLessons("python", fixture());
    expect(ls.map((l) => l.concept)).toEqual(["basics", "loops"]);
    expect(ls[1]).toMatchObject({ title: "Loops", tags: ["loops"], source: "exercism/python", order: 2, checked: "doctest" });
    expect(ls[0].checked).toBeNull();
    expect(ls[1].text).toContain("A loop repeats.");
  });
  it("skips an exercise missing its exemplar (Review Focus #3)", () => {
    const loops = loadLessons("python", fixture()).find((l) => l.concept === "loops")!;
    expect(loops.exercises.map((e) => e.id)).toEqual(["1-count"]);
  });
  it("the level ladder is separate from the lessons", () => {
    const root = fixture();
    expect(levelTasks("python", root).map((e) => e.id)).toEqual(["1-leap"]);
    expect(loadLessons("python", root).map((l) => l.concept)).not.toContain("_levels");
  });
  it("an unknown language has no lessons", () => {
    expect(loadLessons("cobol", fixture())).toEqual([]);
  });
  it("writes the exercise for the learner without the exemplar, and never outside the root", () => {
    const root = fixture();
    const ex = levelTasks("python", root)[0];
    const proj = mkdtempSync(join(tmpdir(), "proj-"));
    const written = writeExercise(proj, "learn/leap/1-leap", "python", ex);
    expect(written.map((p) => p.replace(proj + "/", "")).sort()).toEqual(["learn/leap/1-leap/instructions.md", "learn/leap/1-leap/solution.py", "learn/leap/1-leap/test_examples.py"]);
    expect(readFileSync(join(proj, "learn/leap/1-leap/solution.py"), "utf8")).toBe(STUB);
    expect(existsSync(join(proj, "learn/leap/1-leap/.exemplar"))).toBe(false);
    expect(() => writeExercise(proj, "../escape", "python", ex)).toThrow();
  });
  it("writes the layout's extra files (go.mod for go)", () => {
    const proj = mkdtempSync(join(tmpdir(), "proj-"));
    const ex = { id: "1-x", dir: "/nowhere", instructions: "# x\n", stub: "package exam\n", tests: "package exam\n", exemplar: "package exam\n", extras: [] as [string, string][] };
    writeExercise(proj, "learn/x/1-x", "go", ex);
    expect(readdirSync(join(proj, "learn/x/1-x")).sort()).toEqual(["examples_test.go", "go.mod", "instructions.md", "solution.go"]);
  });
  it.skipIf(!has("python3"))("helper files under files/ reach the learner and the check (Exercism data modules)", async () => {
    const root = fixture();
    put(root, "python/sets/1-cater/instructions.md", "# Cater\n");
    put(root, "python/sets/1-cater/solution.py", "from data import VEG\ndef veg():\n    raise NotImplementedError\n");
    put(root, "python/sets/1-cater/.exemplar/solution.py", "from data import VEG\ndef veg():\n    return VEG\n");
    put(root, "python/sets/1-cater/test_examples.py", "import unittest\nfrom solution import veg\nclass T(unittest.TestCase):\n    def test_v(self):\n        self.assertEqual(veg(), {'kale'})\n");
    put(root, "python/sets/1-cater/files/data.py", "VEG = {'kale'}\n");
    put(root, "python/sets/lesson.md", "---\nconcept: sets\norder: 3\n---\nSets.\n");
    const ex = loadLessons("python", root).find((l) => l.concept === "sets")!.exercises[0];
    expect(ex.extras).toEqual([["data.py", "VEG = {'kale'}\n"]]);
    const proj = mkdtempSync(join(tmpdir(), "proj-"));
    writeExercise(proj, "learn/sets/1-cater", "python", ex);
    expect(readFileSync(join(proj, "learn/sets/1-cater/data.py"), "utf8")).toBe("VEG = {'kale'}\n");
    const r = await checkExercise(realExec, "python", ex, null);
    expect(r.exemplar.code, r.exemplar.out).toBe(0);
    expect(r.stub.code).not.toBe(0);
  }, 30_000);
  it.skipIf(!has("python3"))("checks an exercise: the exemplar passes and the stub fails", async () => {
    const ex = levelTasks("python", fixture())[0];
    const r = await checkExercise(realExec, "python", ex, null);
    expect(r.exemplar.code, r.exemplar.out).toBe(0);
    expect(r.stub.code).not.toBe(0);
    expect(r.stub.broken).toBe(false);
  }, 30_000);
});

describe("lesson text checks (side-agent note 2026-10-19: the text, not only the exercises)", () => {
  it("flags reStructuredText leftovers: double backticks, roles, directives, a lone colon, XXX notes", () => {
    const bad = "`open()` returns ``open(filename)``\n\n:\n\n.. XXX str(f) is <io.TextIOWrapper>\n\nsee :func:`open` and :file:`JPEG`\n";
    const p = textProblems(bad);
    expect(p).toEqual(expect.arrayContaining([expect.stringMatching(/double backticks/), expect.stringMatching(/directive/), expect.stringMatching(/lone ':'/), expect.stringMatching(/role/)]));
  });
  it("flags a reference-style link whose definition the excerpt left out", () => {
    expect(textProblems("an instance of [`std::io::Stdin`][iostdin], a handle\n")).toEqual([expect.stringMatching(/undefined reference link \[iostdin\]/)]);
    expect(textProblems("see [the docs][d]\n\n[d]: https://example.com\n")).toEqual([]);
  });
  it("clean Markdown with code fences has no problems", () => {
    expect(textProblems("Text with `code`.\n\n```python\n>>> 1 + 1\n2\n```\n")).toEqual([]);
  });
});

describe("lesson rounds (spec 2026-10-19 Q14, Q15)", () => {
  const L = (concept: string, order: number, tags: string[] = [concept]): Lesson => ({ language: "python", concept, title: concept, tags, source: "", order, checked: null, text: "", exercises: [] });
  const lessons = ["basics", "bools", "numbers", "conditionals", "strings", "lists", "loops", "dicts", "functions"].map((c, i) => L(c, i + 1));
  it("only concepts with a lesson that the learner does not know, weak ones first, three per round", () => {
    const r = planRounds(["numbers", "conditionals", "strings", "lists", "loops", "dicts", "functions", "bools", "async"], new Set(["bools"]), ["dicts", "loops"], lessons);
    expect(r.map((x) => x.length)).toEqual([3, 3, 1]);
    expect(r.flat()).not.toContain("bools");
    expect(r.flat()).not.toContain("async");
    expect(r[0].slice(0, 2)).toEqual(["dicts", "loops"]);
  });
  it("a concept matches a lesson by its tags too (variables → basics)", () => {
    expect(planRounds(["variables"], new Set(), [], [L("basics", 1, ["variables"])])).toEqual([["basics"]]);
  });
  it("a beginner also gets the lessons that come before the project's concepts, in course order", () => {
    const r = planRounds(["lists"], new Set(), [], lessons, { beginner: true });
    expect(r.flat()).toEqual(["basics", "bools", "numbers", "conditionals", "strings", "lists"]);
    expect(r.map((x) => x.length)).toEqual([3, 3]);
  });
  it("a beginner whose project names no known concept starts at the beginning of the course (live check 2026-10-19)", () => {
    expect(planRounds(["data-entry", "file-storage"], new Set(), [], lessons, { beginner: true })).toEqual([["basics", "bools", "numbers"], ["conditionals", "strings", "lists"]]);
  });
  it("nothing to learn gives no rounds", () => {
    expect(planRounds(["async"], new Set(), [], lessons)).toEqual([]);
  });
});
