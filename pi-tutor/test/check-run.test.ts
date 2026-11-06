import { describe, it, expect } from "vitest";
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { runChecks, projectRun, CHECKS_SANDBOX_OFF, PRINTED_TOO_MUCH } from "../extensions/tutor/check-run.js";
import { crossCheckOnReference } from "../extensions/tutor/check-job.js";
import type { RunExec } from "../extensions/tutor/exam/layout.js";
import { SANDBOX_MISSING, type SandboxHost } from "../extensions/tutor/exam/sandbox.js";
import type { Check } from "../extensions/tutor/checks.js";
import { realExec } from "./fake-pi.js";

const has = (cmd: string, flag = "--version") => spawnSync(cmd, [flag]).status === 0;
const bwrapReady = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0;
const host = (): SandboxHost => ({ env: process.env, home: homedir(), cacheDir: mkdtempSync(join(tmpdir(), "chk-cache-")) });
const value = (expr: string, expected: string): Check => ({ task: "P2.T2", kind: "value", expr, expected, milestone: 2, status: "trusted" });
const io = (stdin: string, contains: string): Check => ({ task: "P2.T3", kind: "io", stdin, contains, milestone: 2, status: "trusted" });
function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "chk-proj-"));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); }
  return root;
}
const py = (root: string, checks: Check[], limitSec?: number) =>
  runChecks(realExec, { language: "python", root, entry: "src/main.py", runCmd: "python3 src/main.py", checks, sandbox: host(), limitSec });
// Final review C1: Pi's exec keeps all output in memory; ~700 MB of it crashed Pi. Records the most any run returned.
function counting() {
  const seen = { max: 0 };
  const exec: RunExec = async (c, a, o) => { const r = await realExec(c, a, o); seen.max = Math.max(seen.max, r.stdout.length + r.stderr.length); return r; };
  return { exec, seen };
}
const lua = (root: string, checks: Check[], limitSec?: number) =>
  runChecks(realExec, { language: "lua", root, entry: "src/main.lua", runCmd: "lua src/main.lua", checks, sandbox: host(), limitSec });

describe("projectRun", () => {
  it("reads the run command from README front matter and finds the entry file in it", () => {
    const root = project({ "README.md": "---\nrun: python3 src/main.py\nlanguage: python\n---\n# T\n" });
    expect(projectRun(root, "python")).toEqual({ runCmd: "python3 src/main.py", entry: "src/main.py" });
    expect(projectRun(project({ "README.md": "---\nrun: cargo run\n---\n" }), "rust")).toEqual({ runCmd: "cargo run", entry: null });
    expect(projectRun(project({}), "python")).toEqual({ runCmd: null, entry: null });
  });
  it("an entry: line wins; else the file in run:; else the language's default file when it exists (spec 2026-10-22 §5.1)", () => {
    expect(projectRun(project({ "README.md": "---\nrun: go run ./src\nentry: src/lib/app.go\n---\n" }), "go").entry).toBe("src/lib/app.go");
    expect(projectRun(project({ "README.md": "---\nrun: cargo run\n---\n", "src/main.rs": "fn main() {}\n" }), "rust")).toEqual({ runCmd: "cargo run", entry: "src/main.rs" });
    expect(projectRun(project({ "README.md": "---\nrun: go run ./src\n---\n", "src/main.go": "package main\n" }), "go").entry).toBe("src/main.go");
    expect(projectRun(project({ "README.md": "---\nrun: cargo run\n---\n" }), "rust").entry).toBeNull();
  });
  it("Phase 8 A1: a run: naming no file finds the file it runs (go run ., npm start, python -m)", () => {
    expect(projectRun(project({ "README.md": "---\nrun: go run .\n---\n", "main.go": "package main\n" }), "go").entry).toBe("main.go");
    expect(projectRun(project({ "README.md": "---\nrun: npm start\n---\n", "package.json": JSON.stringify({ scripts: { start: "node src/app.js" } }), "src/app.js": "" }), "javascript").entry).toBe("src/app.js");
    expect(projectRun(project({ "README.md": "---\nrun: npm start\n---\n", "package.json": JSON.stringify({ main: "lib/index.mjs" }), "lib/index.mjs": "" }), "javascript").entry).toBe("lib/index.mjs");
    expect(projectRun(project({ "README.md": "---\nrun: python3 -m bills\n---\n", "bills.py": "" }), "python").entry).toBe("bills.py");
    expect(projectRun(project({ "README.md": "---\nrun: python3 -m bills\n---\n", "bills/__main__.py": "" }), "python").entry).toBe("bills/__main__.py");
    expect(projectRun(project({ "README.md": "---\nrun: npm start\n---\n", "package.json": "{oops" }), "javascript").entry).toBeNull();
    expect(projectRun(project({ "README.md": "---\nrun: npm start\n---\n", "package.json": JSON.stringify({ main: "../out.js" }) }), "javascript").entry).toBeNull();
  });
});

