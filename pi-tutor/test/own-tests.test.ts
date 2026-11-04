import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { findOwnTests, runOwnTests, canFail, hasTests } from "../extensions/tutor/own-tests.js";
import type { SandboxHost } from "../extensions/tutor/exam/sandbox.js";
import { realExec } from "./fake-pi.js";

const bwrapReady = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0 && spawnSync("python3", ["--version"]).status === 0;
const host = (): SandboxHost => ({ env: process.env, home: homedir(), cacheDir: mkdtempSync(join(tmpdir(), "own-cache-")) });
function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "own-proj-"));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }
  return root;
}
const SRC = "def split_amount(total, people):\n    return total / people\n\n\ndef tip(total):\n    return total * 0.15\n";
const GOOD = "from main import split_amount\n\ndef test_p1_t1_splits_evenly():\n    assert split_amount(48, 3) == 16\n";
const ALWAYS = "from main import split_amount\n\ndef test_p1_t1_runs():\n    split_amount(48, 3)\n    assert True\n";

describe("findOwnTests (spec 2026-10-26 §7)", () => {
  it("finds a task's tests by name, plain functions and unittest methods", () => {
    const root = project({ "src/main.py": SRC, "tests/test_split.py": GOOD + "\nclass T:\n    def test_p1_t1_other(self):\n        pass\n\ndef test_p1_t2_tip():\n    pass\n" });
    expect(findOwnTests(root, "python", "P1.T1")).toEqual(["tests/test_split.py::test_p1_t1_splits_evenly", "tests/test_split.py::T.test_p1_t1_other"]);
    expect(findOwnTests(root, "python", "P1.T3")).toEqual([]);
  });
  it("final review: a symlink is never followed out of the project (CLAUDE.md root rule)", () => {
    const outside = project({ "test_x.py": "def test_p1_t1_outside():\n    pass\n" });
    const root = project({ "src/main.py": SRC });
    symlinkSync(outside, join(root, "lib"));
    symlinkSync(join(outside, "test_x.py"), join(root, "test_link.py"));
    expect(findOwnTests(root, "python", "P1.T1")).toEqual([]);
    expect(hasTests(root, "python")).toBe(false);
  });
  it("Go and Rust names are found too", () => {
    expect(findOwnTests(project({ "src/split_test.go": "package main\nfunc TestP1T1Even(t *testing.T) {}\n" }), "go", "P1.T1")).toEqual(["src/split_test.go::TestP1T1Even"]);
    expect(findOwnTests(project({ "src/main.rs": "#[test]\nfn p1_t1_even() {}\n" }), "rust", "P1.T1")).toEqual(["src/main.rs::p1_t1_even"]);
  });
});

describe("hasTests (phase 4 live run: a test not named for the task is pointed out)", () => {
  it("sees any test the learner wrote, in each language", () => {
    expect(hasTests(project({ "src/main.py": SRC, "tests/test_split.py": "def test_split():\n    pass\n" }), "python")).toBe(true);
    expect(hasTests(project({ "src/main.py": SRC }), "python")).toBe(false);
    expect(hasTests(project({ "src/main.rs": "#[test]\nfn even() {}\n" }), "rust")).toBe(true);
    expect(hasTests(project({ "src/a_test.go": "package main\nfunc TestEven(t *testing.T) {}\n" }), "go")).toBe(true);
  });
});

