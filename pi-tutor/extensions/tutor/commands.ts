import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Where } from "./wayfinding.js";
import { VALUE_LANGUAGES } from "./checks.js";

// Wayfinding spec 2026-11-08 §6: one list (pi-tutor/commands.json) describes every learner-facing command and key.
// Pi's descriptions, the model's command note, the next-step line, the card and Neovim's help tab all read it.
const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "commands.json");

export interface Command {
  name: string;
  where: "editor" | "pane" | "key";
  twin?: string;
  args?: string;
  for: string;
  help: string;
  group: "start" | "moving" | "coding" | "paths" | "record";
  when: (Where | "always")[];
  builtin?: boolean;
  planned?: string;
  context?: string;
  /** In the model's note in every state: running code, starting, the recipe (learner-session fixes). */
  core?: boolean;
}

let cache: Command[] | null = null;

/** The list, with an entry that names a twin taking the twin's `for` and `help` when it has none of its own. */
export function loadCommands(): Command[] {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Command>[];
  const byName = new Map(raw.map((c) => [c.name!, c]));
  // A twin may itself name a twin (<leader>t? → :TutorHelp → /tutor-help): follow the chain.
  const own = (c: Partial<Command> | undefined, k: "for" | "help", hops = 0): string =>
    !c ? "" : c[k] ?? (hops < 3 && c.twin ? own(byName.get(c.twin), k, hops + 1) : "");
  cache = raw.map((c) => ({ ...c, for: own(c, "for"), help: own(c, "help") }) as Command);
  return cache;
}

/** The entry's one-line "what it's for"; an unknown name throws, so a typo fails at load. */
export function describe(name: string): string {
  const c = loadCommands().find((x) => x.name === name);
  if (!c) throw new Error(`no command ${name} in commands.json`);
  return c.for;
}

/** The commands relevant where the learner is (and those relevant always). */
export function commandsFor(w: Where): Command[] {
  return loadCommands().filter((c) => !c.planned && (c.when.includes(w) || c.when.includes("always")));
}

const PLACE = { editor: "type it in the editor", pane: "type it in the tutor pane", key: "a key" } as const;

/** The model's note: the commands to point the learner to now, each with where it is typed (replaces COMMANDS_NOTE). */
export function commandNote(w: Where): string {
  const now = commandsFor(w);
  const core = loadCommands().filter((c) => c.core && !now.includes(c));
  const lines = [...now, ...core].filter((c) => c.where !== "key" || !c.context).map((c) =>
    `- ${c.name}${c.args ? ` ${c.args}` : ""} (${PLACE[c.where]}): ${c.help}`);
  return ["The tutor's own commands, the ones to point the learner to now (never to an outside terminal). "
    + "`:Name` is typed in the editor, `/name` in the tutor pane:", ...lines].join("\n");
}

/** Whether `args` are words a command with this `args` spec takes: its listed words, a task id, a level, a language. */
function takes(spec: string | undefined, args: string[]): boolean {
  if (!spec) return args.length === 0;
  // Placeholder names are not words to type; free text (a topic, a question) is never guessed at, so such a line goes
  // to the tutor instead.
  const words = new Set(spec.split(/[\s|[\]<>]+/).filter((w) => /^[a-z][a-z-]*$/.test(w)));
  const task = words.delete("task") && words.delete("id"), level = spec.includes("<0-100>"), lang = words.delete("language");
  words.delete("topic"); words.delete("question");
  return args.every((a) => words.has(a) || (task && /^P\d+\.T\d+$/i.test(a))
    || (level && /^\d{1,3}$/.test(a) && Number(a) <= 100) || (lang && VALUE_LANGUAGES.has(a.toLowerCase())));
}

/**
 * 2026-11-09: a `:Tutor…` command typed into the tutor pane (the learner thought they were in the editor) is a listed
 * Neovim command, never a chat message. Only names in the list count, and only with words that command takes
 * (review 2026-11-09 #1: `:TutorExam what is this for?` is a question for the tutor, not an exam on that topic).
 */
export function editorCommandOf(text: string): { name: string; args: string[] } | null {
  const m = /^:(Tutor\w*)(?:\s+(.*))?$/.exec(text.trim());
  if (!m) return null;
  const c = loadCommands().find((c) => c.where === "editor" && !c.planned && c.name === `:${m[1]}`);
  if (!c) return null;
  const args = m[2] ? m[2].trim().split(/\s+/) : [];
  return takes(c.args, args) ? { name: m[1], args } : null;
}
