// Habit detectors (spec 2026-10-26 §3): each turns something code saw into good (true), a miss (false) or
// nothing (null). Pure; index.ts adds the language, project, time and evidence when it records one.

/** `key`: the set of checks the try ran; tries are compared only on the same set (final review I2). */
export interface TryOutcome { passed: number; total: number; crashed: boolean; key?: string }

/** Right direction: the next graded try on a spot passes more checks, or stops crashing. */
export function directionEvent(prev: TryOutcome, next: TryOutcome): boolean | null {
  if (prev.key !== undefined && next.key !== undefined && prev.key !== next.key) return null;
  if (prev.crashed !== next.crashed) return prev.crashed;
  if (next.passed !== prev.passed) return next.passed > prev.passed;
  return null;
}

/** Right question: the try after it got closer; asking the same thing again is a miss. */
export function questionEvent(nextTry: { closer: boolean } | null, repeated: boolean): boolean | null {
  if (repeated) return false;
  return nextTry ? nextTry.closer : null;
}

/**
 * Phase 8 A12: the task a question (it has a "?") is about, so it is judged by that task's next try: a named task
 * id wins (null when that task is not open), then the functions it names when they all belong to one other task
 * (`fns`: function → the tasks whose checks call it), else the open episode's task.
 */
export function questionTask(prompt: string, episodeTask: string | null, open: Set<string>, fns: Map<string, string[]>): string | null {
  if (!prompt.includes("?")) return null;
  const named = /\bP\d+\.T\d+\b/.exec(prompt)?.[0];
  if (named) return named === episodeTask || open.has(named) ? named : null;
  if (!episodeTask) return null;
  const words = new Set(prompt.match(/[A-Za-z_][\w]*/g) ?? []);
  const tasks = [...fns].filter(([f]) => words.has(f)).map(([, ts]) => ts);
  if (!tasks.length || tasks.some((ts) => ts.includes(episodeTask))) return episodeTask;
  const other = [...new Set(tasks.flat())];
  return other.length === 1 && open.has(other[0]) ? other[0] : episodeTask;
}

/** Reads errors: the right-click ask came after the error was on screen ≥ 5 s; a chat question with an error open is a miss. */
export function readsErrorEvent(ask: { shownMs: number | null } | null, chatQuestionWithErrorOpen: boolean): boolean | null {
  if (ask) return ask.shownMs !== null && ask.shownMs >= 5000;
  return chatQuestionWithErrorOpen ? false : null;
}

/** Small runs: at most 15 lines changed since the last run. */
export function smallRunEvent(changed: number): boolean | null {
  return changed === 0 ? null : changed <= 15;
}

/** Lines added, removed or edited between two versions (a line-by-line LCS distance). */
export function changedLines(before: string, after: string): number {
  const a = before.split("\n").filter((l, i, xs) => i < xs.length - 1 || l !== "");
  const b = after.split("\n").filter((l, i, xs) => i < xs.length - 1 || l !== "");
  const lcs: number[] = new Array(b.length + 1).fill(0);
  for (const x of a) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const keep = lcs[j];
      lcs[j] = x === b[j - 1] ? prev + 1 : Math.max(lcs[j], lcs[j - 1]);
      prev = keep;
    }
  }
  return Math.max(a.length, b.length) - lcs[b.length];
}

/** Own fixes: a spot closed by passing checks before the ladder's fix step. */
export function ownFixEvent(closedBy: "checks" | "fix-step"): boolean {
  return closedBy === "checks";
}

/** Steps first: at least 2 of Shape / Examples / Steps came from the learner's own text before Build. */
export function stepsFirstEvent(artifactsBeforeBuild: number): boolean {
  return artifactsBeforeBuild >= 2;
}

/** Ideas to code: the learner's own recipe Steps, then the task's checks passed (or not). */
export function ideasToCodeEvent(ownSteps: boolean, checksPassed: boolean): boolean | null {
  return ownSteps ? checksPassed : null;
}

/** Looks things up: the docs were opened before asking. Asking without them is not a miss. */
export function looksUpEvent(docsOpenedBeforeAsk: boolean): boolean | null {
  return docsOpenedBeforeAsk ? true : null;
}