describe("runChecks without a sandbox (spec §11a)", () => {
  it("runs nothing when the sandbox is off", async () => {
    const ran: string[] = [];
    const r = await runChecks(async (c) => { ran.push(c); return { stdout: "", stderr: "", code: 0, killed: false }; },
      { language: "python", root: project({}), entry: "src/main.py", runCmd: null, checks: [value("f()", "1")], sandbox: null });
    expect(r).toEqual({ results: [], missing: CHECKS_SANDBOX_OFF });
    expect(ran).toEqual([]);
  });
  it("bwrap that cannot start is reported, and nothing else runs", async () => {
    const ran: string[] = [];
    const r = await runChecks(async (c) => { ran.push(c); return { stdout: "", stderr: "", code: c === "bwrap" ? 1 : 0, killed: false }; },
      { language: "python", root: project({}), entry: "src/main.py", runCmd: null, checks: [value("f()", "1")], sandbox: host() });
    expect(r.missing).toBe(SANDBOX_MISSING);
    expect(ran).toEqual(["bwrap"]);
  });
});

describe.skipIf(!bwrapReady || !has("python3"))("runChecks: Python in the sandbox", () => {
  it("a wrong value fails with what it gave; a right one passes within the decimal tolerance", async () => {
    const root = project({ "src/main.py": "def split_amount(total, people):\n    return total * people\n" });
    const [bad] = (await py(root, [value("split_amount(48, 3)", "16.0")])).results;
    expect(bad).toMatchObject({ pass: false, got: "144" });
    writeFileSync(join(root, "src/main.py"), "def split_amount(total, people):\n    return total / people\n");
    expect((await py(root, [value("split_amount(52.8, 3)", "17.6"), value("split_amount(48, 3)", "16")])).results.map((r) => r.pass)).toEqual([true, true]);
  }, 30_000);
  it("Review Focus #1: a function not written yet fails plainly", async () => {
    const root = project({ "src/main.py": "def split_amount(total, people):\n    return total / people\n" });
    expect((await py(root, [value("tip_rate(True)", "0.2")])).results[0]).toMatchObject({ pass: false, error: "tip_rate is not defined yet" });
  }, 30_000);
  it("Review Focus #2: an endless loop is cut off and reported, and the next check still runs", async () => {
    const root = project({ "src/main.py": "def f():\n    while True:\n        pass\n\ndef g():\n    return 2\n" });
    const r = (await py(root, [value("f()", "1"), value("g()", "2")], 2)).results;
    expect(r[0]).toMatchObject({ pass: false, error: "took too long (an endless loop?)" });
    expect(r[1].pass).toBe(true);
  }, 30_000);
  it("Review Focus #3: input read while loading says so; functions defined before it are still checked", async () => {
    const root = project({ "src/main.py": "def double(x):\n    return x * 2\n\nn = float(input('amount: '))\n\ndef half(x):\n    return x / 2\n" });
    const r = (await py(root, [value("double(2)", "4"), value("half(4)", "2")])).results;
    expect(r[0].pass).toBe(true);
    expect(r[1]).toMatchObject({ pass: false, error: "your file reads input when it is loaded; move that into main()" });
  }, 30_000);
  it("the program's main() under `if __name__ == \"__main__\"` does not run; its own modules and data files are found", async () => {
    const root = project({
      "src/helpers.py": "def rate():\n    return 0.2\n",
      "src/main.py": "from helpers import rate\nRATES = open('data/rates.txt').read().split()\n\ndef tip(x):\n    return x * rate()\n\ndef first():\n    return RATES[0]\n\nif __name__ == '__main__':\n    input('never')\n",
      "data/rates.txt": "0.15 0.2\n",
    });
    expect((await py(root, [value("tip(40)", "8.0"), value("first()", "'0.15'")])).results.map((r) => r.pass)).toEqual([true, true]);
  }, 30_000);
  it("a check that writes files leaves the real project unchanged", async () => {
    const root = project({ "src/main.py": "def save():\n    open('out.txt', 'w').write('x')\n    return True\n" });
    expect((await py(root, [value("save()", "True")])).results[0].pass).toBe(true);
    expect(readdirSync(root).sort()).toEqual(["src"]);
  }, 30_000);
  it("a program that prints forever is cut short and reported; Pi never receives the flood (final review C1)", async () => {
    const root = project({ "src/main.py": "def f():\n    while True:\n        print('balance left: 10')\n\nif __name__ == '__main__':\n    f()\n" });
    const { exec, seen } = counting();
    const r = (await runChecks(exec, { language: "python", root, entry: "src/main.py", runCmd: "python3 src/main.py", checks: [value("f()", "1"), io("", "done")], sandbox: host(), limitSec: 3 })).results;
    expect(r.map((x) => x.error)).toEqual([PRINTED_TOO_MUCH, PRINTED_TOO_MUCH]);
    expect(seen.max).toBeLessThan(200_000);
  }, 30_000);
  it("reports the value's type; a @dataclass file with postponed annotations loads (spec 2026-10-26 §5.3)", async () => {
    const root = project({ "src/main.py": "from __future__ import annotations\nfrom dataclasses import dataclass\n\n@dataclass\nclass Bill:\n    total: float\n\ndef count(s):\n    return len(s.split())\n\ndef half(x):\n    return x / 2\n\ndef bill_total(t):\n    return Bill(t).total\n" });
    const r = (await py(root, [value("count('a b')", "2"), value("half(4)", "2.0"), value("bill_total(3.0)", "3.0")])).results;
    expect(r.map((x) => [x.pass, x.valueType])).toEqual([[true, "int"], [true, "float"], [true, "float"]]);
  }, 30_000);
  it("typed input → output: the run command with stdin fed", async () => {
    const root = project({ "src/main.py": "total = float(input('total: '))\nprint(f'each: {total / 3:.2f}')\n" });
    const r = (await py(root, [io("52.8\n", "17.60"), io("52.8\n", "99")])).results;
    expect(r[0].pass).toBe(true);
    expect(r[1]).toMatchObject({ pass: false });
    expect(r[1].got).toContain("each: 17.60");
  }, 30_000);
});

