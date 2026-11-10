// The step-up (spec 2026-10-26 §6.2, §6.3): offered when a band's habits are solid; a talking test and a
// coding test decide it; the learner says yes before the level crosses the band edge.
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Band } from "./policy.js";
import type { HabitId } from "./habits.js";
import { GATE_HABITS, HABIT_LABEL } from "./levels.js";
import { luaLongEnd, rustLifetime, slipMutants } from "./near-miss.js";

const DAY_MS = 86_400_000;

/** All of the band's counted habits solid in this language, not offered in the last 24 h, never above pro. */
export function stepUpOffered(i: { band: Band; habitsSolidIn: (h: HabitId) => boolean; lastOffer: number | null; now: number }): boolean {
  if (i.band === "pro") return false;
  if (i.lastOffer !== null && i.now - i.lastOffer < DAY_MS) return false;
  return missingForStepUp(i.band, i.habitsSolidIn).length === 0;
}

/** The band's counted habits that are not solid yet, in the band's order. */
export function missingForStepUp(band: Band, habitsSolidIn: (h: HabitId) => boolean): HabitId[] {
  return GATE_HABITS[band].filter((h) => !habitsSolidIn(h));
}

/** The talking test's plan (author 2026-10-26): numbered steps and one `pieces:` line, or null. */
export function parsePlan(text: string): { steps: string[]; pieces: string[] } | null {
  const lines = text.split("\n").map((l) => l.trim());
  const steps = lines.flatMap((l) => { const m = /^\d+[.)]\s+(.+)$/.exec(l); return m ? [m[1].trim()] : []; });
  const piecesLine = lines.find((l) => /^pieces\s*:/i.test(l));
  if (steps.length < 2 || !piecesLine) return null;
  const pieces = piecesLine.replace(/^pieces\s*:/i, "").split(/[,;]/).map((x) => x.trim().replace(/[`()]/g, "").toLowerCase()).filter(Boolean);
  return pieces.length ? { steps, pieces } : null;
}

const KEYWORDS: Record<string, string[]> = {
  python: ["for", "while", "if", "with", "return", "import", "try", "lambda", "yield", "class"],
  lua: ["for", "while", "if", "return", "function", "local", "repeat"],
  rust: ["for", "while", "if", "match", "loop", "return", "impl", "struct"],
  go: ["for", "if", "switch", "return", "range", "struct", "defer"],
};
// Designer's call: a few close substitutes per language, so "dict" counts for a Counter.
const ALIASES: Record<string, Record<string, string[]>> = {
  python: {
    dict: ["counter", "defaultdict", "get"], counter: ["dict", "defaultdict"], defaultdict: ["dict", "counter"],
    sorted: ["sort", "most_common", "nlargest"], sort: ["sorted"], for: ["while", "comprehension"], while: ["for"],
    split: ["splitlines"], read: ["readlines", "readline"], open: ["with"], list: ["append"], append: ["list"],
  },
};

function withoutMain(src: string, language: string): string {
  const m = (language === "rust" ? /\bfn\s+main\s*\(/ : /^func\s+main\s*\(/m).exec(src);
  if (!m) return src;
  let depth = 0, opened = false;
  for (let i = m.index; i < src.length; i++) {
    if (src[i] === "{") { depth++; opened = true; }
    else if (src[i] === "}" && opened && --depth === 0) return src.slice(0, m.index) + src.slice(i + 1);
  }
  return src.slice(0, m.index);
}

/** The pieces of the hidden solution: what it calls (its own functions left out) and its main keywords. */
export function referencePieces(reference: string, language: string): string[] {
  // Final review I3: what only runs the file as a program (print/input under __main__) is not part of the solution.
  const main = reference.search(/^if __name__ == ["']__main__["']\s*:/m);
  if (main >= 0) reference = reference.slice(0, main);
  // Habits Task 24b: Rust's `fn main` and Go's `func main` only run the program, like Python's __main__ block.
  if (language === "rust" || language === "go") reference = withoutMain(reference, language);
  const own = new Set([...reference.matchAll(/\b(?:def|fn|func|function)\s+([A-Za-z_]\w*)/g)].map((m) => m[1].toLowerCase()));
  const calls = [...reference.matchAll(/([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1].toLowerCase()).filter((n) => !own.has(n));
  // A method named without a call is a piece too (`max(words, key=words.count)`).
  const methods = [...reference.matchAll(/\.([A-Za-z_]\w*)\b(?!\s*\()/g)].map((m) => m[1].toLowerCase());
  const words = new Set(reference.toLowerCase().match(/\b[a-z_]+\b/g) ?? []);
  return [...new Set([...calls, ...methods, ...(KEYWORDS[language] ?? []).filter((k) => words.has(k))])];
}

/** How many of the learner's named pieces are in the reference (or a close substitute is). */
export function piecesMatch(pieces: string[], reference: string, language: string): { matched: number; total: number } {
  const ref = new Set(referencePieces(reference, language));
  const alias = ALIASES[language] ?? {};
  // Final review I3: control keywords (for, if, return…) are in almost every solution; they never count —
  // unless the solution has fewer than two other pieces (phase 7 live run: a Rust loop with an `if` and no call
  // could never be passed, whatever the learner named).
  const keywords = new Set(KEYWORDS[language] ?? []);
  const plain = [...ref].filter((p) => !keywords.has(p)).length < 2;
  const named = plain ? pieces : pieces.filter((p) => !keywords.has(p));
  const matched = named.filter((p) => ref.has(p) || (alias[p] ?? []).some((a) => ref.has(a))).length;
  return { matched, total: named.length };
}

/** Final review I7: languages whose coding-test files can each be checked on their own (compiled ones build together). */
export const STEP_UP_LANGUAGES = new Set(["python", "lua", "rust", "go"]); // habits Task 24b: Rust and Go, a folder per part
/** Habits Task 17: the intermediate step-up measures code (Python ast, timed checks), so Python only for now. */
export const ADVANCED_STEP_UP_LANGUAGES = new Set(["python"]);

/** Designer's call: at least 3 of every 4 named pieces match, and at least 2 were named. */
export function talkPassed(m: { matched: number; total: number }): boolean {
  return m.total >= 2 && m.matched * 4 >= m.total * 3;
}

// Designer's call: standard-library modules a step-up's "solve" part may need, in the order they are tried.
const LIBRARIES: Record<string, string[]> = {
  python: ["datetime", "collections", "pathlib", "itertools", "statistics", "json", "textwrap"],
  go: ["time", "sort", "strings", "strconv", "unicode"],
  rust: ["std::collections", "std::fmt", "std::iter"],
  lua: ["os", "string", "table"],
};

/** The first library module the learner's code has not used, or null (author: facing something unfamiliar). */
export function unfamiliarModule(language: string, used: Set<string>): string | null {
  return (LIBRARIES[language] ?? []).find((m) => !used.has(m)) ?? null;
}

/** Modules the learner's sources import (Python `import x` / `from x import`, Go imports, Rust `use`, Lua `require`). */
export function importedModules(sources: string[], language: string): Set<string> {
  const re = language === "python" ? /^\s*(?:import|from)\s+([\w.]+)/gm : language === "go" ? /"([\w/]+)"/g : language === "rust" ? /^\s*use\s+([\w:]+)::/gm : /require\s*\(?\s*["']([\w.]+)["']/g;
  return new Set(sources.flatMap((s) => [...s.matchAll(re)].map((m) => m[1].split(".")[0])));
}

/** Each coding part passes at 3 of 4 checks (a part with none cannot pass); the talk by talkPassed. */
/** Habits Task 17: the intermediate → advanced step-up adds `tests` (tests that can fail) and `improve` (improve it). */
export function stepUpResult(parts: { solve: Score; fix: Score; plan: Score; tests?: Score; improve?: Score }, talk: { matched: number; total: number }): { pass: boolean; practise: string[] } {
  const ok = (s: Score) => s.total > 0 && s.passed * 4 >= s.total * 3;
  const practise = [
    ...(ok(parts.solve) ? [] : [HABIT_LABEL["looks-up"]]),
    ...(ok(parts.fix) ? [] : [HABIT_LABEL["own-fixes"]]),
    ...(ok(parts.plan) ? [] : [HABIT_LABEL["ideas-to-code"]]),
    ...(talkPassed(talk) ? [] : [HABIT_LABEL["steps-first"]]),
    ...(!parts.tests || ok(parts.tests) ? [] : [HABIT_LABEL["tests-that-fail"]]),
    ...(!parts.improve || ok(parts.improve) ? [] : [HABIT_LABEL["optimizes"]]),
  ];
  return { pass: practise.length === 0, practise };
}
interface Score { passed: number; total: number }

/** An error's text without its place in the file (path:line, Python's `File "…", line N`): what went wrong, not where. */
export function noWhere(error: string): string {
  // Review minor 2: of many lines, the compiler's own "error…" line, else the last (a traceback ends with what went
  // wrong); arrows, gutters and source lines (`--> file:12`, `12 | code`) are the place, and may be the planted bug.
  const lines = error.split(/\r?\n/).filter((l) => l.trim());
  const kept = lines.length > 1 ? lines.filter((l) => !/^\s*(?:-->|\d*\s*\||=\s)/.test(l)) : lines;
  const text = kept.length > 1 ? kept.find((l) => /^\s*error(?:\[\w+\])?:/.test(l) && !/aborting/.test(l)) ?? kept[kept.length - 1] : kept[0] ?? "";
  return text
    .replace(/File "[^"]*", line \d+,?\s*/g, "")
    .replace(/(^|[\s(])[\w./-]+\.[A-Za-z]\w*:\d+(?::\d+)?:?\s*/g, "$1") // review minor 10: `3.14:2` is a value
    .replace(/\s*\b(?:on |at )?line \d+\b/gi, "")
    .replace(/\s*\(\s*(?:[\w./-]+\.[A-Za-z]\w*)?\s*,?\s*\)/g, "") // what is left of "(fix.py, line 2)"
    .trim();
}

export type TestsMiss = "none" | "fail-on-solution" | "cannot-fail" | "no-sandbox" | "not-run";
const TESTS_MISS: Record<TestsMiss, string> = {
  none: "no tests were found in your test file",
  "fail-on-solution": "your tests fail on a working solution, so they check something the task does not ask",
  "cannot-fail": "your tests pass even on a broken version, so they cannot catch a bug",
  "no-sandbox": "the tests could not be run: the sandbox is off",
  "not-run": "your tests could not be run against the hidden solution (this step-up was saved without it)",
};
/** Review minor 3: one short line per note, whatever the program printed or returned. */
const NOTE_MAX = 160;
const oneLine = (t: string) => { const s = t.replace(/\s*\n\s*/g, " ").trim(); return s.length > NOTE_MAX ? `${s.slice(0, NOTE_MAX - 1)}…` : s; };

/**
 * Author 2026-11-10 (option A): what a failed step-up missed, one line each, from the failed checks' own output —
 * never from the model. At most two checks per part; the talk gives a count only (naming the pieces would give
 * the hidden solution away).
 */
export function stepUpNotes(i: {
  missed: Partial<Record<"solve" | "fix" | "plan", string[]>>;
  talk: { matched: number; total: number };
  tests?: TestsMiss | null;
  improve?: string | null;
}): string[] {
  const out: string[] = [];
  for (const part of ["solve", "fix", "plan"] as const) {
    const lines = i.missed[part] ?? [];
    lines.slice(0, 2).forEach((l, n) => out.push(`${part}: ${oneLine(l)}${n === 1 && lines.length > 2 ? ` (and ${lines.length - 2} more)` : ""}`));
  }
  if (!talkPassed(i.talk)) out.push(i.talk.total ? `plan talk: ${i.talk.matched} of ${i.talk.total} pieces of your plan matched the hidden solution` : "plan talk: no plan with a pieces: line was given");
  if (i.tests) out.push(`tests: ${TESTS_MISS[i.tests]}`);
  if (i.improve) out.push(`improve: ${i.improve}`);
  return out;
}

/** The "fix an error" program: the first one-character slip of the reference that its checks catch. */
export async function brokenProgram(reference: string, failsChecks: (source: string) => Promise<boolean>): Promise<string | null> {
  for (const m of fixMutants(reference)) if (await failsChecks(m)) return m;
  return null;
}

/** Which characters are code (not inside a string or a comment). */
export function codeMask(source: string, language?: string): boolean[] {
  const mask = new Array<boolean>(source.length).fill(true);
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) { mask[i] = false; if (ch === "\\") { if (i + 1 < source.length) mask[++i] = false; } else if (ch === quote) quote = null; continue; }
    if (ch === "'" && language === "rust" && rustLifetime(source, i)) continue;
    if (language === "lua") { const e = luaLongEnd(source, i); if (e > i) { for (let j = i; j <= e && j < source.length; j++) mask[j] = false; i = e; continue; } }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; mask[i] = false; continue; }
    if (ch === "#" || (ch === "/" && source[i + 1] === "/") || (ch === "-" && source[i + 1] === "-")) {
      const nl = source.indexOf("\n", i), end = nl < 0 ? source.length : nl;
      for (let j = i; j < end; j++) mask[j] = false;
      i = end - 1;
    }
  }
  return mask;
}

/**
 * Bugs to plant for the step-up's fix part (phase 3 live check: `return items[0]` has no operator to slip):
 * the one-character operator slips, plus off-by-one integers and indexes, flipped booleans and ==/!=.
 */
export function fixMutants(source: string, slipMax = 8, language?: string): string[] {
  const code = codeMask(source, language), out: string[] = [];
  const add = (at: number, len: number, by: string) => {
    for (let k = at; k < at + len; k++) if (!code[k]) return;
    out.push(source.slice(0, at) + by + source.slice(at + len));
  };
  for (const m of source.matchAll(/(?<![\w.])\d+(?![\w.])/g)) add(m.index!, m[0].length, String(Number(m[0]) + 1));
  for (const m of source.matchAll(/\b(True|False|true|false)\b/g)) add(m.index!, m[0].length, { True: "False", False: "True", true: "false", false: "true" }[m[0]]!);
  for (const m of source.matchAll(/==|!=|~=/g)) add(m.index!, 2, m[0] === "==" ? (source.includes("~=") ? "~=" : "!=") : "==");
  return [...new Set([...slipMutants(source, slipMax, language), ...out])];
}

/** Final review C1: an existing stepup/ folder (a learner's earlier work) is moved aside, never overwritten. */
export function backupStepUp(root: string, now: number): string | null {
  const from = join(root, "stepup");
  if (!existsSync(from)) return null;
  const name = `stepup.before-${now}`;
  renameSync(from, join(root, name));
  return name;
}
