// The step-up (spec 2026-10-26 §6.2, §6.3): offered when a band's habits are solid; a talking test and a
// coding test decide it; the learner says yes before the level crosses the band edge.
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Band } from "./policy.js";
import type { HabitId } from "./habits.js";
import { GATE_HABITS, HABIT_LABEL } from "./levels.js";
import { rustLifetime, slipMutants } from "./near-miss.js";

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

/** The pieces of the hidden solution: what it calls (its own functions left out) and its main keywords. */
export function referencePieces(reference: string, language: string): string[] {
  // Final review I3: what only runs the file as a program (print/input under __main__) is not part of the solution.
  const main = reference.search(/^if __name__ == ["']__main__["']\s*:/m);
  if (main >= 0) reference = reference.slice(0, main);
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
  // Final review I3: control keywords (for, if, return…) are in almost every solution; they never count.
  const keywords = new Set(KEYWORDS[language] ?? []);
  const named = pieces.filter((p) => !keywords.has(p));
  const matched = named.filter((p) => ref.has(p) || (alias[p] ?? []).some((a) => ref.has(a))).length;
  return { matched, total: named.length };
}

/** Final review I7: languages whose coding-test files can each be checked on their own (compiled ones build together). */
export const STEP_UP_LANGUAGES = new Set(["python", "lua"]);
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

/** The "fix an error" program: the first one-character slip of the reference that its checks catch. */
export async function brokenProgram(reference: string, failsChecks: (source: string) => Promise<boolean>): Promise<string | null> {
  for (const m of fixMutants(reference)) if (await failsChecks(m)) return m;
  return null;
}

/** Which characters are code (not inside a string or a comment). */
function codeMask(source: string, language?: string): boolean[] {
  const mask = new Array<boolean>(source.length).fill(true);
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) { mask[i] = false; if (ch === "\\") { if (i + 1 < source.length) mask[++i] = false; } else if (ch === quote) quote = null; continue; }
    if (ch === "'" && language === "rust" && rustLifetime(source, i)) continue;
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
