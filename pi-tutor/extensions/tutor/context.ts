import type { EditorSnapshot } from "./nvim.js";

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
  const lines = total > MAX_SNAPSHOT_LINES ? s.lines.slice(0, MAX_SNAPSHOT_LINES) : s.lines;
  const last = s.from + lines.length - 1;
  out.push(total > MAX_SNAPSHOT_LINES ? `--- lines ${s.from}-${last} (truncated, ${total} total) ---` : `--- lines ${s.from}-${last} ---`);
  lines.forEach((l, i) => out.push(`${String(s.from + i).padStart(4)}| ${l}`));
  return out.join("\n");
}
