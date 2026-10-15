import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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
  for (const name of ["tutor-teaching-style", "tutor-design-recipe", "tutor-memory", "tutor-stack-traces", "tutor-exam-rubric"]) {
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
const PACK_SKILLS = ["tutor-python-cookbook", "tutor-rust-cookbook", "tutor-go-cookbook", "tutor-typescript-cookbook", "tutor-lua-cookbook", "tutor-javascript-cookbook", "tutor-editor-cookbook",
  "tutor-python-expert", "tutor-rust-expert", "tutor-go-expert", "tutor-typescript-expert", "tutor-lua-expert", "tutor-javascript-expert"];
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
const FENCE: Record<string, string> = { python: "python", rust: "rust", go: "go", typescript: "ts", lua: "lua", javascript: "js" };

function cookbookChecks(lang: string) {
  const sections = read(`tutor-${lang}-cookbook`).split(/^## /m).slice(1);
  expect(sections.map((s) => s.split(":")[0].trim())).toEqual(CATALOG);
  for (const s of sections) {
    const id = s.split(":")[0].trim();
    expect(s, id).toMatch(/^since: \S+/m);
    expect(s, id).toMatch(/^Bridge: /m);
    // Option A (skill-eval iterations 1-2): a one-line idiom the card's index carries.
    expect(s, id).toMatch(/^index: `[^`\n]+`( [^\n]{0,30})?$/m);
    if (id === "read-trace") { expect(s).toContain("tutor-stack-traces"); continue; }
    expect(s, id).toContain("```" + FENCE[lang] + "\n");
  }
}

describe("cookbooks (spec §5)", () => {
  it.each(["python", "rust", "go", "typescript", "lua", "javascript"])("%s cookbook has every catalog step with since, an example and a bridge", (lang) => cookbookChecks(lang));
});

describe("cards (spec §5)", () => {
  it.each(["python", "rust", "go", "typescript", "lua", "javascript"])("%s card names the essentials and has ≥ 12 concept tags", (lang) => {
    const p = loadPack(lang)!;
    for (const k of ["**Format:**", "**Names:**", "**Errors:**", "**Layout:**", "**Test:**", "**Pitfalls:**"]) expect(p.body, k).toContain(k);
    expect(p.tags.length).toBeGreaterThanOrEqual(12);
  });
});

describe("expert skills (spec §5.3)", () => {
  const ADAPTED: Record<string, string> = { python: "python-pro", rust: "rust-engineer", go: "golang-pro", typescript: "typescript-pro", javascript: "javascript-pro" };
  it.each(Object.entries(ADAPTED))("tutor-%s-expert credits %s, carries its LICENSE and records upstream", (lang, up) => {
    const dir = join(SKILLS, `tutor-${lang}-expert`);
    const text = readFileSync(join(dir, "SKILL.md"), "utf8");
    // Agent Skills front matter allows extra data only under `metadata` (skill-creator quick_validate).
    expect(text).toMatch(new RegExp(`^metadata:\\n  upstream: "fullstack-dev-skills/${up}@\\d+\\.\\d+\\.\\d+ \\(skill [\\d.]+, commit [0-9a-f]{7}\\)"$`, "m"));
    expect(text).toMatch(/^license: MIT$/m);
    expect(text).toContain(`Adapted from ${up}`);
    expect(readFileSync(join(dir, "LICENSE"), "utf8")).toMatch(/^MIT License/);
    expect(readdirSync(join(dir, "references")).length).toBeGreaterThan(0);
    expect(text).toMatch(/never write their line/);
  });
  it("tutor-lua-expert exists and is ours", () => {
    const text = read("tutor-lua-expert");
    expect(text).not.toMatch(/upstream:/);
    expect(text).toMatch(/never write their line/);
    expect(readdirSync(join(SKILLS, "tutor-lua-expert", "references")).length).toBeGreaterThanOrEqual(4);
  });
});

describe("editor pack", () => {
  const EDITOR = ["open-file", "search-project", "jump-definition", "see-errors", "fix-suggestion", "rename-symbol", "split-windows", "undo-redo", "run-project", "talk-to-tutor"];
  it("the editor cookbook covers its catalog with keys and an Ex equivalent", () => {
    const sections = read("tutor-editor-cookbook").split(/^## /m).slice(1);
    expect(sections.map((s) => s.split(":")[0].trim())).toEqual(EDITOR);
    for (const s of sections) { expect(s).toMatch(/^since: \S+/m); expect(s).toMatch(/^1\. /m); expect(s).toMatch(/^Also: /m); }
  });
  it("the editor card names the leader and the tutor keys and has ≥ 12 tags", () => {
    const p = loadPack("editor")!;
    for (const k of ["Space", "<leader>tt", "<leader>tr", "gd", "]d"]) expect(p.body).toContain(k);
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
  it("teaches the method and covers the six languages", () => {
    const t = read("tutor-stack-traces");
    for (const s of ["## Python", "## Rust", "## Go", "## TypeScript", "## JavaScript", "## Lua", "last line"]) expect(t).toContain(s);
  });
});
