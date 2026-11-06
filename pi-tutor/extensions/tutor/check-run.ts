// Running checks (spec 2026-10-21 §7, §11a). Checks are model-written, so they run only inside the exam
// sandbox, over a throwaway overlay of the project folder: the learner's other modules and data files are
// there, and nothing a check writes reaches the real folder. One process per check, so an endless loop in
// one check cannot hide the others.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { LANGS } from "./knowledge/versions.js";
import { CAP_TOOLS, SANDBOX_MISSING, bwrapLauncher, freshRust, cappedArgv, reachedCap, sandboxArgv, toolBinds, type SandboxHost } from "./exam/sandbox.js";
import type { RunExec } from "./exam/layout.js";
import type { Check } from "./checks.js";
import { runCompiledChecks } from "./check-run-compiled.js";
import { manifestFor } from "./manifest.js";

/**
 * `outcome` (Rust/Go, spec 2026-10-22 §4): "unfit" — the check cannot call the learner's function as written;
 * "elsewhere" — the project does not compile outside the checked function. Neither passes; neither is a try.
 */
/** The kind of value a check's call returned (spec 2026-10-26 §5.3: integer tasks skip the rounding probe). */
export type ValueType = "int" | "float" | "other";
export interface CheckResult { check: Check; pass: boolean; got?: string; error?: string; outcome?: "unfit" | "elsewhere"; valueType?: ValueType; ms?: number }

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

const DEFAULT_ENTRY: Record<string, string> = { rust: "src/main.rs", go: "src/main.go" };

/** Final review I6: an entry that leaves the project folder (`../x.py`, an absolute path, a symlink out) is no entry. */
function inRoot(root: string, entry: string): string | null {
  let base: string;
  try { base = realpathSync(root); } catch { base = resolve(root); }
  let full = resolve(base, entry);
  try { full = realpathSync(full); } catch { /* not there yet: the plain path decides */ }
  return full.startsWith(`${base}/`) ? entry : null;
}

/** The project's `run:` command (README front matter) and the entry file named in it. */
export function projectRun(root: string, language: string): { runCmd: string | null; entry: string | null } {
  let text = "";
  try { text = readFileSync(`${root}/README.md`, "utf8"); } catch { return { runCmd: null, entry: null }; }
  const lines = text.split("\n");
  if (lines[0] !== "---") return { runCmd: null, entry: null };
  let runCmd: string | null = null, named: string | null = null;
  for (const l of lines.slice(1)) {
    if (l === "---") break;
    const m = /^run:\s*(.+?)\s*$/.exec(l);
    if (m) runCmd = m[1];
    const e = /^entry:\s*(.+?)\s*$/.exec(l);
    if (e) named = e[1];
  }
  if (named) return { runCmd, entry: inRoot(root, named) };
  const ext = SOURCE_EXT[language];
  const inRun = runCmd && ext ? runCmd.split(/\s+/).slice(1).find((w) => ext.test(w)) ?? null : null;
  // Spec 2026-10-22 §5.1: older Rust/Go projects (`cargo run`, `go run ./src`) start in the language's usual file.
  const fallback = DEFAULT_ENTRY[language];
  const found = inRun ?? (fallback && existsSync(`${root}/${fallback}`) ? fallback : null) ?? impliedEntry(root, runCmd, ext);
  return { runCmd, entry: found && inRoot(root, found) };
}

/**
 * Phase 8 A1: a run command that names no source file still runs one — `go run .` the folder's main.go,
 * `npm start` the file in package.json's start script or its main, `python -m pkg` pkg.py or pkg/__main__.py.
 * Without this the checks were never cross-checked and every tick said "self-checked".
 */
