import { existsSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import type { Band } from "../policy.js";
import { completeJson, type Complete } from "../llm.js";
import { normalizeTags, type Vocab } from "../packs.js";
import { slugify } from "../scaffold.js";
import { writeInRoot } from "../files.js";
import { layout, examFiles, runExamTests, type RunExec } from "./layout.js";
import type { SandboxHost } from "./sandbox.js";

// Exam-maker (spec 2026-10-13 §6): one JSON call → exam/<id>/{brief.md, stub, tests}, probed before use (D5).
export type ExamSize = "small" | "medium";
export const LIMIT_MIN: Record<ExamSize, number> = { small: 20, medium: 45 };

export interface ExamSpec { title: string; task: string; requirements: { id: string; text: string }[]; examples: string; concepts: string[]; stub: string; tests: string }

export function parseExamArgs(args: string): { kind: "start"; size: ExamSize; topic: string | null } | { kind: "check" } | { kind: "off" } {
  const a = args.trim();
  if (a === "check" || a === "off") return { kind: a };
  const [first, ...rest] = a.split(/\s+/);
  const size: ExamSize = first === "medium" || first === "small" ? first : "small";
  const topic = (size === first ? rest.join(" ") : a).trim();
  return { kind: "start", size, topic: topic || null };
}

const text = (o: Record<string, unknown>, k: string): string => {
  const v = o[k];
  if (typeof v !== "string" || !v.trim()) throw new Error(`${k} must be a non-empty string`);
  return v;
};

export function checkExam(v: unknown, vocab: Vocab | null): ExamSpec {
  if (typeof v !== "object" || v === null) throw new Error("reply must be a JSON object");
  const o = v as Record<string, unknown>;
  const reqs = Array.isArray(o.requirements) ? o.requirements : [];
  if (reqs.length < 2 || reqs.length > 6) throw new Error("requirements must list 2 to 6 items");
  const requirements = reqs.map((r, i) => {
    const x = (r ?? {}) as Record<string, unknown>;
    if (x.id !== `R${i + 1}`) throw new Error(`requirement ids must be ${reqs.map((_, j) => `R${j + 1}`).join(", ")} in order`);
    return { id: x.id, text: text(x, "text") };
  });
  const tests = text(o, "tests");
  for (const r of requirements) {
    if (!new RegExp(`r${r.id.slice(1)}(?!\\d)`, "i").test(tests)) throw new Error(`no test for ${r.id}: name each test after its requirement`);
  }
  const concepts = normalizeTags(Array.isArray(o.concepts) ? o.concepts.filter((c): c is string => typeof c === "string") : [], vocab);
  if (!concepts.length) throw new Error("concepts must be 1-3 tags from the language card's Concept tags list");
  const title = text(o, "title").trim().slice(0, 60);
  return { title, task: text(o, "task"), requirements, examples: text(o, "examples"), concepts: concepts.slice(0, 3), stub: text(o, "stub"), tests };
}

export function examPrompt(i: { language: string; level: number; band: Band; size: ExamSize; topic: string | null; weak: string[]; card: string; naming: string }): string {
  return [
    `language: ${i.language}`,
    `learner: level ${i.level} (${i.band})`,
    `size: ${i.size} (time limit ${LIMIT_MIN[i.size]} minutes)`,
    i.topic ? `topic the learner asked for: ${i.topic}` : `weak concepts: ${i.weak.join(", ") || "none recorded; pick from the card"}`,
    `File rules: ${i.naming}`,
    "",
    i.card,
  ].join("\n");
}

export function renderBrief(e: ExamSpec, m: { id: string; language: string; size: ExamSize; minutes: number; topic: string | null }): string {
  const lay = layout(m.language)!;
  const dir = `exam/${m.id}`;
  return [
    `# Exam ${m.id}: ${e.title}`, "",
    `${m.language} · ${m.size} · ${m.minutes} minutes${m.topic ? ` · topic: ${m.topic}` : ""}`, "",
    "## Task", "", e.task.trim(), "",
    "## Requirements", "", ...e.requirements.map((r) => `- **${r.id}** ${r.text}`), "",
    "## Examples", "", e.examples.trim(), "",
    "## Your files", "",
    `- Write your code in \`${dir}/${lay.stub}\`.`,
    `- The examples are tests in \`${dir}/${lay.tests}\`; \`:TutorExam check\` runs them.`,
    "- `:TutorSubmit` when you are done. Going over the time is recorded as late and still graded.", "",
    "## How it is graded", "",
    "- Requirements: 80 points, shared equally; each needs evidence in your code.",
    "- Idiomatic code (the language card's checklist): 20 points.",
    "- Until you submit, the tutor answers with a question or a concept, never code.", "",
  ].join("\n");
}

export function nextExamId(root: string, title: string): string {
  let n = 0;
  try { for (const d of readdirSync(join(root, "exam"))) n = Math.max(n, Number(/^(\d+)-/.exec(d)?.[1] ?? 0)); } catch { /* no exam/ yet */ }
  return `${String(n + 1).padStart(2, "0")}-${slugify(title).slice(0, 24).replace(/-+$/, "")}`;
}

export interface Made { id: string; dir: string; spec: ExamSpec }

/** Build output the probe run leaves behind (python, cargo); removed with a rejected exam. */
const PROBE_OUTPUT = ["__pycache__", "target", "Cargo.lock"];

/** Remove the files this call wrote and what the probe made, then its now-empty folders (like writeScaffold, M4 #26). */
function unwrite(paths: string[], root: string, dir: string) {
  for (const p of paths.reverse()) rmSync(p, { force: true });
  for (const out of PROBE_OUTPUT) rmSync(join(root, dir, out), { recursive: true, force: true });
  for (const d of [join(root, dir, "src"), join(root, dir, "tests"), join(root, dir), join(root, "exam")]) {
    try { if (existsSync(d)) rmdirSync(d); } catch { /* not empty: keep */ }
  }
}

export async function makeExam(d: { complete: Complete; exec: RunExec; system: string; prompt: string; language: string; root: string; vocab: Vocab | null; size: ExamSize; topic: string | null; sandbox?: SandboxHost | null }): Promise<Made> {
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = attempt === 0 ? d.prompt : `${d.prompt}\n\nYour previous exam was rejected: ${reason}. Reply with only the corrected JSON object.`;
    const spec = await completeJson(d.complete, d.system, user, (v) => checkExam(v, d.vocab));
    const id = nextExamId(d.root, spec.title);
    const dir = `exam/${id}`;
    const files: [string, string][] = [...examFiles(d.language, spec.stub, spec.tests), ["brief.md", renderBrief(spec, { id, language: d.language, size: d.size, minutes: LIMIT_MIN[d.size], topic: d.topic })]];
    const written: string[] = [];
    try {
      for (const [rel, t] of files) written.push(writeInRoot(d.root, `${dir}/${rel}`, t, { exclusive: true }));
      const r = await runExamTests(d.exec, d.language, join(d.root, dir), { sandbox: d.sandbox });
      if (r.missing) throw new Error(r.missing); // not the model's fault: no retry (final review I1)
      if (r.killed) reason = "the example tests did not finish within 120 s against the stub";
      else if (r.broken) reason = `the example tests do not compile or load: ${r.out.slice(-1500)}`;
      else if (r.code === 0) reason = "the example tests pass against the stub; they must fail until the learner writes the solution";
      else return { id, dir, spec };
    } catch (e) {
      unwrite(written, d.root, dir);
      throw e;
    }
    unwrite(written, d.root, dir);
  }
  throw new Error(`exam rejected twice: ${reason}`);
}