describe.skipIf(!bwrapReady || !has("cargo"))("runChecks: Rust (spec 2026-10-22)", () => {
  it("Review Focus #5: an older project with no manifest and no entry: line still runs both kinds of check; the real folder gets no Cargo.toml", async () => {
    const root = project({ "README.md": "---\nrun: cargo run\nlanguage: rust\n---\n", "src/main.rs": "fn split_amount(total: f64, people: u32) -> f64 { total / people as f64 }\nfn main() {\n    let mut s = String::new();\n    std::io::stdin().read_line(&mut s).unwrap();\n    let t: f64 = s.trim().parse().unwrap();\n    println!(\"Each pays: {:.2}\", split_amount(t, 3));\n}\n" });
    const { runCmd, entry } = projectRun(root, "rust");
    const checks: Check[] = [{ ...io("52.8\n", "17.60"), task: "P1.T2" }, { ...value("split_amount(50.0, 3)", "16.666666666666668"), task: "P1.T1" }];
    const r = (await runChecks(realExec, { language: "rust", root, entry, runCmd, checks, sandbox: host() })).results;
    expect(r.map((x) => x.pass)).toEqual([true, true]);
    expect(readdirSync(root).sort()).toEqual(["README.md", "src"]);
  }, 180_000);
});

describe.skipIf(!bwrapReady || !has("lua", "-v"))("runChecks: Lua in the sandbox", () => {
  it("global functions and a returned module table are both found; a wrong value shows what it gave", async () => {
    const root = project({ "src/main.lua": "function split_amount(t, p) return t * p end\nlocal M = {}\nfunction M.tip(x) return x * 0.2 end\nreturn M\n" });
    const r = (await lua(root, [value("split_amount(48, 3)", "16.0"), value("tip(40)", "8.0"), value("M.tip(10)", "2")])).results;
    expect(r[0]).toMatchObject({ pass: false, got: "144" });
    expect(r[1].pass).toBe(true);
    expect(r[2].pass).toBe(true);
  }, 30_000);
  it("a check written as M.fn still says the file did not load or read input while loading (final review I1)", async () => {
    const broken = project({ "src/main.lua": "local M = {}\nfunction M.tip(x) return x * end\nreturn M\n" });
    expect((await lua(broken, [value("M.tip(10)", "2")])).results[0].error).toMatch(/^your file stopped while loading: .*unexpected symbol/);
    const reads = project({ "src/main.lua": "local M = {}\nfunction M.tip(x) return x * 0.2 end\nlocal n = io.read()\nreturn M\n" });
    expect((await lua(reads, [value("M.tip(10)", "2")])).results[0].error).toBe("your file reads input when it is loaded; move that into main()");
  }, 30_000);
  it("a menu loop that prints forever after the typed input runs out is cut short (final review C1)", async () => {
    const root = project({ "src/main.lua": "while true do\n  io.write('menu> ')\n  local l = io.read()\nend\n" });
    const { exec, seen } = counting();
    const r = (await runChecks(exec, { language: "lua", root, entry: "src/main.lua", runCmd: "lua src/main.lua", checks: [io("1\n", "done")], sandbox: host(), limitSec: 3 })).results;
    expect(r[0].error).toBe(PRINTED_TOO_MUCH);
    expect(seen.max).toBeLessThan(200_000);
  }, 30_000);
  it("Review Focus #1-#3 in Lua", async () => {
    const root = project({ "src/main.lua": "function double(x) return x * 2 end\nfunction spin() while true do end end\nlocal n = tonumber(io.read())\nfunction half(x) return x / 2 end\n" });
    const r = (await lua(root, [value("tip_rate(true)", "0.2"), value("spin()", "1"), value("double(2)", "4"), value("half(4)", "2")], 2)).results;
    expect(r[0]).toMatchObject({ pass: false, error: "your file reads input when it is loaded; move that into main()" });
    expect(r[1]).toMatchObject({ pass: false, error: "took too long (an endless loop?)" });
    expect(r[2].pass).toBe(true);
    expect(r[3]).toMatchObject({ pass: false, error: "your file reads input when it is loaded; move that into main()" });
    const clean = project({ "src/main.lua": "function double(x) return x * 2 end\n" });
    expect((await lua(clean, [value("tip_rate(true)", "0.2")])).results[0]).toMatchObject({ pass: false, error: "tip_rate is not defined yet" });
  }, 30_000);
});

