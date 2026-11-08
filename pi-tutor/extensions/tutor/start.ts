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
import { luarcJson } from "./luarc.js";

// /tutor-start building blocks (spec 2026-10-19 §5): the conversation lives in index.ts and onboard.ts;
// these make the one project suggestion and the project folder. The spec is written later (Task 7).
export const LANGUAGES = ["python", "rust", "go", "typescript", "lua", "javascript"] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(s: string): s is Language {
  return (LANGUAGES as readonly string[]).includes(s);
}

/** One project for this learner (Q4), never one already shown. With an idea, the project is that idea (§9.2). */
export async function suggestOne(d: { profile: Profile; complete: Complete }, i: { language: string; level: number; about: Record<string, string>; exclude: string[]; idea?: string | null }): Promise<Suggestion & { tooBig?: true; slug?: string }> {
  const prompt = suggestPrompt({
    language: i.language, level: i.level, band: bandFor(i.level), about: i.about,
    // M7 minor: old free-form rows read under the pack vocabulary's tag.
    weakConcepts: weakConcepts(d.profile.concepts(i.language), vocabOf(loadPack(i.language), loadPack("editor"))),
    done: d.profile.projects(i.language).map((p) => p.title), count: 1, exclude: i.exclude,
    // Live check 2026-10-19: without the vocabulary the model invented tags no lesson matches.
    tags: loadPack(i.language)?.tags.map((t) => t.tag) ?? [],
  });
  const idea = i.idea?.trim();
  if (!idea) {
    const [s] = await completeJson(d.complete, systemText("suggest"), prompt, (v) => checkSuggestions(v, 1));
    return s;
  }
  // Wayfinding spec §9.2: the model judges whether the idea fits the level; code keeps the title and every offer tied.
  const withIdea = `${prompt}\nthe learner's idea (keep it): ${idea}\nalso answer "fits": true or false — whether this idea, as it is, suits the learner's level; when false, add "smaller": {"title","summary","concepts"}, a smaller version of the same idea`;
  try {
    return await completeJson(d.complete, systemText("suggest"), withIdea, (v) => {
      const [s] = checkSuggestions(v, 1);
      const o = v as { fits?: unknown; smaller?: { title?: unknown; summary?: unknown; concepts?: unknown } };
      if (typeof o.fits !== "boolean") throw new Error('"fits" must be true or false');
      if (o.fits) {
        const title = ideaTitle(idea);
        // Final review I4: a title in a script with no Latin letters names its folder after the model's title.
        return slugify(title) === "project" ? { ...s, title, slug: s.title } : { ...s, title };
      }
      const sm = o.smaller;
      if (!sm || typeof sm.title !== "string" || !sm.title.trim() || typeof sm.summary !== "string") throw new Error('when "fits" is false, "smaller" needs a title and a summary');
      if (!tiedToIdea(`${sm.title} ${sm.summary}`, idea)) throw new Error(`the smaller version must keep the learner's idea "${idea}"`);
      const concepts = Array.isArray(sm.concepts) ? sm.concepts.filter((c): c is string => typeof c === "string") : s.concepts;
      return { title: sm.title.trim(), summary: sm.summary.trim(), size: "small" as const, concepts, tooBig: true as const };
    });
  } catch (e) {
    if (e instanceof Error && /must keep the learner's idea/.test(e.message)) throw new Error(`could not make a smaller version of your idea "${idea}"; /tutor-start tries again, or ask for something else`);
    throw e;
  }
}

// Final review I4: "I'd like to", "i wanna" (no "to") as well as "I want to".
const LEAD_INS = [/^i(?:\s+want|\s+would like|'d like|\s+wanna)(?:\s+to)?\s+(?:make|build|write|create|code|do)\s+/i, /^(?:make|build|write|create|code)\s+/i, /^(?:a|an|the)\s+/i];

/** The learner's own words as a project title (§9.2): lead-ins dropped, at most 40 characters cut at a word, Title Case. */
export function ideaTitle(idea: string): string {
  const flat = idea.trim().replace(/[’‘]/g, "'").replace(/[.!?,;:]+$/u, "").replace(/\s+/g, " ");
  // The clause that says what to make names the thing; an aside before it ("Hmm,") and detail after a comma, colon or
  // bracket are not the title (final review I4, second review M1). "/" joins words ("client/server"), so it stays.
  const clauses = flat.split(/\s*[,;:(]\s*/u).map((c) => c.trim()).filter(Boolean);
  let t = clauses.find((c) => LEAD_INS[0].test(c) || LEAD_INS[1].test(c)) ?? clauses[0] ?? flat;
  for (const re of LEAD_INS) t = t.replace(re, "");
  const words: string[] = [];
  for (const w of t.split(" ")) {
    if ([...words, w].join(" ").length > 40) break;
    words.push(w);
  }
  const out = (words.length ? words : [t.slice(0, 40)]).map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1)).join(" ");
  return out || idea.trim().slice(0, 40);
}

const STOP = new Set(["want", "would", "like", "make", "build", "write", "create", "that", "this", "with", "simple", "small", "some", "thing", "program", "project", "really", "just", "from", "into", "about", "something"]);

/** Whether `text` keeps the idea: it shares a content word (4+ letters, not a filler) with it, any case (§9.2). */
export function tiedToIdea(text: string, idea: string): boolean {
  // Final review I3: scripts written without spaces (Japanese, Chinese, Thai) have no words to split; their ideas
  // are compared by pairs of letters instead.
  const unspaced = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
  if (unspaced.test(idea)) {
    const pairs = (s: string) => { const l = [...s.replace(/[^\p{L}]/gu, "")]; return new Set(l.slice(1).map((c, i) => l[i] + c)); };
    const want = pairs(idea);
    return [...pairs(text)].some((p) => want.has(p));
  }
  const words = (s: string) => s.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w));
  const want = new Set(words(idea));
  if (want.size === 0) return true;
  return words(text).some((w) => want.has(w));
}

