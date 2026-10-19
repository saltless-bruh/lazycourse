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
export interface Lesson { language: string; concept: string; title: string; tags: string[]; source: string; order: number; checked: string | null;
  /** The lessons (concepts or tags) this one builds on, as its source states them; null: not stated, so every earlier lesson. */
  requires: string[] | null; text: string; exercises: Exercise[] }

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
      checked: typeof f.checked === "string" ? f.checked : null, requires: Array.isArray(f.requires) ? f.requires.map(String) : null,
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
  for (const m of prose.matchAll(/\]\[([^\]\n]+)\]/g)) {
    const label = m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^\\[${label}\\]:`, "mi").test(text)) out.push(`undefined reference link [${m[1]}] (its definition was cut from the excerpt)`);
  }
  return out;
}

const matches = (l: Lesson, c: string) => l.concept === c || l.tags.includes(c);

/**
 * Lesson rounds for a project (Q14, Q15): the project's concepts that have a lesson and are not known,
 * weak ones first, then in course order, at most 3 per round. A beginner also gets the lessons those
 * build on (a lesson's `requires`, or every earlier lesson when it states none), followed through.
 */
export function planRounds(project: string[], known: Set<string>, weak: string[], lessons: Lesson[], opts: { beginner?: boolean } = {}): string[][] {
  const isKnown = (l: Lesson) => known.has(l.concept) || l.tags.some((t) => known.has(t));
  const named = (c: string) => lessons.find((l) => l.concept === c) ?? lessons.find((l) => l.tags.includes(c));
  const needed = new Set<Lesson>();
  for (const c of project) for (const l of lessons) if (matches(l, c) && !isKnown(l)) needed.add(l);
  if (opts.beginner && needed.size) {
    // Live check 2026-10-19: "every lesson before the last one needed" planned 13 lessons for a 3-concept project;
    // a beginner gets the prerequisites each lesson states, followed through, and no others.
    const pull = (l: Lesson) => {
      for (const c of l.requires ?? lessons.filter((x) => x.order < l.order).map((x) => x.concept)) {
        const x = named(c);
        if (x && !isKnown(x) && !needed.has(x)) { needed.add(x); pull(x); }
      }
    };
    for (const l of [...needed]) pull(l);
  }
  // Live check 2026-10-19: a beginner's project may name no concept a lesson covers; learning first then
  // starts at the beginning of the course (two rounds), not with nothing.
  if (opts.beginner && !needed.size) for (const l of [...lessons].sort((a, b) => a.order - b.order).filter((x) => !isKnown(x)).slice(0, 6)) needed.add(l);
  const rank = (l: Lesson) => { const w = weak.findIndex((c) => matches(l, c)); return w < 0 ? Number.MAX_SAFE_INTEGER : w; };
  // A planned prerequisite goes first, even when weak-first or course order would put it later.
  const order: string[] = [], seen = new Set<Lesson>();
  const emit = (l: Lesson) => {
    if (seen.has(l)) return;
    seen.add(l);
    const first = (l.requires ?? []).map(named).filter((x): x is Lesson => !!x && needed.has(x)).sort((a, b) => a.order - b.order);
    for (const x of first) emit(x);
    order.push(l.concept);
  };
  for (const l of [...needed].sort((a, b) => rank(a) - rank(b) || a.order - b.order)) emit(l);
  const rounds: string[][] = [];
  for (let i = 0; i < order.length; i += 3) rounds.push(order.slice(i, i + 3));
  return rounds;
}

/** Where the learner is in their lesson rounds (saved per project). `building`: a round is done; its milestone is being built. */
export interface LessonState {
  rounds: string[][]; round: number; concept: string; exercise: number; fails: number; stepBack: boolean; building: boolean;
  /** A review exercise interrupted the plan here (`/tutor-lesson review`); a pass returns to it. */
  resume: { round: number; concept: string; exercise: number; building: boolean } | null;
}

export function startLessons(rounds: string[][]): LessonState | null {
  return rounds.length && rounds[0].length ? { rounds, round: 0, concept: rounds[0][0], exercise: 0, fails: 0, stepBack: false, building: false, resume: null } : null;
}

/** The concept after the current one: the next in its round, or the round's end (`building`). */
export function nextConcept(s: LessonState): LessonState {
  const round = s.rounds[s.round] ?? [];
  const i = round.indexOf(s.concept);
  const base = { ...s, exercise: 0, fails: 0, stepBack: false };
  return i >= 0 && i + 1 < round.length ? { ...base, concept: round[i + 1] } : { ...base, building: true };
}

/** After a round's milestone: the first concept of the next round, or null when every round is done. */
export function nextRound(s: LessonState): LessonState | null {
  const r = s.round + 1;
  return r < s.rounds.length ? { ...s, round: r, concept: s.rounds[r][0], exercise: 0, fails: 0, stepBack: false, building: false } : null;
}
