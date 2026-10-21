// Running checks (spec 2026-10-21 §7, §11a). Checks are model-written, so they run only inside the exam
// sandbox, over a throwaway overlay of the project folder: the learner's other modules and data files are
// there, and nothing a check writes reaches the real folder. One process per check, so an endless loop in
// one check cannot hide the others.
import { readFileSync, realpathSync } from "node:fs";
import { LANGS } from "./knowledge/versions.js";
import { CAP_TOOLS, SANDBOX_MISSING, cappedArgv, reachedCap, sandboxArgv, toolBinds, type SandboxHost } from "./exam/sandbox.js";
import type { RunExec } from "./exam/layout.js";
import type { Check } from "./checks.js";

export interface CheckResult { check: Check; pass: boolean; got?: string; error?: string }

export const CHECKS_SANDBOX_OFF = "checks run only in the sandbox, and it is off (/tutor-exam sandbox on turns it back on)";
export const TOO_LONG = "took too long (an endless loop?)";
export const INPUT_AT_LOAD = "your file reads input when it is loaded; move that into main()";
export const PRINTED_TOO_MUCH = "printed too much (an endless loop?)";

const CHECK_LIMIT_SEC = 20;
const MARK = "\x1eTUTOR\t";
// Final review C1: a check's output is cut inside the sandbox (cappedArgv).
const OUT_CAP = 65536;
const ERR_CAP = 8192;
const capped = (argv: string[]) => cappedArgv(argv, OUT_CAP, ERR_CAP);
const flooded = (stdout: string) => reachedCap(stdout, OUT_CAP);
const SOURCE_EXT: Record<string, RegExp> = {
  python: /\.py$/, lua: /\.lua$/, javascript: /\.(m?js|cjs)$/, typescript: /\.(ts|mts)$/, go: /\.go$/, rust: /\.rs$/,
};

/** The project's `run:` command (README front matter) and the entry file named in it. */
export function projectRun(root: string, language: string): { runCmd: string | null; entry: string | null } {
  let text = "";
  try { text = readFileSync(`${root}/README.md`, "utf8"); } catch { return { runCmd: null, entry: null }; }
  const lines = text.split("\n");
  if (lines[0] !== "---") return { runCmd: null, entry: null };
  let runCmd: string | null = null;
  for (const l of lines.slice(1)) {
    if (l === "---") break;
    const m = /^run:\s*(.+?)\s*$/.exec(l);
    if (m) runCmd = m[1];
  }
  const ext = SOURCE_EXT[language];
  const entry = runCmd && ext ? runCmd.split(/\s+/).slice(1).find((w) => ext.test(w)) ?? null : null;
  return { runCmd, entry };
}

const PY_HARNESS = `
import builtins, json, math, os, sys
MARK = ${JSON.stringify(MARK)}
entry, expr, expected = sys.argv[1], sys.argv[2], sys.argv[3]
class _Input(Exception): pass
def _no_input(*a, **k): raise _Input()
builtins.input = _no_input
sys.path.insert(0, os.path.dirname(os.path.abspath(entry)))
ns = {"__name__": "__tutor_check__", "__file__": os.path.abspath(entry), "__builtins__": builtins}
stopped = None
try:
    with open(entry, encoding="utf-8") as f:
        code = compile(f.read(), entry, "exec")
    exec(code, ns)
except _Input:
    stopped = "input"
except SystemExit:
    stopped = "the file ended the program while loading (exit)"
except BaseException as e:
    stopped = "your file stopped while loading: %s: %s" % (type(e).__name__, e)
def out(**kw):
    sys.stdout.write("\\n" + MARK + json.dumps(kw) + "\\n"); sys.stdout.flush()
def same(a, b):
    if isinstance(a, bool) or isinstance(b, bool): return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)): return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)): return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict): return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    return a == b
def missing(name):
    if stopped == "input": return ${JSON.stringify(INPUT_AT_LOAD)}
    if stopped: return stopped
    return "%s is not defined yet" % name
try:
    want = eval(expected, ns)
except BaseException as e:
    out(error="the check's expected value does not work: %s: %s" % (type(e).__name__, e)); sys.exit(0)
try:
    got = eval(expr, ns)
except NameError as e:
    out(error=missing(e.name))
except _Input:
    out(error="it waited for typed input; a check types nothing")
except BaseException as e:
    out(error="%s: %s" % (type(e).__name__, e))
else:
    out(**{"pass": same(got, want), "got": repr(got)})
`;

