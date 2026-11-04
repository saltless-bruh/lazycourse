// The pro score (spec 2026-10-21 §8, habits spec 2026-10-26 §8, Task 16): only facts code can check, so every
// point re-runs the same way. The model's views on design and naming are notes with no points and no effect on
// the level; a run of scores far from the level makes the tutor suggest a level, and the learner decides.

export interface ProFacts { checksPass: boolean; ownTestsPass: boolean; ownTestsCanFail: boolean; edgeCasesCovered: number; edgeCasesTotal: number }

const edgePoints = (f: ProFacts) => (f.edgeCasesTotal > 0 ? (25 * Math.min(f.edgeCasesCovered, f.edgeCasesTotal)) / f.edgeCasesTotal : 0);

/** 25 for each of the first three facts, 25 × covered/total for the edge cases (none listed: no points). */
export function proScore(f: ProFacts): number {
  return Math.round((f.checksPass ? 25 : 0) + (f.ownTestsPass ? 25 : 0) + (f.ownTestsCanFail ? 25 : 0) + edgePoints(f));
}

/** Every fact with its points, so the learner sees where each point came from. */
export function scoreLine(f: ProFacts): string {
  const pts = (b: boolean) => (b ? 25 : 0);
  return `pro score ${proScore(f)}/100: checks pass ${pts(f.checksPass)} · your tests pass ${pts(f.ownTestsPass)} · `
    + `your tests catch a broken version ${pts(f.ownTestsCanFail)} · done-when cases covered ${f.edgeCasesCovered}/${f.edgeCasesTotal} ${Math.round(edgePoints(f))}`;
}

/** The calls in backticks on a task's `done when:` (`split_amount(48, 3)`), in order. */
export function doneWhenCalls(tasksMd: string, task: string): string[] {
  const line = tasksMd.split("\n").find((l) => new RegExp(`^\\s*- \\[[ x]\\] ${task.replace(".", "\\.")}\\b`).test(l));
  const when = line ? /done when:(.*)$/i.exec(line)?.[1] ?? "" : "";
  return [...when.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter((c) => /^[\w.]+\s*\(.*\)$/.test(c));
}

const squash = (s: string) => s.replace(/\s+/g, "");

/** How many of `calls` an own test's body makes, spaces ignored. */
export function coveredCalls(calls: string[], testBodies: string[]): number {
  const bodies = testBodies.map(squash);
  return calls.filter((c) => bodies.some((b) => b.includes(squash(c)))).length;
}

/**
 * After three scores, a level to suggest: their average 15 or more above the level → 10 higher; 30 or more below
 * → 10 lower; otherwise none. Never above 100 or below 0. The learner decides; the tutor never moves the level.
 */
export function levelSuggestion(lastScores: number[], level: number): number | null {
  if (lastScores.length < 3) return null;
  const recent = lastScores.slice(-3);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const to = avg >= level + 15 ? Math.min(100, level + 10) : avg <= level - 30 ? Math.max(0, level - 10) : level;
  return to === level ? null : to;
}
