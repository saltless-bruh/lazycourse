// Rust and Go function checks (spec 2026-10-22 §5.2). A hidden test harness is written into the sandbox's
// throwaway copy only (Rust: a `#[cfg(test)] mod tutor_check` appended to the entry; Go: zz_tutor_check_test.go
// beside it), built once, then each check runs on its own under a time limit. Compiler errors are sorted
// into the outcomes of spec §4: not written yet, does not fit, inside the checked function, elsewhere, typo.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Check } from "./checks.js";
import { PRINTED_TOO_MUCH, TOO_LONG, type CheckResult, type Sandboxed } from "./check-run.js";
import { manifestFor } from "./manifest.js";
import { isSyntaxError } from "./stuck.js";

type Lang = "rust" | "go";
const MARK = "\x1eTUTOR\t";
const PART_CAP = 16384;
const BUILD_LIMIT_SEC = 300;

/** 1-based first and last line of function `name` in `source`, or null. Braces in strings and comments are skipped. */
export function functionSpan(source: string, name: string, language: Lang): [number, number] | null {
  const head = language === "rust"
    ? new RegExp(`\\bfn\\s+${name}\\s*[<(]`)
    : new RegExp(`^func\\s+(?:\\([^)]*\\)\\s*)?${name}\\s*[[(]`, "m");
  const m = head.exec(source);
  if (!m) return null;
  const lineAt = (i: number) => source.slice(0, i).split("\n").length;
  let depth = 0, opened = false;
  for (let i = m.index; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (ch === "/" && next === "/") { i = source.indexOf("\n", i); if (i < 0) break; continue; }
    if (ch === "/" && next === "*") { i = source.indexOf("*/", i + 2) + 1; if (i <= 0) break; continue; }
    if (ch === '"' || ch === "`") {
      for (i++; i < source.length && source[i] !== ch; i++) if (source[i] === "\\" && ch === '"') i++;
      continue;
    }
    if (ch === "{") { depth++; opened = true; }
    else if (ch === "}" && --depth === 0 && opened) return [lineAt(m.index), lineAt(i)];
  }
  return null;
}

