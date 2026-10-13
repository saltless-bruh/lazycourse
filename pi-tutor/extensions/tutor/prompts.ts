import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Band } from "./policy.js";

// prompts/system/*.md (spec §4, §9; spec 2026-10-13 §2, §7 #2). Read lazily and cached; files are tiny.
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

/** Rough token count for the prompt budget: about four characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The tutor system section: role, teaching style, band, ladder (when the role uses it), turn protocol. */
export function tutorPrompt(band: Band, opts: { role?: string; ladder?: boolean } = {}): string {
  const parts = [opts.role?.trim(), read("style"), read(band), opts.ladder === false ? undefined : read("ladder"), read("judgment")];
  return `${parts.filter((p): p is string => !!p).join("\n\n")}\n`;
}

/** Any other prompt in prompts/system (suggest, scaffold, learn, style). */
export function systemText(name: string): string {
  return read(name);
}
