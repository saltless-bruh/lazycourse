import type { ExamSize } from "./make.js";

// The exam in progress (spec 2026-10-13 §6): a `tutor_exam` session entry, restored on resume.
export interface ExamState { id: string; dir: string; language: string; topic: string | null; size: ExamSize; started: number; limit: number; concepts: string[]; submitted?: number; abandoned?: number; score?: number }

/** The last `tutor_exam` entry on the branch, if it is still open (not submitted or abandoned). */
export function restoreExam(branch: unknown[]): ExamState | null {
  let e: ExamState | undefined;
  for (const x of branch as { type?: string; customType?: string; data?: unknown }[]) if (x.type === "custom" && x.customType === "tutor_exam") e = x.data as ExamState;
  return e && typeof e.started === "number" && typeof e.id === "string" && e.submitted === undefined && e.abandoned === undefined ? e : null;
}
