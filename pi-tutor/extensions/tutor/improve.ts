// "Improve it" (habits spec 2026-10-26 §8, Task 17): working code made better, measured before → after.
// logic = edge-case checks that pass; speed = a timed large-input check; code = function length, nesting depth
// and branch count from the language's own parser (Python `ast`, run in the sandbox: the code is the learner's);
// design = the model's notes only, never measured here.
import { realpathSync } from "node:fs";
import type { RunExec } from "./exam/layout.js";
import type { SandboxHost } from "./exam/sandbox.js";
import { cappedArgv } from "./exam/sandbox.js";
import { sandboxFor } from "./check-run.js";
import { LANGS } from "./knowledge/versions.js";

export interface Metrics { longestFunction: number; maxNesting: number; branches: number }

const PY_METRICS = String.raw`
import ast, json, sys
try:
    tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
except BaseException:
    print("null"); sys.exit(0)
names = set(sys.argv[2:])
fns = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and (not names or n.name in names)]
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
    "longestFunction": max((f.end_lineno - f.lineno + 1 for f in fns), default=0),
    "maxNesting": max((depth(f, 0) for f in fns), default=0),
    "branches": sum(branches(f) for f in fns),
}))
`;

/** Python metrics of `entry` (only `functions`, when given), or null when it does not parse or cannot run. */
export async function codeMetrics(exec: RunExec, i: { root: string; entry: string; sandbox: SandboxHost; functions?: string[] }): Promise<Metrics | null> {
  let real = i.root;
  try { real = realpathSync(i.root); } catch { return null; }
  const py = LANGS.python.command;
  const sb = await sandboxFor(exec, real, "python", [py], i.sandbox);
  if ("missing" in sb) return null;
  const r = await sb.run(cappedArgv([py, "-c", PY_METRICS, i.entry, ...(i.functions ?? [])], 4096, 2048), 30_000);
  try { return JSON.parse(r.stdout.trim()) as Metrics | null; } catch { return null; }
}

export type Measured = Metrics & { edgePassed: number; ms: number | null };

/**
 * What got better and what got worse, in words. Speed counts only past timing noise (20 % and 5 ms) and only
 * when a timed check measured both; fewer lines, less nesting and fewer branches are better.
 */
export function improveResult(before: Measured, after: Measured): { better: string[]; worse: string[] } {
  const better: string[] = [], worse: string[] = [];
  if (after.edgePassed !== before.edgePassed) (after.edgePassed > before.edgePassed ? better : worse).push(`edge cases passed: ${before.edgePassed} → ${after.edgePassed}`);
  if (before.ms !== null && after.ms !== null && Math.abs(after.ms - before.ms) >= 5) {
    if (after.ms <= before.ms * 0.8) better.push(`speed: ${before.ms} ms → ${after.ms} ms`);
    else if (after.ms >= before.ms * 1.25) worse.push(`speed: ${before.ms} ms → ${after.ms} ms`);
  }
  const code: [keyof Metrics, string, string][] = [["longestFunction", "longest function", " lines"], ["maxNesting", "nesting", ""], ["branches", "branches", ""]];
  for (const [k, label, unit] of code) {
    if (after[k] !== before[k]) (after[k] < before[k] ? better : worse).push(`${label}: ${before[k]} → ${after[k]}${unit}`);
  }
  return { better, worse };
}
