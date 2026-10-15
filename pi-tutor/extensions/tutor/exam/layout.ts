// Exam folders (spec 2026-10-13 §6, M8 D2): each is a small project of its own, so its tests run
// inside any parent project. The model writes the stub and the tests; the rest is ours.
export type RunExec = (command: string, args: string[], options: { cwd: string; timeout: number }) => Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;
export interface Layout { stub: string; tests: string; extras: [string, string][]; command: [string, string[]]; broken(out: string): boolean; naming: string }
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
    stub: "solution.py", tests: "test_examples.py", extras: [], command: ["python3", ["-m", "unittest", "-v"]],
    broken: (o) => /Failed to import test module|SyntaxError|IndentationError|Ran 0 tests/.test(o),
    naming: "stub: solution.py (functions raise NotImplementedError). tests: test_examples.py with unittest, `from solution import …`, one method per requirement named test_r<n>_<what>.",
  },
  rust: {
    stub: "src/lib.rs", tests: "tests/examples.rs",
    extras: [["Cargo.toml", `[package]\nname = "exam"\nversion = "0.1.0"\nedition = "2021"\n\n[workspace]\n`]],
    command: ["cargo", ["test", "--quiet"]],
    // A failing test also prints "error: test failed, to rerun …": only compile errors are broken tests.
    broken: (o) => /^error\[E\d+\]|could not compile|^error: (?!test failed)/m.test(o),
    naming: "stub: src/lib.rs of crate `exam` (pub fns whose bodies are todo!()). tests: tests/examples.rs, `use exam::…;`, one #[test] fn per requirement named r<n>_<what>.",
  },
  go: {
    stub: "solution.go", tests: "examples_test.go", extras: [["go.mod", "module exam\n\ngo 1.22\n"]],
    command: ["go", ["test", "./..."]],
    broken: (o) => /\[build failed\]|\[setup failed\]|no test files/.test(o),
    naming: "stub: solution.go in package exam (funcs that panic(\"write …\")). tests: examples_test.go in package exam, one func TestR<n><What>(t *testing.T) per requirement.",
  },
  typescript: {
    stub: "solution.ts", tests: "examples.test.ts", extras: [["package.json", `{ "type": "module" }\n`]],
    command: ["node", ["--test", "examples.test.ts"]],
    broken: (o) => /SyntaxError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/.test(o),
    naming: "stub: solution.ts with exported functions that throw new Error(\"write …\"); erasable TypeScript only (no enum, namespace, parameter properties). tests: examples.test.ts with node:test and node:assert/strict, `import { … } from \"./solution.ts\"`, one test(\"r<n> <what>\", …) per requirement.",
  },
  javascript: {
    stub: "solution.js", tests: "examples.test.js", extras: [["package.json", `{ "type": "module" }\n`]],
    command: ["node", ["--test", "examples.test.js"]],
    broken: (o) => /SyntaxError|ERR_MODULE_NOT_FOUND/.test(o),
    naming: "stub: solution.js (an ES module) with exported functions that throw new Error(\"write …\"). tests: examples.test.js with node:test and node:assert/strict, `import { … } from \"./solution.js\"`, one test(\"r<n> <what>\", …) per requirement.",
  },
  lua: {
    stub: "solution.lua", tests: "examples_test.lua", extras: [], command: ["lua", ["examples_test.lua"]],
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

export interface TestRun { code: number; out: string; killed: boolean; broken: boolean }

/** The exam's example tests, run by the extension in the exam folder (M8 D1); never by the model. */
export async function runExamTests(exec: RunExec, language: string, dir: string): Promise<TestRun> {
  const l = LAYOUTS[language];
  if (!l) throw new Error(`no exams for ${language} yet`);
  const r = await exec(l.command[0], l.command[1], { cwd: dir, timeout: EXAM_TIMEOUT_MS });
  const out = `${r.stdout}\n${r.stderr}`.trim();
  return { code: r.code, out, killed: r.killed, broken: !r.killed && r.code !== 0 && l.broken(out) };
}
