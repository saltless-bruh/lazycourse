// The level inside its band (spec 2026-10-26 §4): it rises as the band's habits turn solid, falls a little on
// a streak of handed fixes, never below the band's floor, never across a band edge (that takes the step-up).
import type { Band } from "./policy.js";
import { BAND_HABITS, habitState, solidIn, type HabitEvent, type HabitId } from "./habits.js";

const BANDS: Record<Band, [number, number]> = { beginner: [0, 33], intermediate: [34, 66], pro: [67, 100] };

/** The habits that count toward a band (looks-up waits for the step-up, which is where it can be shown). */
export const GATE_HABITS: Record<Band, HabitId[]> = {
  beginner: BAND_HABITS.beginner.filter((h) => h !== "looks-up"),
  intermediate: BAND_HABITS.intermediate,
  pro: BAND_HABITS.pro,
};

export const HABIT_LABEL: Record<HabitId, string> = {
  "steps-first": "breaks a problem into steps first", "reads-errors": "reads the error before asking",
  "looks-up": "looks things up", "small-runs": "runs small pieces often", "own-fixes": "fixes own bugs",
  "ideas-to-code": "turns ideas into code", "right-direction": "goes the right direction",
  "right-question": "asks the right question", "tests-that-fail": "writes tests that can fail",
  "complex": "figures out complex problems", "optimizes": "optimizes logic, speed and code",
};
const REASON: Record<HabitId, string> = {
  "steps-first": "you broke the problem into steps before coding", "reads-errors": "you read errors before asking",
  "looks-up": "you looked things up", "small-runs": "you ran small pieces often", "own-fixes": "you fixed your own bugs without the handed line",
  "ideas-to-code": "you turned your own plan into working code", "right-direction": "your tries kept getting closer",
  "right-question": "your questions moved you forward", "tests-that-fail": "your tests catch broken code",
  "complex": "you solved a complex problem yourself", "optimizes": "you improved working code",
};

/** `handedNow`: this tick itself needed the handed line (final review I3: only then does the streak lower the level). */
export function levelInBand(i: { level: number; band: Band; solid: number; total: number; fixStepStreak: number; newest?: HabitId; handedNow?: boolean }): { level: number; reason: string } | null {
  const [floor, top] = BANDS[i.band];
  if (i.handedNow && i.fixStepStreak >= 2) {
    const down = Math.max(floor, i.level - 3);
    return down < i.level ? { level: down, reason: "the last tasks needed the handed line" } : null;
  }
  const target = Math.min(top, Math.round(floor + (top - floor) * (i.total ? i.solid / i.total : 0)));
  return target > i.level ? { level: target, reason: i.newest ? REASON[i.newest] : "your habits are growing" } : null;
}

export function stepDownSuggested(fixStepStreak: number): boolean {
  return fixStepStreak >= 3;
}

/** How many of the band's counted habits are solid in this language, and the most recently solid one. */
export function bandProgress(events: HabitEvent[], band: Band, language: string): { solid: number; total: number; newest?: HabitId } {
  let newest: { h: HabitId; at: number } | undefined;
  let solid = 0;
  for (const h of GATE_HABITS[band]) {
    const es = events.filter((e) => e.habit === h);
    if (!solidIn(es, language)) continue;
    solid++;
    const at = Math.max(...es.map((e) => e.at));
    if (!newest || at > newest.at) newest = { h, at };
  }
  return { solid, total: GATE_HABITS[band].length, newest: newest?.h };
}

/** `/tutor-progress`: the band's habits with their state and the latest evidence. */
export function habitReport(events: HabitEvent[], band: Band, language: string): string {
  const lines = [`Habits (${band})`];
  for (const h of BAND_HABITS[band]) {
    if (!GATE_HABITS[band].includes(h)) { lines.push(`- ${HABIT_LABEL[h]}: shown in the step-up`); continue; }
    const es = events.filter((e) => e.habit === h);
    const state = solidIn(es, language) ? "solid" : habitState(es);
    const last = es.at(-1);
    lines.push(`- ${HABIT_LABEL[h]}: ${state}${last ? ` (latest: ${last.ok ? "good" : "miss"}, ${last.evidence})` : ""}`);
  }
  return lines.join("\n");
}
