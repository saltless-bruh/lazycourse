import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkScaffold, taskIds, slugify, commentPrefix, isEmptyOrMissing, writeScaffold, scaffoldPrompt, type ScaffoldSpec } from "../extensions/tutor/scaffold.js";
import { systemText } from "../extensions/tutor/prompts.js";

const spec = (over: Partial<ScaffoldSpec> = {}): ScaffoldSpec => ({
  design_md: "# Design\n\n```\ncli ──▶ store\n```\n",
  tasks_md: "# Tasks\n\n## P1 Basics\n- [ ] P1.T1 Parse args\n  - [ ] P1.T1.S1 Define a function that takes argv and returns a Command\n- [ ] P1.T2 Save tasks\n",
  requirements_md: "# Requirements\n\n## P1.T1\n...\n## P1.T1.S1\n...\n## P1.T2\n...\n",
  entry_file: "src/main.rs", run_cmd: "cargo run", ...over,
});
const meta = { language: "rust", level: 40, band: "intermediate" as const, title: "Todo CLI", summary: "Track tasks in a file." };

describe("taskIds / checkScaffold", () => {
  it("lists unique task ids in order", () => {
    expect(taskIds(spec().tasks_md)).toEqual(["P1.T1", "P1.T1.S1", "P1.T2"]);
  });
  it("accepts a consistent spec", () => {
    expect(checkScaffold(spec())).toEqual(spec());
  });
  it("rejects a task id missing from requirements, naming it", () => {
    expect(() => checkScaffold(spec({ requirements_md: "## P1.T1\n## P1.T2\n" }))).toThrow(/P1\.T1\.S1/);
  });
  it("rejects tasks without ids or without checkboxes", () => {
    expect(() => checkScaffold(spec({ tasks_md: "# Tasks\n- [ ] do things\n" }))).toThrow(/task ids/);
    expect(() => checkScaffold(spec({ tasks_md: "P1.T1 Parse args\n", requirements_md: "P1.T1" }))).toThrow(/\[ \]/);
  });
  it("rejects an entry file outside src/ or escaping the project", () => {
    for (const bad of ["main.rs", "../../.bashrc", "/etc/x", "src/../../x.rs", "src/"]) {
      expect(() => checkScaffold(spec({ entry_file: bad }))).toThrow(/entry_file/);
    }
  });
  it("rejects missing or empty fields", () => {
    expect(() => checkScaffold({ ...spec(), design_md: "" })).toThrow(/design_md/);
    expect(() => checkScaffold({ ...spec(), run_cmd: 3 })).toThrow(/run_cmd/);
  });
});

describe("helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("HTTP Status Checker!")).toBe("http-status-checker");
    expect(slugify("  ")).toBe("project");
  });
  it("picks a line-comment prefix by extension", () => {
    expect(commentPrefix("src/main.py")).toBe("#");
    expect(commentPrefix("src/main.rs")).toBe("//");
    expect(commentPrefix("src/init.lua")).toBe("--");
    expect(commentPrefix("src/x.unknown")).toBe("#");
  });
  it("puts the band's detail level into the scaffold prompt", () => {
    const project = { title: "Todo CLI", summary: "s", size: "small" as const, concepts: ["structs"] };
    expect(scaffoldPrompt({ language: "rust", level: 10, band: "beginner", project, interview: null })).toMatch(/takes X and returns Y/);
    expect(scaffoldPrompt({ language: "rust", level: 90, band: "pro", project, interview: null })).toMatch(/no subtasks/);
    expect(systemText("scaffold")).toContain('"tasks_md"');
  });
});

describe("writeScaffold", () => {
  it("writes the spec §6 layout and nothing outside the folder", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "pitutor-scaffold-")), "rust-todo-cli");
    const written = writeScaffold(dir, spec(), meta);
    expect(written).toEqual(["README.md", "AGENTS.md", "spec/design.md", "spec/tasks.md", "spec/requirements.md", "src/main.rs"]);
    expect(existsSync(join(dir, ".pi"))).toBe(false); // .pi/skills makes Pi ask "trust this folder?" (final review I5)
    expect(readFileSync(join(dir, "spec/tasks.md"), "utf8")).toBe(spec().tasks_md);
    expect(readFileSync(join(dir, "src/main.rs"), "utf8")).toBe("// Start here: spec/tasks.md, task P1.T1. You write the code; the tutor coaches.\n");
    const readme = readFileSync(join(dir, "README.md"), "utf8");
    expect(readme.startsWith("---\nrun: cargo run\nlanguage: rust\n---\n# Todo CLI\n")).toBe(true);
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(agents).toContain("rust");
    expect(agents).toContain("spec/tasks.md");
    expect(agents).toMatch(/never write .*src\//i);
  });
  it("refuses a non-empty folder and writes nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "pitutor-scaffold-"));
    writeFileSync(join(dir, "keep.txt"), "mine");
    expect(isEmptyOrMissing(dir)).toBe(false);
    expect(() => writeScaffold(dir, spec(), meta)).toThrow(/not empty/);
    expect(existsSync(join(dir, "README.md"))).toBe(false);
  });
  it("accepts an existing empty folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "pitutor-scaffold-"));
    mkdirSync(join(dir, "x")); // a folder holding only an empty dir is not empty
    expect(isEmptyOrMissing(dir)).toBe(false);
    const empty = mkdtempSync(join(tmpdir(), "pitutor-scaffold-"));
    expect(isEmptyOrMissing(empty)).toBe(true);
    expect(writeScaffold(empty, spec(), meta)).toHaveLength(6);
  });
});
