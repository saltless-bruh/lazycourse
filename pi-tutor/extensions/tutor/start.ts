import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bandFor } from "./policy.js";
import type { Profile } from "./profile.js";
import { completeJson, type Complete } from "./llm.js";
import { systemText } from "./prompts.js";
import { loadPack, vocabOf, weakConcepts } from "./packs.js";
import { suggestPrompt, checkSuggestions, type Suggestion } from "./suggest.js";
import { agents, slugify, isEmptyOrMissing } from "./scaffold.js";
import { LANGS } from "./knowledge/versions.js";

// /tutor-start building blocks (spec 2026-10-19 §5): the conversation lives in index.ts and onboard.ts;
// these make the one project suggestion and the project folder. The spec is written later (Task 7).
export const LANGUAGES = ["python", "rust", "go", "typescript", "lua", "javascript"] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(s: string): s is Language {
  return (LANGUAGES as readonly string[]).includes(s);
}

/** One project for this learner (Q4), never one already shown. */
export async function suggestOne(d: { profile: Profile; complete: Complete }, i: { language: string; level: number; about: Record<string, string>; exclude: string[] }): Promise<Suggestion> {
  const [s] = await completeJson(d.complete, systemText("suggest"), suggestPrompt({
    language: i.language, level: i.level, band: bandFor(i.level), about: i.about,
    // M7 minor: old free-form rows read under the pack vocabulary's tag.
    weakConcepts: weakConcepts(d.profile.concepts(i.language), vocabOf(loadPack(i.language), loadPack("editor"))),
    done: d.profile.projects(i.language).map((p) => p.title), count: 1, exclude: i.exclude,
    // Live check 2026-10-19: without the vocabulary the model invented tags no lesson matches.
    tags: loadPack(i.language)?.tags.map((t) => t.tag) ?? [],
  }), (v) => checkSuggestions(v, 1));
  return s;
}

export function expandHome(p: string, home: string): string {
  return p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p;
}

export function defaultProjectDir(home: string, language: string, title: string): string {
  return join(home, "lazycourse", `${language}-${slugify(title)}`);
}

/**
 * The project folder before any spec (Q23): README front matter (language, test), AGENTS.md, and the
 * profile rows, so the Pi that restarts there finds its project. Refuses a non-empty folder.
 */
export function createProject(profile: Profile, i: { language: string; level: number; project: Suggestion; dir: string; about: Record<string, string>; now: number }): { dir: string } {
  const dir = resolve(i.dir);
  if (!isEmptyOrMissing(dir)) throw new Error(`${dir} is not empty; pick another folder`);
  mkdirSync(dir, { recursive: true });
  const test = LANGS[i.language]?.test;
  const meta = { language: i.language, level: i.level, band: bandFor(i.level), title: i.project.title, summary: i.project.summary };
  writeFileSync(join(dir, "README.md"), `---\n${test ? `test: ${test}\n` : ""}language: ${i.language}\n---\n# ${i.project.title}\n\n${i.project.summary}\n\nThe plan arrives in \`spec/\` shortly; the tutor is writing it.\n`, { flag: "wx" });
  writeFileSync(join(dir, "AGENTS.md"), agents(meta), { flag: "wx" });
  // M4 #25: the tutor finds its project by realpath(cwd); a symlinked parent must not hide it.
  const real = realpathSync(dir);
  if (profile.language(i.language)) profile.setLevel(i.language, i.level);
  else profile.saveLanguage(i.language, i.level, i.about, i.now);
  profile.addProject(i.language, real, i.project.title, i.now);
  return { dir: real };
}
