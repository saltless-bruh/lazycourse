// The check job (spec 2026-10-21 §7): per milestone, the model writes checks, and in a separate request that
// never sees them or the tasks' "done when", a reference solution. The checks run against the reference in the
// sandbox: agree → trusted, disagree → unverified. The reference is stored in the profile, never in the project.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseChecks, VALUE_LANGUAGES, type Check, type TickHow } from "./checks.js";
import { runChecks, type CheckResult } from "./check-run.js";
import { systemText } from "./prompts.js";
import { taskIds } from "./scaffold.js";
import { manifestFor } from "./manifest.js";
import { roundingWeakTasks, slipMutants } from "./near-miss.js";
import type { Complete } from "./llm.js";
import type { RunExec } from "./exam/layout.js";
import type { SandboxHost } from "./exam/sandbox.js";
import type { LessonState } from "./lessons.js";

/** `weak`: tasks whose checks a near miss may still pass after the guard's one extra ask (spec 2026-10-22 §5.5). */
export interface MilestoneChecks { checks: Check[]; reference: string; ran: boolean; weak?: string[] }
export interface ChecksState {
  milestones: Record<string, MilestoneChecks>;
  /** How each task was ticked by /tutor-done (spec §7: self-checked and "ticked by you" are labelled). */
  ticks?: Record<string, TickHow>;
}

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

// Spec 2026-10-22 §5.2: compiled languages need the value written as the language writes it.
const VALUE_EXAMPLE: Record<string, string> = { rust: "split_amount(50.0, 3) == 16.67", go: "splitAmount(50, 3) == 16.67" };
const BUILDS_AS: Record<string, string> = {
  rust: "The file is the crate root (src/main.rs) of the project's Cargo.toml: it must build with `cargo build` and keep `fn main`.",
  go: "The file is `package main` in the folder `go run` builds: it must build with the project's go.mod and keep `func main`.",
};

export function checksPrompt(i: { language: string; tasksMd: string; milestone: number }): string {
  const value = VALUE_LANGUAGES.has(i.language);
  return [
    `Language: ${i.language}.`,
    `The tasks of milestone ${i.milestone}:`,
    milestoneText(i.tasksMd, i.milestone),
    "",
    "Line forms:",
    ...(value ? ["check <task id>: <expression> == <expected value>"] : []),
    ...(VALUE_EXAMPLE[i.language] ? [`for example: check P1.T1: ${VALUE_EXAMPLE[i.language]}`] : []),
    'run <task id>: stdin "<typed input>" -> stdout contains "<printed text>"',
    ...(value ? [] : ["", `Write only run lines: ${i.language} functions cannot be called directly here.`]),
  ].join("\n");
}

