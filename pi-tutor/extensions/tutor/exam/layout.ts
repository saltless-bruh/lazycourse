// Exam folders (spec 2026-10-13 §6, M8 D2): each is a small project of its own, so its tests run
// inside any parent project. The model writes the stub and the tests; the rest is ours.
import { realpathSync } from "node:fs";
import { BWRAP_PROBE, SANDBOX_MISSING, sandboxArgv, toolBinds, type SandboxHost } from "./sandbox.js";

export type RunExec = (command: string, args: string[], options: { cwd: string; timeout: number }) => Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;
/** `version`: a cheap command that fails when the toolchain is not installed (final review I1: pi.exec never rejects). */
export interface Layout { stub: string; tests: string; extras: [string, string][]; command: [string, string[]]; version: [string, string[]]; broken(out: string): boolean; naming: string }
export const EXAM_TIMEOUT_MS = 120_000;

/** Lua has no standard test library: a fixed harness around the model's check(...) lines. */
const LUA_HEAD = `package.path = "./?.lua;" .. package.path
local solution = require("solution")
local failed = 0
local function check(name, f)
  local ok, err = pcall(f)
  print((ok and "ok   " or "FAIL ") .. name .. (ok and "" or (": " .. tostring(err))))
  if not ok then failed = failed + 1 end
end
`;
const LUA_TAIL = `\nos.exit(failed == 0 and 0 or 1)\n`;

const LAYOUTS: Record<string, Layout> = {
  python: {
    stub: "solution.py", tests: "test_examples.py", extras: [], command: ["python3", ["-m", "unittest", "-v"]], version: ["python3", ["--version"]],
    broken: (o) => /Failed to import test module|SyntaxError|IndentationError|Ran 0 tests/.test(o),
    naming: "stub: solution.py (functions raise NotImplementedError). tests: test_examples.py with unittest, `from solution import …`, one method per requirement named test_r<n>_<what>.",
  },
  rust: {
    stub: "src/lib.rs", tests: "tests/examples.rs",
    extras: [["Cargo.toml", `[package]\nname = "exam"\nversion = "0.1.0"\nedition = "2021"\n\n[workspace]\n`]],
    command: ["cargo", ["test", "--quiet"]], version: ["cargo", ["--version"]],
    // A failing test also prints "error: test failed, to rerun …": only compile errors are broken tests.
    broken: (o) => /^error\[E\d+\]|could not compile|^error: (?!test failed)/m.test(o),
    naming: "stub: src/lib.rs of crate `exam` (pub fns whose bodies are todo!()). tests: tests/examples.rs, `use exam::…;`, one #[test] fn per requirement named r<n>_<what>.",
  },
  go: {
    stub: "solution.go", tests: "examples_test.go", extras: [["go.mod", "module exam\n\ngo 1.22\n"]],
    command: ["go", ["test", "./..."]], version: ["go", ["version"]],
    broken: (o) => /\[build failed\]|\[setup failed\]|no test files/.test(o),
    naming: "stub: solution.go in package exam (funcs that panic(\"write …\")). tests: examples_test.go in package exam, one func TestR<n><What>(t *testing.T) per requirement.",
  },
  typescript: {
    // Final review I5: not *.test.ts, so the project's own `node --test` never runs exam tests.
    stub: "solution.ts", tests: "examples.exam.ts", extras: [["package.json", `{ "type": "module" }\n`]],
    command: ["node", ["--test", "examples.exam.ts"]], version: ["node", ["--version"]],
    broken: (o) => /SyntaxError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/.test(o),
    naming: "stub: solution.ts with exported functions that throw new Error(\"write …\"); erasable TypeScript only (no enum, namespace, parameter properties). tests: examples.exam.ts with node:test and node:assert/strict, `import { … } from \"./solution.ts\"`, one test(\"r<n> <what>\", …) per requirement.",
  },
  javascript: {
    stub: "solution.js", tests: "examples.exam.js", extras: [["package.json", `{ "type": "module" }\n`]],
    command: ["node", ["--test", "examples.exam.js"]], version: ["node", ["--version"]],
    broken: (o) => /SyntaxError|ERR_MODULE_NOT_FOUND/.test(o),
    naming: "stub: solution.js (an ES module) with exported functions that throw new Error(\"write …\"). tests: examples.exam.js with node:test and node:assert/strict, `import { … } from \"./solution.js\"`, one test(\"r<n> <what>\", …) per requirement.",
  },
  lua: {
    stub: "solution.lua", tests: "examples_test.lua", extras: [], command: ["lua", ["examples_test.lua"]], version: ["lua", ["-v"]],
    broken: (o) => !/^(ok|FAIL) /m.test(o),
    naming: "stub: solution.lua returning a module table M whose functions call error(\"write …\"). tests: only lines of check(\"r<n> <what>\", function() assert(…) end), one per requirement; `solution` (the module) and `check` already exist.",
  },
};

