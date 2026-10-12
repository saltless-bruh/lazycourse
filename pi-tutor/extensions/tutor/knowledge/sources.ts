import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// sources.json pins a language to a DevDocs slug (spec 2026-10-13 §5.2): { "python": "python~3.12" }.
export function sourcesPath(): string {
  return process.env.PI_TUTOR_SOURCES || join(homedir(), ".config", "nvim-tutor", "sources.json");
}

export function overrideFor(language: string): string | undefined {
  try {
    const v = (JSON.parse(readFileSync(sourcesPath(), "utf8")) as Record<string, unknown>)[language];
    return typeof v === "string" && /^[a-z0-9_.~-]+$/i.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
