// The habits the tutor watches (spec 2026-10-26 §3, author): evidence, not opinion. Pure.
import type { Band } from "./policy.js";

export type HabitId = "steps-first" | "reads-errors" | "looks-up" | "small-runs" | "own-fixes" | "ideas-to-code"
  | "right-direction" | "right-question" | "tests-that-fail" | "complex" | "optimizes";
export type HabitState = "not yet" | "showing" | "solid";
export interface HabitEvent { habit: HabitId; ok: boolean; language: string; project: string; at: number; evidence: string }

export const BAND_HABITS: Record<Band, HabitId[]> = {
  beginner: ["steps-first", "reads-errors", "looks-up", "small-runs", "own-fixes", "ideas-to-code", "right-direction", "right-question"],
  intermediate: ["tests-that-fail", "complex"],
  pro: ["optimizes"],
};

/**
 * showing after 2 qualifying events; solid after 5 qualifying across ≥ 2 projects with the last 3 qualifying;
 * a solid habit drops back to showing only when 3 of its last 5 events miss (one slip does not undo it).
 */
export function habitState(events: HabitEvent[]): HabitState {
  const seen: HabitEvent[] = [];
  let state: HabitState = "not yet";
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    seen.push(e);
    const good = seen.filter((x) => x.ok);
    if (state === "solid") {
      if (seen.slice(-5).filter((x) => !x.ok).length >= 3) state = "showing";
      continue;
    }
    if (good.length >= 5 && new Set(good.map((x) => x.project)).size >= 2 && seen.slice(-3).every((x) => x.ok)) state = "solid";
    else if (good.length >= 2) state = "showing";
  }
  return state;
}

/** Solid overall, and shown at least once in `language` (author: experience carries, once seen there). */
export function solidIn(events: HabitEvent[], language: string): boolean {
  return habitState(events) === "solid" && events.some((e) => e.ok && e.language === language);
}
