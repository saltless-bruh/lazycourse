import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { layout, type TestRun } from "./layout.js";

// Examiner (spec 2026-10-13 §6): learner files + test run → one JSON call → checked grade → grade.md.
export interface LearnerFile { rel: string; lines: string[] }
export interface Grade { requirements: { id: string; met: boolean; evidence: string }[]; idioms: { ok: boolean; note: string; evidence: string }[]; next_fixes: string[]; in_short: string }

const SKIP_DIRS = new Set(["target", "node_modules", "__pycache__", ".git", ".pytest_cache"]);
const MAX_FILES = 12, MAX_LINES = 400, MAX_BYTES = 64 * 1024;

/** The learner's text files in the exam folder (not ours, no build output, nothing linked from outside). */
export function learnerFiles(dir: string, language: string): LearnerFile[] {
  const lay = layout(language)!;
  const ours = new Set(["brief.md", "grade.md", lay.tests, ...lay.extras.map(([p]) => p), "Cargo.lock", "go.sum"]);
  const root = realpathSync(dir);
  const out: LearnerFile[] = [];
  const walk = (d: string, depth: number) => {
    for (const name of readdirSync(d).sort()) {
      if (out.length >= MAX_FILES) return;
      const abs = join(d, name), rel = relative(root, abs).split(sep).join("/");
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (!SKIP_DIRS.has(name) && depth < 3) walk(abs, depth + 1); continue; }
      if (!st.isFile() || ours.has(rel) || st.size > MAX_BYTES) continue;
      const text = readFileSync(abs, "utf8");
      if (text.includes("\0")) continue;
      out.push({ rel, lines: text.split(/\r?\n/).slice(0, MAX_LINES) });
    }
  };
  walk(root, 0);
  return out;
}

const EVIDENCE = /^([\w./-]+):(\d+)\b/;

function evidenceOk(ev: unknown, files: LearnerFile[]): string {
  if (typeof ev !== "string") throw new Error("every evidence must be a string starting with file:line");
  const m = EVIDENCE.exec(ev.trim());
  const f = m && files.find((x) => x.rel === m[1]);
  if (!m || !f || Number(m[2]) < 1 || Number(m[2]) > f.lines.length) throw new Error(`${m ? `${m[1]}:${m[2]}` : ev} is not a line in the files you were given`);
  return ev.trim();
}

export function checkGrade(v: unknown, c: { ids: string[]; files: LearnerFile[]; testsPassed: boolean }): Grade {
  if (typeof v !== "object" || v === null) throw new Error("reply must be a JSON object");
  const o = v as Record<string, unknown>;
  const reqs = Array.isArray(o.requirements) ? o.requirements as Record<string, unknown>[] : [];
  if (reqs.map((r) => r?.id).join(",") !== c.ids.join(",")) throw new Error(`requirements must be exactly ${c.ids.join(", ")} in order`);
  const requirements = reqs.map((r) => ({ id: String(r.id), met: r.met === true, evidence: evidenceOk(r.evidence, c.files) }));
  if (!c.testsPassed && requirements.every((r) => r.met)) throw new Error("the example tests fail, so at least one requirement is not met");
  const idioms = (Array.isArray(o.idioms) ? o.idioms as Record<string, unknown>[] : []).slice(0, 5)
    .map((i) => ({ ok: i.ok === true, note: String(i.note ?? "").trim(), evidence: evidenceOk(i.evidence, c.files) }));
  const fixes = Array.isArray(o.next_fixes) ? o.next_fixes.filter((f): f is string => typeof f === "string" && !!f.trim()) : [];
  if (fixes.length !== 3) throw new Error("next_fixes must be exactly three sentences");
  const inShort = typeof o.in_short === "string" ? o.in_short.trim() : "";
  if (!inShort) throw new Error("in_short must be a non-empty string");
  return { requirements, idioms, next_fixes: fixes.map((f) => f.trim()), in_short: inShort };
}

export function score(g: Grade): number {
  const met = g.requirements.filter((r) => r.met).length / g.requirements.length;
  const idioms = g.idioms.length ? g.idioms.filter((i) => i.ok).length / g.idioms.length : 1;
  return Math.round(80 * met + 20 * idioms);
}

function testLine(t: TestRun): string {
  return t.killed ? "The example tests timed out after 120 s (an endless loop or a very slow solution)."
    : t.code === 0 ? "The example tests passed." : `The example tests failed (exit ${t.code}).`;
}

export function gradePrompt(i: { brief: string; files: LearnerFile[]; test: TestRun; checklist: string; minutes: number; limit: number }): string {
  const numbered = i.files.map((f) => `--- ${f.rel}\n${f.lines.map((l, n) => `${String(n + 1).padStart(4)}  ${l}`).join("\n")}`).join("\n\n");
  return [
    "## Brief", i.brief.trim(), "",
    "## Learner's files (numbered)", numbered || "(no files)", "",
    "## Example test run", testLine(i.test), i.test.out.slice(-4000), "",
    `## Time\n${i.minutes} of ${i.limit} minutes`, "",
    "## Language card checklist", i.checklist.trim(),
  ].join("\n");
}

export function renderGrade(g: Grade, m: { id: string; score: number; minutes: number; limit: number; test: TestRun }): string {
  const late = m.minutes > m.limit;
  return [
    `# Grade: exam ${m.id}`, "",
    `**${m.score}/100** · ${m.minutes} of ${m.limit} minutes · ${late ? "late" : "on time"}`, "",
    "## Requirements", "", ...g.requirements.map((r) => `- ${r.met ? "✔" : "✘"} **${r.id}** ${r.evidence}`), "",
    ...(g.idioms.length ? ["## Idioms", "", ...g.idioms.map((i) => `- ${i.ok ? "✔" : "✘"} ${i.note} (${i.evidence})`), ""] : []),
    "## Example tests", "", testLine(m.test), ...(m.test.out ? ["", "```", m.test.out.split("\n").slice(-30).join("\n"), "```"] : []), "",
    "## Next fixes", "", ...g.next_fixes.map((f, n) => `${n + 1}. ${f}`), "",
    "## In short", "", g.in_short, "",
  ].join("\n");
}
