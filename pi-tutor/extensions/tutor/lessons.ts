// Learn-first lessons (spec 2026-10-19 §7, §7a): vendored from established curricula, never generated.
// lessons/<language>/<concept>/lesson.md plus exercises <n>-<slug>/ that use the exam layouts, so the
// same sandboxed runner checks them; .exemplar/ holds the reference solution and never reaches the learner.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { examFiles, layout, runExamTests, type RunExec, type TestRun } from "./exam/layout.js";
import type { SandboxHost } from "./exam/sandbox.js";
import { writeInRoot } from "./files.js";

export const LESSONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "lessons");
const LEVELS = "_levels";

/** `extras`: helper files the source ships next to the stub (Exercism data modules), from `files/`. */
export interface Exercise { id: string; dir: string; instructions: string; stub: string; tests: string; exemplar: string; extras: [string, string][] }
/** `checked`: how the lesson text itself is verified ("doctest": its >>> examples run in `npm run lessons`), or null. */
export interface Lesson { language: string; concept: string; title: string; tags: string[]; source: string; order: number; checked: string | null; text: string; exercises: Exercise[] }

const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const read = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return null; } };

/** One exercise folder, or null when any of its four parts is missing (Review Focus #3). */
function loadExercise(language: string, dir: string): Exercise | null {
  const l = layout(language);
  if (!l) return null;
  const instructions = read(join(dir, "instructions.md"));
  const stub = read(join(dir, l.stub));
  const tests = read(join(dir, l.tests));
  const exemplar = read(join(dir, ".exemplar", l.stub));
  if (instructions === null || stub === null || tests === null || exemplar === null) return null;
  const fdir = join(dir, "files");
  const extras: [string, string][] = isDir(fdir) ? readdirSync(fdir).sort().filter((f) => !isDir(join(fdir, f))).map((f) => [f, readFileSync(join(fdir, f), "utf8")]) : [];
  return { id: dir.split("/").pop()!, dir, instructions, stub, tests, exemplar, extras };
}

/** Exercise folders are `<n>-<slug>`, taken in numeric order. */
function exercisesIn(language: string, dir: string): Exercise[] {
  const n = (s: string) => Number(s.split("-")[0]);
  return readdirSync(dir).filter((d) => /^\d+-/.test(d) && isDir(join(dir, d))).sort((a, b) => n(a) - n(b) || a.localeCompare(b))
    .map((d) => loadExercise(language, join(dir, d))).filter((e): e is Exercise => e !== null);
}

export function loadLessons(language: string, root = LESSONS_DIR): Lesson[] {
  const base = join(root, language);
  if (!isDir(base)) return [];
  const out: Lesson[] = [];
  for (const concept of readdirSync(base)) {
    if (concept === LEVELS || !isDir(join(base, concept))) continue;
    const text = read(join(base, concept, "lesson.md"));
    if (text === null) continue;
    const { frontmatter: f, body } = parseFrontmatter<Record<string, unknown>>(text);
    out.push({
      language, concept: String(f.concept ?? concept), title: String(f.title ?? concept),
      tags: Array.isArray(f.tags) ? f.tags.map(String) : [], source: String(f.source ?? ""), order: Number(f.order ?? 999),
      checked: typeof f.checked === "string" ? f.checked : null,
      text: body.trim(), exercises: exercisesIn(language, join(base, concept)),
    });
  }
  return out.sort((a, b) => a.order - b.order || a.concept.localeCompare(b.concept));
}

/** The level ladder (Q20): leap → raindrops → isogram → luhn. */
export function levelTasks(language: string, root = LESSONS_DIR): Exercise[] {
  const dir = join(root, language, LEVELS);
  return isDir(dir) ? exercisesIn(language, dir) : [];
}

/** The learner's copy: instructions, stub, tests and the layout's extras; never the exemplar. */
export function writeExercise(projectRoot: string, rel: string, language: string, ex: Exercise): string[] {
  const out = [writeInRoot(projectRoot, `${rel}/instructions.md`, ex.instructions)];
  for (const [file, text] of [...examFiles(language, ex.stub, ex.tests), ...ex.extras]) out.push(writeInRoot(projectRoot, `${rel}/${file}`, text));
  return out;
}

function runIn(exec: RunExec, language: string, stub: string, ex: Exercise, sandbox: SandboxHost | null): Promise<TestRun> {
  const dir = mkdtempSync(join(tmpdir(), "lesson-check-"));
  for (const [file, text] of [...examFiles(language, stub, ex.tests), ...ex.extras]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return runExamTests(exec, language, dir, { sandbox }).finally(() => { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });
}

/** Trust check (spec §7a): the exemplar must pass and the stub must fail, each in a fresh folder. */
export async function checkExercise(exec: RunExec, language: string, ex: Exercise, sandbox: SandboxHost | null): Promise<{ exemplar: TestRun; stub: TestRun }> {
  return { exemplar: await runIn(exec, language, ex.exemplar, ex, sandbox), stub: await runIn(exec, language, ex.stub, ex, sandbox) };
}

/** Markup a conversion from the docs' reStructuredText must not leave in a lesson (`npm run lessons`). */
export function textProblems(text: string): string[] {
  const prose = text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "");
  const out: string[] = [];
  if (/(?<!`)``[^`\n]+``(?!`)/.test(prose)) out.push("double backticks (rST inline literal)");
  if (/:(func|exc|class|meth|attr|keyword|term|file|kbd|ref|dfn|data|mod|const|envvar):`/.test(prose)) out.push("rST role such as :func:`…`");
  if (/^\.\. [a-zA-Z_-]+(::|:)?/m.test(prose)) out.push("rST directive or comment (.. …)");
  if (/^[ \t]*:[ \t]*$/m.test(prose)) out.push("a lone ':' line (rST literal-block marker)");
  if (/\bXXX\b/.test(prose)) out.push("an XXX note from the source's comments");
  return out;
}
