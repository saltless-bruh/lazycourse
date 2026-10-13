import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { assertNoSecrets } from "./vendor/pify-secrets.js";
import type { MemoryRow, MemoryType, Profile } from "./profile.js";

// Tutor memory (spec 2026-10-13 §7.1): the model writes through ONE tool and reads through ONE;
// the extension renders a frozen snapshot at session start. No hidden model calls.
export const MEMORY_TYPES: readonly MemoryType[] = ["learner", "feedback", "project", "reference"];
export const MAX_MEMORY_CHARS = 400;
/** ~400 tokens: the snapshot's share of the per-turn prompt budget (spec §7 #2). */
export const SNAPSHOT_CHARS = 1600;
const RECALL_MAX = 10;

export interface MemoryScope { profile(): Profile | null; language(): string | null; project(): string | null; now(): number }

const result = (text: string, details: Record<string, unknown> = {}) => ({ content: [{ type: "text" as const, text }], details });

function profileOf(s: MemoryScope): Profile {
  const p = s.profile();
  if (!p) throw new Error("the learner profile is unavailable; nothing was saved or searched");
  return p;
}

export function rememberTool(s: MemoryScope) {
  return defineTool({
    name: "tutor_remember",
    label: "Remember",
    description: "Save one durable fact about the learner for future sessions. Types: learner (how they learn, what they know), feedback (how they want to be taught), project (decisions in their project), reference (where something lives). One fact per call, plain words, at most 400 characters. Never save code, secrets, or anything only true right now. The tutor-memory skill has the rules.",
    parameters: Type.Object({
      type: Type.Union([Type.Literal("learner"), Type.Literal("feedback"), Type.Literal("project"), Type.Literal("reference")]),
      text: Type.String({ description: "the fact, in one or two plain sentences" }),
    }),
    async execute(_id, params) {
      const type = String(params.type) as MemoryType;
      if (!MEMORY_TYPES.includes(type)) throw new Error(`type must be one of ${MEMORY_TYPES.join(", ")}`);
      const text = String(params.text ?? "").trim();
      if (!text) throw new Error("the memory text is empty");
      if (text.length > MAX_MEMORY_CHARS) throw new Error(`a memory is at most ${MAX_MEMORY_CHARS} characters; save one fact`);
      assertNoSecrets(text);
      const r = profileOf(s).remember({ type, text, language: s.language(), project: s.project() }, s.now());
      return result(r.created ? `saved memory #${r.id}` : `already remembered as #${r.id}`, { id: r.id });
    },
  });
}

export function recallTool(s: MemoryScope) {
  return defineTool({
    name: "tutor_recall",
    label: "Recall",
    description: "Search what you saved about this learner in earlier sessions (words, any order). Returns up to 10 memories as `#id [type] text`.",
    parameters: Type.Object({
      query: Type.String({ description: "words to search for" }),
      limit: Type.Optional(Type.Number({ description: "at most 10; default 5" })),
    }),
    async execute(_id, params) {
      const limit = Math.min(RECALL_MAX, Math.max(1, Math.floor(Number(params.limit ?? 5)) || 5));
      const query = String(params.query ?? "");
      const rows = profileOf(s).recall(query, limit);
      if (rows.length === 0) return result(`no saved memories match "${query}"`);
      return result(rows.map(memoryLine).join("\n"), { ids: rows.map((r) => r.id) });
    },
  });
}

/** `#id [type] text (language)`: tutor_recall results and the /tutor-memory list. */
export function memoryLine(r: MemoryRow): string {
  return `#${r.id} [${r.type}] ${r.text}${r.language ? ` (${r.language})` : ""}`;
}

/** The `tutor_memory` system-prompt section, frozen at session start (idea from @henryqw/pi-memory). */
export function memorySnapshot(rows: MemoryRow[], maxChars = SNAPSHOT_CHARS): string | null {
  if (rows.length === 0) return null;
  const out = ["## What you remember about this learner", "Saved in earlier sessions with tutor_remember, newest first. Search for more with tutor_recall."];
  let size = out.join("\n").length;
  for (const r of rows) {
    const l = `- [${r.type}] ${r.text}`;
    if (size + 1 + l.length > maxChars) break;
    out.push(l);
    size += 1 + l.length;
  }
  return out.join("\n");
}
