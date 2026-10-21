import type { TurnStep } from "./ladder.js";

// One narrow instruction per turn (spec 2026-10-21 §6): a long rule list does not steer a weak model, so code
// picks the step from the attempt count and the model gets only that step's job and limits.

/** Re-asks of one reply before the learner gets the code-written fallback (spec §6). */
export const MAX_REASKS = 2;
/** Shown while a held reply streams, and in place of a reply that is being written again. */
export const HOLD_TEXT = "_(tutor is checking this reply…)_";
export const REWRITE_TEXT = "_(tutor is rewriting this reply…)_";

/** What a reply at each step may be; the reply check (compliance.checkTurn) holds it to these. */
export const TURN_LIMITS: Record<TurnStep, { maxSentences: number | null; ownCode: boolean; question: boolean }> = {
  teach: { maxSentences: null, ownCode: false, question: false },
  hint: { maxSentences: 2, ownCode: false, question: false },
  why: { maxSentences: 6, ownCode: false, question: false },
  ask: { maxSentences: 3, ownCode: false, question: true },
  fix: { maxSentences: null, ownCode: true, question: false },
};

const INSTRUCTION: Record<TurnStep, string> = {
  teach: "Teach the idea with the labelled parts. Show code only on a small unrelated example, never with the learner's own names, and end by asking them to try their own line.",
  hint: "One small hint that points at the spot (the line or the value that is off). At most 2 sentences. No code with the learner's names and no fix.",
  why: "Say clearly why it is wrong and what kind of change fixes it, from the run output. At most 6 sentences. No code with the learner's names, and do not state the corrected line.",
  ask: "Before explaining anything, ask what they were thinking when they wrote that part, or whether they guessed. Only the question: at most 3 sentences, ending with a question mark.",
  fix: "Give the fix for only the stuck part: that one line, with one sentence of why. Everything else stays theirs.",
};

export function turnInstruction(step: TurnStep): string {
  return INSTRUCTION[step];
}

/** Shown when every re-ask of a reply failed its check: written by code, so it can never hold code or the fix. */
export function fallbackReply(step: TurnStep, spot?: string): string {
  const at = spot ? ` (${spot.replace(/[`*_]/g, "").slice(0, 80)})` : "";
  switch (step) {
    case "teach": return "Tell me which step you are on and what you tried so far, and I will show the idea on a small example.";
    case "hint": return `Look again at the spot the last run points to${at}: what does that part do with its values? Change it, then run again.`;
    case "ask": return "Before I explain: what were you thinking when you wrote that part? Did you reason it out, or was it a guess?";
    case "why":
    case "fix": return `The last run still fails at the same spot${at}. Compare what it printed with what you expected, and work out which operation or value makes the difference.`;
  }
}
