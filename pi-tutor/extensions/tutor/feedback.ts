import type { FeedbackKind } from "./profile.js";

// `/tutor-feedback` (spec 2026-10-13 §7 #7): adjusts style and rung, logged in the profile.
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

export function feedbackRung(kind: FeedbackKind, rung: number, cap: number): number {
  if (kind === "too-much-help") return Math.max(1, rung - 1);
  if (kind === "too-vague") return Math.min(cap, rung + 1);
  return rung;
}

/** The hidden per-turn note; shorter never means dropping needed detail (spec §2 "Complete"). */
export function formatFeedback(active: FeedbackKind[]): string | null {
  const lines = active.filter((k): k is Exclude<FeedbackKind, "good"> => k !== "good").map((k) => `- ${NOTES[k]}`);
  return lines.length ? ["[tutor-feedback] The learner told you how to teach them; keep replies complete, and:", ...lines].join("\n") : null;
}
