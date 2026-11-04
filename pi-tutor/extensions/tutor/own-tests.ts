// The learner's own tests (spec 2026-10-26 §7, habits Task 14). A task's own test is found by name
// (`test_p1_t1_*` in Python, `p1_t1_*` in Rust, `TestP1T1*` in Go). It adds proof to a task's trusted checks,
// never replaces them: it must pass, and it must fail on a broken copy of the learner's code (the step-up's
// planted slips, reused), or it is "a test that cannot fail". Own tests are the learner's code, so they run
// only inside the exam sandbox, over a throwaway overlay of the project folder: a broken copy is written there
// and never reaches the real file.
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { LANGS } from "./knowledge/versions.js";
import { cappedArgv, type SandboxHost } from "./exam/sandbox.js";
import type { RunExec } from "./exam/layout.js";
import { sandboxFor, type Sandboxed } from "./check-run.js";
import { manifestFor } from "./manifest.js";
import { codeMask, fixMutants } from "./step-up.js";
import { rustLifetime } from "./near-miss.js";

export const OWN_TEST_LANGUAGES = new Set(["python", "rust", "go"]);
const SKIP_DIRS = new Set(["node_modules", "target", "__pycache__", "venv", "stepup"]);
const LIMIT_SEC = 60;
// Final review: a planted slip can loop forever (`i + 1` → `i - 1`); a Python copy gets 10 s, not 60, so
// /tutor-done, which holds the lock, is not stuck for minutes. Rust and Go copies must build, so they keep 60.
const MUTANT_SEC = { python: 10, compiled: LIMIT_SEC };
const MAX_MUTANTS = { python: 12, compiled: 6 };
const MARK = "\x1eTUTOR\t";

/** Source files of `language` under `root`, sorted, skipping hidden folders, builds and step-up copies. */
function sources(root: string, test: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    let names: string[] = [];
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const n of names) {
      if (n.startsWith(".") || SKIP_DIRS.has(n) || n.startsWith("stepup.before-")) continue;
      const p = join(dir, n);
      let st;
      // Final review: a symlink can point out of the project; it is never followed (CLAUDE.md root rule).
      try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p, depth + 1);
      else if (st.isFile() && st.size < 512_000 && test(n)) out.push(relative(root, p));
    }
  };
  walk(root, 0);
  return out;
}

