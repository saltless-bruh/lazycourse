// The check job (spec 2026-10-21 §7): per milestone, the model writes checks, and in a separate request that
// never sees them or the tasks' "done when", a reference solution. The checks run against the reference in the
// sandbox: agree → trusted, disagree → unverified. The reference is stored in the profile, never in the project.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseChecks, VALUE_LANGUAGES, type Check } from "./checks.js";
import { runChecks, type CheckResult } from "./check-run.js";
import { systemText } from "./prompts.js";
import { taskIds } from "./scaffold.js";
import type { Complete } from "./llm.js";
import type { RunExec } from "./exam/layout.js";
import type { SandboxHost } from "./exam/sandbox.js";
import type { LessonState } from "./lessons.js";

export interface MilestoneChecks { checks: Check[]; reference: string; ran: boolean }
export interface ChecksState { milestones: Record<string, MilestoneChecks> }

export function readChecksState(raw: string | null | undefined): ChecksState {
  if (!raw) return { milestones: {} };
  try {
    const v = JSON.parse(raw) as ChecksState;
    return v && typeof v.milestones === "object" && v.milestones ? v : { milestones: {} };
  } catch { return { milestones: {} }; }
}

const HEADING = /^## Milestone (\d+):/;

export function milestoneCount(tasksMd: string): number {
  return tasksMd.split("\n").filter((l) => HEADING.test(l)).length;
}

/** Milestone `k`'s section (with `upTo`, milestones 1..k); a plan without milestone headings is all milestone 1. */
export function milestoneText(tasksMd: string, k: number, o: { upTo?: boolean } = {}): string {
  const lines = tasksMd.split("\n");
  if (!lines.some((l) => HEADING.test(l))) return lines.filter((l) => l.trim() && !l.startsWith("# ")).join("\n");
  const out: string[] = [];
  let cur = 0;
  for (const l of lines) {
    const m = HEADING.exec(l);
    if (m) cur = Number(m[1]);
    else if (/^#{1,2} /.test(l)) cur = cur > 0 ? cur : 0;
    if (cur > 0 && (o.upTo ? cur <= k : cur === k) && l.trim()) out.push(l);
  }
  return out.join("\n");
}

/** The milestone being built: the lesson round's when it reaches building, every milestone once lessons end. */
export function currentMilestone(tasksMd: string, lesson: LessonState | null): number {
  const count = milestoneCount(tasksMd);
  if (count === 0) return 1;
  if (!lesson) return count;
  const at = lesson.resume ?? lesson;
  return Math.min(count, at.building ? at.round + 1 : at.round);
}

export function checksPrompt(i: { language: string; tasksMd: string; milestone: number }): string {
  const value = VALUE_LANGUAGES.has(i.language);
  return [
    `Language: ${i.language}.`,
    `The tasks of milestone ${i.milestone}:`,
    milestoneText(i.tasksMd, i.milestone),
    "",
    "Line forms:",
    ...(value ? ["check <task id>: <expression> == <expected value>"] : []),
    'run <task id>: stdin "<typed input>" -> stdout contains "<printed text>"',
    ...(value ? [] : ["", `Write only run lines: ${i.language} functions cannot be called directly here.`]),
  ].join("\n");
}

/** Spec §7: the reference sees what to build, never how it is checked. */
export function referencePrompt(i: { language: string; tasksMd: string; milestone: number; entry: string }): string {
  const tasks = milestoneText(i.tasksMd, i.milestone, { upTo: true })
    .split("\n").map((l) => l.replace(/[;,.]?\s*done when:.*$/i, "")).join("\n");
  return [`Language: ${i.language}. File: ${i.entry}.`, `Write the whole file as it is at the end of milestone ${i.milestone}. The tasks so far:`, tasks].join("\n");
}

/** The largest fenced block of the reply, or the whole reply; always ends with a newline. */
export function extractCode(reply: string): string {
  const blocks = [...reply.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const code = blocks.length ? blocks.reduce((a, b) => (b.length > a.length ? b : a)) : reply.trim();
  return code.endsWith("\n") ? code : `${code}\n`;
}

export function crossCheck(results: CheckResult[]): Check[] {
  return results.map((r) => ({ ...r.check, status: r.pass ? "trusted" : "unverified" }));
}

export async function writeMilestoneChecks(d: {
  complete: Complete; exec: RunExec; sandbox: SandboxHost | null;
  language: string; tasksMd: string; milestone: number; entry: string | null; runCmd: string | null;
}): Promise<MilestoneChecks> {
  const ids = taskIds(milestoneText(d.tasksMd, d.milestone));
  const ask = checksPrompt({ language: d.language, tasksMd: d.tasksMd, milestone: d.milestone });
  let parsed = parseChecks(await d.complete(systemText("checks"), ask), { language: d.language, taskIds: ids, milestone: d.milestone });
  if (parsed.checks.length === 0 && parsed.rejected.length > 0) {
    const again = `${ask}\n\nYour previous reply had no usable line. These lines were rejected:\n${parsed.rejected.join("\n")}\nReply with only check lines in the forms above.`;
    parsed = parseChecks(await d.complete(systemText("checks"), again), { language: d.language, taskIds: ids, milestone: d.milestone });
  }
  const entry = d.entry ?? "main";
  const reference = extractCode(await d.complete(systemText("reference"), referencePrompt({ language: d.language, tasksMd: d.tasksMd, milestone: d.milestone, entry })));
  if (!d.sandbox || !d.entry || parsed.checks.length === 0) return { checks: parsed.checks, reference, ran: false };
  const dir = mkdtempSync(join(tmpdir(), "lazycourse-ref-"));
  try {
    mkdirSync(dirname(join(dir, d.entry)), { recursive: true });
    writeFileSync(join(dir, d.entry), reference);
    const r = await runChecks(d.exec, { language: d.language, root: dir, entry: d.entry, runCmd: d.runCmd, checks: parsed.checks, sandbox: d.sandbox });
    return r.missing ? { checks: parsed.checks, reference, ran: false } : { checks: crossCheck(r.results), reference, ran: true };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
