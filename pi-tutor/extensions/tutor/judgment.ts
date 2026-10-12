// Parses the fenced `tutor-judgment` JSON block the band prompt asks the model to end every turn with (spec §5).
export type JudgmentValue = "correct" | "partial" | "wrong" | "none";

export interface Judgment {
  judgment: JudgmentValue;
  concept_tags: string[];
  task_done_ids: string[];
  episode_closed: boolean;
}

const VALUES: readonly JudgmentValue[] = ["correct", "partial", "wrong", "none"];
const FENCE = /```tutor-judgment[ \t]*\r?\n([\s\S]*?)```/g;

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseJudgment(text: string): Judgment | null {
  let body: string | null = null;
  for (const m of text.matchAll(FENCE)) body = m[1];
  if (body === null) return null;
  let raw: unknown;
  try { raw = JSON.parse(body.trim()); } catch { return null; }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!VALUES.includes(o.judgment as JudgmentValue)) return null;
  return {
    judgment: o.judgment as JudgmentValue,
    concept_tags: strings(o.concept_tags),
    task_done_ids: strings(o.task_done_ids),
    episode_closed: o.episode_closed === true,
  };
}
