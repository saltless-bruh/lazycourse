import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConstraint } from "../extensions/tutor/knowledge/constraints.js";

const dir = (files: Record<string, string>) => {
  const d = mkdtempSync(join(tmpdir(), "cons-"));
  for (const [f, t] of Object.entries(files)) writeFileSync(join(d, f), t);
  return d;
};

describe("readConstraint (spec §5.1)", () => {
  it.each([
    ["python", { "pyproject.toml": '[project]\nname = "x"\nrequires-python = ">=3.12"\n' }, "requires-python >=3.12 (pyproject.toml)"],
    ["rust", { "Cargo.toml": '[package]\nname = "x"\nedition = "2024"\nrust-version = "1.85"\n' }, "edition 2024, rust-version 1.85 (Cargo.toml)"],
    ["rust", { "Cargo.toml": '[package]\nedition = "2021"\n' }, "edition 2021 (Cargo.toml)"],
    ["go", { "go.mod": "module x\n\ngo 1.24\n\ntoolchain go1.27.2\n" }, "go 1.24 (go.mod)"],
    ["typescript", { "package.json": JSON.stringify({ engines: { node: ">=22" }, devDependencies: { typescript: "^5.9.0" } }) }, "node >=22, typescript ^5.9.0 (package.json)"],
    ["lua", { "x-1.0-1.rockspec": 'dependencies = {\n  "lua >= 5.1",\n}\n' }, "lua >= 5.1 (x-1.0-1.rockspec)"],
  ])("%s", (lang, files, want) => {
    expect(readConstraint(lang, dir(files))).toBe(want);
  });
  it("no file, an unknown language, or a broken file gives null and never throws", () => {
    expect(readConstraint("python", dir({}))).toBeNull();
    expect(readConstraint("cobol", dir({}))).toBeNull();
    expect(readConstraint("typescript", dir({ "package.json": "{ not json" }))).toBeNull();
    expect(readConstraint("go", dir({ "go.mod": "" }))).toBeNull();
    expect(readConstraint("python", dir({ "pyproject.toml": "[[[" }))).toBeNull();
    expect(readConstraint("python", "/nonexistent/dir")).toBeNull();
  });
});
