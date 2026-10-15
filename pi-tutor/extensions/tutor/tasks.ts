import { findTask } from "./workflow.js";

// spec/tasks.md is the progress source (spec 2026-10-07): ticking turns "[ ]" into "[x]" on the
// task's own line. Pure; index.ts decides when (M8 D6: after a passing run).
export function tickTasks(md: string, ids: string[]): { text: string; ticked: string[]; missing: string[] } {
  const eol = md.includes("\r\n") ? "\r\n" : "\n";
  const lines = md.split(/\r?\n/);
  const ticked: string[] = [], missing: string[] = [];
  for (const id of ids) {
    const line = findTask(lines.filter((l) => /\[ \]/.test(l)).join("\n"), id);
    const i = line === null ? -1 : lines.indexOf(line);
    if (i < 0) { missing.push(id); continue; }
    lines[i] = lines[i].replace("[ ]", "[x]");
    ticked.push(id);
  }
  return { text: lines.join(eol), ticked, missing };
}
