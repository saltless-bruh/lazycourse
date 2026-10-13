import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { guardToolCall, resolveToolPath, realpathLoose, skillDirs, MEMORY_TOOLS } from "../extensions/tutor/guard.js";

let root: string;
beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "pitutor-guard-")));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.py"), "x = 1\n");
  symlinkSync("/etc", join(root, "etc-link"));
  mkdirSync(`${root}-sibling`);
});
const allowed = (tool: string, input: Record<string, unknown>) => expect(guardToolCall(tool, input, root)).toBeUndefined();
const blocked = (tool: string, input: Record<string, unknown>) => expect(guardToolCall(tool, input, root)).toMatchObject({ block: true });

describe("guardToolCall", () => {
  it("allows read/grep/find/ls inside the project root", () => {
    allowed("read", { path: "src/a.py" });
    allowed("read", { path: join(root, "src/a.py") });
    allowed("grep", { pattern: "x" });
    allowed("grep", { pattern: "x", path: "src" });
    allowed("find", { pattern: "*.py" });
    allowed("ls", {});
    allowed("ls", { path: "." });
  });
  it("blocks paths outside the root", () => {
    blocked("read", { path: "/etc/passwd" });
    blocked("read", { path: "../outside.txt" });
    blocked("grep", { pattern: "x", path: "/" });
    blocked("find", { pattern: "*", path: ".." });
    blocked("ls", { path: "~" });
  });
  it("blocks a sibling directory that shares the root's name as a prefix", () => {
    blocked("read", { path: `${root}-sibling/x` });
  });
  it("follows symlinks: a link inside the root to /etc is outside", () => {
    blocked("read", { path: "etc-link/passwd" });
    blocked("ls", { path: "etc-link" });
  });
  it("judges not-yet-existing paths by their nearest existing parent", () => {
    allowed("read", { path: "src/new/deeper.py" });
    blocked("read", { path: "src/../../nope/x.py" });
  });
  it("resolves @, ~ and file:// forms the way Pi does", () => {
    allowed("read", { path: "@src/a.py" });
    allowed("read", { path: pathToFileURL(join(root, "src/a.py")).href });
    blocked("read", { path: "file:///etc/passwd" });
    blocked("read", { path: "~/.ssh/id_ed25519" });
  });
  it("blocks bash, write, edit and unknown tools with a reason", () => {
    for (const t of ["bash", "write", "edit", "powershell", "web_fetch"]) {
      const r = guardToolCall(t, { command: "ls", path: "src/a.py" }, root);
      expect(r?.block).toBe(true);
      expect(r?.reason).toMatch(t === "bash" ? /bash is off/ : /read-only/);
    }
  });
  it("blocks a missing or non-string path where one is required or given", () => {
    blocked("read", {});
    blocked("read", { path: 42 });
    blocked("grep", { pattern: "x", path: 42 });
  });
  it("names the refused path in the reason", () => {
    expect(guardToolCall("read", { path: "/etc/passwd" }, root)?.reason).toContain("/etc/passwd");
  });
});

describe("resolveToolPath / realpathLoose", () => {
  it("normalizes unicode spaces, strips @, expands ~", () => {
    expect(resolveToolPath("@~/x y", "/c")).toBe(join(homedir(), "x y"));
    expect(resolveToolPath("~", "/c")).toBe(homedir());
    expect(resolveToolPath("a/../b", "/c")).toBe("/c/b");
  });
  it("re-appends the missing tail to the real parent", () => {
    expect(realpathLoose(join(root, "etc-link", "nope", "x"))).toBe(join(realpathSync("/etc"), "nope", "x"));
    expect(realpathLoose(join(root, "missing", "y"))).toBe(join(root, "missing", "y"));
  });
});

describe("skill folders (M5)", () => {
  it("allows reads inside an extra root such as a loaded skill folder, and nothing next to it", () => {
    const skills = mkdtempSync(join(tmpdir(), "pitutor-skills-"));
    const dir = join(skills, "tutor-rust-style");
    mkdirSync(join(dir, "references"), { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "x");
    writeFileSync(join(skills, "secret.md"), "x");
    expect(guardToolCall("read", { path: join(dir, "SKILL.md") }, root, [dir])).toBeUndefined();
    expect(guardToolCall("read", { path: join(dir, "references", "1-style.md") }, root, [dir])).toBeUndefined();
    expect(guardToolCall("read", { path: join(skills, "secret.md") }, root, [dir])).toMatchObject({ block: true });
    expect(guardToolCall("read", { path: join(dir, "SKILL.md") }, root)).toMatchObject({ block: true });
    expect(guardToolCall("bash", { command: "cat x" }, root, [dir])).toMatchObject({ block: true });
  });
  it("derives skill folders from Pi's command list", () => {
    expect(skillDirs([
      { source: "skill", sourceInfo: { path: "/a/skills/tutor-rust-style/SKILL.md" } },
      { source: "extension", sourceInfo: { path: "/a/ext/index.ts" } },
      { source: "prompt", sourceInfo: { path: "/a/prompts/x.md" } },
      { source: "skill", sourceInfo: {} },
    ])).toEqual(["/a/skills/tutor-rust-style"]);
  });
});

describe("memory tools (spec 2026-10-13 §7.1)", () => {
  it("allows tutor_remember and tutor_recall by name and nothing else new", () => {
    expect([...MEMORY_TOOLS].sort()).toEqual(["tutor_recall", "tutor_remember"]);
    for (const t of MEMORY_TOOLS) expect(guardToolCall(t, { text: "x" }, "/tmp")).toBeUndefined();
    expect(guardToolCall("memory_write", { text: "x" }, "/tmp")?.block).toBe(true);
  });
});
