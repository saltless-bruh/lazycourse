import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSkillHeader } from "../extensions/tutor/learn.js";
import { DIAGRAM_COLS } from "../extensions/tutor/compliance.js";
import { loadPack } from "../extensions/tutor/packs.js";

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const read = (name: string) => readFileSync(join(SKILLS, name, "SKILL.md"), "utf8");
/** Lines inside untagged/text fences: the diagrams. Fences are paired from the top, like compliance.checkReply. */
const diagramLines = (t: string) => [...t.matchAll(/```([^\n`]*)\r?\n([\s\S]*?)```/g)]
  .filter((m) => ["", "text"].includes(m[1].trim())).flatMap((m) => m[2].split("\n"));

describe("bundled skills", () => {
  for (const name of ["tutor-teaching-style", "tutor-design-recipe", "tutor-memory", "tutor-stack-traces"]) {
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

/** M7 pack skills: same header rules; a diagram is optional, but any diagram line stays ≤ 40 columns. */
const PACK_SKILLS = ["tutor-python-cookbook", "tutor-rust-cookbook", "tutor-go-cookbook"];
describe("pack skills load in Pi", () => {
  it.each(PACK_SKILLS)("%s: name matches folder, description says when to use it, narrow diagrams", (name) => {
    const h = parseSkillHeader(read(name));
    expect(h.name).toBe(name);
    expect(h.description).toMatch(/use when/i);
    expect(h.description.length).toBeLessThanOrEqual(1024);
    for (const l of diagramLines(read(name))) expect(Array.from(l).length).toBeLessThanOrEqual(DIAGRAM_COLS);
  });
});

const CATALOG = ["read-args", "parse-number", "loop-index", "lookup-default", "count-items", "group-by", "sort-by", "filter-map", "record-type", "maybe-value", "errors", "read-file", "write-file", "format-string", "split-join", "test-function", "read-trace"];
const FENCE: Record<string, string> = { python: "python", rust: "rust", go: "go", typescript: "ts", lua: "lua" };

function cookbookChecks(lang: string) {
  const sections = read(`tutor-${lang}-cookbook`).split(/^## /m).slice(1);
  expect(sections.map((s) => s.split(":")[0].trim())).toEqual(CATALOG);
  for (const s of sections) {
    const id = s.split(":")[0].trim();
    expect(s, id).toMatch(/^since: \S+/m);
    expect(s, id).toMatch(/^Bridge: /m);
    if (id === "read-trace") { expect(s).toContain("tutor-stack-traces"); continue; }
    expect(s, id).toContain("```" + FENCE[lang] + "\n");
  }
}

describe("cookbooks (spec §5)", () => {
  it.each(["python", "rust", "go"])("%s cookbook has every catalog step with since, an example and a bridge", (lang) => cookbookChecks(lang));
});

describe("cards (spec §5)", () => {
  it.each(["python", "rust", "go"])("%s card names the essentials and has ≥ 12 concept tags", (lang) => {
    const p = loadPack(lang)!;
    for (const k of ["**Format:**", "**Names:**", "**Errors:**", "**Layout:**", "**Test:**", "**Pitfalls:**"]) expect(p.body, k).toContain(k);
    expect(p.tags.length).toBeGreaterThanOrEqual(12);
  });
});

describe("tutor-memory skill", () => {
  it("names the four types, both tools and what never to save", () => {
    const t = read("tutor-memory");
    for (const s of ["learner", "feedback", "project", "reference", "tutor_remember", "tutor_recall"]) expect(t).toContain(s);
    expect(t).toMatch(/never save/i);
  });
});

describe("tutor-stack-traces skill", () => {
  it("teaches the method and covers the five languages", () => {
    const t = read("tutor-stack-traces");
    for (const s of ["## Python", "## Rust", "## Go", "## TypeScript", "## Lua", "last line"]) expect(t).toContain(s);
  });
});
