// Wayfinding spec 2026-11-08 §7: where the learner is, from the extension's own state (never the model's).
export type Where =
  | "fresh" | "tour" | "onboarding-talk" | "level-task" | "onboarding-dialog" | "project-elsewhere"
  | "onboarding-paused" | "plan-writing" | "plan-failed" | "project" | "recipe" | "stuck" | "checks-pass"
  | "lesson" | "exam" | "step-up";
