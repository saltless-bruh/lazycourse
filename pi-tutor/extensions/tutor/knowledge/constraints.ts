import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Project constraints read from files (spec 2026-10-13 §5.1); the card states them next to the
// installed version. Line-level reads: a broken file gives null, never an exception.
function read(root: string, file: string): string | null {
  try { return readFileSync(join(root, file), "utf8"); } catch { return null; }
}
const tomlKey = (text: string, key: string) => new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, "m").exec(text)?.[1] ?? null;

export function readConstraint(language: string, root: string): string | null {
  try {
    switch (language) {
      case "python": {
        const t = read(root, "pyproject.toml");
        const v = t && tomlKey(t, "requires-python");
        return v ? `requires-python ${v} (pyproject.toml)` : null;
      }
      case "rust": {
        const t = read(root, "Cargo.toml");
        if (!t) return null;
        const edition = tomlKey(t, "edition"), msrv = tomlKey(t, "rust-version");
        const parts = [edition && `edition ${edition}`, msrv && `rust-version ${msrv}`].filter(Boolean);
        return parts.length ? `${parts.join(", ")} (Cargo.toml)` : null;
      }
      case "go": {
        const v = /^go\s+(\d+\.\d+(?:\.\d+)?)\s*$/m.exec(read(root, "go.mod") ?? "")?.[1];
        return v ? `go ${v} (go.mod)` : null;
      }
      case "typescript": {
        const t = read(root, "package.json");
        if (!t) return null;
        const j = JSON.parse(t) as { engines?: { node?: string }; devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
        const ts = j.devDependencies?.typescript ?? j.dependencies?.typescript;
        const parts = [j.engines?.node && `node ${j.engines.node}`, ts && `typescript ${ts}`].filter(Boolean);
        return parts.length ? `${parts.join(", ")} (package.json)` : null;
      }
      case "lua": {
        const f = readdirSync(root).find((n) => n.endsWith(".rockspec"));
        if (!f) return null;
        const v = /"(lua\s*[<>=~]+\s*[\d.]+)"/.exec(read(root, f) ?? "")?.[1];
        return v ? `${v} (${f})` : null;
      }
      default: return null;
    }
  } catch { return null; }
}