/** Spec §7: the reference sees what to build, never how it is checked. */
export function referencePrompt(i: { language: string; tasksMd: string; milestone: number; entry: string }): string {
  const tasks = milestoneText(i.tasksMd, i.milestone, { upTo: true })
    .split("\n").map((l) => l.replace(/[;,.]?\s*done when:.*$/i, "")).join("\n");
  return [`Language: ${i.language}. File: ${i.entry}.`, ...(BUILDS_AS[i.language] ? [BUILDS_AS[i.language]] : []), `Write the whole file as it is at the end of milestone ${i.milestone}. The tasks so far:`, tasks].join("\n");
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

const ROUNDED = "an answer rounded down to a whole number (floor, //, integer division) passes them; use inputs whose result is not whole";
const SLIP = "an answer with one character changed (`*` for `/`, `<` for `<=`) passes them; use inputs at the edges";

/** Spec 2026-10-26 §5.1: extra checks (the learner's Examples rows) cross-checked on the stored reference. */
export async function crossCheckOnReference(d: { exec: RunExec; sandbox: SandboxHost | null; language: string; entry: string | null; runCmd: string | null; reference: string; checks: Check[]; root?: string }): Promise<Check[]> {
  if (!d.sandbox || !d.entry || !d.reference || d.checks.length === 0) return d.checks;
  const dir = mkdtempSync(join(tmpdir(), "lazycourse-ref-"));
  try {
    mkdirSync(dirname(join(dir, d.entry)), { recursive: true });
    writeFileSync(join(dir, d.entry), d.reference);
    const manifest = manifestFor(d.language, "project");
    if (manifest) {
      let text = manifest.text;
      try { if (d.root) text = readFileSync(join(d.root, manifest.rel), "utf8"); } catch { /* none yet: the minimal one */ }
      writeFileSync(join(dir, manifest.rel), text);
    }
    const r = await runChecks(d.exec, { language: d.language, root: dir, entry: d.entry, runCmd: d.runCmd, checks: d.checks, sandbox: d.sandbox });
    return r.missing ? d.checks : crossCheck(r.results);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export async function writeMilestoneChecks(d: {
  complete: Complete; exec: RunExec; sandbox: SandboxHost | null;
  language: string; tasksMd: string; milestone: number; entry: string | null; runCmd: string | null;
  /** The project folder, whose Cargo.toml / go.mod the reference builds with (spec 2026-10-22 §5.3). */
  root?: string;
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
    const manifest = manifestFor(d.language, "project");
    if (manifest) {
      let text = manifest.text;
      try { if (d.root) text = readFileSync(join(d.root, manifest.rel), "utf8"); } catch { /* none yet: the minimal one */ }
      writeFileSync(join(dir, manifest.rel), text);
    }
    const entryPath = join(dir, d.entry);
    const run = (checks: Check[]) => runChecks(d.exec, { language: d.language, root: dir, entry: d.entry, runCmd: d.runCmd, checks, sandbox: d.sandbox });
    const r = await run(parsed.checks);
    if (r.missing) return { checks: parsed.checks, reference, ran: false };
    let checks = crossCheck(r.results);
    const types = new Map(r.results.flatMap((x) => (x.valueType && x.check.expr ? [[x.check.expr, x.valueType] as const] : [])));
    // Spec §5.5: a near miss that passes every trusted check of a task gets that task one more check, asked once.
    const probe = async (all: Check[]): Promise<Map<string, string>> => {
      const weak = new Map(roundingWeakTasks(all, types).map((t) => [t, ROUNDED]));
      const trusted = all.filter((c) => c.status === "trusted");
      for (const mutant of slipMutants(reference)) {
        writeFileSync(entryPath, mutant);
        const m = await run(trusted);
        if (m.missing || m.results.some((x) => x.error || x.outcome)) continue; // did not build or load: not an answer
        for (const t of new Set(trusted.map((c) => c.task))) {
          if (!weak.has(t) && m.results.filter((x) => x.check.task === t).every((x) => x.pass)) weak.set(t, SLIP);
        }
      }
      writeFileSync(entryPath, reference);
      return weak;
    };
    let weak = await probe(checks);
    if (weak.size) {
      const more = `${ask}\n\nThe checks so far would let a close wrong answer pass:\n${[...weak].map(([t, why]) => `- ${t}: ${why}`).join("\n")}\n` +
        "Write one more check for each of these tasks that such an answer fails. Write every expected value exactly, with all its decimals (16.666666666666668, never 16.67).";
      const extra = parseChecks(await d.complete(systemText("checks"), more), { language: d.language, taskIds: [...weak.keys()], milestone: d.milestone });
      if (extra.checks.length) {
        const r2 = await run(extra.checks);
        checks = [...checks, ...(r2.missing ? extra.checks : crossCheck(r2.results))];
        for (const x of r2.results) if (x.valueType && x.check.expr) types.set(x.check.expr, x.valueType);
        weak = await probe(checks);
      }
    }
    return { checks, reference, ran: true, ...(weak.size ? { weak: [...weak.keys()] } : {}) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
