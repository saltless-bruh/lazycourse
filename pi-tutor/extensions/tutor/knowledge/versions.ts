// Installed toolchain version per language (spec 2026-10-13 §5.1). Run by the extension, never by the model.
export type Exec = (command: string, args: string[], options?: { timeout?: number }) => Promise<{ stdout: string; stderr: string; code: number }>;

export interface LangSpec { devdocsType: string; command: string; args: string[] }

export const LANGS: Readonly<Record<string, LangSpec>> = {
  python: { devdocsType: "python", command: "python3", args: ["--version"] },
  rust: { devdocsType: "rust", command: "rustc", args: ["--version"] },
  go: { devdocsType: "go", command: "go", args: ["version"] },
  typescript: { devdocsType: "typescript", command: "tsc", args: ["--version"] },
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
