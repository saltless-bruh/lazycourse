// Checks (spec 2026-10-21 §7): what proves a task works, in a strict form code can run. Pure.
// A function value `check <id>: <expr> == <expected>` (Python, Lua) or typed input → output
// `run <id>: stdin "<text>" -> stdout contains "<text>"` (every language).

export interface Check {
  task: string;
  /** "timed" (habits Task 17): a large-input call that must finish within `limitMs` (the reference's time × 3). */
  kind: "value" | "io" | "timed";
  expr?: string;
  expected?: string;
  stdin?: string;
  contains?: string;
  limitMs?: number;
  milestone: number;
  status: "trusted" | "unverified";
}

/** Languages whose functions a check can call directly (phase 2; Rust and Go: spec 2026-10-22); the rest get typed input → output only. */
export const VALUE_LANGUAGES = new Set(["python", "lua", "rust", "go", "javascript", "typescript"]);

const VALUE = /^check\s+(P\d+\.T\d+(?:\.S\d+)?)\s*:\s*(.+)$/;
/** Languages a timed check can time (habits Task 17: Python first). */
export const TIMED_LANGUAGES = new Set(["python"]);
const TIMED = /^timed\s+(P\d+\.T\d+(?:\.S\d+)?)\s*:\s*(.+)$/;
const IO = /^run\s+(P\d+\.T\d+(?:\.S\d+)?)\s*:\s*stdin\s+"((?:[^"\\]|\\.)*)"\s*(?:->|→)\s*stdout\s+contains\s+"((?:[^"\\]|\\.)*)"\s*$/;

const unquote = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));

const BACKTICK = new Set(["javascript", "typescript", "go"]);

/**
 * The string starting at `i`: the index after it and whether it closed (unclosed runs to the end), or null when
 * none starts there. Phase 8 A6: JS/TS templates and Go raw strings in backticks, Lua long strings `[==[…]==]`.
 */
function stringAt(s: string, i: number, language: string): { end: number; closed: boolean } | null {
  const ch = s[i];
  if (ch === '"' || ch === "'" || (ch === "`" && BACKTICK.has(language))) {
    const escapes = !(ch === "`" && language === "go"); // a Go raw string has no escapes
    for (let j = i + 1; j < s.length; j++) {
      if (escapes && s[j] === "\\") j++;
      else if (s[j] === ch) return { end: j + 1, closed: true };
    }
    return { end: s.length, closed: false };
  }
  const long = language === "lua" ? /^\[(=*)\[/.exec(s.slice(i)) : null;
  if (!long) return null;
  const close = s.indexOf(`]${long[1]}]`, i + long[0].length);
  return close < 0 ? { end: s.length, closed: false } : { end: close + long[0].length, closed: true };
}

/** Rust/Go minor: every bracket closes, in order, outside strings (an unclosed one sank a reference run). */
function balanced(s: string, language: string): boolean {
  const open = "([{", close = ")]}", stack: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const str = stringAt(s, i, language);
    if (str) { if (!str.closed) return false; i = str.end - 1; continue; }
    const ch = s[i];
    if (open.includes(ch)) stack.push(close[open.indexOf(ch)]);
    else if (close.includes(ch) && stack.pop() !== ch) return false;
  }
  return stack.length === 0;
}

/** The last top-level ` == ` outside strings splits expression from expected value. */
function splitValue(body: string, language: string): [string, string] | null {
  let depth = 0, at = -1;
  for (let i = 0; i < body.length; i++) {
    const str = stringAt(body, i, language);
    if (str) { i = str.end - 1; continue; }
    const ch = body[i];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (depth === 0 && body.startsWith("==", i)) { at = i; i++; }
  }
  if (at < 0) return null;
  const expr = body.slice(0, at).trim(), expected = body.slice(at + 2).trim();
  return expr && expected ? [expr, expected] : null;
}

export function parseChecks(text: string, o: { language: string; taskIds: string[]; milestone: number }): { checks: Check[]; rejected: string[] } {
  const known = new Set(o.taskIds), checks: Check[] = [], rejected: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^[-*]\s+/, "");
    if (line === "" || line.startsWith("```")) continue;
    const io = IO.exec(line);
    if (io && known.has(io[1])) { checks.push({ task: io[1], kind: "io", stdin: unquote(io[2]), contains: unquote(io[3]), milestone: o.milestone, status: "unverified" }); continue; }
    const tm = TIMED.exec(line);
    if (tm && known.has(tm[1]) && TIMED_LANGUAGES.has(o.language)) { checks.push({ task: tm[1], kind: "timed", expr: tm[2].trim(), milestone: o.milestone, status: "unverified" }); continue; }
    const v = VALUE.exec(line), parts = v ? splitValue(v[2], o.language) : null;
    if (v && parts && known.has(v[1]) && VALUE_LANGUAGES.has(o.language) && balanced(parts[0], o.language) && balanced(parts[1], o.language)) {
      checks.push({ task: v[1], kind: "value", expr: parts[0], expected: parts[1], milestone: o.milestone, status: "unverified" });
      continue;
    }
    rejected.push(raw.trim());
  }
  return { checks, rejected };
}

