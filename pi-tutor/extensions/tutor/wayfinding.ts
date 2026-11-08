import type { Stage } from "./onboard.js";

// Wayfinding spec 2026-11-08 §7: where the learner is, from the extension's own state (never the model's).
export type Where =
  | "fresh" | "tour" | "onboarding-talk" | "level-task" | "onboarding-dialog" | "project-elsewhere"
  | "onboarding-paused" | "plan-writing" | "plan-failed" | "project" | "recipe" | "stuck" | "checks-pass"
  | "lesson" | "exam" | "step-up";

/** What the extension knows that decides the next step (built in index.ts from its own state). */
export interface WayInput {
  firstRun: boolean;
  tour: { step: number; total: number; title: string } | null;
  onboarding: { stage: Stage; paused: boolean; levelTaskOpen: boolean; dialog: boolean; elsewhere: string | null } | null;
  spec: "writing" | "failed" | null;
  project: boolean;
  recipe: { task: string; step: number; action: string } | null;
  stuck: boolean;
  /** The task whose checks last passed and is not ticked yet. */
  passingTask: string | null;
  lesson: boolean;
  exam: boolean;
  stepUp: boolean;
}

/** One place, by precedence: a mode the learner chose (tour, exam, step-up, lesson) wins over the course's state. */
export function whereOf(i: WayInput): Where {
  if (i.tour) return "tour";
  if (i.exam) return "exam";
  if (i.stepUp) return "step-up";
  if (i.lesson) return "lesson";
  const o = i.onboarding;
  if (o) {
    if (o.paused) return "onboarding-paused";
    if (o.elsewhere) return "project-elsewhere";
    if (o.dialog) return "onboarding-dialog";
    if (o.levelTaskOpen) return "level-task";
    if (o.stage !== "done" && o.stage !== "choose") return "onboarding-talk";
  }
  if (i.spec === "writing") return "plan-writing";
  if (i.spec === "failed") return "plan-failed";
  if (i.recipe) return "recipe";
  if (i.passingTask) return "checks-pass";
  if (i.stuck) return "stuck";
  if (i.project) return "project";
  return "fresh";
}

/** The one next thing to do, as the widget's third line: command first, short enough not to clip (44 columns). */
export function nextStep(i: WayInput): string {
  const w = whereOf(i);
  const say: Record<Where, () => string> = {
    "fresh": () => ":TutorTour, or tell me what to learn",
    "tour": () => `tour ${i.tour!.step}/${i.tour!.total}: ${i.tour!.title}`,
    "onboarding-talk": () => "answer the tutor in its pane",
    "level-task": () => "/tutor-start check after the task",
    "onboarding-dialog": () => "answer the dialog in the tutor pane",
    "project-elsewhere": () => `open ${i.onboarding!.elsewhere} to go on`,
    "onboarding-paused": () => "/tutor-start to pick up again",
    "plan-writing": () => "wait, the plan is being written",
    "plan-failed": () => "/tutor-start spec to retry the plan",
    "project": () => "/tutor-plan <task> from spec/tasks.md",
    "recipe": () => `step ${i.recipe!.step} ${i.recipe!.action}, or say "skip"`,
    "stuck": () => ":TutorRun test, or ask: <leader>te",
    "checks-pass": () => `:TutorDone ${i.passingTask}`,
    "lesson": () => "/tutor-lesson next, or check",
    "exam": () => "/tutor-exam check, then /tutor-submit",
    "step-up": () => "/tutor-step-up check when ready",
  };
  return `next: ${say[w]()}`;
}