const LUA_HARNESS = `
local MARK = "\\30TUTOR\\t"
local INPUT = {}
local dir = ENTRY:match("^(.*)/[^/]*$") or "."
package.path = dir .. "/?.lua;./?.lua;" .. package.path
local env = setmetatable({}, { __index = _G })
env.io = setmetatable({ read = function() error(INPUT, 0) end, lines = function() error(INPUT, 0) end }, { __index = io })
local function loadin(src, name, scope, file)
  if setfenv then
    local f, e = (file and loadfile(src) or loadstring(src, name))
    if f then setfenv(f, scope) end
    return f, e
  end
  if file then return loadfile(src, "t", scope) end
  return load(src, name, "t", scope)
end
local stopped, mod
local chunk, err = loadin(ENTRY, nil, env, true)
if not chunk then stopped = "your file stopped while loading: " .. tostring(err) else
  local ok, r = pcall(chunk)
  if ok then mod = r elseif r == INPUT then stopped = "input" else stopped = "your file stopped while loading: " .. tostring(r) end
end
local scope = setmetatable({}, { __index = function(_, k)
  local v = rawget(env, k)
  if v ~= nil then return v end
  if type(mod) == "table" then
    if k == "M" then return mod end
    if mod[k] ~= nil then return mod[k] end
  end
  return _G[k]
end })
local function esc(s) return (s:gsub('[%c"\\\\]', function(c) return string.format("\\\\u%04x", c:byte()) end)) end
local function out(fields)
  local parts = {}
  for k, v in pairs(fields) do
    parts[#parts + 1] = '"' .. k .. '":' .. (type(v) == "boolean" and tostring(v) or ('"' .. esc(v) .. '"'))
  end
  io.write("\\n" .. MARK .. "{" .. table.concat(parts, ",") .. "}\\n")
end
local function show(v, depth)
  local t = type(v)
  if t == "string" then return '"' .. v:gsub('[\\\\"]', '\\\\%0') .. '"' end
  if t ~= "table" then return tostring(v) end
  if depth > 2 then return "{...}" end
  local parts, n = {}, #v
  for i = 1, n do parts[#parts + 1] = show(v[i], depth + 1) end
  local keys = {}
  for k in pairs(v) do if not (type(k) == "number" and k >= 1 and k <= n and k % 1 == 0) then keys[#keys + 1] = k end end
  table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
  for _, k in ipairs(keys) do parts[#parts + 1] = tostring(k) .. " = " .. show(v[k], depth + 1) end
  return "{" .. table.concat(parts, ", ") .. "}"
end
local function same(a, b)
  if type(a) == "number" and type(b) == "number" then
    return math.abs(a - b) <= 1e-9 * math.max(1, math.abs(a), math.abs(b))
  end
  if type(a) == "table" and type(b) == "table" then
    for k, v in pairs(a) do if not same(v, b[k]) then return false end end
    for k in pairs(b) do if a[k] == nil then return false end end
    return true
  end
  return a == b
end
local function missing(name)
  if stopped == "input" then return ${JSON.stringify(INPUT_AT_LOAD)} end
  if stopped then return stopped end
  return name .. " is not defined yet"
end
local wantf, werr = loadin("return " .. EXPECTED, "=expected", scope)
local okw, want = false, werr
if wantf then okw, want = pcall(wantf) end
if not okw then out({ error = "the check's expected value does not work: " .. tostring(want) }) return end
local f, ferr = loadin("return " .. EXPR, "=check", scope)
if not f then out({ error = "the check does not parse: " .. tostring(ferr) }) return end
local ok, got = pcall(f)
if ok then out({ pass = same(got, want), got = show(got, 0) }) return end
if got == INPUT then out({ error = "it waited for typed input; a check types nothing" }) return end
-- A file that did not load explains any failure (final review I1: \`M.tip(10)\` fails on a nil M, not a missing name).
if stopped then out({ error = missing("") }) return end
local name = tostring(got):match("attempt to call a nil value %(%a+ '([%w_]+)'%)")
out({ error = name and missing(name) or tostring(got) })
`;

/** A Lua long-bracket string literal that cannot be closed by its own text. */
function luaString(s: string): string {
  let eq = "";
  while (s.includes(`]${eq}]`)) eq += "=";
  return `[${eq}[\n${s}]${eq}]`;
}

