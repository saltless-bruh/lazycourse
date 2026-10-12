import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Band } from "./policy.js";

// prompts/system/<band>.md + judgment.md (spec §4, §9). Read lazily and cached; files are tiny.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts", "system");
const cache = new Map<string, string>();

function read(name: string): string {
  let text = cache.get(name);
  if (text === undefined) {
    text = readFileSync(join(DIR, `${name}.md`), "utf8").trimEnd();
    cache.set(name, text);
  }
  return text;
}

export function bandPrompt(band: Band): string {
  return `${read(band)}\n\n${read("ladder")}\n\n${read("judgment")}\n`;
}
