import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Profile, SCHEMA_VERSION, defaultProfilePath } from "../extensions/tutor/profile.js";

let p: Profile | undefined;
afterEach(() => { p?.close(); p = undefined; });
const tmp = () => join(mkdtempSync(join(tmpdir(), "pitutor-profile-")), "sub", "profile.sqlite");

describe("Profile.open", () => {
  it("creates the file and its directory, and migrates to the current schema", () => {
    const path = tmp();
    p = Profile.open(path);
    expect(p.version).toBe(SCHEMA_VERSION);
    p.close();
    p = Profile.open(path); // re-open is a no-op migration
    expect(p.version).toBe(SCHEMA_VERSION);
  });
  it("refuses a profile written by a newer pi-tutor", () => {
    const path = tmp();
    Profile.open(path).close();
    const db = new DatabaseSync(path);
    db.prepare("UPDATE schema_version SET v = ?").run(SCHEMA_VERSION + 1);
    db.close();
    expect(() => Profile.open(path)).toThrow(/newer/);
  });
  it("defaults to $XDG_DATA_HOME/nvim-tutor/profile.sqlite, overridable by PI_TUTOR_PROFILE", () => {
    const saved = { x: process.env.XDG_DATA_HOME, p: process.env.PI_TUTOR_PROFILE };
    try {
      delete process.env.PI_TUTOR_PROFILE;
      process.env.XDG_DATA_HOME = "/data";
      expect(defaultProfilePath()).toBe("/data/nvim-tutor/profile.sqlite");
      process.env.PI_TUTOR_PROFILE = "/x.sqlite";
      expect(defaultProfilePath()).toBe("/x.sqlite");
    } finally {
      if (saved.x === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = saved.x;
      if (saved.p === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved.p;
    }
  });
});

describe("languages", () => {
  it("saves, reads, lists and re-levels a language; keeps created on re-save", () => {
    p = Profile.open(":memory:");
    expect(p.language("rust")).toBeUndefined();
    p.saveLanguage("rust", 40, { goal: "a CLI" }, 100);
    p.saveLanguage("rust", 45, { goal: "a CLI" }, 200);
    expect(p.language("rust")).toEqual({ name: "rust", level: 45, interview: { goal: "a CLI" }, created: 100 });
    expect(p.setLevel("rust", 70)).toBe(true);
    expect(p.setLevel("go", 70)).toBe(false);
    expect(p.language("rust")?.level).toBe(70);
    p.saveLanguage("go", 10, {}, 300);
    expect(p.languages()).toEqual(["go", "rust"]);
  });
});

describe("episodes and concept ease", () => {
  const ep = (tags: string[]) => ({ language: "rust", project: "/p", concept_tags: tags, rungs_used: 2, turns: 3, opened: 1, closed: 2 });
  it("records episodes and keeps ease as the running mean of scores", () => {
    p = Profile.open(":memory:");
    p.recordEpisode(ep(["borrow", "lifetimes"]), 1);
    p.recordEpisode(ep(["borrow"]), 0);
    expect(p.concepts("rust")).toEqual([
      { language: "rust", tag: "borrow", ease: 0.5, episodes: 2 },
      { language: "rust", tag: "lifetimes", ease: 1, episodes: 1 },
    ]);
    expect(p.episodes("rust")).toHaveLength(2);
    expect(p.episodes("rust")[0]).toEqual(ep(["borrow", "lifetimes"]));
  });
  it("stores an unscored episode without touching concepts", () => {
    p = Profile.open(":memory:");
    p.recordEpisode(ep(["borrow"]), null);
    expect(p.concepts("rust")).toEqual([]);
    expect(p.episodes("rust")).toHaveLength(1);
  });
});

describe("projects", () => {
  it("adds projects, finds one by exact path, lists by language", () => {
    p = Profile.open(":memory:");
    const a = p.addProject("rust", "/home/u/lazycourse/rust-todo", "Todo CLI", 5);
    expect(a).toEqual({ id: 1, language: "rust", path: "/home/u/lazycourse/rust-todo", title: "Todo CLI", status: "active", created: 5 });
    expect(p.projectAt("/home/u/lazycourse/rust-todo")).toEqual(a);
    expect(p.projectAt("/home/u/lazycourse")).toBeUndefined();
    expect(p.projects("rust").map((x) => x.title)).toEqual(["Todo CLI"]);
    expect(p.projects("go")).toEqual([]);
  });
});
