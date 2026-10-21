import type { FeedbackKind } from "./profile.js";

// `/tutor-feedback` (spec 2026-10-13 §7 #7): adjusts style, logged in the profile. Help moves only with
// graded tries (spec 2026-10-21 §5); too-much-help can only slow it (index.ts sets the episode's delay).
export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["too-long", "too-vague", "too-much-help", "good"];

const NOTES: Record<Exclude<FeedbackKind, "good">, string> = {
  "too-long": "the learner finds your replies too long: keep every part they need, but say each in one or two sentences and drop examples they did not ask for",
  "too-vague": "the learner finds your replies too vague: point at exact lines (path:line), name the concept precisely, and give one concrete example",
  "too-much-help": "the learner wants to work things out: hint less, ask one more question before pointing",
};

/** History → active kinds: each kind stays on until `good` clears them all; first-seen order. */
export function activeFeedback(history: FeedbackKind[]): FeedbackKind[] {
  let active: FeedbackKind[] = [];
  for (const k of history) {
    if (k === "good") active = [];
    else if (!active.includes(k)) active.push(k);
  }
  return active;
}

/** The hidden per-turn note; shorter never means dropping needed detail (spec §2 "Complete"). */
export function formatFeedback(active: FeedbackKind[]): string | null {
  const lines = active.filter((k): k is Exclude<FeedbackKind, "good"> => k !== "good").map((k) => `- ${NOTES[k]}`);
  return lines.length ? ["[tutor-feedback] The learner told you how to teach them; keep replies complete, and:", ...lines].join("\n") : null;
}