export function expandHome(p: string, home: string): string {
  return p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p;
}

/** `fallback`: the folder name to use when the title has no Latin letters (an idea in another script). */
export function defaultProjectDir(home: string, language: string, title: string, fallback?: string): string {
  const slug = slugify(title);
  return join(home, "lazycourse", `${language}-${slug === "project" && fallback ? slugify(fallback) : slug}`);
}

/**
 * The project folder before any spec (Q23): README front matter (language, test), AGENTS.md, and the
 * profile rows, so the Pi that restarts there finds its project. Refuses a non-empty folder.
 */
export function createProject(profile: Profile, i: { language: string; level: number; project: Suggestion; dir: string; about: Record<string, string>; now: number; luaRuntime?: string | null }): { dir: string } {
  const dir = resolve(i.dir);
  if (!isEmptyOrMissing(dir)) throw new Error(`${dir} is not empty; pick another folder`);
  mkdirSync(dir, { recursive: true });
  const test = LANGS[i.language]?.test;
  const meta = { language: i.language, level: i.level, band: bandFor(i.level), title: i.project.title, summary: i.project.summary };
  writeFileSync(join(dir, "README.md"), `---\n${test ? `test: ${test}\n` : ""}language: ${i.language}\n---\n# ${i.project.title}\n\n${i.project.summary}\n\nThe plan arrives in \`spec/\` shortly; the tutor is writing it.\n`, { flag: "wx" });
  writeFileSync(join(dir, "AGENTS.md"), agents(meta), { flag: "wx" });
  if (i.language === "lua" && i.luaRuntime) writeFileSync(join(dir, ".luarc.json"), luarcJson(i.luaRuntime), { flag: "wx" });
  // M4 #25: the tutor finds its project by realpath(cwd); a symlinked parent must not hide it.
  const real = realpathSync(dir);
  if (profile.language(i.language)) profile.setLevel(i.language, i.level);
  else profile.saveLanguage(i.language, i.level, i.about, i.now);
  profile.addProject(i.language, real, i.project.title, i.now);
  return { dir: real };
}