describe.skipIf(!bwrapReady)("running own tests in the sandbox", () => {
  it("a passing and a failing own test", async () => {
    const root = project({ "src/main.py": SRC, "tests/test_split.py": GOOD });
    const ok = await runOwnTests(realExec, { root, language: "python", tests: findOwnTests(root, "python", "P1.T1"), sandbox: host() });
    expect(ok.pass).toBe(true);
    writeFileSync(join(root, "src/main.py"), SRC.replace("total / people", "total * people"));
    const bad = await runOwnTests(realExec, { root, language: "python", tests: findOwnTests(root, "python", "P1.T1"), sandbox: host() });
    expect(bad.pass).toBe(false);
    // Phase 4 live run: the learner sees the line of their test that failed, not the harness's traceback.
    expect(bad.out).toBe("test_p1_t1_splits_evenly: tests/test_split.py:4: assert split_amount(48, 3) == 16 (AssertionError)");
  }, 60_000);
  it("canFail: a real test fails on a broken copy; an always-true test does not (habits Review Focus #5)", async () => {
    const good = project({ "src/main.py": SRC, "tests/test_split.py": GOOD });
    expect(await canFail(realExec, { root: good, language: "python", tests: findOwnTests(good, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe(true);
    const always = project({ "src/main.py": SRC, "tests/test_split.py": ALWAYS });
    expect(await canFail(realExec, { root: always, language: "python", tests: findOwnTests(always, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe(false);
    expect(readFileSync(join(good, "src/main.py"), "utf8")).toBe(SRC);
    expect(readdirSync(good).sort()).toEqual(["src", "tests"]);
  }, 120_000);
  it("canFail plants bugs in the function the test calls: low in the file, or in another module (side-agent note)", async () => {
    const busy = "def tip(total):\n" + Array.from({ length: 20 }, (_, k) => `    total = total * 1 + ${k} - ${k}\n`).join("") + "    return total\n\n\n";
    const low = project({ "src/main.py": busy + SRC, "tests/test_split.py": GOOD });
    expect(await canFail(realExec, { root: low, language: "python", tests: findOwnTests(low, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe(true);
    const other = project({ "src/main.py": busy + "from money import split_amount\n", "src/money.py": SRC, "tests/test_split.py": GOOD });
    expect(await canFail(realExec, { root: other, language: "python", tests: findOwnTests(other, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe(true);
    expect(readFileSync(join(other, "src/money.py"), "utf8")).toBe(SRC);
  }, 120_000);
  it("final review: a broken copy that loops forever is cut short, so /tutor-done is not held for a minute per copy", async () => {
    const loop = "def count(n):\n    i = 0\n    while i < n:\n        i = i + 1\n    return i\n";
    const root = project({ "src/main.py": loop, "tests/test_count.py": "from main import count\n\ndef test_p1_t1_runs():\n    count(3)\n" });
    const t0 = Date.now();
    expect(await canFail(realExec, { root, language: "python", tests: findOwnTests(root, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe(false);
    expect(Date.now() - t0).toBeLessThan(30_000);
  }, 120_000);
  it.skipIf(spawnSync("go", ["version"]).status !== 0)("Go: go test runs the own test; it can fail on a broken copy, a test with no check cannot", async () => {
    const main = "package main\n\nfunc Split(total, people float64) float64 {\n\treturn total / people\n}\n\nfunc main() {}\n";
    const good = "package main\n\nimport \"testing\"\n\nfunc TestP1T1Even(t *testing.T) {\n\tif Split(48, 3) != 16 {\n\t\tt.Errorf(\"got %v\", Split(48, 3))\n\t}\n}\n";
    const root = project({ "go.mod": "module p\n\ngo 1.22\n", "src/main.go": main, "src/split_test.go": good });
    const tests = findOwnTests(root, "go", "P1.T1");
    expect((await runOwnTests(realExec, { root, language: "go", tests, sandbox: host() })).pass).toBe(true);
    expect(await canFail(realExec, { root, language: "go", tests, entry: "src/main.go", sandbox: host() })).toBe(true);
    writeFileSync(join(root, "src/split_test.go"), "package main\n\nimport \"testing\"\n\nfunc TestP1T1Even(t *testing.T) {\n\tSplit(48, 3)\n}\n");
    expect(await canFail(realExec, { root, language: "go", tests, entry: "src/main.go", sandbox: host() })).toBe(false);
    writeFileSync(join(root, "src/split_test.go"), good.replace("!= 16", "!= 15"));
    expect((await runOwnTests(realExec, { root, language: "go", tests, sandbox: host() })).pass).toBe(false);
  }, 240_000);
  it.skipIf(spawnSync("cargo", ["--version"]).status !== 0)("Rust: cargo test runs the own test; the broken copy never touches the test itself", async () => {
    const src = (want: string, body: string) => `fn split(total: f64, people: f64) -> f64 {\n    total / people\n}\n\nfn main() { println!("{}", split(1.0, 1.0)); }\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn p1_t1_even() {\n        ${body.replace("WANT", want)}\n    }\n}\n`;
    const root = project({ "Cargo.toml": '[package]\nname = "p"\nversion = "0.1.0"\nedition = "2021"\n\n[workspace]\n', "src/main.rs": src("16.0", "assert_eq!(split(48.0, 3.0), WANT);") });
    const tests = findOwnTests(root, "rust", "P1.T1");
    expect((await runOwnTests(realExec, { root, language: "rust", tests, sandbox: host() })).pass).toBe(true);
    expect(await canFail(realExec, { root, language: "rust", tests, entry: "src/main.rs", sandbox: host() })).toBe(true);
    writeFileSync(join(root, "src/main.rs"), src("16.0", "let _ = split(48.0, 3.0); assert!(1 + 1 == 2);"));
    expect(await canFail(realExec, { root, language: "rust", tests, entry: "src/main.rs", sandbox: host() })).toBe(false);
  }, 400_000);
});
