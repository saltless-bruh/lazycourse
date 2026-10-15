import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { layout, examFiles, runExamTests, EXAM_TIMEOUT_MS } from "../extensions/tutor/exam/layout.js";
import { realExec } from "./fake-pi.js";

const has = (cmd: string) => spawnSync(cmd, ["--version"]).status === 0 || spawnSync(cmd, ["version"]).status === 0 || spawnSync(cmd, ["-v"]).status === 0;
const CASES: Record<string, { tool: string; stub: string; solved: string; tests: string; badTests: string }> = {
  python: {
    tool: "python3",
    stub: "def count_words(text):\n    raise NotImplementedError('write count_words')\n",
    solved: "def count_words(text):\n    out = {}\n    for w in text.split():\n        out[w] = out.get(w, 0) + 1\n    return out\n",
    tests: "import unittest\nfrom solution import count_words\n\nclass Examples(unittest.TestCase):\n    def test_r1_counts(self):\n        self.assertEqual(count_words('a b a'), {'a': 2, 'b': 1})\n",
    badTests: "import unittest\nfrom solution import nope\n",
  },
  rust: {
    tool: "cargo",
    stub: "use std::collections::HashMap;\n\npub fn count_words(text: &str) -> HashMap<String, usize> {\n    todo!(\"write count_words {text}\")\n}\n",
    solved: "use std::collections::HashMap;\n\npub fn count_words(text: &str) -> HashMap<String, usize> {\n    let mut m = HashMap::new();\n    for w in text.split_whitespace() { *m.entry(w.to_string()).or_insert(0) += 1; }\n    m\n}\n",
    tests: "use exam::count_words;\n\n#[test]\nfn r1_counts() {\n    assert_eq!(count_words(\"a b a\")[\"a\"], 2);\n}\n",
    badTests: "use exam::nope;\n#[test]\nfn r1() { nope(); }\n",
  },
  go: {
    tool: "go",
    stub: "package exam\n\nfunc CountWords(text string) map[string]int {\n\tpanic(\"write CountWords\")\n}\n",
    solved: "package exam\n\nimport \"strings\"\n\nfunc CountWords(text string) map[string]int {\n\tm := map[string]int{}\n\tfor _, w := range strings.Fields(text) {\n\t\tm[w]++\n\t}\n\treturn m\n}\n",
    tests: "package exam\n\nimport \"testing\"\n\nfunc TestR1Counts(t *testing.T) {\n\tif got := CountWords(\"a b a\"); got[\"a\"] != 2 {\n\t\tt.Fatalf(\"got %v\", got)\n\t}\n}\n",
    badTests: "package exam\n\nimport \"testing\"\n\nfunc TestR1(t *testing.T) { Nope() }\n",
  },
  typescript: {
    tool: "node",
    stub: "export function countWords(text: string): Record<string, number> {\n  throw new Error(\"write countWords\");\n}\n",
    solved: "export function countWords(text: string): Record<string, number> {\n  const m: Record<string, number> = {};\n  for (const w of text.split(/\\s+/).filter(Boolean)) m[w] = (m[w] ?? 0) + 1;\n  return m;\n}\n",
    tests: "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { countWords } from \"./solution.ts\";\n\ntest(\"r1 counts\", () => { assert.deepEqual(countWords(\"a b a\"), { a: 2, b: 1 }); });\n",
    badTests: "import { nope } from \"./solution.ts\";\n",
  },
  javascript: {
    tool: "node",
    stub: "export function countWords(text) {\n  throw new Error(\"write countWords\");\n}\n",
    solved: "export function countWords(text) {\n  const m = {};\n  for (const w of text.split(/\\s+/).filter(Boolean)) m[w] = (m[w] ?? 0) + 1;\n  return m;\n}\n",
    tests: "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { countWords } from \"./solution.js\";\n\ntest(\"r1 counts\", () => { assert.deepEqual(countWords(\"a b a\"), { a: 2, b: 1 }); });\n",
    badTests: "import { nope } from \"./solution.js\";\n",
  },
  lua: {
    tool: "lua",
    stub: "local M = {}\n\nfunction M.count_words(text)\n  error(\"write count_words\")\nend\n\nreturn M\n",
    solved: "local M = {}\n\nfunction M.count_words(text)\n  local m = {}\n  for w in text:gmatch(\"%S+\") do m[w] = (m[w] or 0) + 1 end\n  return m\nend\n\nreturn M\n",
    tests: "check(\"r1 counts\", function() assert(solution.count_words(\"a b a\").a == 2) end)\n",
    badTests: "check(\"r1\", function() assert(\n",
  },
};

function writeAll(dir: string, files: [string, string][]) {
  for (const [rel, text] of files) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
}

describe("exam layouts run with the real toolchains (M8 D2, D5)", () => {
  for (const [lang, c] of Object.entries(CASES)) {
    it.skipIf(!has(c.tool))(`${lang}: the stub fails cleanly, broken tests are caught, a solution passes`, async () => {
      const lay = layout(lang)!;
      const dir = mkdtempSync(join(tmpdir(), `exam-${lang}-`));
      writeAll(dir, examFiles(lang, c.stub, c.tests));
      const stub = await runExamTests(realExec, lang, dir);
      expect(stub.code).not.toBe(0);
      expect(stub.broken, stub.out).toBe(false);
      writeAll(dir, [[lay.tests, examFiles(lang, c.stub, c.badTests).find(([r]) => r === lay.tests)![1]]]);
      expect((await runExamTests(realExec, lang, dir)).broken).toBe(true);
      writeAll(dir, examFiles(lang, c.solved, c.tests));
      const solved = await runExamTests(realExec, lang, dir);
      expect(solved.code, solved.out).toBe(0);
    }, 60_000);
  }
  it("knows exactly the six exam languages", () => {
    expect(["python", "rust", "go", "typescript", "lua", "javascript"].every((l) => layout(l))).toBe(true);
    expect(layout("c")).toBeNull();
    expect(EXAM_TIMEOUT_MS).toBe(120_000);
  });
  it("a killed run (timeout) is reported, not mistaken for broken tests (Review Focus #2)", async () => {
    const r = await runExamTests(async () => ({ stdout: "", stderr: "", code: 143, killed: true }), "python", "/nonexistent");
    expect(r).toMatchObject({ killed: true, broken: false });
  });
});
