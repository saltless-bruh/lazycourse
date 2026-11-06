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
  return replay(events).state;
}

/** Phase 8 B8: when the habit last turned solid (the time of that event), or null when it is not solid now. */
export function solidSince(events: HabitEvent[]): number | null {
  const r = replay(events);
  return r.state === "solid" ? r.since : null;
}

function replay(events: HabitEvent[]): { state: HabitState; since: number | null } {
  // Phase 8 B9: running counts, so a replay is one pass (it ran on every tick for every habit).
  const seen: HabitEvent[] = [], projects = new Set<string>();
  let state: HabitState = "not yet", since: number | null = null, good = 0;
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    seen.push(e);
    if (e.ok) { good++; projects.add(e.project); }
    if (state === "solid") {
      if (seen.slice(-5).filter((x) => !x.ok).length >= 3) state = "showing";
      continue;
    }
    if (good >= 5 && projects.size >= 2 && seen.slice(-3).every((x) => x.ok)) { state = "solid"; since = e.at; }
    else if (good >= 2) state = "showing";
  }
  return { state, since };
}

/** Solid overall, and shown at least once in `language` (author: experience carries, once seen there). */
export function solidIn(events: HabitEvent[], language: string): boolean {
  return habitState(events) === "solid" && events.some((e) => e.ok && e.language === language);
}
