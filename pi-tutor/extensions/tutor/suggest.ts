import type { Band } from "./policy.js";
import type { InterviewAnswers, Size } from "./interview.js";

// Project suggester (spec §6): three projects biased toward weak concepts, as JSON.
export interface Suggestion { title: string; summary: string; size: Size; concepts: string[] }
export interface SuggestInput { language: string; level: number; band: Band; interview: InterviewAnswers | null; weakConcepts: string[]; done: string[] }

const SIZES: readonly string[] = ["small", "medium", "large"];
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none yet");

export function suggestPrompt(i: SuggestInput): string {
  const lines = [
    `language: ${i.language}`,
    `learner: level ${i.level} (${i.band})`,
  ];
  if (i.interview) {
    lines.push(`programming experience: ${i.interview.experience}`);
    lines.push(`languages known: ${i.interview.known || "not given"}`);
    lines.push(`familiarity with ${i.language}: ${i.interview.familiarity}`);
    lines.push(`goal: ${i.interview.goal || "not given"}`);
    lines.push(`preferred size: ${i.interview.size}`);
  }
  lines.push(`weak concepts: ${list(i.weakConcepts)}`);
  lines.push(`finished projects: ${list(i.done)}`);
  return lines.join("\n");
}

function text(v: unknown, field: string, n: number): string {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`project ${n} needs a non-empty ${field}`);
  return v.trim();
}

export function checkSuggestions(v: unknown): Suggestion[] {
  const projects = (v as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(projects)) throw new Error('reply must be {"projects":[…]}');
  if (projects.length !== 3) throw new Error(`need exactly 3 projects, got ${projects.length}`);
  return projects.map((p, idx) => {
    const n = idx + 1;
    const o = (p ?? {}) as Record<string, unknown>;
    if (!SIZES.includes(o.size as string)) throw new Error(`project ${n} size must be small, medium or large`);
    if (!Array.isArray(o.concepts) || !o.concepts.every((c) => typeof c === "string")) throw new Error(`project ${n} concepts must be strings`);
    return { title: text(o.title, "title", n), summary: text(o.summary, "summary", n), size: o.size as Size, concepts: o.concepts as string[] };
  });
}

export function suggestionLabel(s: Suggestion, i: number): string {
  return `${i + 1}. ${s.title} (${s.size}) — ${s.summary}`;
}
