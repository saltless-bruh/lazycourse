import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { findOwnTests, runOwnTests, canFail, hasTests, testSpans } from "../extensions/tutor/own-tests.js";
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
  it("final review M1/M4: a column-0 comment keeps the class; a Rust helper without #[test] is not a test", () => {
    const root = project({ "tests/test_a.py": "import unittest\n\nclass T(unittest.TestCase):\n# area checks\n    def test_p1_t1_area(self):\n        pass\n" });
    expect(findOwnTests(root, "python", "P1.T1")).toEqual(["tests/test_a.py::T.test_p1_t1_area"]);
    const rs = project({ "src/main.rs": "fn p1_t1_input() -> i32 { 1 }\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn p1_t1_even() {}\n}\n" });
    expect(findOwnTests(rs, "rust", "P1.T1")).toEqual(["src/main.rs::p1_t1_even"]);
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
    expect(await canFail(realExec, { root: good, language: "python", tests: findOwnTests(good, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("caught");
    const always = project({ "src/main.py": SRC, "tests/test_split.py": ALWAYS });
    expect(await canFail(realExec, { root: always, language: "python", tests: findOwnTests(always, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("missed");
    expect(readFileSync(join(good, "src/main.py"), "utf8")).toBe(SRC);
    expect(readdirSync(good).sort()).toEqual(["src", "tests"]);
  }, 120_000);
  it("canFail plants bugs in the function the test calls: low in the file, or in another module (side-agent note)", async () => {
    const busy = "def tip(total):\n" + Array.from({ length: 20 }, (_, k) => `    total = total * 1 + ${k} - ${k}\n`).join("") + "    return total\n\n\n";
    const low = project({ "src/main.py": busy + SRC, "tests/test_split.py": GOOD });
    expect(await canFail(realExec, { root: low, language: "python", tests: findOwnTests(low, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("caught");
    const other = project({ "src/main.py": busy + "from money import split_amount\n", "src/money.py": SRC, "tests/test_split.py": GOOD });
    expect(await canFail(realExec, { root: other, language: "python", tests: findOwnTests(other, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("caught");
    expect(readFileSync(join(other, "src/money.py"), "utf8")).toBe(SRC);
  }, 120_000);
  it("final review: a broken copy that loops forever is cut short, so /tutor-done is not held for a minute per copy", async () => {
    const loop = "def count(n):\n    i = 0\n    while i < n:\n        i = i + 1\n    return i\n";
    const root = project({ "src/main.py": loop, "tests/test_count.py": "from main import count\n\ndef test_p1_t1_runs():\n    count(3)\n" });
    const t0 = Date.now();
    expect(await canFail(realExec, { root, language: "python", tests: findOwnTests(root, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("missed");
    expect(Date.now() - t0).toBeLessThan(30_000);
  }, 120_000);
  it("final review I1: a string task's test is tried on a changed string; code with nothing to break is untestable, not missed", async () => {
    const greet = project({ "src/main.py": "def greet(name):\n    return \"Hello, \" + name\n", "tests/test_g.py": "from main import greet\n\ndef test_p1_t1_greets():\n    assert greet(\"Bo\") == \"Hello, Bo\"\n" });
    expect(await canFail(realExec, { root: greet, language: "python", tests: findOwnTests(greet, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("caught");
    const same = project({ "src/main.py": "def ident(x):\n    return x\n", "tests/test_i.py": "from main import ident\n\ndef test_p1_t1_same():\n    assert ident(3) == 3\n" });
    expect(await canFail(realExec, { root: same, language: "python", tests: findOwnTests(same, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("untestable");
  }, 120_000);
  it("phase 5 live run: code with no operator to slip gets logic slips (not in ↔ in, and ↔ or, if → if not)", async () => {
    const SLOW = "def count_unique(items):\n    seen = []\n    for x in items:\n        if x not in seen:\n            seen.append(x)\n    return len(seen)\n";
    const root = project({ "src/main.py": SLOW, "tests/test_c.py": "from main import count_unique\n\ndef test_p1_t1_repeats():\n    assert count_unique([1, 1, 2]) == 2\n" });
    expect(await canFail(realExec, { root, language: "python", tests: findOwnTests(root, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("caught");
    const both = project({ "src/main.py": "def ok(a, b):\n    return a and b\n", "tests/test_o.py": "from main import ok\n\ndef test_p1_t1_both():\n    assert ok(True, False) is False\n" });
    expect(await canFail(realExec, { root: both, language: "python", tests: findOwnTests(both, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("caught");
  }, 120_000);
  it("final review I2: only the functions this task's test calls are broken, not other tasks' in the same file", async () => {
    const parse = "def parse(s):\n" + Array.from({ length: 14 }, (_, k) => `    s = s * 1 + ${k} - ${k}\n`).join("") + "    return s\n\n\ndef area(w, h):\n    return w * h\n";
    const root = project({ "src/main.py": parse, "tests/test_all.py": "from main import parse, area\n\ndef test_p1_t2_parse():\n    assert parse(2) == 2\n\ndef test_p1_t1_area():\n    assert area(2, 3) == 6\n" });
    expect(await canFail(realExec, { root, language: "python", tests: findOwnTests(root, "python", "P1.T1"), entry: "src/main.py", sandbox: host() })).toBe("caught");
  }, 120_000);
  it("final review M2: an async own test is awaited", async () => {
    const root = project({ "src/main.py": SRC, "tests/test_a.py": "from main import split_amount\n\nasync def test_p1_t1_even():\n    assert split_amount(48, 3) == 15\n" });
    expect((await runOwnTests(realExec, { root, language: "python", tests: findOwnTests(root, "python", "P1.T1"), sandbox: host() })).pass).toBe(false);
  }, 60_000);
  it.skipIf(spawnSync("go", ["version"]).status !== 0)("Go: go test runs the own test; it can fail on a broken copy, a test with no check cannot", async () => {
    const main = "package main\n\nfunc Split(total, people float64) float64 {\n\treturn total / people\n}\n\nfunc main() {}\n";
    const good = "package main\n\nimport \"testing\"\n\nfunc TestP1T1Even(t *testing.T) {\n\tif Split(48, 3) != 16 {\n\t\tt.Errorf(\"got %v\", Split(48, 3))\n\t}\n}\n";
    const root = project({ "go.mod": "module p\n\ngo 1.22\n", "src/main.go": main, "src/split_test.go": good });
    const tests = findOwnTests(root, "go", "P1.T1");
    expect((await runOwnTests(realExec, { root, language: "go", tests, sandbox: host() })).pass).toBe(true);
    expect(await canFail(realExec, { root, language: "go", tests, entry: "src/main.go", sandbox: host() })).toBe("caught");
    writeFileSync(join(root, "src/split_test.go"), "package main\n\nimport \"testing\"\n\nfunc TestP1T1Even(t *testing.T) {\n\tSplit(48, 3)\n}\n");
    expect(await canFail(realExec, { root, language: "go", tests, entry: "src/main.go", sandbox: host() })).toBe("missed");
    writeFileSync(join(root, "src/split_test.go"), good.replace("!= 16", "!= 15"));
    const bad = await runOwnTests(realExec, { root, language: "go", tests, sandbox: host() });
    expect(bad.pass).toBe(false);
    expect(bad.failed).toBe("TestP1T1Even"); // final review I3: the try's spot needs the real name
  }, 240_000);
  it.skipIf(spawnSync("cargo", ["--version"]).status !== 0)("Rust: cargo test runs the own test; the broken copy never touches the test itself", async () => {
    const src = (want: string, body: string) => `fn split(total: f64, people: f64) -> f64 {\n    total / people\n}\n\nfn main() { println!("{}", split(1.0, 1.0)); }\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn p1_t1_even() {\n        ${body.replace("WANT", want)}\n    }\n}\n`;
    const root = project({ "Cargo.toml": '[package]\nname = "p"\nversion = "0.1.0"\nedition = "2021"\n\n[workspace]\n', "src/main.rs": src("16.0", "assert_eq!(split(48.0, 3.0), WANT);") });
    const tests = findOwnTests(root, "rust", "P1.T1");
    expect((await runOwnTests(realExec, { root, language: "rust", tests, sandbox: host() })).pass).toBe(true);
    expect(await canFail(realExec, { root, language: "rust", tests, entry: "src/main.rs", sandbox: host() })).toBe("caught");
    writeFileSync(join(root, "src/main.rs"), src("15.0", "assert_eq!(split(48.0, 3.0), WANT);"));
    const bad = await runOwnTests(realExec, { root, language: "rust", tests, sandbox: host() });
    expect(bad.pass).toBe(false);
    expect(bad.failed).toBe("p1_t1_even"); // final review I3
    expect(bad.out).not.toMatch(/^…/);
    // final review I4: a lifetime is no string quote, so the code after it can still be broken
    writeFileSync(join(root, "src/main.rs"), "const NAME: &'static str = \"x\";\n" + src("16.0", "assert_eq!(split(48.0, 3.0), WANT);"));
    expect(await canFail(realExec, { root, language: "rust", tests, entry: "src/main.rs", sandbox: host() })).toBe("caught");
    writeFileSync(join(root, "src/main.rs"), src("16.0", "let _ = split(48.0, 3.0); assert!(1 + 1 == 2);"));
    expect(await canFail(realExec, { root, language: "rust", tests, entry: "src/main.rs", sandbox: host() })).toBe("missed");
  }, 400_000);
});

describe("testSpans (Phase 8 A11)", () => {
  it("in Rust, only the item #[cfg(test)] marks is test code; a helper after it can still be broken", () => {
    const src = "fn a() -> i32 { 1 }\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn p1_t1_x() { assert_eq!(a(), 1); let s = \"}\"; }\n}\n\nfn helper() -> i32 { 2 }\n";
    const spans = testSpans(src, "rust");
    const start = src.indexOf("#[cfg(test)]"), end = src.indexOf("}\n\nfn helper") + 1;
    expect(spans).toEqual([[start, end]]);
    expect(spans.some(([a, b]) => src.indexOf("fn helper") >= a && src.indexOf("fn helper") < b)).toBe(false);
    const two = "#[cfg(test)]\nmod a { #[test] fn t() {} }\nfn mid() {}\n#[cfg(test)]\nmod b { }\n";
    expect(testSpans(two, "rust").map(([a, b]) => two.slice(a, b))).toEqual(["#[cfg(test)]\nmod a { #[test] fn t() {} }", "#[cfg(test)]\nmod b { }"]);
  });
});