export function layout(language: string): Layout | null {
  return LAYOUTS[language] ?? null;
}

export function examFiles(language: string, stub: string, tests: string): [string, string][] {
  const l = LAYOUTS[language];
  if (!l) throw new Error(`no exams for ${language} yet`);
  const t = language === "lua" ? `${LUA_HEAD}\n${tests.trimEnd()}\n${LUA_TAIL}` : tests;
  return [...l.extras, [l.stub, stub], [l.tests, t]];
}

/** `missing`: the toolchain could not run, so the tests say nothing about the code (final review I1). */
export interface TestRun { code: number; out: string; killed: boolean; broken: boolean; missing?: string }

/**
 * The exam's example tests, run by the extension in the exam folder (M8 D1); never by the model.
 * Final review I2: Pi's exec kills only its direct child, so cargo's and go's test binaries outlived a
 * hang. coreutils `timeout` runs the command in its own process group and kills the whole group.
 */
export interface ExamRunOptions { limitSec?: number; sandbox?: SandboxHost | null }

export async function runExamTests(exec: RunExec, language: string, dir: string, opts: ExamRunOptions = {}): Promise<TestRun> {
  const l = LAYOUTS[language];
  if (!l) throw new Error(`no exams for ${language} yet`);
  const limitSec = opts.limitSec ?? EXAM_TIMEOUT_MS / 1000;
  const sb = opts.sandbox ?? null;
  // Plan 2026-10-16 S2: no usable bwrap means no run at all, never a silent run outside the sandbox.
  if (sb && (await exec(BWRAP_PROBE[0], BWRAP_PROBE[1], { cwd: dir, timeout: 10_000 })).code !== 0) {
    return { code: 1, out: SANDBOX_MISSING, killed: false, broken: false, missing: SANDBOX_MISSING };
  }
  // Review Focus #5: bind and chdir the real folder, not a symlink to it.
  let real = dir;
  try { real = realpathSync(dir); } catch { /* a missing folder: bwrap cannot bind it, so the version check reports it */ }
  const prefix = sb ? sandboxArgv(real, language, toolBinds([l.version[0], l.command[0], "timeout"], sb), sb) : null;
  const run = (c: string, a: string[], timeout: number) => (prefix ? exec("bwrap", [...prefix, c, ...a], { cwd: dir, timeout }) : exec(c, a, { cwd: dir, timeout }));
  const tool = await run(l.version[0], l.version[1], 10_000);
  if (tool.code !== 0) {
    const missing = sb
      ? `could not run ${l.version[0]} inside the exam sandbox: is it installed and on the PATH Pi was started with? (/tutor-exam sandbox off runs it without one)`
      : `could not run ${l.version[0]}: is it installed and on the PATH Pi was started with?`;
    return { code: tool.code, out: missing, killed: false, broken: false, missing };
  }
  const group = (await run("timeout", ["--version"], 10_000)).code === 0;
  const r = group
    ? await run("timeout", ["-k", "5", String(limitSec), l.command[0], ...l.command[1]], (limitSec + 15) * 1000)
    : await run(l.command[0], l.command[1], limitSec * 1000);
  const killed = r.killed || (group && (r.code === 124 || r.code === 137));
  const out = `${r.stdout}\n${r.stderr}`.trim();
  return { code: r.code, out, killed, broken: !killed && r.code !== 0 && l.broken(out) };
}
