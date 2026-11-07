import type { Band } from "./policy.js";

// Show or hide the model's thinking in the tutor pane (learner request 2026-10-14): display only,
// the model still thinks and the session keeps it. Learner-session fixes (spec §4): `auto` hides it on every band —
// a beginner watched the model argue with its own instructions during onboarding; `show` shows it.
export type ThinkingMode = "auto" | "show" | "hide";
const MODES: readonly ThinkingMode[] = ["auto", "show", "hide"];
export const THINKING_LABEL = "thinking hidden · /tutor-thinking show";

export function parseThinkingMode(s: string): ThinkingMode | null {
  const m = s.trim().toLowerCase();
  return (MODES as readonly string[]).includes(m) ? (m as ThinkingMode) : null;
}

/** `guarded`: a teaching turn before the fix is allowed, where the thinking holds the fix (spec 2026-10-21 §6). */
export function thinkingHidden(mode: ThinkingMode, band: Band, guarded = false): boolean {
  void band; // kept in the signature: callers pass it, and a band rule may return
  return guarded || mode !== "show";
}
