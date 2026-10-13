import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

// Roles (spec 2026-10-13 §3): pi-tutor/agents/<role>.md, frontmatter + a short role prompt.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "agents");

export interface Role { name: string; command: string; ladder: boolean; skills: string[]; prompt: string }
export const DEFAULT_ROLE = "coding-tutor";

export function parseRole(text: string): Role {
  let fm: Record<string, unknown> = {};
  let body = text;
  try { const p = parseFrontmatter(text); fm = p.frontmatter; body = p.body; } catch { /* reported below as a missing name */ }
  const name = typeof fm.name === "string" ? fm.name : "";
  if (!name) throw new Error("role file needs a name in its frontmatter");
  const command = typeof fm.command === "string" ? fm.command : "";
  if (!command) throw new Error(`role ${name} needs a command in its frontmatter`);
  const skills = Array.isArray(fm.skills) ? fm.skills.filter((s): s is string => typeof s === "string") : [];
  return { name, command, ladder: fm.ladder !== false, skills, prompt: body.trim() };
}

let cache: Map<string, Role> | null = null;

export function roles(): Map<string, Role> {
  if (!cache) {
    cache = new Map();
    for (const f of readdirSync(DIR).filter((f) => f.endsWith(".md")).sort()) {
      const r = parseRole(readFileSync(join(DIR, f), "utf8"));
      cache.set(r.name, r);
    }
  }
  return cache;
}

export function roleNamed(name: string): Role {
  const all = roles();
  return all.get(name) ?? all.get(DEFAULT_ROLE)!;
}

/** The role section of the tutor prompt: its text plus the skills it prefers (spec §5.4). */
export function rolePrompt(r: Role): string {
  return r.skills.length ? `${r.prompt}\n\nPrefer these skills when they fit: ${r.skills.map((s) => `\`${s}\``).join(", ")}.` : r.prompt;
}
