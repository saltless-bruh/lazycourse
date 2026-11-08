import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Where } from "./wayfinding.js";

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
  const lines = commandsFor(w).filter((c) => c.where !== "key" || !c.context).map((c) =>
    `- ${c.name}${c.args ? ` ${c.args}` : ""} (${PLACE[c.where]}): ${c.help}`);
  return ["The tutor's own commands, the ones to point the learner to now (never to an outside terminal). "
    + "`:Name` is typed in the editor, `/name` in the tutor pane:", ...lines].join("\n");
}
