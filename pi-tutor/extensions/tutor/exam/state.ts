import type { ExamSize } from "./make.js";

// The exam in progress (spec 2026-10-13 §6): a `tutor_exam` session entry, restored on resume.
/** `tests` (M8 minor M3): the exam's tests file as it was written, so a grade never runs the learner's edits of it. */
export interface ExamState { id: string; dir: string; language: string; topic: string | null; size: ExamSize; started: number; limit: number; concepts: string[]; submitted?: number; abandoned?: number; score?: number; tests?: string;
  /** Phase 8 D: the requirement ids as the exam was written (brief.md is the learner's to edit). */
  ids?: string[];
  /** The brief as written, for the grader. */
  brief?: string }

/** The last `tutor_exam` entry on the branch, if it is still open (not submitted or abandoned). */
export function restoreExam(branch: unknown[]): ExamState | null {
  let e: ExamState | undefined;
  for (const x of branch as { type?: string; customType?: string; data?: unknown }[]) if (x.type === "custom" && x.customType === "tutor_exam") e = x.data as ExamState;
  return e && typeof e.started === "number" && typeof e.id === "string" && e.submitted === undefined && e.abandoned === undefined ? e : null;
}

const mmss = (ms: number) => { const s = Math.floor(Math.abs(ms) / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

/** The widget label (spec §6 "exam <id> ⏱ mm:ss"): the number only, so line 1 keeps room. */
export function examLabel(e: ExamState, now: number): string {
  const left = e.started + e.limit * 60_000 - now;
  const n = e.id.split("-")[0];
  return left >= 0 ? `exam ${n} ${mmss(left)} left` : `exam ${n} +${mmss(left)} late`;
}

export function formatExamContext(e: ExamState, now: number): string {
  const left = e.started + e.limit * 60_000 - now;
  return `[exam] timed exam ${e.id} in progress (${left >= 0 ? `${mmss(left)} left` : `${mmss(left)} over time`}). The brief is ${e.dir}/brief.md. Hints stay at a pointer or a why: never write, complete or fix the learner's solution in ${e.dir}/, and do not grade it; :TutorSubmit grades.`;
}
