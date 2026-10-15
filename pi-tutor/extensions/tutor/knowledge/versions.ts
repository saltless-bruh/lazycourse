import { readConstraint } from "./constraints.js";

// Installed toolchain version per language (spec 2026-10-13 §5.1). Run by the extension, never by the model.
export type Exec = (command: string, args: string[], options?: { timeout?: number }) => Promise<{ stdout: string; stderr: string; code: number }>;

/** `runtime`: what runs the language when its own compiler is missing (TypeScript without tsc → node). */
export interface LangSpec { devdocsType: string; command: string; args: string[]; runtime?: { command: string; args: string[]; name: string } }

export const LANGS: Readonly<Record<string, LangSpec>> = {
  python: { devdocsType: "python", command: "python3", args: ["--version"] },
  rust: { devdocsType: "rust", command: "rustc", args: ["--version"] },
  go: { devdocsType: "go", command: "go", args: ["version"] },
  typescript: { devdocsType: "typescript", command: "tsc", args: ["--version"], runtime: { command: "node", args: ["--version"], name: "node" } },
  lua: { devdocsType: "lua", command: "lua", args: ["-v"] },
};

export function parseVersion(text: string): string | null {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return m ? m[0] : null;
}

export async function detectVersion(language: string, exec: Exec): Promise<string | null> {
  const spec = LANGS[language];
  if (!spec) return null;
  try {
    const r = await exec(spec.command, spec.args, { timeout: 5000 });
    if (r.code !== 0) return null;
    return parseVersion(`${r.stdout}\n${r.stderr}`);
  } catch {
    return null;
  }
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
    return Promise.race([rawExec(c, a, o), limit]).finally(() => clearTimeout(t));
  };
  const installed = await detectVersion(language, exec);
  let runtime: string | null = null;
  if (!installed && spec.runtime) {
    try {
      const r = await exec(spec.runtime.command, spec.runtime.args, { timeout: 5000 });
      const v = r.code === 0 ? parseVersion(`${r.stdout}\n${r.stderr}`) : null;
      runtime = v ? `${spec.runtime.name} ${v}` : null;
    } catch { runtime = null; }
  }
  return { installed, runtime, constraint: readConstraint(language, root) };
}
