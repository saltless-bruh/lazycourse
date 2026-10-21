import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceHash } from "../extensions/tutor/source-hash.js";

describe("sourceHash (spec 2026-10-21 §11a: an unchanged rerun is not a new attempt)", () => {
  it("changes when a source file changes, not when spec/ does", () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "hash-")));
    mkdirSync(join(d, "src")); mkdirSync(join(d, "spec"));
    writeFileSync(join(d, "src", "main.py"), "a = 1\n"); writeFileSync(join(d, "spec", "tasks.md"), "- [ ] P1.T1\n");
    const h1 = sourceHash(d);
    writeFileSync(join(d, "spec", "tasks.md"), "- [x] P1.T1\n");
    expect(sourceHash(d)).toBe(h1);
    writeFileSync(join(d, "src", "main.py"), "a = 2\n");
    expect(sourceHash(d)).not.toBe(h1);
  });
  it("ignores build and tool folders, and a missing root hashes to a stable value", () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "hash-")));
    writeFileSync(join(d, "main.rs"), "fn main() {}\n");
    const h1 = sourceHash(d);
    for (const dir of ["target", "node_modules", ".git", "__pycache__"]) { mkdirSync(join(d, dir)); writeFileSync(join(d, dir, "x"), "noise"); }
    expect(sourceHash(d)).toBe(h1);
    expect(sourceHash(join(d, "nope"))).toBe(sourceHash(join(d, "nope")));
  });
});
