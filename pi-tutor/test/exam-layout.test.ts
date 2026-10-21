import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, lstatSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { createServer, type AddressInfo } from "node:net";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { layout, examFiles, runExamTests, EXAM_TIMEOUT_MS, EXAM_PRINTED_TOO_MUCH, type RunExec } from "../extensions/tutor/exam/layout.js";
import { realExec } from "./fake-pi.js";
import { SANDBOX_MISSING, type SandboxHost } from "../extensions/tutor/exam/sandbox.js";

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

// Final review C1 (phase 2), exam half: pi.exec keeps all output in memory, so a printing loop must be cut before it.
const FLOOD = "def count_words(text):\n    while True:\n        print('counting', text)\n";
function counting() {
  const seen = { max: 0 };
  const exec: RunExec = async (c, a, o) => { const r = await realExec(c, a, o); seen.max = Math.max(seen.max, r.stdout.length + r.stderr.length); return r; };
  return { exec, seen };
}

describe("exam layouts run with the real toolchains (M8 D2, D5)", () => {
  it.skipIf(!has("python3"))("a solution that prints forever is stopped and says so; Pi never receives the flood (phase 2 final review)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "exam-flood-"));
    writeAll(dir, examFiles("python", FLOOD, CASES.python.tests));
    const { exec, seen } = counting();
    const r = await runExamTests(exec, "python", dir, { limitSec: 20 });
    expect(r).toMatchObject({ killed: false, broken: false });
    expect(r.out.endsWith(EXAM_PRINTED_TOO_MUCH)).toBe(true);
    expect(seen.max).toBeLessThan(3_000_000);
  }, 60_000);
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
    // Version checks answer; the test run itself is killed.
    const r = await runExamTests(async (_c, a) => (a.includes("--version") ? { stdout: "1", stderr: "", code: 0, killed: false } : { stdout: "", stderr: "", code: 143, killed: true }), "python", "/nonexistent");
    expect(r).toMatchObject({ killed: true, broken: false });
  });
  it("a missing toolchain is reported as missing, not as failing tests (final review I1)", async () => {
    // pi.exec never rejects: a program that cannot start resolves with code 1 and no output.
    const exec = async () => ({ stdout: "", stderr: "", code: 1, killed: false });
    const r = await runExamTests(exec, "rust", "/nonexistent");
    expect(r.missing).toMatch(/could not run cargo/);
    expect(r.broken).toBe(false);
  });
  it.skipIf(!has("go") || spawnSync("timeout", ["--version"]).status !== 0)("a solution that loops forever is stopped with every process it started (final review I2)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "exam-hang-"));
    writeAll(dir, examFiles("go", "package exam\n\nfunc CountWords(text string) map[string]int {\n\tfor {\n\t}\n}\n", CASES.go.tests));
    const r = await runExamTests(realExec, "go", dir, { limitSec: 3 });
    expect(r.killed).toBe(true);
    await new Promise((res) => setTimeout(res, 500));
    const left = execFileSync("ps", ["-eo", "comm"], { encoding: "utf8" }).split("\n").filter((c) => c === "exam.test");
    expect(left).toEqual([]);
  }, 60_000);
  it.each(["typescript", "javascript"])("%s: the project's own `node --test` does not pick up exam tests (final review I5)", (lang) => {
    const root = mkdtempSync(join(tmpdir(), "exam-proj-"));
    writeAll(join(root, "exam", "01-x"), examFiles(lang, CASES[lang].stub, CASES[lang].tests));
    const out = spawnSync("node", ["--test"], { cwd: root, encoding: "utf8" });
    expect(`${out.stdout}${out.stderr}`).not.toMatch(/r1 counts/);
  });
});

const lstatOk = (p: string) => { try { lstatSync(p); return true; } catch { return false; } };
const bwrapReady = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0;
const realHost = (): SandboxHost => ({ env: process.env, home: homedir(), cacheDir: mkdtempSync(join(tmpdir(), "sbx-cache-")) });

