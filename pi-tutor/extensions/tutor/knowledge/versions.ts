import { existsSync } from "node:fs";
import { join } from "node:path";
import { readConstraint } from "./constraints.js";

// Installed toolchain version per language (spec 2026-10-13 §5.1). Run by the extension, never by the model.
export type Exec = (command: string, args: string[], options?: { timeout?: number; cwd?: string }) => Promise<{ stdout: string; stderr: string; code: number }>;

/**
 * `runtime`: what runs the language when its own compiler is missing (TypeScript without tsc → node).
 * `local`: a project-relative compiler that wins over the PATH one (TypeScript's node_modules/.bin/tsc).
 */
export interface LangSpec { devdocsType: string; command: string; args: string[]; runtime?: { command: string; args: string[]; name: string }; local?: string }

export const LANGS: Readonly<Record<string, LangSpec>> = {
  python: { devdocsType: "python", command: "python3", args: ["--version"] },
  rust: { devdocsType: "rust", command: "rustc", args: ["--version"] },
  go: { devdocsType: "go", command: "go", args: ["version"] },
  typescript: { devdocsType: "typescript", command: "tsc", args: ["--version"], runtime: { command: "node", args: ["--version"], name: "node" }, local: "node_modules/.bin/tsc" },
  lua: { devdocsType: "lua", command: "lua", args: ["-v"] },
  // JavaScript has no version of its own: Node is what runs it, and DevDocs versions the Node docs.
  javascript: { devdocsType: "node", command: "node", args: ["--version"] },
};

/** Neovim filetypes that are a pack language under another name (M7 minor). */
const FILETYPE_LANG: Readonly<Record<string, string>> = { typescriptreact: "typescript", javascriptreact: "javascript" };

/** The pack language a buffer's filetype stands for, or null (markdown, help, a language with no pack). */
export function languageOfFiletype(filetype: string | undefined): string | null {
  if (!filetype) return null;
  const lang = FILETYPE_LANG[filetype] ?? filetype;
  return LANGS[lang] ? lang : null;
}

export function parseVersion(text: string): string | null {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return m ? m[0] : null;
}

async function versionOf(command: string, args: string[], exec: Exec): Promise<string | null> {
  try {
    const r = await exec(command, args, { timeout: 5000 });
    if (r.code !== 0) return null;
    return parseVersion(`${r.stdout}\n${r.stderr}`);
  } catch {
    return null;
  }
}

export async function detectVersion(language: string, exec: Exec): Promise<string | null> {
  const spec = LANGS[language];
  return spec ? versionOf(spec.command, spec.args, exec) : null;
}

export interface Toolchain { installed: string | null; runtime: string | null; constraint: string | null }

/** What the card states (spec §5.1): the compiler/interpreter version, a runtime fallback, the project's constraint. */
export async function toolchain(language: string, root: string, rawExec: Exec): Promise<Toolchain> {
  const spec = LANGS[language];
  if (!spec) return { installed: null, runtime: null, constraint: null };
  // pi.exec enforces `timeout`, but a turn must never wait on an exec that ignores it (Review Focus #2).
  const exec: Exec = (c, a, o) => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("version command timed out")), 6000); });
    return Promise.race([rawExec(c, a, { ...o, cwd: root }), limit]).finally(() => clearTimeout(t));
  };
  const local = spec.local ? join(root, spec.local) : null;
  const command = local && existsSync(local) ? local : spec.command;
  // M7 minor: compiler and runtime asked at once, so a missing tsc costs one 6 s cap, not two.
  const [installed, rt] = await Promise.all([
    versionOf(command, spec.args, exec),
    spec.runtime ? versionOf(spec.runtime.command, spec.runtime.args, exec) : Promise.resolve(null),
  ]);
  const runtime = !installed && rt && spec.runtime ? `${spec.runtime.name} ${rt}` : null;
  return { installed, runtime, constraint: readConstraint(language, root) };
}

const FOUND_TTL = 5 * 60_000;
const MISSING_TTL = 60_000;

/**
 * M7 minor (the cache never refreshed): the version commands run at most once per language+root
 * per 5 minutes (1 minute while nothing was found: a slow first run or a fresh install); the
 * project's constraint file is cheap and re-read on every call, so an edit shows on the next turn.
 */
export function toolchainCache(exec: Exec, now: () => number = Date.now): (language: string, root: string) => Promise<Toolchain> {
  const cache = new Map<string, { at: number; value: Promise<Toolchain> }>();
  return async (language, root) => {
    const k = `${language}\0${root}`;
    const hit = cache.get(k);
    const fresh = hit && now() - hit.at <= ((await hit.value).installed || (await hit.value).runtime ? FOUND_TTL : MISSING_TTL);
    const entry = fresh ? hit : { at: now(), value: toolchain(language, root, exec) };
    cache.set(k, entry);
    return { ...(await entry.value), constraint: readConstraint(language, root) };
  };
}