interface Sandboxed { run(argv: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>; limited: boolean }

/** The sandbox for `root`, or the reason nothing may run. */
async function sandboxFor(exec: RunExec, root: string, language: string, tools: string[], host: SandboxHost): Promise<Sandboxed | { missing: string }> {
  let real = root;
  try { real = realpathSync(root); } catch { /* bwrap cannot mount it: the probe reports it */ }
  const prefix = sandboxArgv(real, language, toolBinds([...tools, "timeout", ...CAP_TOOLS], host), host);
  if ((await exec("bwrap", [...prefix, "true"], { cwd: real, timeout: 10_000 })).code !== 0) return { missing: SANDBOX_MISSING };
  const run = (argv: string[], timeout: number) => exec("bwrap", [...prefix, ...argv], { cwd: real, timeout });
  const limited = (await run(["timeout", "--version"], 10_000)).code === 0;
  return { run, limited };
}

async function limitedRun(sb: Sandboxed, argv: string[], limitSec: number) {
  const r = sb.limited
    ? await sb.run(["timeout", "-k", "5", String(limitSec), ...argv], (limitSec + 15) * 1000)
    : await sb.run(argv, limitSec * 1000);
  return { ...r, killed: r.killed || (sb.limited && (r.code === 124 || r.code === 137)) };
}

const tail = (s: string, n = 300) => (s.length > n ? `…${s.slice(-n)}` : s).trim();

function valueResult(check: Check, r: { stdout: string; stderr: string; code: number; killed: boolean }): CheckResult {
  if (r.killed) return { check, pass: false, error: TOO_LONG };
  if (flooded(r.stdout)) return { check, pass: false, error: PRINTED_TOO_MUCH };
  const line = r.stdout.split("\n").filter((l) => l.startsWith(MARK)).at(-1);
  if (!line) return { check, pass: false, error: `the check could not run: ${tail(r.stderr || r.stdout, 200) || `exit ${r.code}`}` };
  const o = JSON.parse(line.slice(MARK.length)) as { pass?: boolean; got?: string; error?: string };
  return o.error !== undefined ? { check, pass: false, error: o.error } : { check, pass: o.pass === true, got: o.got };
}

export async function runChecks(exec: RunExec, i: { language: string; root: string; entry: string | null; runCmd: string | null; checks: Check[]; sandbox: SandboxHost | null; limitSec?: number }): Promise<{ results: CheckResult[]; missing?: string }> {
  if (!i.sandbox) return { results: [], missing: CHECKS_SANDBOX_OFF };
  const interp = LANGS[i.language]?.command;
  const runTool = i.runCmd?.split(/\s+/)[0];
  const sb = await sandboxFor(exec, i.root, i.language, [interp, runTool].filter((t): t is string => !!t), i.sandbox);
  if ("missing" in sb) return { results: [], missing: sb.missing };
  const limit = i.limitSec ?? CHECK_LIMIT_SEC;
  const results: CheckResult[] = [];
  for (const check of i.checks) {
    if (check.kind === "io") {
      if (!i.runCmd) { results.push({ check, pass: false, error: "no run command: add `run:` to README.md's front matter" }); continue; }
      const r = await limitedRun(sb, capped(["sh", "-c", 'printf "%s" "$1" | sh -c "$2"', "sh", check.stdin ?? "", i.runCmd]), limit);
      if (r.killed) { results.push({ check, pass: false, error: TOO_LONG }); continue; }
      if (flooded(r.stdout)) { results.push({ check, pass: false, error: PRINTED_TOO_MUCH }); continue; }
      const pass = r.stdout.includes(check.contains ?? "");
      results.push({ check, pass, got: tail(r.stdout), ...(pass || r.code === 0 ? {} : { error: tail(r.stderr, 200) || `exit ${r.code}` }) });
      continue;
    }
    if (!i.entry || !interp || (i.language !== "python" && i.language !== "lua")) {
      results.push({ check, pass: false, error: "no entry file to load: name it in README.md's `run:` command" });
      continue;
    }
    const argv = i.language === "python"
      ? capped([interp, "-c", PY_HARNESS, i.entry, check.expr ?? "", check.expected ?? ""])
      : capped([interp, "-e", `local ENTRY, EXPR, EXPECTED = ${luaString(i.entry)}, ${luaString(check.expr ?? "")}, ${luaString(check.expected ?? "")}\n${LUA_HARNESS}`]);
    results.push(valueResult(check, await limitedRun(sb, argv, limit)));
  }
  return { results };
}
