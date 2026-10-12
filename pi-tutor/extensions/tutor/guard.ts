import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Tool fence (spec §8): read-only tools, project root only. Defence in depth behind `--tools`.
export const READ_TOOLS: ReadonlySet<string> = new Set(["read", "grep", "find", "ls"]);

export type GuardResult = { block: true; reason: string } | undefined;

const UNICODE_SPACES = /[  -   　]/g;
const BASH_REASON = "bash is off for the tutor: ask the learner to run the command (e.g. :TutorRun) and share the output";

/** Mirror of Pi's resolveToCwd (dist/utils/paths.js normalizePath + resolvePath). */
export function resolveToolPath(p: string, cwd: string): string {
  let s = p.replace(UNICODE_SPACES, " ");
  if (s.startsWith("@")) s = s.slice(1);
  if (s === "~") s = homedir();
  else if (s.startsWith("~/")) s = join(homedir(), s.slice(2));
  else if (s.startsWith("file://")) s = fileURLToPath(s);
  return isAbsolute(s) ? resolve(s) : resolve(cwd, s);
}

/** realpath of the nearest existing ancestor with the missing tail re-appended. */
export function realpathLoose(abs: string): string {
  let head = abs;
  const tail: string[] = [];
  while (!existsSync(head)) {
    const parent = dirname(head);
    if (parent === head) break;
    tail.unshift(basename(head));
    head = parent;
  }
  let real: string;
  try { real = realpathSync(head); } catch { real = head; }
  return tail.length ? join(real, ...tail) : real;
}

export function guardToolCall(toolName: string, input: Record<string, unknown>, cwd: string, extraRoots: string[] = []): GuardResult {
  if (toolName === "bash") return { block: true, reason: BASH_REASON };
  if (!READ_TOOLS.has(toolName)) return { block: true, reason: `the tutor is read-only: ${toolName} is not allowed` };
  const p = input.path;
  if (p === undefined && toolName !== "read") return undefined; // defaults to cwd
  if (typeof p !== "string") return { block: true, reason: `${toolName} needs a string path inside the project` };
  const root = realpathLoose(cwd);
  const target = realpathLoose(resolveToolPath(p, cwd));
  for (const r of [root, ...extraRoots.map(realpathLoose)]) {
    const prefix = r.endsWith("/") ? r : r + "/";
    if (target === r || target.startsWith(prefix)) return undefined;
  }
  return { block: true, reason: `${p} is outside the project root ${root}; the tutor only reads project files and loaded skills` };
}

/** Folders of the skills Pi loaded (spec §7): the model reads SKILL.md and references/ through `read`. */
export function skillDirs(commands: { source: string; sourceInfo?: { path?: string } }[]): string[] {
  return commands.filter((c) => c.source === "skill" && typeof c.sourceInfo?.path === "string").map((c) => dirname(c.sourceInfo!.path!));
}
