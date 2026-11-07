// Structural similarity for the reply check (learner-session fixes, spec §5). The leak check compared exact lines
// and the learner's function names, so an "unrelated" example that was the task's solution renamed
// (`number = random.randint(1, 100)` for "generate a random secret number") passed. Two signals instead:
// - windows: code turned into normalized tokens (identifiers ID, numbers NUM, strings STR; keywords and operators
//   kept), compared as 5-token windows against the hidden solution — renaming changes nothing;
// - task terms: words of the task line (or, before a plan, the project's title and summary) used in the example's
//   identifiers or strings.
// Pure; compliance.ts decides what counts as a leak.

const KEYWORDS = new Set([
  // Python
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif",
  "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or",
  "pass", "raise", "return", "try", "while", "with", "yield",
  // JavaScript / TypeScript, Lua, Rust, Go (the common ones)
  "const", "let", "var", "function", "new", "this", "null", "undefined", "true", "false", "typeof", "of", "export",
  "local", "then", "end", "nil", "repeat", "until", "fn", "mut", "pub", "impl", "struct", "enum", "match", "use",
  "loop", "func", "package", "range", "type", "interface", "go", "defer", "switch", "case", "default",
]);

const BUILTINS = ["print", "input", "int", "str", "float", "bool", "list", "dict", "set", "tuple", "len", "range", "open",
  "sum", "min", "max", "sorted", "abs", "round", "enumerate", "zip", "map", "filter", "format", "split", "join", "append",
  "console", "log", "println"];

const COMMON = ["the", "with", "that", "this", "from", "into", "each", "when", "done", "then", "than", "have", "will",
  "your", "their", "them", "they", "what", "which", "should", "must", "more", "less", "some", "task", "file", "main",
  "line", "lines", "code", "value", "values", "variable", "store", "show", "make", "give", "take", "write", "check",
  "result", "results", "returns", "return", "using", "user", "users", "first", "next", "after", "before", "only",
  "until", "while", "also", "both", "else", "elif"];

// Terms are content words: not a keyword, a builtin or a common English word (which would match every example).
const NOT_TERMS = new Set([...[...KEYWORDS].map((k) => k.toLowerCase()), ...BUILTINS, ...COMMON]);

const TOKEN = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`)|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|(==|!=|<=|>=|->|=>|\*\*|\/\/|::|\.\.|[^\s\w])/g;

/** Code as structure: identifiers → ID, numbers → NUM, strings → STR; keywords and operators kept as they are. */
export function normalizedTokens(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(TOKEN)) {
    if (m[1] !== undefined) out.push("STR");
    else if (m[2] !== undefined) out.push("NUM");
    else if (m[3] !== undefined) out.push(KEYWORDS.has(m[3]) ? m[3] : "ID");
    else out.push(m[4]);
  }
  return out;
}

const windows = (tokens: string[], n: number) => tokens.length < n ? [] : tokens.slice(0, tokens.length - n + 1).map((_, i) => tokens.slice(i, i + n).join(" "));

/** The share (0..1) of `code`'s n-token windows that also occur in `reference`; 0 when `code` is shorter than n. */
export function windowOverlap(code: string, reference: string, n = 5): number {
  const mine = windows(normalizedTokens(code), n);
  if (!mine.length) return 0;
  const theirs = new Set(windows(normalizedTokens(reference), n));
  return mine.filter((w) => theirs.has(w)).length / mine.length;
}

/** A light stem so "guessing", "guesses", "randomly", "generated" meet "guess", "random", "generate"'s stem. */
function stem(w: string): string {
  for (const suffix of ["ing", "ly", "ed", "es", "s"]) {
    if (suffix === "s" && w.endsWith("ss")) continue; // "guess", not "gues"
    if (w.length - suffix.length >= 4 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  return w;
}

const words = (text: string) => (text.match(/[A-Za-z]+/g) ?? []).flatMap((w) => w.split(/(?<=[a-z])(?=[A-Z])/)).map((w) => w.toLowerCase());

/** The content words of a task line (or a project's title and summary), stemmed: 4+ letters, not keyword/builtin/common. */
export function taskTerms(text: string): Set<string> {
  return new Set(words(text).filter((w) => w.length >= 4 && !NOT_TERMS.has(w)).map(stem));
}

/** How many distinct task terms an example's code uses, in its identifiers or inside its strings. */
export function termHits(code: string, terms: Set<string>): number {
  const used = new Set(words(code).filter((w) => w.length >= 4 && !NOT_TERMS.has(w)).map(stem));
  return [...terms].filter((t) => used.has(t)).length;
}
