import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suggestOne, createProject, defaultProjectDir, isLanguage, LANGUAGES } from "../extensions/tutor/start.js";
import { Profile } from "../extensions/tutor/profile.js";

let profile: Profile | undefined;
afterEach(() => { profile?.close(); profile = undefined; });
const ONE = JSON.stringify({ projects: [{ title: "Tip Calculator", summary: "Split a bill.", size: "small", concepts: ["numbers", "functions"] }] });
const project = { title: "Tip Calculator", summary: "Split a bill.", size: "small" as const, concepts: ["numbers"] };

describe("start building blocks (spec 2026-10-19 §5, Q4, Q23)", () => {
  it("knows exactly the six languages, and nothing else (the pytutor-architect case)", () => {
    expect(LANGUAGES).toEqual(["python", "rust", "go", "typescript", "lua", "javascript"]);
    expect(isLanguage("python")).toBe(true);
    expect(isLanguage("pytutor-architect")).toBe(false);
  });
  it("suggests one project, telling the model what the conversation learned and what was already shown", async () => {
    profile = Profile.open(":memory:");
    const seen: string[] = [];
    const s = await suggestOne({ profile, complete: async (_sys, user) => { seen.push(user); return ONE; } },
      { language: "python", level: 10, about: { experience: "none yet", idea: "track my expenses" }, exclude: ["Expense Logger"] });
    expect(s.title).toBe("Tip Calculator");
    expect(seen[0]).toMatch(/projects wanted: 1/);
    expect(seen[0]).toMatch(/do not suggest: Expense Logger/);
    expect(seen[0]).toMatch(/idea: track my expenses/);
  });
  it("rejects a reply with the wrong number of projects", async () => {
    profile = Profile.open(":memory:");
    const three = JSON.stringify({ projects: [1, 2, 3].map((n) => ({ title: `P${n}`, summary: "s.", size: "small", concepts: [] })) });
    const replies = [three, three];
    await expect(suggestOne({ profile, complete: async () => replies.shift()! }, { language: "go", level: 50, about: {}, exclude: [] })).rejects.toThrow(/exactly 1/);
  });
  it("the default folder is ~/lazycourse/<language>-<slug>", () => {
    expect(defaultProjectDir("/home/u", "python", "Tip Calculator!")).toBe("/home/u/lazycourse/python-tip-calculator");
  });
  it("creates the project folder before any spec: README front matter, AGENTS.md, profile rows", () => {
    profile = Profile.open(":memory:");
    const dir = join(mkdtempSync(join(tmpdir(), "start-")), "python-tip");
    const r = createProject(profile, { language: "python", level: 10, project, dir, about: { experience: "none yet" }, now: 5 });
    expect(r.dir).toBe(realpathSync(dir));
    const readme = readFileSync(join(dir, "README.md"), "utf8");
    expect(readme).toMatch(/^---\n/);
    expect(readme).toMatch(/language: python/);
    expect(readme).toMatch(/test: python3 -m unittest/);
    expect(readme).toContain("# Tip Calculator");
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toMatch(/never write the solution/i);
    expect(profile.language("python")?.level).toBe(10);
    expect(profile.projectAt(r.dir)?.title).toBe("Tip Calculator");
  });
  it("keeps an existing language level row, and refuses a non-empty folder", () => {
    profile = Profile.open(":memory:");
    profile.saveLanguage("python", 70, {}, 1);
    const base = mkdtempSync(join(tmpdir(), "start-"));
    createProject(profile, { language: "python", level: 30, project, dir: join(base, "a"), about: {}, now: 5 });
    expect(profile.language("python")?.level).toBe(30);
    mkdirSync(join(base, "b")); writeFileSync(join(base, "b", "x"), "");
    expect(() => createProject(profile!, { language: "python", level: 30, project, dir: join(base, "b"), about: {}, now: 5 })).toThrow(/not empty/);
    expect(existsSync(join(base, "b", "README.md"))).toBe(false);
  });
  it("records the project at its real path under a symlinked parent (M4 #25)", () => {
    profile = Profile.open(":memory:");
    const real = mkdtempSync(join(tmpdir(), "pitutor-real-"));
    const home = mkdtempSync(join(tmpdir(), "pitutor-home-"));
    symlinkSync(real, join(home, "lazycourse"));
    const r = createProject(profile, { language: "rust", level: 50, project, dir: join(home, "lazycourse", "rust-tip"), about: {}, now: 5 });
    expect(r.dir).toBe(join(realpathSync(real), "rust-tip"));
    expect(profile.projectAt(r.dir)).toBeDefined();
  });
});