// Habits Task 17: speed is measured by a timed large-input check, limited to the reference's time × 3.
describe.skipIf(!bwrapReady)("timed checks (habits spec 2026-10-26 §8)", () => {
  const LINEAR = "def count_unique(items):\n    return len(set(items))\n";
  const QUADRATIC = "def count_unique(items):\n    seen = []\n    for x in items:\n        if x not in seen:\n            seen.append(x)\n    return len(seen)\n";
  const timed = (limitMs?: number): Check => ({ task: "P2.T2", kind: "timed", expr: "count_unique(list(range(20000)))", milestone: 2, status: "trusted", ...(limitMs ? { limitMs } : {}) });
  it("takes its limit from the reference, then passes a linear version and fails a quadratic one", async () => {
    const [ref] = await crossCheckOnReference({ exec: realExec, sandbox: host(), language: "python", entry: "src/main.py", runCmd: null, reference: LINEAR, checks: [timed()] });
    expect(ref.status).toBe("trusted");
    expect(ref.limitMs).toBeGreaterThanOrEqual(50);
    expect(ref.limitMs).toBeLessThan(1000);
    const fast = await py(project({ "src/main.py": LINEAR }), [ref]);
    expect(fast.results[0]).toMatchObject({ pass: true });
    const slow = await py(project({ "src/main.py": QUADRATIC }), [ref]);
    expect(slow.results[0].pass).toBe(false);
    expect(slow.results[0].error).toMatch(new RegExp(`^took \\d+ ms; the limit is ${ref.limitMs} ms \\(the reference's time × 3\\)$`));
    expect(slow.results[0].ms).toBeGreaterThan(ref.limitMs!);
    // final review I1: the reference's answer on the large input is kept, so wrong-but-fast code fails
    expect(ref.expected).toBe("20000");
    const cheat = await py(project({ "src/main.py": "def count_unique(items):\n    if len(items) > 1000:\n        return 0\n    return len(set(items))\n" }), [ref]);
    expect(cheat.results[0]).toMatchObject({ pass: false, error: "gave a different answer on the large input than the hidden solution" });
  }, 120_000);
  it("a call that fails is an error, not a time", async () => {
    const r = await py(project({ "src/main.py": "def count_unique(items):\n    return 1 / 0\n" }), [timed(100)]);
    expect(r.results[0]).toMatchObject({ pass: false, error: "ZeroDivisionError: division by zero" });
  }, 60_000);
});

