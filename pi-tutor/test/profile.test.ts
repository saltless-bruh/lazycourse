import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Profile, SCHEMA_VERSION, MIGRATIONS, defaultProfilePath, toFtsQuery } from "../extensions/tutor/profile.js";

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
  it("re-adding a recorded folder updates its row instead of failing (final review I2)", () => {
    p = Profile.open(":memory:");
    const a = p.addProject("python", "/home/u/lazycourse/py-todo", "Todo CLI", 5);
    const b = p.addProject("python", "/home/u/lazycourse/py-todo", "Todo CLI v2", 9);
    expect(b).toEqual({ ...a, title: "Todo CLI v2", created: 9 });
    expect(p.projects("python")).toEqual([b]);
  });
});

describe("busy profile (final review I4)", () => {
  it("waits for a lock up to the busy timeout, then throws instead of hanging", () => {
    const path = tmp();
    p = Profile.open(path, { busyTimeoutMs: 50 });
    const other = new DatabaseSync(path);
    other.exec("BEGIN EXCLUSIVE");
    try {
      const t0 = Date.now();
      expect(() => p!.setLevel("rust", 1)).toThrow(/locked|busy/i);
      expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
    } finally { other.exec("ROLLBACK"); other.close(); }
  });
});

describe("profile v2: memory and feedback (spec 2026-10-13 §7.1, §7 #7, §8)", () => {
  const open = () => Profile.open(":memory:");
  it("is schema v2", () => { expect(SCHEMA_VERSION).toBe(2); expect(open().version).toBe(2); });
  it("upgrades a v1 profile in place and keeps its rows", () => {
    const file = join(mkdtempSync(join(tmpdir(), "pitutor-v1-")), "profile.sqlite");
    const raw = new DatabaseSync(file);
    raw.exec(`CREATE TABLE schema_version (v INTEGER NOT NULL); INSERT INTO schema_version (v) VALUES (1);
      CREATE TABLE languages (name TEXT PRIMARY KEY, level INTEGER NOT NULL, interview_json TEXT NOT NULL, created INTEGER NOT NULL);
      INSERT INTO languages VALUES ('rust', 40, '{}', 1);`);
    raw.close();
    const q = Profile.open(file);
    expect(q.version).toBe(2);
    expect(q.language("rust")?.level).toBe(40);
    expect(q.remember({ type: "learner", text: "knows Go", language: null, project: null }, 2).created).toBe(true);
    q.close();
  });
  it("remember dedupes the same type+text and bumps updated", () => {
    const q = open();
    const a = q.remember({ type: "learner", text: "prefers Rust comparisons", language: "python", project: null }, 1);
    const b = q.remember({ type: "learner", text: "prefers Rust comparisons", language: "python", project: null }, 5);
    expect(b).toEqual({ id: a.id, created: false });
    expect(q.memories({ language: "python", limit: 10 })[0].updated).toBe(5);
  });
  it("memories: newest first, the language plus language-free rows", () => {
    const q = open();
    q.remember({ type: "learner", text: "general fact", language: null, project: null }, 1);
    q.remember({ type: "project", text: "python fact", language: "python", project: "/p" }, 2);
    q.remember({ type: "project", text: "rust fact", language: "rust", project: "/r" }, 3);
    expect(q.memories({ language: "python", limit: 10 }).map((m) => m.text)).toEqual(["python fact", "general fact"]);
    expect(q.memories({ language: null, limit: 2 }).map((m) => m.text)).toEqual(["rust fact", "python fact"]);
  });
  it("recall searches words with BM25 and survives FTS syntax in the query", () => {
    const q = open();
    q.remember({ type: "learner", text: "struggles with closures and borrowing", language: "rust", project: null }, 1);
    q.remember({ type: "reference", text: "uses pytest for tests", language: "python", project: null }, 2);
    expect(q.recall("closures", 5).map((m) => m.text)).toEqual(["struggles with closures and borrowing"]);
    expect(q.recall('closures" OR *', 5).length).toBe(1);
    expect(q.recall("", 5)).toEqual([]);
  });
  it("forget removes the row and its index entry", () => {
    const q = open();
    const { id } = q.remember({ type: "learner", text: "likes diagrams", language: null, project: null }, 1);
    expect(q.forget(id)).toBe(true);
    expect(q.recall("diagrams", 5)).toEqual([]);
    expect(q.forget(id)).toBe(false);
  });
  it("feedback is logged per language, oldest first", () => {
    const q = open();
    q.recordFeedback({ kind: "too-long", language: "python", project: "/p", rung: 2 }, 1);
    q.recordFeedback({ kind: "good", language: "python", project: "/p", rung: null }, 2);
    q.recordFeedback({ kind: "too-vague", language: "rust", project: null, rung: null }, 3);
    expect(q.feedback("python").map((f) => f.kind)).toEqual(["too-long", "good"]);
  });
  it("toFtsQuery quotes each term and ORs them (from @pify/memory fts.ts)", () => {
    expect(toFtsQuery('a closures "x" yz*')).toBe('"closures" OR "yz*"'); // one-letter terms are dropped, as upstream
    expect(toFtsQuery("  ")).toBe('""');
  });
});

describe("M6c: profile minors", () => {
  it("remember keeps the same text for two languages apart (M6b #57)", () => {
    const q = Profile.open(":memory:");
    expect(q.remember({ type: "learner", text: "likes loops", language: "python", project: null }, 1).created).toBe(true);
    expect(q.remember({ type: "learner", text: "likes loops", language: "rust", project: null }, 2).created).toBe(true);
    expect(q.remember({ type: "learner", text: "likes loops", language: null, project: null }, 3).created).toBe(true);
    expect(q.remember({ type: "learner", text: "likes loops", language: null, project: null }, 4).created).toBe(false);
  });
  it("a real v1 profile keeps languages, concepts, episodes and projects through the upgrade (M6b #60)", () => {
    const file = join(mkdtempSync(join(tmpdir(), "pitutor-v1full-")), "profile.sqlite");
    const raw = new DatabaseSync(file);
    raw.exec(`CREATE TABLE schema_version (v INTEGER NOT NULL); INSERT INTO schema_version (v) VALUES (1);`);
    raw.exec(MIGRATIONS[0]);
    raw.exec(`INSERT INTO languages VALUES ('rust', 40, '{}', 1);
      INSERT INTO concepts VALUES ('rust', 'traits', 0.5, 2);
      INSERT INTO episodes (language, project, concept_tags, rungs_used, turns, opened, closed) VALUES ('rust', '/p', '["traits"]', 2, 3, 1, 2);
      INSERT INTO projects (language, path, title, status, created) VALUES ('rust', '/p', 'T', 'active', 1);`);
    raw.close();
    const q = Profile.open(file);
    expect(q.version).toBe(2);
    expect(q.language("rust")?.level).toBe(40);
    expect(q.concepts("rust")).toEqual([{ language: "rust", tag: "traits", ease: 0.5, episodes: 2 }]);
    expect(q.episodes("rust")).toHaveLength(1);
    expect(q.projectAt("/p")?.title).toBe("T");
    q.close();
  });
});