const called = (c: Check) => (c.kind !== "io" ? /^([A-Za-z_][\w.:]*)\s*\(/.exec(c.expr ?? "")?.[1] : undefined);

/** Checks up to `milestone`; a later milestone's value check on a function retires an earlier one on it. */
export function liveChecks(all: Check[], milestone: number): Check[] {
  const reached = all.filter((c) => c.milestone <= milestone);
  const newest = new Map<string, number>();
  // Final review M7: only value checks retire; a timed check is kept unless a newer value check names its function.
  for (const c of reached) { const f = c.kind === "value" ? called(c) : undefined; if (f) newest.set(f, Math.max(newest.get(f) ?? 0, c.milestone)); }
  return reached.filter((c) => { const f = called(c); return !f || (c.kind === "timed" ? c.milestone >= (newest.get(f) ?? 0) : newest.get(f) === c.milestone); });
}

const show = (s: string) => JSON.stringify(s);

/** Spec 2026-10-26 §5.3: a long decimal shown to 4 places in notices ("16.6667"); comparison is unchanged. */
export function shortNumber(s: string): string {
  return /^-?\d+\.\d{5,}$/.test(s.trim()) ? Number(s).toFixed(4) : s;
}

export type TickHow = "checks" | "self" | "you";
const HOW: Record<TickHow, string> = { checks: "done", self: "done, self-checked", you: "done, ticked by you" };

export function renderChecksMd(checks: Check[], ticked: Set<string>, o: { note?: string; how?: Record<string, TickHow>; weak?: Set<string> } = {}): string {
  const out = [
    "<!-- The tutor rewrites this file from its own record; edits here are not kept. -->",
    "# Checks",
    "",
    "Run `:TutorDone <task>` when a task works. Checks marked (unverified) are shown but never block a tick.",
    "",
  ];
  if (o.note) out.push(o.note, "");
  // Learner-session fixes (spec §3): how much of this is proven, at a glance.
  if (checks.length) out.push(`${checks.filter((c) => c.status === "trusted").length} of ${checks.length} checks confirmed`, "");
  const tasks = [...new Set(checks.map((c) => c.task))];
  for (const t of tasks) {
    out.push(`## ${t}${ticked.has(t) ? ` (${HOW[o.how?.[t] ?? "checks"]})` : o.weak?.has(t) ? " (a near miss may pass these checks)" : ""}`);
    for (const c of checks.filter((x) => x.task === t)) {
      const body = c.kind === "value" ? `${c.expr} == ${c.expected}`
        : c.kind === "timed" ? (c.limitMs ? `${c.expr} finishes within ${c.limitMs} ms` : `${c.expr} is timed`)
        : `type ${show(c.stdin ?? "")} → output contains ${show(c.contains ?? "")}`;
      out.push(`- ${body}${c.status === "unverified" ? " (unverified)" : ""}`);
    }
    out.push("");
  }
  return out.join("\n");
}

/** Ids ticked in spec/tasks.md (`- [x] P1.T2 …`). */
export function tickedIds(tasksMd: string): Set<string> {
  return new Set(boxedIds(tasksMd, /^\s*[-*+] \[[xX]\]/));
}

/** Unticked tasks (not subtasks), in file order. */
export function openTaskIds(tasksMd: string): string[] {
  return [...new Set(boxedIds(tasksMd, /^\s*[-*+] \[ \]/).filter((id) => !id.includes(".S")))];
}

// The first task id on each checkbox line, however the model wrapped it (`**P1.T2**`, `P1.T2:`): final review I4.
function boxedIds(tasksMd: string, box: RegExp): string[] {
  return tasksMd.split(/\r?\n/).flatMap((l) => (box.test(l) ? /\bP\d+\.T\d+(?:\.S\d+)?\b/.exec(l)?.[0] ?? [] : []));
}