describe("projectRun keeps the entry inside the project (final review I6)", () => {
  it("an entry that points outside the root is no entry", () => {
    const root = project({ "README.md": "---\nrun: python3 src/main.py\nentry: ../outside.py\n---\n" });
    expect(projectRun(root, "python").entry).toBeNull();
    const ok = project({ "README.md": "---\nrun: python3 src/main.py\n---\n", "src/main.py": "" });
    expect(projectRun(ok, "python").entry).toBe("src/main.py");
  });
});

// Habits Task 23: function checks for JavaScript and TypeScript, through a Node harness in the sandbox.
describe.skipIf(!bwrapReady || !has("node"))("JavaScript and TypeScript function checks", () => {
  const js = (root: string, checks: Check[], entry = "src/main.js", language = "javascript") =>
    runChecks(realExec, { language, root, entry, runCmd: `node ${entry}`, checks, sandbox: host() });
  it("Phase 8 A5: a class instance matches an object literal with its fields; two different classes do not", async () => {
    const root = project({ "src/main.js": "class Point { constructor(x, y) { this.x = x; this.y = y } }\nclass Other { constructor(x, y) { this.x = x; this.y = y } }\nexport const at = (x) => new Point(x, x / 3)\nexport const other = (x) => new Other(x, x / 3)\nexport { Point }\n" });
    const r = await js(root, [value("at(1)", "{ x: 1, y: 0.3333333333333333 }"), value("at(1)", "{ x: 1, y: 2 }"), value("other(1)", "new Point(1, 1 / 3)"), value("at(1)", "new Point(1, 1 / 3)")]);
    expect(r.results.map((x) => x.pass)).toEqual([true, false, false, true]);
    const built = project({ "src/main.js": "export const m = () => new Map()\nexport const d = () => new Date(0)\n" });
    expect((await js(built, [value("m()", "{}"), value("d()", "{}")])).results.map((x) => x.pass)).toEqual([false, false]);
  }, 30_000);
  it("an exported function is called; numbers compare within a tolerance, arrays and objects element by element", async () => {
    const root = project({ "src/main.js": "export function splitAmount(t, p) { return t / p }\nexport const pair = (a) => [a, { n: a / 3 }]\n" });
    const r = await js(root, [value("splitAmount(50, 3)", "16.666666666666668"), value("splitAmount(50, 4)", "13"), value("pair(1)", "[1, { n: 0.3333333333333333 }]")]);
    expect(r.results.map((x) => x.pass)).toEqual([true, false, true]);
    expect(r.results[1]).toMatchObject({ got: "12.5" });
  }, 60_000);
  it("TypeScript runs as it is (Node strips the types); an async function's promise is awaited", async () => {
    const root = project({ "src/main.ts": "export async function total(xs: number[]): Promise<number> {\n  return xs.reduce((a, b) => a + b, 0)\n}\n" });
    const r = await js(root, [value("total([1, 2, 3])", "6")], "src/main.ts", "typescript");
    expect(r.results[0]).toMatchObject({ pass: true });
  }, 60_000);
  it("a function that is not exported says so; a file that stops while loading says why", async () => {
    const hidden = await js(project({ "src/main.js": "function splitAmount(t, p) { return t / p }\n" }), [value("splitAmount(50, 4)", "12.5")]);
    expect(hidden.results[0]).toMatchObject({ pass: false, error: "splitAmount is not exported yet (export function splitAmount(…))" });
    const broken = await js(project({ "src/main.js": "export function f() { return 1 }\nthrow new Error('boom')\n" }), [value("f()", "1")]);
    expect(broken.results[0].error).toMatch(/^your file stopped while loading: Error: boom/);
    // final review I2: a typo inside the function is its own ReferenceError, not "not exported"
    const typo = await js(project({ "src/main.js": "export function total(xs) { return xs.reduce((a, b) => a + b, totl) }\n" }), [value("total([1, 2])", "3")]);
    expect(typo.results[0]).toMatchObject({ pass: false, error: "ReferenceError: totl is not defined" });
    // M1: NaN equals NaN; M3: a default-exported function is in scope by its name
    const nan = await js(project({ "src/main.js": "export const half = (x) => x / 2\nexport default function splitAmount(t, p) { return t / p }\n" }), [value("half(NaN)", "NaN"), value("splitAmount(50, 4)", "12.5")]);
    expect(nan.results.map((x) => x.pass)).toEqual([true, true]);
  }, 60_000);
});

