// What the onboarding conversation (onboard.ts, spec 2026-10-19) shares with the rest: the experience
// bands it normalises answers onto, and project sizes. The old five-question form is gone.
export type Size = "small" | "medium" | "large";

export const EXPERIENCE = ["none yet", "under a year", "1-3 years", "over 3 years"] as const;
