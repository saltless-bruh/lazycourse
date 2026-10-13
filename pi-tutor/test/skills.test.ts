import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSkillHeader } from "../extensions/tutor/learn.js";
import { DIAGRAM_COLS } from "../extensions/tutor/compliance.js";

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const read = (name: string) => readFileSync(join(SKILLS, name, "SKILL.md"), "utf8");
/** Lines inside untagged/text fences: the diagrams. Fences are paired from the top, like compliance.checkReply. */
const diagramLines = (t: string) => [...t.matchAll(/```([^\n`]*)\r?\n([\s\S]*?)```/g)]
  .filter((m) => ["", "text"].includes(m[1].trim())).flatMap((m) => m[2].split("\n"));

describe("bundled skills", () => {
  for (const name of ["tutor-teaching-style", "tutor-design-recipe"]) {
    it(`${name} loads in Pi (name matches folder, description ≤ 1024)`, () => {
      const h = parseSkillHeader(read(name));
      expect(h.name).toBe(name);
      expect(h.description).toMatch(/use when/i);
    });
    it(`${name} practises what it teaches: every diagram line ≤ ${DIAGRAM_COLS} columns`, () => {
      const lines = diagramLines(read(name));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) expect(Array.from(l).length).toBeLessThanOrEqual(DIAGRAM_COLS);
    });
  }
  it("tutor-teaching-style covers the five parts and a worked example per band", () => {
    const t = read("tutor-teaching-style");
    for (const s of ["What's happening", "Why", "Example", "What to try", "In short", "## Beginner", "## Intermediate", "## Pro"]) expect(t).toContain(s);
  });
  it("tutor-design-recipe covers the six steps and the band table", () => {
    const t = read("tutor-design-recipe");
    for (const s of ["1. Find", "2. Shape", "3. Examples", "4. Steps", "5. Map", "6. Build", "beginner", "intermediate", "pro", "step_done"]) expect(t).toContain(s);
  });
});