function impliedEntry(root: string, runCmd: string | null, ext: RegExp | undefined): string | null {
  if (!runCmd || !ext) return null;
  const there = (f: string) => { const rel = f.replace(/^\.\//, ""); return existsSync(join(root, rel)) ? rel : null; };
  const words = runCmd.trim().split(/\s+/);
  if (words[0] === "go" && words[1] === "run") {
    // Phase 8 review M5: flags (-race, -tags=x) are not the folder
    const dir = (words.slice(2).find((w) => !w.startsWith("-")) ?? ".").replace(/^\.\/?/, "").replace(/\/$/, "");
    return there(dir ? `${dir}/main.go` : "main.go");
  }
  const m = words.indexOf("-m");
  if (/^python/.test(words[0]) && m > 0 && words[m + 1]) {
    const mod = words[m + 1].replace(/\./g, "/");
    return there(`${mod}.py`) ?? there(`${mod}/__main__.py`);
  }
  if (/^(npm|pnpm|yarn)$/.test(words[0]) && /^(start|run)$/.test(words[1] ?? "")) {
    let pkg: { main?: unknown; scripts?: Record<string, unknown> };
    // Phase 8 review M4: a package.json that links out of the project is not read
    if (!inRoot(root, "package.json")) return null;
    try { pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")); } catch { return null; }
    const script = pkg.scripts?.[words[1] === "run" ? words[2] ?? "" : "start"];
    const named = typeof script === "string" ? script.split(/\s+/).find((w) => ext.test(w)) : undefined;
    const main = typeof pkg.main === "string" ? pkg.main : undefined;
    return (named && there(named)) ?? (main && there(main)) ?? null;
  }
  return null;
}

const PY_HARNESS = `
import builtins, json, math, os, sys, time, types
MARK = ${JSON.stringify(MARK)}
entry, expr, expected = sys.argv[1], sys.argv[2], sys.argv[3]
timed = len(sys.argv) > 4 and sys.argv[4] == "timed"
class _Input(Exception): pass
def _no_input(*a, **k): raise _Input()
builtins.input = _no_input
sys.path.insert(0, os.path.dirname(os.path.abspath(entry)))
# Spec 2026-10-26 §5.3: a registered module, so @dataclass with postponed annotations can look itself up.
_mod = types.ModuleType("__tutor_check__")
sys.modules["__tutor_check__"] = _mod
ns = _mod.__dict__
ns.update({"__file__": os.path.abspath(entry), "__builtins__": builtins})
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
    want = None if timed else eval(expected, ns)
except BaseException as e:
    out(error="the check's expected value does not work: %s: %s" % (type(e).__name__, e)); sys.exit(0)
try:
    t0 = time.perf_counter()
    got = eval(expr, ns)
    ms = (time.perf_counter() - t0) * 1000
except NameError as e:
    out(error=missing(e.name))
except _Input:
    out(error="it waited for typed input; a check types nothing")
except BaseException as e:
    out(error="%s: %s" % (type(e).__name__, e))
else:
    if timed:
        # Final review I1: the answer on the large input must match the hidden solution's (kept as its repr, or a
        # sha256 of a long one), so wrong-but-fast code is not faster.
        import hashlib
        r = repr(got)
        h = hashlib.sha256(r.encode()).hexdigest()
        if expected:
            try:
                ok = expected[7:] == h if expected.startswith("sha256:") else same(got, eval(expected, ns))
            except BaseException:
                ok = False
            if not ok: out(error="gave a different answer on the large input than the hidden solution"); sys.exit(0)
        out(ms=ms, got=r if len(r) <= 2000 else "sha256:" + h); sys.exit(0)
    kind = "other" if isinstance(got, bool) else "int" if isinstance(got, int) else "float" if isinstance(got, float) else "other"
    out(**{"pass": same(got, want), "got": repr(got), "type": kind})
`;

// Habits Task 23: JavaScript and TypeScript (Node strips the types). The entry is imported; its exports (and a
// default-exported object's) are the names a check's expression and expected value are evaluated with.
const NODE_HARNESS = String.raw`
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { isDeepStrictEqual, inspect } from "node:util";
const MARK = "\x1eTUTOR\t";
const [entry, expr, expected] = process.argv.slice(1);
const out = (o) => process.stdout.write("\n" + MARK + JSON.stringify(o) + "\n");
let mod = {}, stopped = null;
try { mod = await import(pathToFileURL(resolve(entry)).href); }
catch (e) { stopped = "your file stopped while loading: " + (e && e.name) + ": " + (e && e.message); }
const scope = { ...(mod.default && typeof mod.default === "object" ? mod.default : {}), ...mod };
// Final review M3: a default-exported function is in scope by its own name.
if (typeof mod.default === "function" && mod.default.name && !(mod.default.name in scope)) scope[mod.default.name] = mod.default;
delete scope.default;
// A CommonJS file's namespace has a "module.exports" key: only names a parameter can take are in scope.
const names = Object.keys(scope).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
const run = (src) => new Function(...names, "return (" + src + ");")(...names.map((k) => scope[k]));
const near = (a, b) => {
  if (typeof a === "number" && typeof b === "number") return a === b || (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); // final review M1: NaN is NaN
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => near(x, b[i]));
  // Phase 8 A5: either side a plain object (the expected value is usually a literal) compares field by field, so a
  // class instance matches the literal of its fields; two instances still need the same class.
  const plain = (o) => [Object.prototype, null].includes(Object.getPrototypeOf(o));
  const builtIn = (o) => [Map, Set, WeakMap, WeakSet, Date, RegExp, Error, Promise].some((C) => o instanceof C) || ArrayBuffer.isView(o) || o instanceof ArrayBuffer;
  const fields = (o, p) => plain(o) ? true : !builtIn(o) && plain(p);
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b) && (plain(a) || plain(b)) && fields(a, b) && fields(b, a)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && near(a[k], b[k]));
  }
  return isDeepStrictEqual(a, b);
};
// Final review I2: "not exported" only for a name the check itself uses; a typo inside the learner's function is
// its own ReferenceError.
const usesName = (n) => new RegExp("(^|[^\\w$.])" + n + "(?![\\w$])").test(expr + " " + expected);
const missing = (e) => {
  const name = /^(\w+) is not defined/.exec(e.message)?.[1];
  if (stopped) return stopped;
  return name && !names.includes(name) && usesName(name) ? name + " is not exported yet (export function " + name + "(…))" : "ReferenceError: " + e.message;
};
let want;
try { want = run(expected); }
catch (e) { out({ error: e instanceof ReferenceError && stopped ? stopped : "the check's expected value does not work: " + e.name + ": " + e.message }); process.exit(0); }
try {
  let got = run(expr);
  if (got && typeof got.then === "function") got = await got;
  out({ pass: near(got, want), got: inspect(got, { depth: 4, breakLength: Infinity }), type: typeof got === "number" ? "float" : "other" });
} catch (e) {
  out({ error: e instanceof ReferenceError ? missing(e) : (e && e.name) + ": " + (e && e.message) });
}
process.exit(0);
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
    local f, e
    if file then f, e = loadfile(src) else f, e = loadstring(src, name) end
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
if ok then
  local kind = "other"
  if type(got) == "number" then kind = (math.type and math.type(got) == "integer") and "int" or "float" end
  out({ pass = same(got, want), got = show(got, 0), type = kind })
  return
end
if got == INPUT then out({ error = "it waited for typed input; a check types nothing" }) return end
-- A file that did not load explains any failure (final review I1: \`M.tip(10)\` fails on a nil M, not a missing name).
if stopped then out({ error = missing("") }) return end
-- Lua 5.4 says "attempt to call a nil value (global 'f')", 5.1 and LuaJIT "attempt to call global 'f' (a nil value)".
local name = tostring(got):match("attempt to call a nil value %(%a+ '([%w_]+)'%)") or tostring(got):match("attempt to call %a+ '([%w_]+)' %(a nil value%)")
out({ error = name and missing(name) or tostring(got) })
`;

/** A Lua long-bracket string literal that cannot be closed by its own text. */
function luaString(s: string): string {
  let eq = "";
  while (s.includes(`]${eq}]`)) eq += "=";
  return `[${eq}[\n${s}]${eq}]`;
}

export interface Sandboxed { run(argv: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>; limited: boolean }

/** The sandbox for `root`, or the reason nothing may run. */
export async function sandboxFor(exec: RunExec, root: string, language: string, tools: string[], host: SandboxHost): Promise<Sandboxed | { missing: string }> {
  let real = root;
  try { real = realpathSync(root); } catch { /* bwrap cannot mount it: the probe reports it */ }
  const prefix = sandboxArgv(real, language, toolBinds([...tools, "timeout", ...CAP_TOOLS], host), host);
  if ((await exec("bwrap", [...prefix, "true"], { cwd: real, timeout: 10_000 })).code !== 0) return { missing: SANDBOX_MISSING };
  const launch = await bwrapLauncher(exec);
  const run = (argv: string[], timeout: number) => { const [c, a] = launch([...prefix, ...freshRust(language, argv)]); return exec(c, a, { cwd: real, timeout }); };
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

/** Habits Task 17: a timed check passes when its call finishes within its limit (none yet: it only measures). */
function timedResult(check: Check, r: { stdout: string; stderr: string; code: number; killed: boolean }): CheckResult {
  const v = valueResult(check, r);
  if (v.error !== undefined) return v;
  const line = r.stdout.split("\n").filter((l) => l.startsWith(MARK)).at(-1)!;
  const o = JSON.parse(line.slice(MARK.length)) as { ms: number; got?: string };
  const ms = Math.round(o.ms);
  const limit = check.limitMs;
  return limit === undefined || ms <= limit ? { check, pass: true, ms, got: o.got }
    : { check, pass: false, ms, error: `took ${ms} ms; the limit is ${limit} ms (the reference's time × 3)` };
}

function valueResult(check: Check, r: { stdout: string; stderr: string; code: number; killed: boolean }): CheckResult {
  if (r.killed) return { check, pass: false, error: TOO_LONG };
  if (flooded(r.stdout)) return { check, pass: false, error: PRINTED_TOO_MUCH };
  const line = r.stdout.split("\n").filter((l) => l.startsWith(MARK)).at(-1);
  if (!line) return { check, pass: false, error: `the check could not run: ${tail(r.stderr || r.stdout, 200) || `exit ${r.code}`}` };
  const o = JSON.parse(line.slice(MARK.length)) as { pass?: boolean; got?: string; error?: string; type?: ValueType };
  return o.error !== undefined ? { check, pass: false, error: o.error } : { check, pass: o.pass === true, got: o.got, valueType: o.type ?? "other" };
}

/** `sh -c` prefix that writes `files` into the throwaway overlay before the command runs (the real folder never sees them). */
function withOverlay(files: [string, string][], argv: string[]): string[] {
  if (!files.length) return argv;
  const script = 'while [ "$1" != "--" ]; do mkdir -p "$(dirname "$1")" && printf "%s" "$2" > "$1" || exit 126; shift 2; done; shift; exec "$@"';
  return ["sh", "-c", script, "sh", ...files.flat(), "--", ...argv];
}

/**
 * `overlay` (habits Task 17, the load flake): files laid over the project in the throwaway copy only, so the code
 * as it was before an improvement can be timed again right next to the code as it is now.
 */
export async function runChecks(exec: RunExec, i: { language: string; root: string; entry: string | null; runCmd: string | null; checks: Check[]; sandbox: SandboxHost | null; limitSec?: number; overlay?: Record<string, string> }): Promise<{ results: CheckResult[]; missing?: string }> {
  const over = Object.entries(i.overlay ?? {});
  if (!i.sandbox) return { results: [], missing: CHECKS_SANDBOX_OFF };
  const interp = LANGS[i.language]?.command;
  const runTool = i.runCmd?.split(/\s+/)[0];
  const node = i.language === "javascript" || i.language === "typescript" ? ["node"] : [];
  const sb = await sandboxFor(exec, i.root, i.language, [interp, runTool, ...node].filter((t): t is string => !!t), i.sandbox);
  if ("missing" in sb) return { results: [], missing: sb.missing };
  const limit = i.limitSec ?? CHECK_LIMIT_SEC;
  const results: CheckResult[] = [];
  // Spec 2026-10-22: Rust/Go function checks build one hidden harness together; their results keep their places.
  const compiled = (i.language === "rust" || i.language === "go") && i.entry ? i.checks.filter((c) => c.kind === "value") : [];
  const built = compiled.length ? await runCompiledChecks(sb, { language: i.language as "rust" | "go", root: i.root, entry: i.entry!, checks: compiled, limitSec: limit }) : [];
  // An older Rust/Go project may have no manifest: the throwaway copy gets a minimal one (the real folder never does).
  const manifest = manifestFor(i.language, "project");
  for (const check of i.checks) {
    if (compiled.includes(check)) { results.push(built[compiled.indexOf(check)]); continue; }
    if (check.kind === "io") {
      if (!i.runCmd) { results.push({ check, pass: false, error: "no run command: add `run:` to README.md's front matter" }); continue; }
      const r = await limitedRun(sb, capped(["sh", "-c", '[ -z "$3" ] || [ -f "$3" ] || printf "%s" "$4" > "$3"; printf "%s" "$1" | sh -c "$2"', "sh", check.stdin ?? "", i.runCmd, manifest?.rel ?? "", manifest?.text ?? ""]), limit);
      if (r.killed) { results.push({ check, pass: false, error: TOO_LONG }); continue; }
      if (flooded(r.stdout)) { results.push({ check, pass: false, error: PRINTED_TOO_MUCH }); continue; }
      const pass = r.stdout.includes(check.contains ?? "");
      results.push({ check, pass, got: tail(r.stdout), ...(pass || r.code === 0 ? {} : { error: tail(r.stderr, 200) || `exit ${r.code}` }) });
      continue;
    }
    if (check.kind === "timed") {
      if (!i.entry || !interp || i.language !== "python") { results.push({ check, pass: false, outcome: "unfit", error: "timed checks run for Python only" }); continue; }
      results.push(timedResult(check, await limitedRun(sb, capped(withOverlay(over, [interp, "-c", PY_HARNESS, i.entry, check.expr ?? "", check.expected ?? "", "timed"])), limit)));
      continue;
    }
    if (i.language === "javascript" || i.language === "typescript") {
      if (!i.entry) { results.push({ check, pass: false, error: "no entry file to load: name it in README.md's `run:` command" }); continue; }
      results.push(valueResult(check, await limitedRun(sb, capped(withOverlay(over, ["node", "--input-type=module", "-e", NODE_HARNESS, "--", i.entry, check.expr ?? "", check.expected ?? ""])), limit)));
      continue;
    }
    if (!i.entry || !interp || (i.language !== "python" && i.language !== "lua")) {
      results.push({ check, pass: false, error: "no entry file to load: name it in README.md's `run:` command" });
      continue;
    }
    const argv = i.language === "python"
      ? capped(withOverlay(over, [interp, "-c", PY_HARNESS, i.entry, check.expr ?? "", check.expected ?? ""]))
      : capped(withOverlay(over, [interp, "-e", `local ENTRY, EXPR, EXPECTED = ${luaString(i.entry)}, ${luaString(check.expr ?? "")}, ${luaString(check.expected ?? "")}\n${LUA_HARNESS}`]));
    results.push(valueResult(check, await limitedRun(sb, argv, limit)));
  }
  return { results };
}
