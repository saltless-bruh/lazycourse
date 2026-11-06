// "Improve it" (habits spec 2026-10-26 §8, Task 17): working code made better, measured before → after.
// logic = edge-case checks that pass; speed = a timed large-input check; code = function size in statements, nesting depth
// and branch count from the language's own parser (Python `ast`, run in the sandbox: the code is the learner's);
// design = the model's notes only, never measured here.
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { RunExec } from "./exam/layout.js";
import type { SandboxHost } from "./exam/sandbox.js";
import { cappedArgv } from "./exam/sandbox.js";
import { sandboxFor } from "./check-run.js";
import { LANGS } from "./knowledge/versions.js";

export interface Metrics { longestFunction: number; maxNesting: number; branches: number }

const PY_METRICS = String.raw`
import ast, json, os, sys
try:
    tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
except BaseException:
    print("null"); sys.exit(0)
names = set(sys.argv[2:])
# Phase 8 A10: the project files the entry imports, directly or not (import x, from x import f, from .x import f),
# found next to the importing file or at the project root; anything else (the standard library) is not the learner's
def local(mod, here, level):
    base = here if level else None
    for _ in range(max(0, level - 1)): base = os.path.dirname(base)
    rel = mod.replace(".", "/") if mod else ""
    for d in ([base] if level else [here, "."]):
        for c in ([os.path.join(d, rel + ".py"), os.path.join(d, rel, "__init__.py")] if rel else [os.path.join(d, "__init__.py")]):
            c = os.path.normpath(c)
            if os.path.isfile(c) and not c.startswith(".."): return c
    return None
trees, todo_files, seen = [], [(sys.argv[1], tree)], set()
while todo_files:
    path, t = todo_files.pop(0)
    if path in seen: continue
    seen.add(path); trees.append(t)
    here = os.path.dirname(path) or "."
    for n in ast.walk(t):
        mods = [(a.name, 0) for a in n.names] if isinstance(n, ast.Import) else [(n.module, n.level)] if isinstance(n, ast.ImportFrom) else []
        if isinstance(n, ast.ImportFrom) and not n.module: mods = [(a.name, n.level) for a in n.names]
        for mod, level in mods:
            f = local(mod, here, level)
            if f and f not in seen:
                try: todo_files.append((f, ast.parse(open(f, encoding="utf-8").read())))
                except BaseException: pass
defs = {}
for t in trees:
    for n in ast.walk(t):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)): defs.setdefault(n.name, n)
# final review I2: the named functions and every function of the file they call, directly or not, so moving the
# body into a helper changes nothing
keep, todo = set(), list(names)
while todo:
    n = todo.pop()
    if n in keep or n not in defs: continue
    keep.add(n)
    for c in ast.walk(defs[n]):
        if isinstance(c, ast.Call):
            f = c.func
            todo.append(f.id if isinstance(f, ast.Name) else f.attr if isinstance(f, ast.Attribute) else "")
fns = [n for t in (trees if names else [tree]) for n in ast.walk(t) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and (not names or (n.name in keep and defs[n.name] is n))]
BLOCK = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.With, ast.AsyncWith, ast.Try) + ((ast.Match,) if hasattr(ast, "Match") else ())
def depth(node, d):
    best = d
    for field, value in ast.iter_fields(node):
        kids = value if isinstance(value, list) else [value]
        # an elif is the lone If in its parent's orelse: the same level, not one deeper
        elif_chain = isinstance(node, ast.If) and field == "orelse" and len(kids) == 1 and isinstance(kids[0], ast.If)
        for c in kids:
            if not isinstance(c, ast.AST) or isinstance(c, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)): continue
            best = max(best, depth(c, d if elif_chain or not isinstance(c, BLOCK) else d + 1))
    return best
def branches(f):
    n = 0
    for x in ast.walk(f):
        if isinstance(x, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.IfExp, ast.ExceptHandler)): n += 1
        elif isinstance(x, ast.BoolOp): n += len(x.values) - 1
        elif hasattr(ast, "match_case") and isinstance(x, ast.match_case): n += 1
    return n
print(json.dumps({
    # side-agent note: statements, not lines, so blank lines, comments and "a; b" change nothing
    "longestFunction": max((sum(1 for x in ast.walk(f) if isinstance(x, ast.stmt) and x is not f) for f in fns), default=0),
    "maxNesting": max((depth(f, 0) for f in fns), default=0),
    "branches": sum(branches(f) for f in fns),
}))
`;

