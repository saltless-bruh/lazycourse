import { resolve, join } from "node:path";
import { bandFor } from "./policy.js";
import type { Profile } from "./profile.js";
import { runInterview, initialLevel, type Ask, type InterviewAnswers } from "./interview.js";
import { completeJson, type Complete } from "./llm.js";
import { Cancelled } from "./progress.js";
import { systemText } from "./prompts.js";
import { suggestPrompt, checkSuggestions, suggestionLabel } from "./suggest.js";
import { scaffoldPrompt, checkScaffold, writeScaffold, slugify, isEmptyOrMissing } from "./scaffold.js";

// /tutor-start (spec §6): language → interview if new → 3 suggestions → folder → scaffold. Every dependency injected.
export const LANGUAGES = ["python", "rust", "go", "typescript", "lua"] as const;
const OTHER = "other…";
const NAME = /^[a-z][a-z0-9+#.-]{0,30}$/;

export interface StartUi extends Ask {
  notify(msg: string, level: "info" | "warning" | "error"): void;
  working(msg?: string): void;
}
export interface StartDeps { ui: StartUi; profile: Profile; complete: Complete; now: () => number; home: string }
export interface StartResult { dir: string; language: string; level: number; title: string; files: string[] }

async function pickLanguage(arg: string, d: StartDeps): Promise<string | null> {
  let name = arg.trim();
  if (!name) {
    const extra = d.profile.languages().filter((l) => !(LANGUAGES as readonly string[]).includes(l));
    const choice = await d.ui.select("Which language?", [...LANGUAGES, ...extra, OTHER]);
    if (choice === undefined) return null;
    name = choice === OTHER ? ((await d.ui.input("Language name", "e.g. zig")) ?? "") : choice;
    if (!name.trim()) return null;
  }
  name = name.trim().toLowerCase();
  if (!NAME.test(name)) { d.ui.notify(`"${name}" is not a language name I can use`, "warning"); return null; }
  return name;
}

function expandHome(p: string, home: string): string {
  return p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p;
}

export async function runStart(arg: string, d: StartDeps): Promise<StartResult | null> {
  const language = await pickLanguage(arg, d);
  if (!language) return null;

  let interview: InterviewAnswers | null = null;
  let level: number;
  const row = d.profile.language(language);
  if (row) {
    level = row.level;
  } else {
    interview = await runInterview(language, d.ui);
    if (!interview) return null;
    level = initialLevel(interview);
  }
  const band = bandFor(level);

  try {
    d.ui.working("tutor: suggesting projects…");
    const suggestions = await completeJson(d.complete, systemText("suggest"), suggestPrompt({
      language, level, band, interview,
      weakConcepts: d.profile.concepts(language).filter((c) => c.ease < 0.5).slice(0, 8).map((c) => c.tag),
      done: d.profile.projects(language).map((p) => p.title),
    }), checkSuggestions);
    d.ui.working();

    const labels = suggestions.map(suggestionLabel);
    const picked = await d.ui.select("Pick a project", labels);
    if (picked === undefined) return null;
    const project = suggestions[labels.indexOf(picked)];

    const fallback = `~/lazycourse/${language}-${slugify(project.title)}`;
    const answer = await d.ui.input("Project folder", fallback);
    if (answer === undefined) return null;
    const dir = resolve(expandHome(answer.trim() || fallback, d.home));
    if (!isEmptyOrMissing(dir)) { d.ui.notify(`${dir} is not empty; pick another folder`, "warning"); return null; }

    d.ui.working("tutor: writing the spec…");
    const spec = await completeJson(d.complete, systemText("scaffold"), scaffoldPrompt({ language, level, band, project, interview }), checkScaffold);
    const files = writeScaffold(dir, spec, { language, level, band, title: project.title, summary: project.summary });
    if (interview) d.profile.saveLanguage(language, level, interview as unknown as Record<string, string>, d.now());
    d.profile.addProject(language, dir, project.title, d.now());
    return { dir, language, level, title: project.title, files };
  } catch (e) {
    if (e instanceof Cancelled) d.ui.notify("tutor-start cancelled", "info");
    else d.ui.notify(`tutor-start failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    return null;
  } finally {
    d.ui.working();
  }
}
