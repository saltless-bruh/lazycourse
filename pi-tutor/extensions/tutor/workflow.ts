import type { Band } from "./policy.js";

// The design-recipe workflow (spec 2026-10-13 §4): six steps, one artifact each, the learner does each.
export const STEPS = ["Find", "Shape", "Examples", "Steps", "Map", "Build"] as const;

const ARTIFACT = [
  "the task line, its requirements and its blueprint box, as a small map diagram",
  "inputs and outputs with their types, as one line like `argv: list[str] → Command`",
  "2-3 concrete input → output cases, one of them an edge case",
  "the job as numbered plain sentences, no code",
  "each step mapped to the language construct that does it",
  "one step at a time: write it, run it, compare with the examples",
];

const MODE: Record<Band, string> = {
  beginner: "Beginner: half-fill this step's artifact as a model and let the learner complete it; at Map, show an unrelated mini example per construct.",
  intermediate: "Intermediate: ask one question about this step and check the learner's answer.",
  pro: "Pro: name the step only, then review what the learner produces.",
};

export interface Workflow { task: string; step: number; started: number; done?: number }

/** Task ids from spec/tasks.md: P1, P1.T2, P1.T2.S3. */
export const TASK_ID = /^P\d+(?:\.T\d+(?:\.S\d+)?)?$/;

export function startWorkflow(task: string, now: number): Workflow {
  return { task, step: 1, started: now };
}

export function advance(w: Workflow, stepDone: boolean, now: number): Workflow {
  if (!stepDone || w.done !== undefined) return w;
  return w.step >= STEPS.length ? { ...w, done: now } : { ...w, step: w.step + 1 };
}

/** The widget label; a finished workflow is dropped by the extension, so it is never shown. */
export function workflowLabel(w: Workflow): string {
  return `plan ${w.step}/${STEPS.length}`;
}

export function formatWorkflowContext(w: Workflow, band: Band): string {
  return [
    `[workflow] design recipe for ${w.task}: step ${w.step}/${STEPS.length} ${STEPS[w.step - 1]}`,
    `artifact: ${ARTIFACT[w.step - 1]}`,
    // M7: the language card names the cookbook skill; its recipes are indexed by these plain steps.
    ...(STEPS[w.step - 1] === "Map" ? ["Open the cookbook skill the language card lists and match each of the learner's steps to a recipe; show the recipe's example, not their code."] : []),
    MODE[band],
    "The learner produces the artifact; set step_done true in the judgment only when they finished it. The tutor-design-recipe skill has the method.",
  ].join("\n");
}

/** The line of spec/tasks.md holding `id` as a whole token (P1.T1 must not match P1.T10 or P1.T1.S2). */
export function findTask(tasksMd: string, id: string): string | null {
  const re = new RegExp(`(^|[^\\w.])${id.replace(/\./g, "\\.")}(?![\\w.]*\\d)`);
  return tasksMd.split(/\r?\n/).find((l) => re.test(l)) ?? null;
}
