import type { Band } from "./policy.js";
import type { Size } from "./interview.js";

// Project suggester (spec §6; 2026-10-19 Q4): `count` projects biased toward weak concepts, as JSON.
export interface Suggestion { title: string; summary: string; size: Size; concepts: string[] }
/** `about`: what the onboarding conversation learned (experience, known, idea…); `exclude`: titles already shown. */
/** `tags`: the language's concept vocabulary; the project's concepts come from it so lessons can match them. */
export interface SuggestInput { language: string; level: number; band: Band; about: Record<string, string>; weakConcepts: string[]; done: string[]; count: number; exclude: string[]; tags: string[] }

const SIZES: readonly string[] = ["small", "medium", "large"];
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none yet");

export function suggestPrompt(i: SuggestInput): string {
  const lines = [
    `language: ${i.language}`,
    `learner: level ${i.level} (${i.band})`,
  ];
  for (const [k, v] of Object.entries(i.about)) if (v) lines.push(`${k}: ${v}`);
  lines.push(`weak concepts: ${list(i.weakConcepts)}`);
  lines.push(`finished projects: ${list(i.done)}`);
  if (i.tags.length) lines.push(`concept tags to choose from: ${i.tags.join(", ")}`);
  lines.push(`projects wanted: ${i.count}`);
  if (i.exclude.length) lines.push(`do not suggest: ${i.exclude.join(", ")}`);
  return lines.join("\n");
}

function text(v: unknown, field: string, n: number): string {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`project ${n} needs a non-empty ${field}`);
  return v.trim();
}

export function checkSuggestions(v: unknown, count = 3): Suggestion[] {
  const projects = (v as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(projects)) throw new Error('reply must be {"projects":[…]}');
  if (projects.length !== count) throw new Error(`need exactly ${count} project${count === 1 ? "" : "s"}, got ${projects.length}`);
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
