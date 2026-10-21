import type { EditorSnapshot } from "./nvim.js";
import { describeTrigger, type Episode, type TurnStep } from "./ladder.js";
import { turnInstruction } from "./turns.js";

// Renders the per-turn editor context the model receives as a hidden custom message (spec §4).
export const MAX_SNAPSHOT_LINES = 400;

const SEV: Record<number, string> = { 1: "E", 2: "W", 3: "I", 4: "H" };

export function formatEditorContext(s: EditorSnapshot): string {
  const out: string[] = [`[editor] ${s.path} (${s.filetype || "unknown"}), cursor line ${s.cursor}`];
  if (s.diagnostics.length === 0) out.push("diagnostics: none");
  else {
    out.push("diagnostics:");
    for (const d of s.diagnostics) out.push(`  L${d.line} ${SEV[d.severity] ?? "?"}: ${d.msg}`);
  }
  const total = s.lines.length;
  // M2 #9: a long buffer keeps the MAX_SNAPSHOT_LINES lines centred on the cursor, clamped to the buffer.
  const at = Math.min(Math.max(0, s.cursor - s.from), Math.max(0, total - 1));
  const start = total > MAX_SNAPSHOT_LINES ? Math.max(0, Math.min(at - MAX_SNAPSHOT_LINES / 2, total - MAX_SNAPSHOT_LINES)) : 0;
  const lines = s.lines.slice(start, start + MAX_SNAPSHOT_LINES);
  const first = s.from + start, last = first + lines.length - 1;
  out.push(total > MAX_SNAPSHOT_LINES ? `--- lines ${first}-${last} (truncated, ${total} total) ---` : `--- lines ${first}-${last} ---`);
  lines.forEach((l, i) => out.push(`${String(first + i).padStart(4)}| ${l}`));
  return out.join("\n");
}

/** The episode header the model reads (spec 2026-10-21 §5–6): what it is stuck on, the failed attempts, this turn's job. */
export function formatEpisodeContext(ep: Episode, step: TurnStep): string {
  const out = [
    `[episode] stuck on: ${describeTrigger(ep.trigger)}`,
    `failed attempts on this spot: ${ep.attempts}, ${ep.turns} turn(s) so far`,
    `this turn: ${turnInstruction(step)}`,
  ];
  if (ep.concept_tags.length) out.push(`concepts: ${ep.concept_tags.join(", ")}`);
  if (ep.trigger.kind === "run") {
    // M6b #58: a fence longer than any backtick run in the trace, so program output cannot close it.
    const fence = "`".repeat(Math.max(3, ...[...ep.trigger.trace.matchAll(/`+/g)].map((m) => m[0].length + 1)));
    out.push("trace (last lines of the output):", `${fence}text`, ep.trigger.trace, fence,
      "Read it with the learner: find the error message and the learner's own frame (where depends on the language); the tutor-stack-traces skill has the method.");
  }
  return out.join("\n");
}
