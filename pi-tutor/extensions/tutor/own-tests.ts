// The learner's own tests (spec 2026-10-26 §7, habits Task 14). A task's own test is found by name
// (`test_p1_t1_*` in Python, `p1_t1_*` in Rust, `TestP1T1*` in Go). It adds proof to a task's trusted checks,
// never replaces them: it must pass, and it must fail on a broken copy of the learner's code (the step-up's
// planted slips, reused), or it is "a test that cannot fail". Own tests are the learner's code, so they run
// only inside the exam sandbox, over a throwaway overlay of the project folder: a broken copy is written there
// and never reaches the real file.
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { LANGS } from "./knowledge/versions.js";
import { cappedArgv, type SandboxHost } from "./exam/sandbox.js";
import type { RunExec } from "./exam/layout.js";
import { sandboxFor, type Sandboxed } from "./check-run.js";
import { manifestFor } from "./manifest.js";
import { fixMutants } from "./step-up.js";

export const OWN_TEST_LANGUAGES = new Set(["python", "rust", "go"]);
const SKIP_DIRS = new Set(["node_modules", "target", "__pycache__", "venv", "stepup"]);
const LIMIT_SEC = 60;
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
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (st.isFile() && st.size < 512_000 && test(n)) out.push(relative(root, p));
    }
  };
  walk(root, 0);
  return out;
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
    for (const f of sources(root, (n) => n.endsWith(".py"))) {
      let cls: string | null = null;
      for (const line of readFileSync(join(root, f), "utf8").split("\n")) {
        const c = /^class\s+(\w+)/.exec(line);
        if (c) { cls = c[1]; continue; }
        if (/^\S/.test(line)) cls = null;
        const d = /^(\s*)(?:async\s+)?def\s+(test_\w+)\s*\(/.exec(line);
        if (!d || !d[2].startsWith(`test_${snake}`)) continue;
        if (d[1] === "") out.push(`${f}::${d[2]}`);
        else if (cls) out.push(`${f}::${cls}.${d[2]}`);
      }
    }
  } else if (language === "rust") {
    for (const f of sources(root, (n) => n.endsWith(".rs")))
      for (const d of readFileSync(join(root, f), "utf8").matchAll(/\bfn\s+((?:test_)?p\d+_t\d+_\w*)\s*\(/g))
        if (d[1].replace(/^test_/, "").startsWith(snake)) out.push(`${f}::${d[1]}`);
  } else {
    for (const f of sources(root, (n) => n.endsWith("_test.go")))
      for (const d of readFileSync(join(root, f), "utf8").matchAll(new RegExp(`^func\\s+(TestP${p}T${t}(?!\\d)\\w*)\\s*\\(`, "gm")))
        out.push(`${f}::${d[1]}`);
  }
  return out;
}

const PY_OWN = String.raw`
import sys, os, json, traceback, importlib.util, unittest, inspect
MARK = "\x1eTUTOR\t"
entry = sys.argv[1]
for d in (os.getcwd(), os.path.join(os.getcwd(), "src"), os.path.dirname(os.path.abspath(entry or "."))):
    if os.path.isdir(d): sys.path.insert(0, d)
mods = {}
def say(spec, ok, kind="", msg=""):
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
        f()
        say(spec, True)
    except AssertionError:
        say(spec, False, "assert", traceback.format_exc())
    except BaseException:
        say(spec, False, "error", traceback.format_exc())
`;

interface OneRun { pass: boolean; out: string; assertFailed: boolean; built: boolean }

const tail = (s: string, n = 400) => (s.length > n ? `…${s.slice(-n)}` : s).trim();

async function limited(sb: Sandboxed, argv: string[]) {
  const capped = cappedArgv(argv, 65536, 8192);
  const r = sb.limited
    ? await sb.run(["timeout", "-k", "5", String(LIMIT_SEC), ...capped], (LIMIT_SEC + 15) * 1000)
    : await sb.run(capped, LIMIT_SEC * 1000);
  return { ...r, killed: r.killed || (sb.limited && (r.code === 124 || r.code === 137)) };
}

/** `sh -c` prefix that writes `files` (path, text pairs) into the overlay, then runs the rest of argv. */
function withFiles(files: [string, string][], argv: string[]): string[] {
  const script = 'while [ "$1" != "--" ]; do mkdir -p "$(dirname "$1")" && printf "%s" "$2" > "$1" || exit 126; shift 2; done; shift; exec "$@"';
  return ["sh", "-c", script, "sh", ...files.flat(), "--", ...argv];
}