describe("exam tests inside the sandbox (plan 2026-10-16)", () => {
  it.skipIf(!bwrapReady || !has("python3"))("a solution that prints forever is stopped inside the sandbox too (phase 2 final review)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sbx-flood-"));
    writeAll(dir, examFiles("python", FLOOD, CASES.python.tests));
    const { exec, seen } = counting();
    const r = await runExamTests(exec, "python", dir, { limitSec: 20, sandbox: realHost() });
    expect(r).toMatchObject({ killed: false, broken: false });
    expect(r.out.endsWith(EXAM_PRINTED_TOO_MUCH)).toBe(true);
    expect(seen.max).toBeLessThan(3_000_000);
  }, 60_000);
  for (const [lang, c] of Object.entries(CASES)) {
    it.skipIf(!bwrapReady || !has(c.tool))(`${lang}: stub fails cleanly and a solution passes inside the sandbox`, async () => {
      const dir = mkdtempSync(join(tmpdir(), `sbx-${lang}-`));
      writeAll(dir, examFiles(lang, c.stub, c.tests));
      const stub = await runExamTests(realExec, lang, dir, { sandbox: realHost() });
      expect(stub.missing, stub.out).toBeUndefined();
      expect(stub.code).not.toBe(0);
      expect(stub.broken, stub.out).toBe(false);
      writeAll(dir, examFiles(lang, c.solved, c.tests));
      const solved = await runExamTests(realExec, lang, dir, { sandbox: realHost() });
      expect(solved.code, solved.out).toBe(0);
    }, 90_000);
  }

  it.skipIf(!bwrapReady || !has("python3"))("a test file cannot write outside, read home or secrets, or reach a port or socket (Review Focus #1)", async () => {
    const outside = mkdtempSync(join(tmpdir(), "sbx-outside-"));
    const home = mkdtempSync(join(tmpdir(), "sbx-fakehome-"));
    writeFileSync(join(home, "id_secret"), "k");
    process.env.LAZY_SANDBOX_SECRET = "s3cr3t-value";
    const server = createServer().listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    const sock = join(outside, "nvim.sock");
    const unix = createServer().listen(sock);
    await once(unix, "listening");
    const probe = [
      "import os, socket, unittest",
      "class T(unittest.TestCase):",
      "    def test_escape(self):",
      `        try: open(${JSON.stringify(join(outside, "escaped"))}, "w").write("x")`,
      "        except OSError: pass",
      "        print('HOME', sorted(os.listdir(os.path.expanduser('~'))))",
      "        print('ENV', os.environ.get('LAZY_SANDBOX_SECRET'))",
      "        for fam, addr, tag in ((socket.AF_INET, ('127.0.0.1', " + port + "), 'tcp'), (socket.AF_UNIX, " + JSON.stringify(sock) + ", 'unix'), (socket.AF_UNIX, '/run/dbus/system_bus_socket', 'sysbus'), (socket.AF_UNIX, '/run/docker.sock', 'docker')):",
      "            s = socket.socket(fam)",
      "            try: s.connect(addr); print(tag, 'reached')",
      "            except OSError: print(tag, 'blocked')",
      "        self.fail('done')",
    ].join("\n");
    const dir = mkdtempSync(join(tmpdir(), "sbx-escape-"));
    writeAll(dir, [["solution.py", "\n"], ["test_examples.py", probe]]);
    try {
      const r = await runExamTests(realExec, "python", dir, { sandbox: { env: process.env, home, cacheDir: outside } });
      expect(existsSync(join(outside, "escaped"))).toBe(false);
      expect(r.out).toContain("HOME []");
      expect(r.out).toContain("ENV None");
      expect(r.out).toContain("tcp blocked");
      expect(r.out).toContain("unix blocked");
      expect(r.out).not.toMatch(/sysbus reached|docker reached/); // final review C1: root-owned sockets in /run
    } finally {
      delete process.env.LAZY_SANDBOX_SECRET;
      server.close(); unix.close();
    }
  }, 60_000);

  it.skipIf(!bwrapReady || !has("python3"))("symlinks and files a test plants never reach the real exam folder (final review C2)", async () => {
    const outside = mkdtempSync(join(tmpdir(), "sbx-plant-"));
    const dir = mkdtempSync(join(tmpdir(), "sbx-plantexam-"));
    const plant = [
      "import os, unittest",
      "class T(unittest.TestCase):",
      "    def test_plant(self):",
      `        os.symlink(${JSON.stringify(join(outside, "planted.sh"))}, "grade.md")`,
      "        os.remove('brief.md')",
      `        os.symlink(${JSON.stringify(join(outside, "secret"))}, "brief.md")`,
      "        open('planted.txt', 'w').write('x')",
      "        open('solution.py', 'w').write('hacked = True')",
      "        print('planted')",
    ].join("\n");
    writeAll(dir, [["solution.py", "\n"], ["brief.md", "# brief\n"], ["test_examples.py", plant]]);
    const r = await runExamTests(realExec, "python", dir, { sandbox: realHost() });
    expect(r.out).toContain("planted");
    expect(lstatOk(join(dir, "grade.md"))).toBe(false);
    expect(lstatSync(join(dir, "brief.md")).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(dir, "brief.md"), "utf8")).toBe("# brief\n");
    expect(readFileSync(join(dir, "solution.py"), "utf8")).toBe("\n");
    expect(existsSync(join(dir, "planted.txt"))).toBe(false);
  }, 60_000);

  it.skipIf(!bwrapReady || !has("go"))("a looping solution is still stopped with every process it started (Review Focus #2)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sbx-hang-"));
    writeAll(dir, examFiles("go", "package exam\n\nfunc CountWords(text string) map[string]int {\n\tfor {\n\t}\n}\n", CASES.go.tests));
    const r = await runExamTests(realExec, "go", dir, { limitSec: 3, sandbox: realHost() });
    expect(r.killed).toBe(true);
    await new Promise((res) => setTimeout(res, 500));
    expect(execFileSync("ps", ["-eo", "comm"], { encoding: "utf8" }).split("\n").filter((c) => c === "exam.test")).toEqual([]);
  }, 90_000);

  it("bwrap that cannot start is reported as missing with the fix, and nothing else runs (Review Focus #3)", async () => {
    const ran: string[] = [];
    const exec = async (c: string) => { ran.push(c); return { stdout: "", stderr: "", code: c === "bwrap" ? 1 : 0, killed: false }; };
    const dir = mkdtempSync(join(tmpdir(), "sbx-nobwrap-"));
    const r = await runExamTests(exec, "python", dir, { sandbox: realHost() });
    expect(r.missing).toBe(SANDBOX_MISSING);
    expect(r.broken).toBe(false);
    expect(ran).toEqual(["bwrap"]);
  });

  it("a toolchain the sandbox cannot see says so", async () => {
    const exec = async (c: string, a: string[]) => ({ stdout: "", stderr: "", code: c === "bwrap" && a.includes("--version") ? 1 : 0, killed: false });
    const dir = mkdtempSync(join(tmpdir(), "sbx-notool-"));
    const r = await runExamTests(exec, "rust", dir, { sandbox: realHost() });
    expect(r.missing).toMatch(/could not run cargo inside the exam sandbox/);
  });
});
