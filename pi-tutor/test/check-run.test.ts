import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { runChecks, projectRun, CHECKS_SANDBOX_OFF, PRINTED_TOO_MUCH } from "../extensions/tutor/check-run.js";
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
  it("typed input → output: the run command with stdin fed", async () => {
    const root = project({ "src/main.py": "total = float(input('total: '))\nprint(f'each: {total / 3:.2f}')\n" });
    const r = (await py(root, [io("52.8\n", "17.60"), io("52.8\n", "99")])).results;
    expect(r[0].pass).toBe(true);
    expect(r[1]).toMatchObject({ pass: false });
    expect(r[1].got).toContain("each: 17.60");
  }, 30_000);
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
