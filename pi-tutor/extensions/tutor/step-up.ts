// The step-up (spec 2026-10-26 §6.2, §6.3): offered when a band's habits are solid; a talking test and a
// coding test decide it; the learner says yes before the level crosses the band edge.
import type { Band } from "./policy.js";
import type { HabitId } from "./habits.js";
import { GATE_HABITS } from "./levels.js";

const DAY_MS = 86_400_000;

/** All of the band's counted habits solid in this language, not offered in the last 24 h, never above pro. */
export function stepUpOffered(i: { band: Band; habitsSolidIn: (h: HabitId) => boolean; lastOffer: number | null; now: number }): boolean {
  if (i.band === "pro") return false;
  if (i.lastOffer !== null && i.now - i.lastOffer < DAY_MS) return false;
  return missingForStepUp(i.band, i.habitsSolidIn).length === 0;
}

/** The band's counted habits that are not solid yet, in the band's order. */
export function missingForStepUp(band: Band, habitsSolidIn: (h: HabitId) => boolean): HabitId[] {
  return GATE_HABITS[band].filter((h) => !habitsSolidIn(h));
}
