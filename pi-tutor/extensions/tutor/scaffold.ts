import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync, rmdirSync } from "node:fs";
import { dirname, extname, join, normalize, isAbsolute } from "node:path";
import type { Band } from "./policy.js";
import { LANGS } from "./knowledge/versions.js";
import type { InterviewAnswers } from "./interview.js";
import type { Suggestion } from "./suggest.js";

// Scaffold writer (spec §6): one structured call → spec/{design,tasks,requirements}.md, plus local templates.
export interface ScaffoldSpec { design_md: string; tasks_md: string; requirements_md: string; entry_file: string; run_cmd: string }
export interface ScaffoldMeta { language: string; level: number; band: Band; title: string; summary: string }

const ID = /\bP\d+(?:\.T\d+(?:\.S\d+)?)?\b/g;
const DETAIL: Record<Band, string> = {
  beginner: "Detail: beginner. Break every task into subtasks small enough to read like \"define a function that takes X and returns Y\".",
  intermediate: "Detail: intermediate. Tasks with subtasks only where a step is not obvious.",
  pro: "Detail: pro. Phases and tasks with requirements only; no subtasks.",
};
const COMMENT: Record<string, string> = {
  ".rs": "//", ".go": "//", ".ts": "//", ".js": "//", ".c": "//", ".cpp": "//", ".java": "//", ".kt": "//", ".swift": "//", ".zig": "//",
  ".lua": "--", ".hs": "--", ".sql": "--",
};

export function taskIds(tasksMd: string): string[] {
  return [...new Set((tasksMd.match(ID) ?? []).filter((id) => id.includes(".T")))];
}

function field(o: Record<string, unknown>, k: keyof ScaffoldSpec): string {
  const v = o[k];
  if (typeof v !== "string" || v.trim() === "") throw new Error(`${k} must be a non-empty string`);
  return v;
}

export function checkScaffold(v: unknown): ScaffoldSpec {
  if (typeof v !== "object" || v === null) throw new Error("reply must be a JSON object");
  const o = v as Record<string, unknown>;
  const s: ScaffoldSpec = {
    design_md: field(o, "design_md"), tasks_md: field(o, "tasks_md"), requirements_md: field(o, "requirements_md"),
    entry_file: field(o, "entry_file"), run_cmd: field(o, "run_cmd"),
  };
  const ids = taskIds(s.tasks_md);
  if (ids.length === 0) throw new Error("tasks_md has no task ids like P1.T1");
  if (!s.tasks_md.includes("[ ]")) throw new Error("tasks_md tasks need [ ] checkboxes");
  const missing = ids.filter((id) => !new RegExp(`\\b${id.replace(/\./g, "\\.")}\\b`).test(s.requirements_md));
  if (missing.length) throw new Error(`requirements_md is missing sections for ${missing.join(", ")}`);
  const entry = normalize(s.entry_file);
  if (isAbsolute(s.entry_file) || !entry.startsWith("src/") || entry === "src/" || entry.split("/").includes("..")) {
    throw new Error("entry_file must be a relative file path under src/");
  }
  return s;
}

export function scaffoldPrompt(i: { language: string; level: number; band: Band; project: Suggestion; interview: InterviewAnswers | null }): string {
  return [
    `language: ${i.language}`,
    `learner: level ${i.level} (${i.band})`,
    `project: ${i.project.title} — ${i.project.summary}`,
    `size: ${i.project.size}`,
    `concepts to exercise: ${i.project.concepts.join(", ") || "any"}`,
    ...(i.interview?.goal ? [`learner goal: ${i.interview.goal}`] : []),
    DETAIL[i.band],
  ].join("\n");
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "project";
}

export function commentPrefix(entryFile: string): string {
  return COMMENT[extname(entryFile)] ?? "#";
}

export function isEmptyOrMissing(dir: string): boolean {
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

function readme(s: ScaffoldSpec, m: ScaffoldMeta): string {
  const test = LANGS[m.language]?.test;
  return `---\nrun: ${s.run_cmd}\n${test ? `test: ${test}\n` : ""}language: ${m.language}\n---\n# ${m.title}\n\n${m.summary}\n\n` +
    `## Run\n\n\`${s.run_cmd}\`\n\n## Working with the tutor\n\n` +
    `- Run it with \`:TutorRun\`${test ? ", test it with `:TutorRun test`" : ""}.\n` +
    `- The plan is in \`spec/\`: start with \`spec/tasks.md\`, tick tasks as you finish them.\n` +
    `- Open the tutor with \`:Tutor\`; ask it anything, it answers with hints, not code.\n` +
    `- Change how much help you get with \`:TutorLevel <0-100>\`.\n`;
}

function agents(m: ScaffoldMeta): string {
  return `# Tutor instructions for this project\n\n` +
    `- This is a ${m.language} learning project: ${m.title}. ${m.summary}\n` +
    `- The learner's level is ${m.level} (${m.band}). Coach; never write the solution.\n` +
    `- Never write or edit files in src/. You have read-only tools; the learner writes all the code.\n` +
    `- The plan is spec/design.md, spec/tasks.md and spec/requirements.md. Refer to tasks by id (P1.T2.S3) and cite \`path:line\`.\n`;
}

export function writeScaffold(dir: string, s: ScaffoldSpec, meta: ScaffoldMeta): string[] {
  if (!isEmptyOrMissing(dir)) throw new Error(`${dir} is not empty`);
  const entry = normalize(s.entry_file);
  const first = taskIds(s.tasks_md)[0];
  const files: [string, string][] = [
    ["README.md", readme(s, meta)],
    // No .pi/skills/ yet: Pi asks "trust this folder?" for it; M5 creates it when it writes a skill.
    ["AGENTS.md", agents(meta)],
    ["spec/design.md", s.design_md],
    ["spec/tasks.md", s.tasks_md],
    ["spec/requirements.md", s.requirements_md],
    [entry, `${commentPrefix(entry)} Start here: spec/tasks.md, task ${first}. You write the code; the tutor coaches.\n`],
  ];
  const made: string[] = [];
  const madeDirs: string[] = [];
  try {
    for (const [rel, text] of files) {
      const abs = join(dir, rel);
      for (let d = dirname(abs); d !== dir && !existsSync(d); d = dirname(d)) madeDirs.unshift(d);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text, { flag: "wx" });
      made.push(abs);
    }
  } catch (e) {
    // M4 #26: never touch files this call did not create; remove ours, then our now-empty folders.
    for (const f of made.reverse()) rmSync(f, { force: true });
    for (const d of [...new Set(madeDirs)].reverse()) { try { rmdirSync(d); } catch { /* not empty: keep */ } }
    throw e;
  }
  return files.map(([rel]) => rel);
}