/** Python tests in one file as `file::name` (methods as `file::Class.name`), the names `keep` accepts. */
function pythonTests(root: string, f: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  let cls: string | null = null, text = "";
  try { text = readFileSync(join(root, f), "utf8"); } catch { return out; }
  for (const line of text.split("\n")) {
    const c = /^class\s+(\w+)/.exec(line);
    if (c) { cls = c[1]; continue; }
    if (/^[^\s#@]/.test(line)) cls = null; // final review M1: a column-0 comment or decorator keeps the class
    const d = /^(\s*)(?:async\s+)?def\s+(test_\w+)\s*\(/.exec(line);
    if (!d || !keep(d[2])) continue;
    if (d[1] === "") out.push(`${f}::${d[2]}`);
    else if (cls) out.push(`${f}::${cls}.${d[2]}`);
  }
  return out;
}

/** Every Python test in `rel` (the step-up's tests part, habits Task 17). */
export function testsInFile(root: string, rel: string): string[] {
  return pythonTests(root, rel, () => true);
}

/**
 * The task's own tests as `file::name` (Python methods as `file::Class.name`). `task` is `P1.T1`; names follow
 * the language's test style, and `P1.T1` never matches `P1.T10`.
 */
export function findOwnTests(root: string, language: string, task: string): string[] {
  const m = /^P(\d+)\.T(\d+)$/.exec(task);
  if (!m || !OWN_TEST_LANGUAGES.has(language)) return [];
  const [p, t] = [m[1], m[2]];
  const snake = `p${p}_t${t}_`;
  const out: string[] = [];
  if (language === "python") {
    for (const f of sources(root, (n) => n.endsWith(".py"))) out.push(...pythonTests(root, f, (n) => n.startsWith(`test_${snake}`)));
  } else if (language === "rust") {
    for (const f of sources(root, (n) => n.endsWith(".rs")))
      for (const d of readFileSync(join(root, f), "utf8").matchAll(/#\[test\]\s*(?:#\[[^\]]*\]\s*)*(?:async\s+)?fn\s+((?:test_)?p\d+_t\d+_\w*)\s*\(/g)) // final review M4: #[test] only
        if (d[1].replace(/^test_/, "").startsWith(snake)) out.push(`${f}::${d[1]}`);
  } else {
    for (const f of sources(root, (n) => n.endsWith("_test.go")))
      for (const d of readFileSync(join(root, f), "utf8").matchAll(new RegExp(`^func\\s+(TestP${p}T${t}(?!\\d)\\w*)\\s*\\(`, "gm")))
        out.push(`${f}::${d[1]}`);
  }
  return out;
}

/** Whether the learner wrote any test at all (named for a task or not). */
export function hasTests(root: string, language: string): boolean {
  if (!OWN_TEST_LANGUAGES.has(language)) return false;
  const [ext, re] = language === "python" ? [".py", /^\s*(?:async\s+)?def\s+test_\w*\s*\(/m]
    : language === "rust" ? [".rs", /#\[test\]/] : ["_test.go", /^func\s+Test\w*\s*\(/m];
  return sources(root, (n) => n.endsWith(ext)).some((f) => { try { return re.test(readFileSync(join(root, f), "utf8")); } catch { return false; } });
}

/** The name a task's own test takes, for the learner (`P1.T1` → `test_p1_t1_<what>`). */
export function ownTestName(language: string, task: string): string {
  const [p, t] = task.slice(1).split(".T");
  return language === "go" ? `TestP${p}T${t}<What>` : language === "rust" ? `p${p}_t${t}_<what>` : `test_p${p}_t${t}_<what>`;
}

const PY_OWN = String.raw`
import sys, os, re, json, traceback, importlib.util, unittest, inspect, asyncio
MARK = "\x1eTUTOR\t"
entry = sys.argv[1]
for d in (os.getcwd(), os.path.join(os.getcwd(), "src"), os.path.dirname(os.path.abspath(entry or "."))):
    if os.path.isdir(d): sys.path.insert(0, d)
mods = {}
def short(text):
    # The learner's own line: the last frame inside the project, then the error (phase 4 live run).
    lines = text.rstrip().split("\n")
    last = lines[-1].strip() if lines else ""
    at = None
    for k, l in enumerate(lines):
        mm = re.match(r'\s*File "([^"]+)", line (\d+)', l)
        if mm and os.path.abspath(mm.group(1)).startswith(os.getcwd() + os.sep):
            code = lines[k + 1].strip() if k + 1 < len(lines) and not lines[k + 1].strip().startswith(("File ", "~", "^")) else ""
            at = "%s:%s: %s" % (os.path.relpath(mm.group(1)), mm.group(2), code)
    return "%s (%s)" % (at, last) if at else last
def say(spec, ok, kind="", msg=""):
    if msg: msg = short(msg)
    print(MARK + json.dumps({"spec": spec, "ok": ok, "kind": kind, "msg": msg[-600:]}), flush=True)
for spec in sys.argv[2:]:
    path, name = spec.split("::", 1)
    try:
        if path not in mods:
            sys.path.insert(0, os.path.dirname(os.path.abspath(path)))
            s = importlib.util.spec_from_file_location("tutor_own_%d" % len(mods), path)
            m = importlib.util.module_from_spec(s)
            s.loader.exec_module(m)
            mods[path] = m
        m = mods[path]
        cls, _, fn = name.rpartition(".")
        if cls and isinstance(getattr(m, cls, None), type) and issubclass(getattr(m, cls), unittest.TestCase):
            r = unittest.TestResult()
            getattr(m, cls)(fn).run(r)
            if r.failures: say(spec, False, "assert", r.failures[0][1])
            elif r.errors: say(spec, False, "error", r.errors[0][1])
            elif r.skipped: say(spec, False, "error", "skipped: " + str(r.skipped[0][1]))
            else: say(spec, True)
            continue
        f = getattr(getattr(m, cls)(), fn) if cls else getattr(m, fn)
        if inspect.signature(f).parameters:
            say(spec, False, "error", name + " takes arguments (pytest fixtures are not supported here)")
            continue
        asyncio.run(f()) if inspect.iscoroutinefunction(f) else f()
        say(spec, True)
    except AssertionError:
        say(spec, False, "assert", traceback.format_exc())
    except BaseException:
        say(spec, False, "error", traceback.format_exc())
`;

interface OneRun { pass: boolean; out: string; assertFailed: boolean; built: boolean; failed?: string }

const tail = (s: string, n = 400) => (s.length > n ? `…${s.slice(-n)}` : s).trim();

async function limited(sb: Sandboxed, argv: string[], sec = LIMIT_SEC) {
  const capped = cappedArgv(argv, 65536, 8192);
  const r = sb.limited
    ? await sb.run(["timeout", "-k", "5", String(sec), ...capped], (sec + 15) * 1000)
    : await sb.run(capped, sec * 1000);
  return { ...r, killed: r.killed || (sb.limited && (r.code === 124 || r.code === 137)) };
}

/** `sh -c` prefix that writes `files` (path, text pairs) into the overlay, then runs the rest of argv. */
function withFiles(files: [string, string][], argv: string[]): string[] {
  const script = 'while [ "$1" != "--" ]; do mkdir -p "$(dirname "$1")" && printf "%s" "$2" > "$1" || exit 126; shift 2; done; shift; exec "$@"';
  return ["sh", "-c", script, "sh", ...files.flat(), "--", ...argv];
}

async function runOnce(sb: Sandboxed, i: { root: string; language: string; tests: string[]; entry: string | null; files: [string, string][]; sec?: number }): Promise<OneRun> {
  const names = i.tests.map((t) => t.split("::")[1]);
  if (i.language === "python") {
    const r = await limited(sb, withFiles(i.files, [LANGS.python.command, "-c", PY_OWN, i.entry ?? "", ...i.tests]), i.sec);
    if (r.killed) return { pass: false, out: "your test took too long (an endless loop?)", assertFailed: false, built: true };
    const rows = r.stdout.split("\n").filter((l) => l.startsWith(MARK)).map((l) => JSON.parse(l.slice(MARK.length)) as { spec: string; ok: boolean; kind: string; msg: string });
    const bad = rows.filter((x) => !x.ok);
    const pass = rows.length === i.tests.length && bad.length === 0;
    const first = bad[0];
    const out = pass ? "" : first ? `${first.spec.split("::")[1]}: ${tail(first.msg)}` : tail(r.stderr || r.stdout) || `exit ${r.code}`;
    return { pass, out, assertFailed: bad.some((x) => x.kind === "assert"), built: true, failed: first?.spec.split("::")[1].split(".").at(-1) };
  }
  // Rust and Go: build first, so a broken copy that does not compile is told apart from a test that fails.
  const manifest = manifestFor(i.language, "project");
  const files = [...i.files];
  if (manifest && !existsIn(i.root, manifest.rel)) files.unshift([manifest.rel, manifest.text]);
  const dirs = [...new Set(i.tests.map((t) => t.split("::")[0].replace(/\/?[^/]*$/, "") || "."))];
  const script = i.language === "rust"
    ? 'cargo test --offline --no-run --quiet 2>&1 || { echo "\x1eBUILD"; exit 1; }; cargo test --offline --quiet -- "$@" 2>&1'
    : 'for d in $DIRS; do go test -c -vet=off -o /tmp/.own.test "./$d" 2>&1 || { echo "\x1eBUILD"; exit 1; }; /tmp/.own.test -test.v -test.run "^($RUN)$" 2>&1 || exit 1; done';
  const argv = i.language === "rust"
    ? ["sh", "-c", script, "sh", ...names]
    : ["env", `DIRS=${dirs.join(" ")}`, `RUN=${names.join("|")}`, "sh", "-c", script];
  const r = await limited(sb, withFiles(files, argv), i.sec);
  const text = r.stdout + r.stderr;
  if (r.killed) return { pass: false, out: "your test took too long (an endless loop?)", assertFailed: false, built: true };
  if (text.includes("\x1eBUILD")) return { pass: false, out: tail(text.replace("\x1eBUILD", "")), assertFailed: false, built: false };
  const ran = i.language === "rust" ? /test result: ok\. [1-9]/.test(text) : names.every((n) => text.includes(`--- PASS: ${n}`));
  const pass = r.code === 0 && ran;
  // Final review M3: the assertion is in the panic message, not anywhere in the output (a test name can say "assertion").
  const assertFailed = !pass && (i.language === "rust" ? /panicked at[^\n]*(?:\n\s*|: ?'?)assert/.test(text) : /--- FAIL/.test(text) && !/^panic:/m.test(text));
  if (pass) return { pass, out: "", assertFailed, built: true };
  // Final review I3: the failing test's own name and message, so a try keeps one spot between runs.
  const failed = i.language === "rust" ? /---- (?:[\w:]*::)?(\w+) stdout ----/.exec(text)?.[1] : /--- FAIL: (\w+)/.exec(text)?.[1];
  const body = failed && i.language === "rust" ? new RegExp(`---- (?:[\\w:]*::)?${failed} stdout ----\\n([\\s\\S]*?)(?:\\n\\n|$)`).exec(text)?.[1]
    : failed ? new RegExp(`=== RUN\\s+${failed}\\n([\\s\\S]*?)--- FAIL`).exec(text)?.[1] : undefined;
  const out = failed ? `${failed}: ${(body ?? "").trim().replace(/\s*\n\s*/g, " ").slice(0, 400) || "failed"}` : tail(text) || `exit ${r.code}`;
  return { pass, out, assertFailed, built: true, failed };
}

const firstDiff = (a: string, b: string) => { let k = 0; while (k < a.length && a[k] === b[k]) k++; return k; };

/** Where test code sits inside the entry file: a broken copy must break the learner's code, not their test. */
function testSpans(source: string, language: string): [number, number][] {
  if (language === "rust") { const at = source.search(/#\[cfg\(test\)\]/); return at < 0 ? [] : [[at, source.length]]; }
  if (language !== "python") return [];
  const spans: [number, number][] = [];
  const lines = source.split("\n");
  let pos = 0, open: { at: number; indent: number } | null = null;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    if (open && line.trim() && indent <= open.indent) { spans.push([open.at, pos]); open = null; }
    const d = /^(\s*)(?:async\s+)?def\s+test_\w*/.exec(line) ?? /^(\s*)class\s+Test\w*/.exec(line);
    if (!open && d) open = { at: pos, indent: d[1].length };
    pos += line.length + 1;
  }
  if (open) spans.push([open.at, source.length]);
  return spans;
}

function existsIn(root: string, rel: string): boolean {
  try { statSync(join(root, rel)); return true; } catch { return false; }
}

const tools = (language: string) => language === "python" ? [LANGS.python.command, "env", "mkdir", "dirname", "printf"]
  : language === "rust" ? ["cargo", "rustc", "env", "mkdir", "dirname", "printf"] : ["go", "env", "mkdir", "dirname", "printf", "true"];

async function sandbox(exec: RunExec, root: string, language: string, host: SandboxHost): Promise<Sandboxed | null> {
  let real = root;
  try { real = realpathSync(root); } catch { return null; }
  const sb = await sandboxFor(exec, real, language, tools(language), host);
  return "missing" in sb ? null : sb;
}

/** Run the own tests on the learner's code as it is. `missing` when the sandbox cannot start. */
/**
 * `overlay` (habits Task 17, the step-up's tests part): files laid over the project in the throwaway copy only,
 * so the learner's tests run against a hidden solution that never reaches the real folder.
 */
export async function runOwnTests(exec: RunExec, i: { root: string; language: string; tests: string[]; sandbox: SandboxHost; entry?: string | null; overlay?: Record<string, string> }): Promise<{ pass: boolean; out: string; missing?: boolean; failed?: string }> {
  if (!i.tests.length || !OWN_TEST_LANGUAGES.has(i.language)) return { pass: false, out: "no own test" };
  const sb = await sandbox(exec, i.root, i.language, i.sandbox);
  if (!sb) return { pass: false, out: "the sandbox cannot start", missing: true };
  const r = await runOnce(sb, { root: i.root, language: i.language, tests: i.tests, entry: i.entry ?? null, files: Object.entries(i.overlay ?? {}) });
  return { pass: r.pass, out: r.out, failed: r.failed };
}

/** Functions defined in `source`: name and the span of its body, so a planted bug lands where a test looks. */
function functionSpans(source: string, language: string): { name: string; at: number; end: number }[] {
  const out: { name: string; at: number; end: number }[] = [];
  if (language === "python") {
    const lines = source.split("\n");
    const starts: number[] = [];
    let pos = 0;
    for (const l of lines) { starts.push(pos); pos += l.length + 1; }
    lines.forEach((line, k) => {
      const d = /^(\s*)(?:async\s+)?def\s+(\w+)/.exec(line);
      if (!d) return;
      let j = k + 1;
      while (j < lines.length && (!lines[j].trim() || lines[j].length - lines[j].trimStart().length > d[1].length)) j++;
      out.push({ name: d[2], at: starts[k], end: j < lines.length ? starts[j] : source.length });
    });
    return out;
  }
  const head = language === "rust" ? /\bfn\s+(\w+)[^{;]*\{/g : /^func\s+(?:\([^)]*\)\s*)?(\w+)[^{]*\{/gm;
  for (const m of source.matchAll(head)) {
    let depth = 0, k = m.index! + m[0].length - 1;
    for (; k < source.length; k++) { if (source[k] === "{") depth++; else if (source[k] === "}" && --depth === 0) break; }
    out.push({ name: m[1], at: m.index!, end: k + 1 });
  }
  return out;
}

const isTestFile = (rel: string, language: string) =>
  language === "go" ? rel.endsWith("_test.go") : language === "python" ? /(^|\/)tests?\/|(^|\/)test_[^/]*\.py$|_test\.py$/.test(rel) : false;
const EXT: Record<string, string> = { python: ".py", rust: ".rs", go: ".go" };

/** Copies of `source`, each with one string literal changed (final review I1: a string task's only operator slip, `+`, just crashes). */
function stringMutants(source: string, language: string): string[] {
  const out: string[] = [];
  const quotes = language === "python" ? `"'` : `"`;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if ((language === "python" && ch === "#") || (language !== "python" && ch === "/" && source[i + 1] === "/")) { const nl = source.indexOf("\n", i); if (nl < 0) break; i = nl; continue; }
    if (language === "rust" && ch === "'") {
      if (rustLifetime(source, i)) continue;
      i = source.indexOf("'", i + (source[i + 1] === "\\" ? 3 : 2)); if (i < 0) break; continue;
    }
    if (language === "go" && ch === "`") { const e = source.indexOf("`", i + 1); if (e < 0) break; i = e; continue; }
    if (!quotes.includes(ch)) continue;
    if (language === "python" && source.startsWith(ch.repeat(3), i)) { const e = source.indexOf(ch.repeat(3), i + 3); if (e < 0) break; i = e + 2; continue; }
    let j = i + 1;
    while (j < source.length && source[j] !== ch && source[j] !== "\n") j += source[j] === "\\" ? 2 : 1;
    if (source[j] === ch) out.push(source.slice(0, j) + "!" + source.slice(j));
    i = j;
  }
  return out;
}

/** The source of each own test's body (the pro score's done-when coverage, Task 16). */
export function ownTestBodies(root: string, language: string, tests: string[]): string[] {
  return tests.flatMap((t) => {
    const [file, name] = t.split("::");
    let text = "";
    try { text = readFileSync(join(root, file), "utf8"); } catch { return []; }
    const own = functionSpans(text, language).find((f) => f.name === name.split(".").at(-1));
    return own ? [text.slice(own.at, own.end)] : [];
  });
}

/**
 * Logic slips (phase 5 live run: `if x not in seen: seen.append(x)` had no operator, number or string to slip, so
 * a good test was "untestable"): `not in` ↔ `in` (never a `for … in`), `and` ↔ `or`, and a condition negated
 * (`if x:` → `if not (x):`; Go/Rust `&&` ↔ `||`, `if x {` → `if !(x) {`). Strings and comments are never touched.
 */
function logicMutants(source: string, language: string): string[] {
  const code = codeMask(source, language), out: string[] = [];
  const add = (at: number, len: number, by: string) => {
    for (let k = at; k < at + len; k++) if (!code[k]) return;
    out.push(source.slice(0, at) + by + source.slice(at + len));
  };
  if (language === "python") {
    for (const m of source.matchAll(/ not in /g)) add(m.index!, m[0].length, " in ");
    for (const m of source.matchAll(/ in /g)) {
      const line = source.slice(source.lastIndexOf("\n", m.index!) + 1, m.index!);
      if (!/\bfor\b/.test(line) && !line.endsWith(" not") && !line.endsWith(" is")) add(m.index!, m[0].length, " not in ");
    }
    for (const m of source.matchAll(/ (and|or) /g)) add(m.index!, m[0].length, m[1] === "and" ? " or " : " and ");
    for (const m of source.matchAll(/^([ \t]*(?:if|elif|while)\s+)(.+?):[ \t]*(#.*)?$/gm)) add(m.index! + m[1].length, m[2].length, `not (${m[2]})`);
  } else {
    for (const m of source.matchAll(/ (&&|\|\|) /g)) add(m.index!, m[0].length, m[1] === "&&" ? " || " : " && ");
    for (const m of source.matchAll(/^([ \t]*(?:\} else )?if\s+)(?!let\b)(.+?)\s*\{[ \t]*$/gm)) add(m.index! + m[1].length, m[2].length, `!(${m[2]})`);
  }
  return out;
}

/** Names called inside the own tests' bodies (final review I2: not anywhere in a file that tests other tasks too). */
function calledByTests(root: string, language: string, tests: string[]): Set<string> {
  const called = new Set<string>();
  for (const t of tests) {
    const [file, name] = t.split("::");
    let text = "";
    try { text = readFileSync(join(root, file), "utf8"); } catch { continue; }
    const own = functionSpans(text, language).find((f) => f.name === name.split(".").at(-1));
    for (const m of (own ? text.slice(own.at, own.end) : text).matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) called.add(m[1]);
  }
  return called;
}

/**
 * Broken copies to try, as (file, text) pairs: one planted slip or changed string each, inside the functions the
 * own tests call, wherever in the project they are defined (side-agent note), taken in turn from each function
 * (final review I2) so the budget is not spent on one. Test code is never touched. With no called function
 * found, the entry file.
 */
function brokenCopies(root: string, language: string, tests: string[], entry: string | null, overlay: Record<string, string> = {}, only?: string[]): [string, string][] {
  const read = (rel: string) => overlay[rel] ?? readFileSync(join(root, rel), "utf8");
  const called = calledByTests(root, language, tests);
  const notTest = (n: string) => !/^(test_|Test)/.test(n) && !/^p\d+_t\d+_/.test(n);
  const groups: [string, string][][] = [];
  let found = false;
  const add = (rel: string, source: string, spans: { at: number; end: number }[] | null) => {
    const guarded = testSpans(source, language);
    const byFn = new Map<number, [string, string][]>();
    for (const m of [...fixMutants(source, 1000, language), ...stringMutants(source, language), ...logicMutants(source, language)]) {
      const at = firstDiff(source, m);
      if (guarded.some(([a, b]) => at >= a && at < b)) continue;
      const k = spans ? spans.findIndex((f) => at >= f.at && at < f.end) : 0;
      if (k < 0) continue;
      byFn.set(k, [...(byFn.get(k) ?? []), [rel, m]]);
    }
    groups.push(...byFn.values());
  };
  // Final review I4: `only` keeps the broken copies to those files (the step-up's solve), so tests of other code never count.
  for (const rel of only ?? sources(root, (n) => n.endsWith(EXT[language]))) {
    if (!only && isTestFile(rel, language)) continue;
    let source: string;
    try { source = read(rel); } catch { continue; }
    const spans = functionSpans(source, language).filter((f) => called.has(f.name) && notTest(f.name));
    if (spans.length) { found = true; add(rel, source, spans); }
  }
  // Only when no function the test calls was found: a found one with nothing to break stays untestable.
  if (!found && entry && (!only || only.includes(entry))) {
    try { add(entry, read(entry), null); } catch { /* no entry file */ }
  }
  const out: [string, string][] = [];
  for (let k = 0; groups.some((g) => k < g.length); k++) for (const g of groups) if (k < g.length) out.push(g[k]);
  return out;
}

/**
 * Whether the own tests can fail (final review I1, three answers): "caught" — a broken copy of the code they call
 * made one of them fail an assertion; "missed" — a broken copy ran and every test still passed; "untestable" —
 * no copy could be tried (nothing to break, every copy only crashed or did not build, or no sandbox). A copy that
 * only crashes proves nothing, since a test with no assertion "fails" on it too.
 */
export type CanFail = "caught" | "missed" | "untestable";
export async function canFail(exec: RunExec, i: { root: string; language: string; tests: string[]; entry?: string | null; sandbox: SandboxHost; overlay?: Record<string, string>; only?: string[] }): Promise<CanFail> {
  if (!i.tests.length || !OWN_TEST_LANGUAGES.has(i.language)) return "untestable";
  const overlay = i.overlay ?? {};
  const copies = brokenCopies(i.root, i.language, i.tests, i.entry ?? null, overlay, i.only);
  if (!copies.length) return "untestable";
  const sb = await sandbox(exec, i.root, i.language, i.sandbox);
  if (!sb) return "untestable";
  const max = i.language === "python" ? MAX_MUTANTS.python : MAX_MUTANTS.compiled;
  let missed = false;
  for (const [rel, broken] of copies.slice(0, max)) {
    const r = await runOnce(sb, { root: i.root, language: i.language, tests: i.tests, entry: i.entry ?? null, files: [...Object.entries(overlay).filter(([k]) => k !== rel), [rel, broken]], sec: i.language === "python" ? MUTANT_SEC.python : MUTANT_SEC.compiled });
    if (r.built && !r.pass && r.assertFailed) return "caught";
    if (r.pass) missed = true;
  }
  return missed ? "missed" : "untestable";
}
