import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
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
    expect(scaffoldPrompt({ language: "rust", level: 10, band: "beginner", project, about: {}, rounds: [] })).toMatch(/takes X and returns Y/);
    expect(scaffoldPrompt({ language: "rust", level: 90, band: "pro", project, about: {}, rounds: [] })).toMatch(/no subtasks/);
    expect(systemText("scaffold")).toContain('"tasks_md"');
  });
});

describe("writeScaffold", () => {
  it("the README front matter carries the language's test command (M8)", () => {
    const dir = mkdtempSync(join(tmpdir(), "pitutor-scaf-"));
    writeScaffold(dir, spec(), meta);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toMatch(/^---\nrun: cargo run\ntest: cargo test\nlanguage: rust\n---\n/);
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain("test it with `:TutorRun test`");
  });
  it("a language with no known test command gets no test: line", () => {
    const dir = mkdtempSync(join(tmpdir(), "pitutor-scaf-"));
    writeScaffold(dir, spec({ entry_file: "src/main.c" }), { ...meta, language: "c" });
    expect(readFileSync(join(dir, "README.md"), "utf8")).toMatch(/^---\nrun: cargo run\nlanguage: c\n---\n/);
  });
  it("writes the spec §6 layout and nothing outside the folder", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "pitutor-scaffold-")), "rust-todo-cli");
    const written = writeScaffold(dir, spec(), meta);
    expect(written).toEqual(["README.md", "AGENTS.md", "spec/design.md", "spec/tasks.md", "spec/requirements.md", "src/main.rs"]);
    expect(existsSync(join(dir, ".pi"))).toBe(false); // .pi/skills makes Pi ask "trust this folder?" (final review I5)
    expect(readFileSync(join(dir, "spec/tasks.md"), "utf8")).toBe(spec().tasks_md);
    expect(readFileSync(join(dir, "src/main.rs"), "utf8")).toBe("// Start here: spec/tasks.md, task P1.T1. You write the code; the tutor coaches.\n");
    const readme = readFileSync(join(dir, "README.md"), "utf8");
    expect(readme.startsWith("---\nrun: cargo run\ntest: cargo test\nlanguage: rust\n---\n# Todo CLI\n")).toBe(true);
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

describe("M6c: scaffold cleanup (M4 #26)", () => {
  it("a failed write removes only what it created, so a retry works", () => {
    const dir = mkdtempSync(join(tmpdir(), "pitutor-half-"));
    expect(() => writeScaffold(dir, spec({ entry_file: "spec/design.md" }), meta)).toThrow(); // collides with a file written earlier
    expect(readdirSync(dir)).toEqual([]);
    expect(writeScaffold(dir, spec(), meta)).toContain("spec/tasks.md");
  });
});

describe("build or learn: milestones and the existing project folder (spec 2026-10-19 Q22, Q23)", () => {
  const project = { title: "Todo CLI", summary: "Track tasks.", size: "small" as const, concepts: ["structs"] };
  it("the prompt asks for one milestone per lesson round, each using only the concepts taught so far", () => {
    const p = scaffoldPrompt({ language: "python", level: 10, band: "beginner", project, about: { idea: "a todo list" }, rounds: [["basics", "functions"], ["lists"]] });
    expect(p).toMatch(/## Milestone 1: basics, functions/);
    expect(p).toMatch(/## Milestone 2: lists/);
    expect(p).toContain("idea: a todo list");
    expect(scaffoldPrompt({ language: "python", level: 10, band: "beginner", project, about: {}, rounds: [] })).not.toMatch(/Milestone/);
  });
  it("a learn-first spec must carry the milestone headings", () => {
    expect(() => checkScaffold(spec(), [["basics"]])).toThrow(/## Milestone 1/);
    const withMilestones = spec({ tasks_md: "## Milestone 1: basics\n- [ ] P1.T1 Parse args\n  - [ ] P1.T1.S1 Define a function\n- [ ] P1.T2 Save tasks\n" });
    expect(checkScaffold(withMilestones, [["basics"]]).tasks_md).toContain("## Milestone 1:");
  });
  it("writes into the folder /tutor-start already made: README and AGENTS replaced, the learner's learn/ kept", () => {
    const dir = mkdtempSync(join(tmpdir(), "pitutor-scaffold-"));
    writeFileSync(join(dir, "README.md"), "---\nlanguage: rust\n---\n# Todo CLI\n");
    writeFileSync(join(dir, "AGENTS.md"), "old");
    mkdirSync(join(dir, "learn", "basics"), { recursive: true });
    writeFileSync(join(dir, "learn", "basics", "solution.py"), "mine");
    writeScaffold(dir, spec(), meta, { existing: true });
    expect(readFileSync(join(dir, "README.md"), "utf8")).toMatch(/run: cargo run/);
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).not.toBe("old");
    expect(readFileSync(join(dir, "learn", "basics", "solution.py"), "utf8")).toBe("mine");
    expect(existsSync(join(dir, "spec", "tasks.md"))).toBe(true);
  });
  it("into an existing folder it still never overwrites a spec or source file that is already there", () => {
    const dir = mkdtempSync(join(tmpdir(), "pitutor-scaffold-"));
    mkdirSync(join(dir, "spec"));
    writeFileSync(join(dir, "spec", "tasks.md"), "mine");
    expect(() => writeScaffold(dir, spec(), meta, { existing: true })).toThrow();
    expect(readFileSync(join(dir, "spec", "tasks.md"), "utf8")).toBe("mine");
  });
});