// Phase 8 A4: a `lua` that is Lua 5.1 or LuaJIT (setfenv, loadstring, other error wording) gets the same results.
describe.skipIf(!bwrapReady || !has("luajit", "-v"))("runChecks: Lua 5.1 / LuaJIT", () => {
  const jit = () => {
    const bin = mkdtempSync(join(tmpdir(), "luajit-bin-"));
    copyFileSync(spawnSync("sh", ["-c", "command -v luajit"]).stdout.toString().trim(), join(bin, "lua"));
    chmodSync(join(bin, "lua"), 0o755);
    return { ...host(), env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
  };
  const run = (root: string, checks: Check[]) => runChecks(realExec, { language: "lua", root, entry: "src/main.lua", runCmd: "lua src/main.lua", checks, sandbox: jit() });
  it("a file that does not parse says why; a missing function is named; a module table works", async () => {
    const broken = (await run(project({ "src/main.lua": "local M = {}\nfunction M.tip(x) return x * + end\nreturn M\n" }), [value("M.tip(10)", "2")])).results[0];
    expect(broken.error).toMatch(/^your file stopped while loading: .*unexpected symbol/);
    const r = (await run(project({ "src/main.lua": "local M = {}\nfunction M.half(x) return x / 2 end\nreturn M\n" }), [value("half(4)", "2"), value("tip_rate(true)", "0.2")])).results;
    expect(r[0].pass).toBe(true);
    expect(r[1]).toMatchObject({ pass: false, error: "tip_rate is not defined yet" });
  }, 30_000);
});

// Phase 8 D (sandbox minor): runs get kernel limits on memory (the in-memory overlay too) and processes.
describe("sandbox resource limits", () => {
  it("runs inside a systemd scope with MemoryMax and TasksMax when one can start; plain bwrap otherwise", async () => {
    const { sandboxFor } = await import("../extensions/tutor/check-run.js");
    const seen: [string, string[]][] = [];
    const fake = (scope: boolean): RunExec => async (c, a) => { seen.push([c, a]); return { stdout: "", stderr: "", code: c === "systemd-run" && !scope ? 1 : 0, killed: false }; };
    const sb = await sandboxFor(fake(true), project({}), "python", ["python3"], host());
    if ("missing" in sb) throw new Error(sb.missing);
    await sb.run(["python3", "-c", "1"], 5000);
    const last = seen.at(-1)!;
    expect(last[0]).toBe("systemd-run");
    expect(last[1].join(" ")).toMatch(/--user --scope .*MemoryMax=\d+G.*TasksMax=\d+ -- bwrap .*python3 -c 1$/);
    seen.length = 0;
    const plain = await sandboxFor(fake(false), project({}), "python", ["python3"], host());
    if ("missing" in plain) throw new Error(plain.missing);
    await plain.run(["python3", "-c", "1"], 5000);
    expect(seen.at(-1)![0]).toBe("bwrap");
  });
});