/** Python metrics of `entry` (only `functions`, when given), or null when it does not parse or cannot run. */
export async function codeMetrics(exec: RunExec, i: { root: string; entry: string; sandbox: SandboxHost; functions?: string[]; overlay?: Record<string, string> }): Promise<Metrics | null> {
  let real = i.root;
  try { real = realpathSync(i.root); } catch { return null; }
  const py = LANGS.python.command;
  const sb = await sandboxFor(exec, real, "python", [py], i.sandbox);
  if ("missing" in sb) return null;
  // `overlay`: files laid over the throwaway copy only (the code as it was when /tutor-improve was typed).
  const files = Object.entries(i.overlay ?? {});
  const write = 'while [ "$1" != "--" ]; do mkdir -p "$(dirname "$1")" && printf "%s" "$2" > "$1" || exit 126; shift 2; done; shift; exec "$@"';
  const argv = [py, "-c", PY_METRICS, i.entry, ...(i.functions ?? [])];
  const r = await sb.run(cappedArgv(files.length ? ["sh", "-c", write, "sh", ...files.flat(), "--", ...argv] : argv, 4096, 2048), 30_000);
  try { return JSON.parse(r.stdout.trim()) as Metrics | null; } catch { return null; }
}

const SKIP_DIRS = new Set(["stepup", "__pycache__", "venv", ".venv", "node_modules", "target", "build", "dist"]);

/**
 * Phase 8 A10: every Python file of the project as it is now (path → text), so the code before an improvement is
 * measured and timed with its helpers as they were. No symlinks, no hidden or tool folders; at most 64 files of 100 KB, 512 KB in all.
 */
export function pythonSources(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  let files = 0, bytes = 0;
  const walk = (rel: string) => {
    let names: string[];
    try { names = readdirSync(join(root, rel)).sort(); } catch { return; }
    for (const n of names) {
      const r = rel ? `${rel}/${n}` : n, st = (() => { try { return lstatSync(join(root, r)); } catch { return null; } })();
      if (!st || st.isSymbolicLink() || n.startsWith(".")) continue;
      if (st.isDirectory()) { if (!SKIP_DIRS.has(n)) walk(r); continue; }
      // one file is one argument of the overlay command, and Linux takes at most 128 KB per argument
      if (!n.endsWith(".py") || st.size > 100 * 1024 || files >= 64 || bytes + st.size > 512 * 1024) continue;
      try { out[r] = readFileSync(join(root, r), "utf8"); files++; bytes += st.size; } catch { /* unreadable: left as it is */ }
    }
  };
  walk("");
  return out;
}

export type Measured = Metrics & { edgePassed: number; ms: number | null };

/**
 * What got better and what got worse, in words. Speed counts only past timing noise (2× and 5 ms) and only
 * when a timed check measured both; fewer lines, less nesting and fewer branches are better.
 */
export function improveResult(before: Measured, after: Measured): { better: string[]; worse: string[] } {
  const better: string[] = [], worse: string[] = [];
  if (after.edgePassed !== before.edgePassed) (after.edgePassed > before.edgePassed ? better : worse).push(`edge cases passed: ${before.edgePassed} → ${after.edgePassed}`);
  if (before.ms !== null && after.ms !== null && Math.abs(after.ms - before.ms) >= 5) {
    // The same code timed twice under load varied by 25–40 % (a full-suite flake), so only 2× either way counts.
    if (after.ms * 2 <= before.ms) better.push(`speed: ${before.ms} ms → ${after.ms} ms`);
    else if (after.ms >= before.ms * 2) worse.push(`speed: ${before.ms} ms → ${after.ms} ms`);
  }
  // Side-agent note: one statement more or less is no change (a stray `pass`); nesting and branches count each step.
  const code: [keyof Metrics, string, string, number][] = [["longestFunction", "longest function", " statements", 2], ["maxNesting", "nesting", "", 1], ["branches", "branches", "", 1]];
  for (const [k, label, unit, step] of code) {
    if (Math.abs(after[k] - before[k]) >= step) (after[k] < before[k] ? better : worse).push(`${label}: ${before[k]} → ${after[k]}${unit}`);
  }
  return { better, worse };
}

/** The user message for the improve-it checks (prompts/system/improve.md is the system text). */
export function improvePrompt(i: { taskLine: string; checks: string[] }): string {
  return ["Language: python.", "The task:", i.taskLine, "", "Its checks so far:", ...i.checks, "", "Line forms:",
    "check <task id>: <expression> == <expected value>", "timed <task id>: <expression>"].join("\n");
}

/** The functions the task's checks call (their metrics are what "code" measures). */
export function calledFunctions(exprs: string[]): string[] {
  return [...new Set(exprs.flatMap((e) => [...e.matchAll(/(?<![\w.])([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1])))]
    .filter((n) => !["list", "range", "len", "set", "dict", "tuple", "str", "int", "float", "sorted", "sum", "min", "max", "abs"].includes(n));
}

/** "longest function 5 statements · nesting 2 · branches 2 · edge cases 2/2 · <timed call> 1840 ms" */
export function measuredLine(m: Measured, edgeTotal: number, timed: string | null): string {
  return [`longest function ${m.longestFunction} statements`, `nesting ${m.maxNesting}`, `branches ${m.branches}`,
    ...(edgeTotal ? [`edge cases ${m.edgePassed}/${edgeTotal}`] : []), ...(timed && m.ms !== null ? [`${timed} ${m.ms} ms`] : [])].join(" · ");
}
