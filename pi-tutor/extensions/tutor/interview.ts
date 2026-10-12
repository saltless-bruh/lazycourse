// First-time interview for a language (spec §6). Choices score the starting level; free text feeds the suggester.
export type Size = "small" | "medium" | "large";

export interface Ask {
  select(title: string, options: string[]): Promise<string | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
}

export interface InterviewAnswers { experience: string; known: string; familiarity: string; goal: string; size: Size }

export const EXPERIENCE = ["none yet", "under a year", "1-3 years", "over 3 years"] as const;
export const FAMILIARITY = ["never used it", "tried it a little", "use it regularly"] as const;
export const SIZES = ["small (1-2 h)", "medium (half a day)", "large (1-2 days)"] as const;

const BASE: Record<string, number> = { "never used it": 15, "tried it a little": 45, "use it regularly": 80 };
const NUDGE: Record<string, number> = { "none yet": -10, "under a year": 0, "1-3 years": 5, "over 3 years": 10 };

export async function runInterview(language: string, ask: Ask): Promise<InterviewAnswers | null> {
  const experience = await ask.select("How long have you been programming (any language)?", [...EXPERIENCE]);
  if (experience === undefined) return null;
  const known = await ask.input("Which languages do you already know?", "e.g. python, javascript");
  if (known === undefined) return null;
  const familiarity = await ask.select(`How familiar are you with ${language}?`, [...FAMILIARITY]);
  if (familiarity === undefined) return null;
  const goal = await ask.input(`What would you like to build or learn with ${language}?`, "optional");
  if (goal === undefined) return null;
  const size = await ask.select("How much time per project?", [...SIZES]);
  if (size === undefined) return null;
  return { experience, known: known.trim(), familiarity, goal: goal.trim(), size: size.split(" ")[0] as Size };
}

export function initialLevel(a: InterviewAnswers): number {
  const level = (BASE[a.familiarity] ?? 45) + (NUDGE[a.experience] ?? 0);
  return Math.min(100, Math.max(0, level));
}