/** The function an expression calls: the last path segment before its first `(`. */
export function calledName(expr: string): string | null {
  const m = /^\s*([A-Za-z_][\w]*(?:(?:::|\.)[A-Za-z_]\w*)*)\s*(?:::<[^>]*>)?\s*\(/.exec(expr);
  return m ? m[1].split(/::|\./).at(-1)! : null;
}

interface Diag { file: string; line: number; message: string }

/** `src/main.rs:3:51: error[E0308]: mismatched types…` (Rust, --message-format=short) or `src/main.go:5:16: declared…` (Go). */
function diagnostics(text: string, language: Lang): Diag[] {
  const out: Diag[] = [];
  for (const l of text.split("\n")) {
    const m = /^(\S+?):(\d+):\d+: (.*)$/.exec(l.trim());
    if (!m) continue;
    if (language === "rust" && !/^error\b/.test(m[3])) continue; // warnings and notes
    out.push({ file: m[1], line: Number(m[2]), message: m[3] });
  }
  return out;
}
const shown = (d: Diag) => `${d.file}:${d.line}: ${d.message.replace(/^error(\[E\d+\])?: /, "")}`;
const missingName = (d: Diag) =>
  /cannot find function `([\w]+)`/.exec(d.message)?.[1] ?? /^undefined: (?:\w+\.)?(\w+)$/.exec(d.message)?.[1] ?? null;

function same(got: string, want: string): boolean {
  const a = Number(got), b = Number(want);
  if (got.trim() !== "" && want.trim() !== "" && Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return got === want;
}

/** The harness source and, per check number, the line (in the harness's file) that holds it. */
function harness(language: Lang, items: { c: Check; n: number }[], pkg: string, firstLine: number): { text: string; lineOf: Map<number, number> } {
  const lineOf = new Map<number, number>();
  const lines = language === "rust"
    ? ["", "#[cfg(test)]", "mod tutor_check {", "    #[allow(unused_imports)] use super::*;"]
    : [`package ${pkg}`, "", 'import ("fmt"; "testing")', ""];
  for (const { c, n } of items) {
    lineOf.set(n, firstLine + lines.length);
    lines.push(language === "rust"
      ? `    #[test] fn c${n}() { let got = ${c.expr}; let want = ${c.expected}; println!("\\x1eTUTOR\\t{:?}\\t{:?}", got, want); }`
      : `func TestTutorC${n}(t *testing.T) { got := ${c.expr}; want := ${c.expected}; fmt.Printf("\\x1eTUTOR\\t%v\\t%v\\n", got, want) }`);
  }
  if (language === "rust") lines.push("}");
  return { text: `${lines.join("\n")}\n`, lineOf };
}

// $1 manifest file, $2 its text, $3 harness file, $4 harness text, $5 append (1) or create (0), $6 build command,
// $7 run command prefix (check name appended), $8 time limit; then the check names.
const SCRIPT = [
  'man=$1 mtext=$2 hfile=$3 htext=$4 append=$5 build=$6 runp=$7 lim=$8; shift 8',
  '[ -f "$man" ] || printf "%s" "$mtext" > "$man"',
  'if [ "$append" = 1 ]; then printf "%s" "$htext" >> "$hfile"; else printf "%s" "$htext" > "$hfile"; fi',
  'sh -c "$build" > /tmp/.tutor-build 2>&1; b=$?',
  `printf '\\036BUILD\\t%s\\n' "$b"; head -c ${PART_CAP} /tmp/.tutor-build; printf '\\n'`,
  '[ "$b" = 0 ] || exit 0',
  `for n in "$@"; do printf '\\036START\\t%s\\n' "$n"; { timeout -k 5 "$lim" sh -c "$runp$n" 2>&1; printf '\\n\\036CODE\\t%s\\n' "$?"; } | head -c ${PART_CAP}; printf '\\n\\036END\\n'; done`,
].join("\n");

function sources(root: string, dir: string, ext: string): Map<string, string> {
  const out = new Map<string, string>();
  try { for (const f of readdirSync(join(root, dir))) if (f.endsWith(ext)) out.set(dir === "." ? f : `${dir}/${f}`, readFileSync(join(root, dir, f), "utf8")); } catch { /* no folder */ }
  return out;
}

export async function runCompiledChecks(sb: Sandboxed, i: { language: Lang; root: string; entry: string; checks: Check[]; limitSec: number }): Promise<CheckResult[]> {
  const { language, root, entry } = i;
  const results: (CheckResult | undefined)[] = i.checks.map(() => undefined);
  const dir = dirname(entry) || ".";
  const files = sources(root, dir, language === "rust" ? ".rs" : ".go");
  const entryText = files.get(entry) ?? "";
  const pkg = /^package\s+(\w+)/m.exec(entryText)?.[1] ?? "main";
  const manifest = manifestFor(language, "project")!;
  let pending = i.checks.map((c, k) => ({ c, n: k + 1 }));
  for (let attempt = 0; attempt <= i.checks.length && pending.length; attempt++) {
    const hfile = language === "rust" ? entry : `${dir}/zz_tutor_check_test.go`;
    const firstLine = language === "rust" ? entryText.split("\n").length + (entryText.endsWith("\n") ? 0 : 1) : 1;
    const h = harness(language, pending, pkg, firstLine);
    const build = language === "rust" ? "cargo test --offline --no-run --message-format=short --quiet" : `go test -c -vet=off -o /tmp/.tutor.test ./${dir === "." ? "" : dir}`;
    const runp = language === "rust" ? "cargo test --offline --quiet -- --nocapture --exact tutor_check::c" : `/tmp/.tutor.test -test.v -test.run ^TestTutorC`;
    const names = pending.map((p) => language === "rust" ? String(p.n) : `${p.n}$`);
    const r = await sb.run(["sh", "-c", SCRIPT, "sh", manifest.rel, manifest.text, hfile, h.text, language === "rust" ? "1" : "0", build, runp, String(i.limitSec), ...names],
      (BUILD_LIMIT_SEC + pending.length * (i.limitSec + 10)) * 1000);
    const out = r.stdout;
    const buildCode = /\x1eBUILD\t(\d+)/.exec(out)?.[1];
    if (buildCode === undefined) {
      for (const p of pending) results[p.n - 1] = { check: p.c, pass: false, error: r.killed ? TOO_LONG : `the check could not run: ${(r.stderr || out).trim().slice(-200) || `exit ${r.code}`}` };
      break;
    }
    if (buildCode === "0") {
      for (const p of pending) {
        const block = new RegExp(`\\x1eSTART\\t${language === "rust" ? p.n : `${p.n}\\$`}\\n([\\s\\S]*?)(?:\\n\\x1eEND|$)`).exec(out)?.[1] ?? "";
        const code = /\x1eCODE\t(\d+)/.exec(block)?.[1];
        const mark = block.split("\n").find((l) => l.startsWith(MARK));
        if (code === undefined) results[p.n - 1] = { check: p.c, pass: false, error: Buffer.byteLength(block) >= PART_CAP - 64 ? PRINTED_TOO_MUCH : TOO_LONG };
        else if (code === "124" || code === "137") results[p.n - 1] = { check: p.c, pass: false, error: TOO_LONG };
        else if (mark) {
          const [got, want] = mark.slice(MARK.length).split("\t");
          results[p.n - 1] = { check: p.c, pass: same(got, want), got };
        } else {
          const panic = /panicked at [^\n]*\n([^\n]+)/.exec(block)?.[1] ?? /^panic: (.+)$/m.exec(block)?.[1];
          results[p.n - 1] = { check: p.c, pass: false, error: panic ? `it stopped with an error: ${panic.trim()}` : `the check could not run: exit ${code}` };
        }
      }
      break;
    }
    const diags = diagnostics(out.slice(out.indexOf("\x1eBUILD")), language);
    const inHarness = (d: Diag) => d.file === hfile && (language === "go" || d.line >= firstLine);
    const byLine = new Map([...h.lineOf].map(([n, l]) => [l, n]));
    // A parse error on a check's own line is that check's; anywhere else (an unclosed `{` is reported at the end
    // of the file, inside the appended harness) it is the learner's typo.
    const syntax = diags.find((d) => !(inHarness(d) && byLine.has(d.line)) && isSyntaxError(d.message.replace(/^error(\[E\d+\])?: /, "error: ")));
    if (syntax) {
      for (const p of pending) results[p.n - 1] = { check: p.c, pass: false, error: `your file stopped while loading: ${syntax.message} (${syntax.file}:${syntax.line})` };
      break;
    }
    const settled = new Set<number>();
    for (const d of diags.filter(inHarness)) {
      const n = byLine.get(d.line);
      if (n === undefined || settled.has(n)) continue;
      settled.add(n);
      const c = i.checks[n - 1], name = missingName(d);
      results[n - 1] = name
        ? { check: c, pass: false, error: `\`${name}\` is not written yet` }
        : { check: c, pass: false, outcome: "unfit", error: `this check calls \`${c.expr}\`, which your \`${calledName(c.expr ?? "") ?? "function"}\` does not accept: ${shown(d)}` };
    }
    const learner = diags.filter((d) => !inHarness(d));
    pending = pending.filter((p) => !settled.has(p.n));
    if (learner.length) {
      for (const p of pending) {
        const name = calledName(p.c.expr ?? "");
        const inside = learner.find((d) => {
          const src = files.get(d.file), span = name && src ? functionSpan(src, name, language) : null;
          return span && d.line >= span[0] && d.line <= span[1];
        });
        results[p.n - 1] = inside
          ? { check: p.c, pass: false, error: shown(inside) }
          : { check: p.c, pass: false, outcome: "elsewhere", error: `your project does not compile (${shown(learner[0])})` };
      }
      break;
    }
    if (!settled.size) {
      for (const p of pending) results[p.n - 1] = { check: p.c, pass: false, error: `the check could not be built: ${diags[0] ? shown(diags[0]) : out.slice(-200).trim()}` };
      break;
    }
  }
  return results.map((r, k) => r ?? { check: i.checks[k], pass: false, error: "the check could not run" });
}
