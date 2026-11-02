// The step-up (spec 2026-10-26 §6.2, §6.3): offered when a band's habits are solid; a talking test and a
// coding test decide it; the learner says yes before the level crosses the band edge.
import type { Band } from "./policy.js";
import type { HabitId } from "./habits.js";
import { GATE_HABITS } from "./levels.js";

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
  const own = new Set([...reference.matchAll(/\b(?:def|fn|func|function)\s+([A-Za-z_]\w*)/g)].map((m) => m[1].toLowerCase()));
  const calls = [...reference.matchAll(/([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1].toLowerCase()).filter((n) => !own.has(n));
  const words = new Set(reference.toLowerCase().match(/\b[a-z_]+\b/g) ?? []);
  return [...new Set([...calls, ...(KEYWORDS[language] ?? []).filter((k) => words.has(k))])];
}

/** How many of the learner's named pieces are in the reference (or a close substitute is). */
export function piecesMatch(pieces: string[], reference: string, language: string): { matched: number; total: number } {
  const ref = new Set(referencePieces(reference, language));
  const alias = ALIASES[language] ?? {};
  const matched = pieces.filter((p) => ref.has(p) || (alias[p] ?? []).some((a) => ref.has(a))).length;
  return { matched, total: pieces.length };
}

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
