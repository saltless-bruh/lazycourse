// Checks (spec 2026-10-21 §7): what proves a task works, in a strict form code can run. Pure.
// A function value `check <id>: <expr> == <expected>` (Python, Lua) or typed input → output
// `run <id>: stdin "<text>" -> stdout contains "<text>"` (every language).

export interface Check {
  task: string;
  kind: "value" | "io";
  expr?: string;
  expected?: string;
  stdin?: string;
  contains?: string;
  milestone: number;
  status: "trusted" | "unverified";
}

/** Languages whose functions a check can call directly (phase 2; Rust and Go: spec 2026-10-22); the rest get typed input → output only. */
export const VALUE_LANGUAGES = new Set(["python", "lua", "rust", "go"]);

const VALUE = /^check\s+(P\d+\.T\d+(?:\.S\d+)?)\s*:\s*(.+)$/;
const IO = /^run\s+(P\d+\.T\d+(?:\.S\d+)?)\s*:\s*stdin\s+"((?:[^"\\]|\\.)*)"\s*(?:->|→)\s*stdout\s+contains\s+"((?:[^"\\]|\\.)*)"\s*$/;

const unquote = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));

/** The last top-level ` == ` outside quotes splits expression from expected value. */
function splitValue(body: string): [string, string] | null {
  let quote: string | null = null, depth = 0, at = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if ("([{".includes(ch)) depth++;
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
    const v = VALUE.exec(line), parts = v ? splitValue(v[2]) : null;
    if (v && parts && known.has(v[1]) && VALUE_LANGUAGES.has(o.language)) {
      checks.push({ task: v[1], kind: "value", expr: parts[0], expected: parts[1], milestone: o.milestone, status: "unverified" });
      continue;
    }
    rejected.push(raw.trim());
  }
  return { checks, rejected };
}

const called = (c: Check) => (c.kind === "value" ? /^([A-Za-z_][\w.:]*)\s*\(/.exec(c.expr ?? "")?.[1] : undefined);

/** Checks up to `milestone`; a later milestone's value check on a function retires an earlier one on it. */
export function liveChecks(all: Check[], milestone: number): Check[] {
  const reached = all.filter((c) => c.milestone <= milestone);
  const newest = new Map<string, number>();
  for (const c of reached) { const f = called(c); if (f) newest.set(f, Math.max(newest.get(f) ?? 0, c.milestone)); }
  return reached.filter((c) => { const f = called(c); return !f || newest.get(f) === c.milestone; });
}

const show = (s: string) => JSON.stringify(s);

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
  const tasks = [...new Set(checks.map((c) => c.task))];
  for (const t of tasks) {
    out.push(`## ${t}${ticked.has(t) ? ` (${HOW[o.how?.[t] ?? "checks"]})` : o.weak?.has(t) ? " (a near miss may pass these checks)" : ""}`);
    for (const c of checks.filter((x) => x.task === t)) {
      const body = c.kind === "value" ? `${c.expr} == ${c.expected}` : `type ${show(c.stdin ?? "")} → output contains ${show(c.contains ?? "")}`;
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