async function runOnce(sb: Sandboxed, i: { root: string; language: string; tests: string[]; entry: string | null; files: [string, string][] }): Promise<OneRun> {
  const names = i.tests.map((t) => t.split("::")[1]);
  if (i.language === "python") {
    const r = await limited(sb, withFiles(i.files, [LANGS.python.command, "-c", PY_OWN, i.entry ?? "", ...i.tests]));
    if (r.killed) return { pass: false, out: "your test took too long (an endless loop?)", assertFailed: false, built: true };
    const rows = r.stdout.split("\n").filter((l) => l.startsWith(MARK)).map((l) => JSON.parse(l.slice(MARK.length)) as { spec: string; ok: boolean; kind: string; msg: string });
    const bad = rows.filter((x) => !x.ok);
    const pass = rows.length === i.tests.length && bad.length === 0;
    const first = bad[0];
    const out = pass ? "" : first ? `${first.spec.split("::")[1]}: ${tail(first.msg)}` : tail(r.stderr || r.stdout) || `exit ${r.code}`;
    return { pass, out, assertFailed: bad.some((x) => x.kind === "assert"), built: true };
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
  const r = await limited(sb, withFiles(files, argv));
  const text = r.stdout + r.stderr;
  if (r.killed) return { pass: false, out: "your test took too long (an endless loop?)", assertFailed: false, built: true };
  if (text.includes("\x1eBUILD")) return { pass: false, out: tail(text.replace("\x1eBUILD", "")), assertFailed: false, built: false };
  const ran = i.language === "rust" ? /test result: ok\. [1-9]/.test(text) : names.every((n) => text.includes(`--- PASS: ${n}`));
  const pass = r.code === 0 && ran;
  const assertFailed = !pass && (i.language === "rust" ? /assertion/.test(text) : /--- FAIL/.test(text) && !/^panic:/m.test(text));
  return { pass, out: pass ? "" : tail(text) || `exit ${r.code}`, assertFailed, built: true };
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
export async function runOwnTests(exec: RunExec, i: { root: string; language: string; tests: string[]; sandbox: SandboxHost; entry?: string | null }): Promise<{ pass: boolean; out: string; missing?: boolean }> {
  if (!i.tests.length || !OWN_TEST_LANGUAGES.has(i.language)) return { pass: false, out: "no own test" };
  const sb = await sandbox(exec, i.root, i.language, i.sandbox);
  if (!sb) return { pass: false, out: "the sandbox cannot start", missing: true };
  const r = await runOnce(sb, { root: i.root, language: i.language, tests: i.tests, entry: i.entry ?? null, files: [] });
  return { pass: r.pass, out: r.out };
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

/**
 * Broken copies to try, as (file, text) pairs: one planted slip each, inside the functions the own tests call,
 * wherever in the project they are defined (side-agent note: the entry file's first slips missed a function
 * lower down or in another module). Test code is never touched. With no called function found, the entry file.
 */
function brokenCopies(root: string, language: string, tests: string[], entry: string | null): [string, string][] {
  const testFiles = [...new Set(tests.map((t) => t.split("::")[0]))];
  const called = new Set<string>();
  for (const f of testFiles) {
    let text = "";
    try { text = readFileSync(join(root, f), "utf8"); } catch { continue; }
    for (const m of text.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) called.add(m[1]);
  }
  const notTest = (n: string) => !/^(test_|Test)/.test(n) && !/^p\d+_t\d+_/.test(n);
  const out: [string, string][] = [];
  const add = (rel: string, source: string, keep: (at: number) => boolean) => {
    const guarded = testSpans(source, language);
    for (const m of fixMutants(source, 1000)) {
      const at = firstDiff(source, m);
      if (!guarded.some(([a, b]) => at >= a && at < b) && keep(at)) out.push([rel, m]);
    }
  };
  for (const rel of sources(root, (n) => n.endsWith(EXT[language]))) {
    if (isTestFile(rel, language)) continue;
    let source: string;
    try { source = readFileSync(join(root, rel), "utf8"); } catch { continue; }
    const spans = functionSpans(source, language).filter((f) => called.has(f.name) && notTest(f.name));
    if (spans.length) add(rel, source, (at) => spans.some((f) => at >= f.at && at < f.end));
  }
  if (!out.length && entry) {
    try { add(entry, readFileSync(join(root, entry), "utf8"), () => true); } catch { /* no entry file */ }
  }
  return out;
}

/**
 * Whether the own tests can fail: some broken copy of the code they call (one planted slip each) makes one of
 * them fail an assertion. A copy that only crashes, or does not build, proves nothing, since a test with no
 * assertion "fails" on it too.
 */
export async function canFail(exec: RunExec, i: { root: string; language: string; tests: string[]; entry?: string | null; sandbox: SandboxHost }): Promise<boolean> {
  if (!i.tests.length || !OWN_TEST_LANGUAGES.has(i.language)) return false;
  const copies = brokenCopies(i.root, i.language, i.tests, i.entry ?? null);
  if (!copies.length) return false;
  const sb = await sandbox(exec, i.root, i.language, i.sandbox);
  if (!sb) return false;
  const max = i.language === "python" ? MAX_MUTANTS.python : MAX_MUTANTS.compiled;
  for (const [rel, broken] of copies.slice(0, max)) {
    const r = await runOnce(sb, { root: i.root, language: i.language, tests: i.tests, entry: i.entry ?? null, files: [[rel, broken]] });
    if (r.built && !r.pass && r.assertFailed) return true;
  }
  return false;
}
