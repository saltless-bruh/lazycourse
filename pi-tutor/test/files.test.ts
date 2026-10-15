import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeInRoot } from "../extensions/tutor/files.js";

const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));

describe("writeInRoot (M8, CLAUDE.md root rule)", () => {
  it("writes a file under the root, making folders, and returns its real path", () => {
    const root = tmp("wir-");
    const abs = writeInRoot(root, "exam/01-x/brief.md", "hi");
    expect(readFileSync(abs, "utf8")).toBe("hi");
    expect(abs.endsWith("/exam/01-x/brief.md")).toBe(true);
  });
  it("refuses absolute paths and .. segments", () => {
    const root = tmp("wir-");
    expect(() => writeInRoot(root, "/etc/x", "")).toThrow(/inside the project/);
    expect(() => writeInRoot(root, "exam/../../x", "")).toThrow(/inside the project/);
  });
  it("refuses a folder symlinked outside the root and creates nothing out there (Review Focus #5)", () => {
    const root = tmp("wir-"), outside = tmp("wir-out-");
    symlinkSync(outside, join(root, "exam"));
    expect(() => writeInRoot(root, "exam/01-x/brief.md", "")).toThrow(/outside the project/);
    expect(existsSync(join(outside, "01-x"))).toBe(false);
  });
  it("refuses a file that is a symlink pointing outside", () => {
    const root = tmp("wir-"), outside = tmp("wir-out-");
    mkdirSync(join(root, "spec"));
    writeFileSync(join(outside, "t.md"), "x");
    symlinkSync(join(outside, "t.md"), join(root, "spec", "tasks.md"));
    expect(() => writeInRoot(root, "spec/tasks.md", "y")).toThrow(/outside the project/);
    expect(readFileSync(join(outside, "t.md"), "utf8")).toBe("x");
  });
  it("exclusive never overwrites (Review Focus #5)", () => {
    const root = tmp("wir-");
    writeInRoot(root, "a.md", "1", { exclusive: true });
    expect(() => writeInRoot(root, "a.md", "2", { exclusive: true })).toThrow(/EEXIST/);
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("1");
  });
});
