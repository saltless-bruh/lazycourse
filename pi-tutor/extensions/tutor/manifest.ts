// Rust and Go projects build as scaffolded (spec 2026-10-22 §5.1): the manifest and an empty main.

/** The project's build manifest, or null for languages that need none. `name` is the project's slug. */
export function manifestFor(language: string, name: string, goVersion?: string | null): { rel: string; text: string } | null {
  if (language === "rust") return { rel: "Cargo.toml", text: `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n\n[workspace]\n` };
  if (language === "go") return { rel: "go.mod", text: `module ${name}\n\ngo ${goVersion ?? "1.22"}\n` };
  return null;
}

/** major.minor from `go version` output ("go version go1.27.3 linux/amd64" → "1.27"). */
export function goVersionOf(versionOutput: string): string | null {
  return /\bgo(\d+\.\d+)/.exec(versionOutput)?.[1] ?? null;
}

/** The empty main a new entry file starts with: boilerplate, not task code (author, 2026-10-22). */
export function starterFor(language: string): string {
  if (language === "rust") return "fn main() {}\n";
  if (language === "go") return "package main\n\nfunc main() {}\n";
  return "";
}
