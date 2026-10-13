import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { RUNG_NAMES, describeTrigger, type Episode } from "./ladder.js";

// /tutor-learn (spec §7): last closed episode → a drafted SKILL.md the learner edits, keeps, or discards.
export interface Learned { slug: string; description: string; body: string }

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function lastClosedEpisode(branch: unknown[]): Episode | null {
  for (let i = branch.length - 1; i >= 0; i--) {
    const e = branch[i] as { type?: string; customType?: string; data?: Episode };
    if (e.type === "custom" && e.customType === "tutor_episode" && e.data && e.data.closed !== undefined) return e.data;
  }
  return null;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((c): c is { type: "text"; text: string } => c?.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n");
}

/** Newest learner/tutor lines that fit in `maxChars`, oldest first. */
export function transcript(branch: unknown[], maxChars = 8000): string {
  const lines: string[] = [];
  let used = 0;
  for (let i = branch.length - 1; i >= 0; i--) {
    const m = (branch[i] as { type?: string; message?: { role?: string; content?: unknown } }).message;
    if ((branch[i] as { type?: string }).type !== "message" || !m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = textOf(m.content).trim();
    if (!text) continue;
    const line = `${m.role === "user" ? "learner" : "tutor"}: ${text}`;
    if (used + line.length + 1 > maxChars) break;
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

export function learnPrompt(language: string, ep: Episode, convo: string): string {
  return [
    `language: ${language}`,
    `stuck on: ${describeTrigger(ep.trigger)}`,
    `concepts: ${ep.concept_tags.join(", ") || "none tagged"}`,
    `closed at rung ${ep.rung} (${RUNG_NAMES[ep.rung - 1]}) after ${ep.turns} turn(s)`,
    "",
    "conversation:",
    convo || "(none recorded)",
  ].join("\n");
}

export function checkLearned(v: unknown): Learned {
  const o = (v ?? {}) as Record<string, unknown>;
  if (typeof o.slug !== "string" || !NAME.test(o.slug) || o.slug.length > 40) throw new Error("slug must be kebab-case, at most 40 characters");
  if (typeof o.description !== "string" || !o.description.trim() || /\n/.test(o.description) || o.description.length > 1024) {
    throw new Error("description must be one non-empty line of at most 1024 characters");
  }
  if (typeof o.body !== "string" || !o.body.trim()) throw new Error("body must be non-empty markdown");
  return { slug: o.slug, description: o.description.trim(), body: o.body.trim() };
}

export function renderLearned(language: string, l: Learned): string {
  return `---\nname: tutor-${language}-learned-${l.slug}\ndescription: ${JSON.stringify(l.description)}\n---\n${l.body}\n`;
}

/**
 * The frontmatter Pi needs to load a skill (docs/skills.md): a valid name and a description.
 * Parsed with Pi's own parseFrontmatter (the yaml package Pi loads skills with), so a header
 * that passes here also loads in Pi.
 */
export function parseSkillHeader(text: string): { name: string; description: string } {
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(text)) throw new Error("missing --- frontmatter --- at the top");
  let fields: Record<string, unknown>;
  try { fields = parseFrontmatter(text).frontmatter; } catch (e) {
    throw new Error(`frontmatter is not valid YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
  const name = typeof fields.name === "string" ? fields.name : "";
  if (!NAME.test(name) || name.length > 64) throw new Error("name must be lowercase letters, digits and single hyphens, at most 64 characters");
  const description = typeof fields.description === "string" ? fields.description.trim() : "";
  if (!description || description.length > 1024) throw new Error("description is required (at most 1024 characters)");
  return { name, description };
}

/** Writes <root>/<name>/SKILL.md; an existing name gets -2, -3, … (also rewritten in the frontmatter). */
export function saveSkill(root: string, name: string, text: string): string {
  let final = name;
  for (let n = 2; existsSync(join(root, final)); n++) final = `${name}-${n}`;
  const dir = join(root, final);
  mkdirSync(dir, { recursive: true });
  // M5 #34: rename the `name:` line wherever it sits in the front matter, never in the body.
  // CRLF needs nothing extra: a multiline `$` also matches before "\r". Front matter without a
  // `name:` line gets one after the opening `---`, so the folder and the skill name agree (M6c M9).
  const end = text.indexOf("\n---", 3);
  const head = end < 0 ? "" : text.slice(0, end);
  const renamed = final === name || end < 0 ? text
    : /^name:/m.test(head) ? head.replace(/^(name:[ \t]*)\S+[ \t]*$/m, `$1${final}`) + text.slice(end)
    : head.replace(/^---(\r?\n)/, `---$1name: ${final}$1`) + text.slice(end);
  writeFileSync(join(dir, "SKILL.md"), renamed, { flag: "wx" });
  return dir;
}
