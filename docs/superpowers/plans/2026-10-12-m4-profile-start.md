# nvim-tutor M4: profile, interview, suggester, scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/tutor-start` (or `:TutorStart`) picks a language. A language with no profile row gets a short interview, which sets its starting level. The tutor then suggests three projects aimed at your weak concepts and writes the one you pick into a new folder (`README.md`, `AGENTS.md`, `.pi/skills/`, `spec/{design,tasks,requirements}.md`, `src/<entry>`). Finally Neovim switches into that folder and restarts Pi there. Closed episodes are stored in a SQLite profile, which keeps per-concept ease.

**Architecture:** The new pure or near-pure modules each have one job. `profile.ts` holds `node:sqlite` storage and migrations. `interview.ts` holds the questions and the level mapping. `llm.ts` turns a model reply into validated JSON, with one retry. `suggest.ts` and `scaffold.ts` build prompts, check replies and write files. `start.ts` runs the `/tutor-start` flow with every dependency injected. `index.ts` wires it in: it opens the profile, learns the language and level of a scaffolded project at `session_start`, writes closed episodes to the profile, and registers `/tutor-start`. The Lua side gains `require("tutor").switch(dir, file)`, which re-roots Neovim and Pi. The extension calls it through the existing Neovim link.

**Tech Stack:** Node ≥ 22.19 built-in `node:sqlite` (`DatabaseSync`). Pi 1.1.0 `ctx.modelRegistry.complete`, `ctx.ui.select/input/setWorkingMessage`, `ctx.model`. TypeScript, vitest, plenary.

**Spec:** `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` (rev 5; sections 5 "mirrored to the profile on close", 6, 9, 10 row M4, 11)

## Global Constraints

- Pi `^1.0`, Node ≥ 22.19, unmodified upstream Pi. The extension does nothing unless `PI_TUTOR=1`.
- Nothing in the extension writes to stdout or stderr. `node:sqlite` loads with no warning on the installed Node (v26.11.1, checked 2026-10-12).
- Every new Pi or Neovim call is verified in `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and listed in `pi-tutor/PI_SURFACE.md` (Task 8). Already verified:
  - `ctx.modelRegistry.complete(model, { systemPrompt, messages }, { signal })` returns `Promise<AssistantMessage>` (`dist/core/model-registry.d.ts:40`; used by `examples/extensions/qna.ts`);
  - `ctx.ui.select(title, options)` returns `Promise<string | undefined>` (types.d.ts:74);
  - `ctx.ui.input(title, placeholder)` returns `Promise<string | undefined>` (:78);
  - `ctx.ui.setWorkingMessage(text?)` (:86);
  - `ctx.model` (:227);
  - `AssistantMessage.stopReason` and `errorMessage` (`pi-ai/dist/types.d.ts:388-390`).
- Profile: `~/.local/share/nvim-tutor/profile.sqlite` (honours `XDG_DATA_HOME`). Tables `schema_version(v)`, `languages(name, level, interview_json, created)`, `concepts(language, tag, ease REAL, episodes INT)`, `episodes(id, language, project, concept_tags, rungs_used, turns, opened, closed)`, `projects(id, language, path, title, status, created)` (spec §6).
- Project sizes: small (1–2 h), medium (half day), large (1–2 days). Exactly 3 suggestions, biased toward low or missing concept scores (spec §6).
- Scaffold layout (spec §6): `README.md`, `AGENTS.md`, `.pi/skills/`, `spec/design.md`, `spec/tasks.md` (ids `P1.T2.S3`, `[ ]` boxes), `spec/requirements.md` (per task id), `src/<entry file>` that is empty except for a comment pointing at `tasks.md`. The three spec files come from **one** structured model call. The extension writes only inside the chosen directory, and never edits `src/` after the scaffold.
- Detail scales with level: beginner gets subtasks down to "define a function that takes X and returns Y"; pro gets tasks and requirements only.
- One module per responsibility. Tests live in `pi-tutor/test/<module>.test.ts`. TDD: write the test, watch it fail, then implement.

## Plan decisions (deviations from the spec's letter, carried as rulings)

- **After the scaffold, Neovim switches into the project and restarts Pi there.** A new Lua function, `require("tutor").switch(dir, file)`, runs `:cd` into the folder, opens `spec/tasks.md` and restarts the Pi pane with `cwd = dir`. This is needed because the tool guard, `AGENTS.md` loading and the editor root all follow Pi's cwd, and a running Pi can't change it. The extension schedules the switch 500 ms after its command returns, so Pi can finish drawing first. Cost: the `/tutor-start` conversation stays in the old session. When Pi runs outside Neovim, it tells you to `cd <dir> && pi` instead.
- **The interview uses `select` for the multiple-choice questions** (experience, familiarity, size) and `input` for free text (languages known, goal). The spec says "via `ctx.ui.input`". Fixed choices let the starting level be computed without a model call: familiarity gives 15/45/80, experience adds −10/0/+5/+10, and the result is clamped to 0–100. Cost if wrong: you can't type nuances such as "I know C, so Rust is half-familiar", but the free-text goal goes to the suggester.
- **Ease** is the mean, per concept, of episode scores. An episode's score is `1 − (rung − startRung) / (cap − startRung + 1)`, clamped to 0–1: closing at the start rung gives 1, and each extra rung of help costs a step. `superseded` episodes are not scored or stored. Lowering the start rung when a concept's ease is ≥ 0.7 waits for M5: rungs are set when an episode opens, before any concept tag is known. Cost if wrong: the formula is one function in `ladder.ts`.
- **The model replies in JSON, and `llm.ts` retries once on invalid JSON or a failed check.** The retry sends the error back to the model. A second failure aborts `/tutor-start` with that error. Nothing has been written to disk at that point.
- **The scaffold must stay consistent.** Every task id in `tasks.md` must appear in `requirements.md`. `entry_file` must be a relative path under `src/` with no `..`. The scaffold is never written into an existing non-empty folder.
- **The default folder is `~/lazycourse/<language>-<slug>`.** The prompt shows it as the placeholder, and an empty answer accepts it.
- **`README.md` front matter carries `run:` and `language:`** for M6's `:TutorRun`. Nothing reads them yet.
- **The language and level of a scaffolded project come from the profile.** At `session_start`, if `ctx.cwd` is a recorded project, `state.language` is set from it, and the level is set from `languages.level` unless the session has a `tutor_level` entry. `/tutor-level` also updates the profile row for the current language. Fetching language knowledge into skills (spec §6, last step) is M5.

## Review Focus

1. Pressing Esc or giving an empty answer at any `/tutor-start` dialog aborts cleanly. No files are written, no profile row exists for a project or a half-finished interview, and the working message is cleared (Task 6 test).
2. The model returns prose around the JSON, or JSON inside a ```` ```json ```` fence: it is parsed anyway. Twice invalid: a clear error, nothing written (Task 3 test).
3. The chosen folder exists and holds files: it is refused before any model call for the spec, and nothing is overwritten (Task 6 test).
4. A profile file written by a newer pi-tutor (`schema_version.v` > known): it is refused with a clear message, and the extension keeps working without a profile (Task 1 and Task 7 tests).
5. `entry_file` like `../../.bashrc` or `/etc/x` from the model: rejected by `checkScaffold`, then retried, never written (Task 5 test).

---

### Task 1: Profile store (`node:sqlite`, migrations)

**Files:**
- Create: `pi-tutor/extensions/tutor/profile.ts`
- Test: `pi-tutor/test/profile.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LanguageRow { name: string; level: number; interview: Record<string, string>; created: number }
  export interface ConceptRow { language: string; tag: string; ease: number; episodes: number }
  export interface ProjectRow { id: number; language: string; path: string; title: string; status: string; created: number }
  export interface EpisodeRecord { language: string; project: string | null; concept_tags: string[]; rungs_used: number; turns: number; opened: number; closed: number }
  export const SCHEMA_VERSION: number; // 1
  export function defaultProfilePath(): string;
  export class Profile {
    static open(path?: string): Profile;          // throws on a newer schema
    readonly version: number;
    close(): void;
    language(name: string): LanguageRow | undefined;
    languages(): string[];
    saveLanguage(name: string, level: number, interview: Record<string, string>, now: number): void;
    setLevel(name: string, level: number): boolean;
    concepts(language: string): ConceptRow[];      // ease ascending
    recordEpisode(e: EpisodeRecord, score: number | null): void;
    episodes(language: string): EpisodeRecord[];
    addProject(language: string, path: string, title: string, now: number): ProjectRow;
    projectAt(path: string): ProjectRow | undefined;
    projects(language: string): ProjectRow[];
  }
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/profile.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/profile.test.ts`
Expected: FAIL. Cannot resolve `../extensions/tutor/profile.js`.

- [ ] **Step 3: Implement**

`pi-tutor/extensions/tutor/profile.ts`:
```ts
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Learner profile (spec §6): node:sqlite, one migration per schema version.
export interface LanguageRow { name: string; level: number; interview: Record<string, string>; created: number }
export interface ConceptRow { language: string; tag: string; ease: number; episodes: number }
export interface ProjectRow { id: number; language: string; path: string; title: string; status: string; created: number }
export interface EpisodeRecord { language: string; project: string | null; concept_tags: string[]; rungs_used: number; turns: number; opened: number; closed: number }

const MIGRATIONS: string[] = [
  `CREATE TABLE languages (name TEXT PRIMARY KEY, level INTEGER NOT NULL, interview_json TEXT NOT NULL, created INTEGER NOT NULL);
   CREATE TABLE concepts (language TEXT NOT NULL, tag TEXT NOT NULL, ease REAL NOT NULL, episodes INTEGER NOT NULL, PRIMARY KEY (language, tag));
   CREATE TABLE episodes (id INTEGER PRIMARY KEY AUTOINCREMENT, language TEXT NOT NULL, project TEXT, concept_tags TEXT NOT NULL,
     rungs_used INTEGER NOT NULL, turns INTEGER NOT NULL, opened INTEGER NOT NULL, closed INTEGER NOT NULL);
   CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, language TEXT NOT NULL, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
     status TEXT NOT NULL, created INTEGER NOT NULL);`,
];
export const SCHEMA_VERSION = MIGRATIONS.length;

export function defaultProfilePath(): string {
  if (process.env.PI_TUTOR_PROFILE) return process.env.PI_TUTOR_PROFILE;
  const data = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(data, "nvim-tutor", "profile.sqlite");
}

type Row = Record<string, unknown>;
const project = (r: Row): ProjectRow => ({
  id: Number(r.id), language: String(r.language), path: String(r.path), title: String(r.title), status: String(r.status), created: Number(r.created),
});

export class Profile {
  private constructor(private readonly db: DatabaseSync) {}

  static open(path = defaultProfilePath()): Profile {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    try {
      db.exec("CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL)");
      const row = db.prepare("SELECT v FROM schema_version").get() as Row | undefined;
      if (!row) db.prepare("INSERT INTO schema_version (v) VALUES (0)").run();
      let v = row ? Number(row.v) : 0;
      if (v > SCHEMA_VERSION) throw new Error(`profile schema v${v} is newer than this pi-tutor (v${SCHEMA_VERSION}); update pi-tutor`);
      for (; v < SCHEMA_VERSION; v++) {
        db.exec("BEGIN");
        try {
          db.exec(MIGRATIONS[v]);
          db.prepare("UPDATE schema_version SET v = ?").run(v + 1);
          db.exec("COMMIT");
        } catch (e) { db.exec("ROLLBACK"); throw e; }
      }
    } catch (e) { db.close(); throw e; }
    return new Profile(db);
  }

  get version(): number {
    return Number((this.db.prepare("SELECT v FROM schema_version").get() as Row).v);
  }

  close(): void { this.db.close(); }

  language(name: string): LanguageRow | undefined {
    const r = this.db.prepare("SELECT * FROM languages WHERE name = ?").get(name) as Row | undefined;
    return r && { name: String(r.name), level: Number(r.level), interview: JSON.parse(String(r.interview_json)), created: Number(r.created) };
  }

  languages(): string[] {
    return (this.db.prepare("SELECT name FROM languages ORDER BY name").all() as Row[]).map((r) => String(r.name));
  }

  saveLanguage(name: string, level: number, interview: Record<string, string>, now: number): void {
    this.db.prepare(`INSERT INTO languages (name, level, interview_json, created) VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET level = excluded.level, interview_json = excluded.interview_json`)
      .run(name, level, JSON.stringify(interview), now);
  }

  setLevel(name: string, level: number): boolean {
    return Number(this.db.prepare("UPDATE languages SET level = ? WHERE name = ?").run(level, name).changes) > 0;
  }

  concepts(language: string): ConceptRow[] {
    return (this.db.prepare("SELECT * FROM concepts WHERE language = ? ORDER BY ease, tag").all(language) as Row[])
      .map((r) => ({ language: String(r.language), tag: String(r.tag), ease: Number(r.ease), episodes: Number(r.episodes) }));
  }

  /** Stores the episode; a non-null score folds into each tag's ease as a running mean. */
  recordEpisode(e: EpisodeRecord, score: number | null): void {
    this.db.prepare(`INSERT INTO episodes (language, project, concept_tags, rungs_used, turns, opened, closed) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(e.language, e.project, JSON.stringify(e.concept_tags), e.rungs_used, e.turns, e.opened, e.closed);
    if (score === null) return;
    const up = this.db.prepare(`INSERT INTO concepts (language, tag, ease, episodes) VALUES (?, ?, ?, 1)
      ON CONFLICT(language, tag) DO UPDATE SET ease = (ease * episodes + excluded.ease) / (episodes + 1), episodes = episodes + 1`);
    for (const tag of e.concept_tags) up.run(e.language, tag, score);
  }

  episodes(language: string): EpisodeRecord[] {
    return (this.db.prepare("SELECT * FROM episodes WHERE language = ? ORDER BY id").all(language) as Row[]).map((r) => ({
      language: String(r.language), project: r.project === null ? null : String(r.project), concept_tags: JSON.parse(String(r.concept_tags)),
      rungs_used: Number(r.rungs_used), turns: Number(r.turns), opened: Number(r.opened), closed: Number(r.closed),
    }));
  }

  addProject(language: string, path: string, title: string, now: number): ProjectRow {
    const r = this.db.prepare("INSERT INTO projects (language, path, title, status, created) VALUES (?, ?, ?, 'active', ?)")
      .run(language, path, title, now);
    return { id: Number(r.lastInsertRowid), language, path, title, status: "active", created: now };
  }

  projectAt(path: string): ProjectRow | undefined {
    const r = this.db.prepare("SELECT * FROM projects WHERE path = ?").get(path) as Row | undefined;
    return r && project(r);
  }

  projects(language: string): ProjectRow[] {
    return (this.db.prepare("SELECT * FROM projects WHERE language = ? ORDER BY id").all(language) as Row[]).map(project);
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/profile.test.ts && npm run typecheck`
Expected: PASS. If `@types/node` 22 types `get()`/`all()` results differently, keep the `as Row` casts and adjust only the cast; don't use `any`.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/profile.ts pi-tutor/test/profile.test.ts
git commit -m "feat(pi-tutor): sqlite learner profile with migrations"
```

---

### Task 2: Interview and starting level

**Files:**
- Create: `pi-tutor/extensions/tutor/interview.ts`
- Test: `pi-tutor/test/interview.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Size = "small" | "medium" | "large";
  export interface Ask {
    select(title: string, options: string[]): Promise<string | undefined>;
    input(title: string, placeholder?: string): Promise<string | undefined>;
  }
  export interface InterviewAnswers { experience: string; known: string; familiarity: string; goal: string; size: Size }
  export const EXPERIENCE: readonly string[]; export const FAMILIARITY: readonly string[]; export const SIZES: readonly string[];
  export function runInterview(language: string, ask: Ask): Promise<InterviewAnswers | null>; // null = cancelled
  export function initialLevel(a: InterviewAnswers): number;
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/interview.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runInterview, initialLevel, EXPERIENCE, FAMILIARITY, SIZES, type Ask, type InterviewAnswers } from "../extensions/tutor/interview.js";

/** Replays scripted answers in order and records every title asked. */
function scripted(answers: (string | undefined)[]) {
  const asked: string[] = [];
  const next = async (title: string) => { asked.push(title); return answers.shift(); };
  const ask: Ask = { select: (t) => next(t), input: (t) => next(t) };
  return { ask, asked };
}

describe("runInterview", () => {
  it("asks five questions naming the language and returns the answers", async () => {
    const { ask, asked } = scripted(["1-3 years", "python, js", "tried it a little", "a CLI todo app", "medium (half a day)"]);
    const a = await runInterview("rust", ask);
    expect(a).toEqual({ experience: "1-3 years", known: "python, js", familiarity: "tried it a little", goal: "a CLI todo app", size: "medium" });
    expect(asked).toHaveLength(5);
    expect(asked.some((t) => t.includes("rust"))).toBe(true);
  });
  it("returns null as soon as a choice is cancelled", async () => {
    const { ask, asked } = scripted(["1-3 years", undefined]);
    expect(await runInterview("rust", ask)).toBeNull();
    expect(asked).toHaveLength(2);
  });
  it("treats an empty free-text answer as 'not given', not as cancel", async () => {
    const { ask } = scripted(["none yet", "", "never used it", "", "small (1-2 h)"]);
    expect(await runInterview("go", ask)).toMatchObject({ known: "", goal: "", size: "small" });
  });
});

describe("initialLevel", () => {
  const a = (experience: string, familiarity: string): InterviewAnswers => ({ experience, familiarity, known: "", goal: "", size: "small" });
  it("maps familiarity to a band and nudges by experience, clamped to 0-100", () => {
    expect(initialLevel(a("none yet", "never used it"))).toBe(5);
    expect(initialLevel(a("over 3 years", "never used it"))).toBe(25);
    expect(initialLevel(a("under a year", "tried it a little"))).toBe(45);
    expect(initialLevel(a("over 3 years", "use it regularly"))).toBe(90);
  });
  it("exposes the choice lists it scores", () => {
    expect(EXPERIENCE).toEqual(["none yet", "under a year", "1-3 years", "over 3 years"]);
    expect(FAMILIARITY).toEqual(["never used it", "tried it a little", "use it regularly"]);
    expect(SIZES).toEqual(["small (1-2 h)", "medium (half a day)", "large (1-2 days)"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/interview.test.ts`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement**

`pi-tutor/extensions/tutor/interview.ts`:
```ts
// First-time interview for a language (spec §6). Choices score the starting level; free text feeds the suggester.
export type Size = "small" | "medium" | "large";

export interface Ask {
  select(title: string, options: string[]): Promise<string | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
}

export interface InterviewAnswers { experience: string; known: string; familiarity: string; goal: string; size: Size }

export const EXPERIENCE = ["none yet", "under a year", "1-3 years", "over 3 years"] as const;
export const FAMILIARITY = ["never used it", "tried it a little", "use it regularly"] as const;
export const SIZES = ["small (1-2 h)", "medium (half a day)", "large (1-2 days)"] as const;

const BASE: Record<string, number> = { "never used it": 15, "tried it a little": 45, "use it regularly": 80 };
const NUDGE: Record<string, number> = { "none yet": -10, "under a year": 0, "1-3 years": 5, "over 3 years": 10 };

export async function runInterview(language: string, ask: Ask): Promise<InterviewAnswers | null> {
  const experience = await ask.select("How long have you been programming (any language)?", [...EXPERIENCE]);
  if (experience === undefined) return null;
  const known = await ask.input("Which languages do you already know?", "e.g. python, javascript");
  if (known === undefined) return null;
  const familiarity = await ask.select(`How familiar are you with ${language}?`, [...FAMILIARITY]);
  if (familiarity === undefined) return null;
  const goal = await ask.input(`What would you like to build or learn with ${language}?`, "optional");
  if (goal === undefined) return null;
  const size = await ask.select("How much time per project?", [...SIZES]);
  if (size === undefined) return null;
  return { experience, known: known.trim(), familiarity, goal: goal.trim(), size: size.split(" ")[0] as Size };
}

export function initialLevel(a: InterviewAnswers): number {
  const level = (BASE[a.familiarity] ?? 45) + (NUDGE[a.experience] ?? 0);
  return Math.min(100, Math.max(0, level));
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/interview.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/interview.ts pi-tutor/test/interview.test.ts
git commit -m "feat(pi-tutor): first-time interview and starting level"
```

---

### Task 3: JSON model calls with one retry

**Files:**
- Create: `pi-tutor/extensions/tutor/llm.ts`
- Test: `pi-tutor/test/llm.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Complete = (system: string, user: string) => Promise<string>;
  export function extractJson(text: string): unknown;   // throws Error("no JSON object in the reply") | SyntaxError
  export function completeJson<T>(complete: Complete, system: string, user: string, check: (v: unknown) => T): Promise<T>;
  ```
  `check` throws an `Error` whose message says what is wrong. `completeJson` makes at most two calls. The second call's user text is the original plus `\n\nYour previous reply was rejected: <message>. Reply with only the corrected JSON object.` If that also fails, it throws `Error("model reply rejected twice: <message>")`.

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/llm.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { extractJson, completeJson, type Complete } from "../extensions/tutor/llm.js";

describe("extractJson", () => {
  it("parses a bare object, a fenced object, and an object wrapped in prose", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here you go:\n{"a":{"b":[1,2]}}\nHope that helps.')).toEqual({ a: { b: [1, 2] } });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow(/no JSON object/);
    expect(() => extractJson("{ not json }")).toThrow();
  });
});

describe("completeJson", () => {
  const isA = (v: unknown) => {
    if (typeof v !== "object" || v === null || typeof (v as { a?: unknown }).a !== "number") throw new Error("a must be a number");
    return (v as { a: number }).a;
  };
  function replies(...texts: string[]) {
    const calls: { system: string; user: string }[] = [];
    const complete: Complete = async (system, user) => { calls.push({ system, user }); return texts.shift() ?? ""; };
    return { complete, calls };
  }

  it("returns the checked value on the first good reply", async () => {
    const { complete, calls } = replies('{"a":3}');
    expect(await completeJson(complete, "S", "U", isA)).toBe(3);
    expect(calls).toEqual([{ system: "S", user: "U" }]);
  });
  it("retries once with the rejection reason, then succeeds", async () => {
    const { complete, calls } = replies('{"a":"x"}', '{"a":4}');
    expect(await completeJson(complete, "S", "U", isA)).toBe(4);
    expect(calls).toHaveLength(2);
    expect(calls[1].user).toBe("U\n\nYour previous reply was rejected: a must be a number. Reply with only the corrected JSON object.");
  });
  it("gives up after the second bad reply with the last reason", async () => {
    const { complete, calls } = replies("nope", "still nope");
    await expect(completeJson(complete, "S", "U", isA)).rejects.toThrow(/rejected twice: no JSON object/);
    expect(calls).toHaveLength(2);
  });
  it("does not retry when the model call itself fails", async () => {
    let n = 0;
    const complete: Complete = async () => { n++; throw new Error("network down"); };
    await expect(completeJson(complete, "S", "U", isA)).rejects.toThrow("network down");
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/llm.test.ts`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement**

`pi-tutor/extensions/tutor/llm.ts`:
```ts
// Structured model calls for the suggester and the scaffold (spec §6): JSON out, one corrective retry.
export type Complete = (system: string, user: string) => Promise<string>;

/** The outermost {...} in the reply, so code fences and chatter around it are ignored. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in the reply");
  return JSON.parse(text.slice(start, end + 1));
}

export async function completeJson<T>(complete: Complete, system: string, user: string, check: (v: unknown) => T): Promise<T> {
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? user : `${user}\n\nYour previous reply was rejected: ${reason}. Reply with only the corrected JSON object.`;
    const text = await complete(system, prompt);
    try {
      return check(extractJson(text));
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`model reply rejected twice: ${reason}`);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/llm.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/llm.ts pi-tutor/test/llm.test.ts
git commit -m "feat(pi-tutor): JSON model calls with one corrective retry"
```

---

### Task 4: Project suggester

**Files:**
- Create: `pi-tutor/extensions/tutor/suggest.ts`, `pi-tutor/prompts/system/suggest.md`
- Modify: `pi-tutor/extensions/tutor/prompts.ts` (export `systemText`)
- Test: `pi-tutor/test/suggest.test.ts`

**Interfaces:**
- Consumes: `Size`, `InterviewAnswers` (Task 2); `Band` (policy.ts).
- Produces:
  ```ts
  // prompts.ts
  export function systemText(name: string): string;  // prompts/system/<name>.md, trimmed, cached
  // suggest.ts
  export interface Suggestion { title: string; summary: string; size: Size; concepts: string[] }
  export interface SuggestInput { language: string; level: number; band: Band; interview: InterviewAnswers | null; weakConcepts: string[]; done: string[] }
  export function suggestPrompt(i: SuggestInput): string;
  export function checkSuggestions(v: unknown): Suggestion[];  // exactly 3, throws with a reason
  export function suggestionLabel(s: Suggestion, i: number): string;
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/suggest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { suggestPrompt, checkSuggestions, suggestionLabel } from "../extensions/tutor/suggest.js";
import { systemText } from "../extensions/tutor/prompts.js";

const good = { projects: [
  { title: "Todo CLI", summary: "Track tasks in a file.", size: "small", concepts: ["structs", "file-io"] },
  { title: "Markdown linter", summary: "Flag common mistakes.", size: "medium", concepts: ["iterators"] },
  { title: "HTTP status checker", summary: "Ping URLs concurrently.", size: "large", concepts: ["async"] },
] };

describe("checkSuggestions", () => {
  it("accepts exactly three well-formed projects", () => {
    expect(checkSuggestions(good).map((s) => s.title)).toEqual(["Todo CLI", "Markdown linter", "HTTP status checker"]);
  });
  it("rejects the wrong count, a bad size, missing text, or non-string concepts", () => {
    expect(() => checkSuggestions({ projects: good.projects.slice(0, 2) })).toThrow(/exactly 3/);
    expect(() => checkSuggestions({ projects: [{ ...good.projects[0], size: "huge" }, ...good.projects.slice(1)] })).toThrow(/size/);
    expect(() => checkSuggestions({ projects: [{ ...good.projects[0], title: " " }, ...good.projects.slice(1)] })).toThrow(/title/);
    expect(() => checkSuggestions({ projects: [{ ...good.projects[0], concepts: [1] }, ...good.projects.slice(1)] })).toThrow(/concepts/);
    expect(() => checkSuggestions([])).toThrow(/projects/);
  });
});

describe("suggestPrompt", () => {
  it("carries language, level, band, interview, weak concepts and finished projects", () => {
    const p = suggestPrompt({
      language: "rust", level: 40, band: "intermediate",
      interview: { experience: "1-3 years", known: "python", familiarity: "tried it a little", goal: "CLIs", size: "small" },
      weakConcepts: ["borrow", "lifetimes"], done: ["Todo CLI"],
    });
    for (const s of ["rust", "level 40 (intermediate)", "python", "CLIs", "small", "borrow, lifetimes", "Todo CLI"]) expect(p).toContain(s);
  });
  it("says 'none yet' for empty lists and no interview", () => {
    const p = suggestPrompt({ language: "go", level: 80, band: "pro", interview: null, weakConcepts: [], done: [] });
    expect(p).toContain("weak concepts: none yet");
    expect(p).toContain("finished projects: none yet");
  });
});

describe("suggestionLabel / system prompt", () => {
  it("labels a suggestion for the select dialog", () => {
    expect(suggestionLabel(checkSuggestions(good)[1], 1)).toBe("2. Markdown linter (medium) — Flag common mistakes.");
  });
  it("ships a system prompt that demands the JSON shape", () => {
    expect(systemText("suggest")).toContain('"projects"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/suggest.test.ts`
Expected: FAIL. The module is missing and `systemText` is not exported.

- [ ] **Step 3: Implement**

In `pi-tutor/extensions/tutor/prompts.ts`, add below `bandPrompt`:
```ts
/** Any other prompt in prompts/system (suggest, scaffold). */
export function systemText(name: string): string {
  return read(name);
}
```

`pi-tutor/prompts/system/suggest.md`:
```markdown
You suggest small learning projects for one programmer learning one language. You never write code.

Reply with only one JSON object, no prose, in exactly this shape:

{"projects":[{"title":"…","summary":"one sentence","size":"small|medium|large","concepts":["kebab-case-tag"]}]}

Rules:
- Exactly 3 projects, each a different kind of program.
- Sizes: small = 1-2 hours, medium = half a day, large = 1-2 days. Prefer the learner's preferred size for at least two of them.
- Each project must exercise at least one of the learner's weak concepts when there are any, and 2-4 concepts in total. Use short kebab-case concept tags.
- Never repeat a finished project. Match the difficulty to the learner's level: 0-33 beginner, 34-66 intermediate, 67-100 pro.
- Titles are at most 6 words. Summaries are one plain sentence.
```

`pi-tutor/extensions/tutor/suggest.ts`:
```ts
import type { Band } from "./policy.js";
import type { InterviewAnswers, Size } from "./interview.js";

// Project suggester (spec §6): three projects biased toward weak concepts, as JSON.
export interface Suggestion { title: string; summary: string; size: Size; concepts: string[] }
export interface SuggestInput { language: string; level: number; band: Band; interview: InterviewAnswers | null; weakConcepts: string[]; done: string[] }

const SIZES: readonly string[] = ["small", "medium", "large"];
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none yet");

export function suggestPrompt(i: SuggestInput): string {
  const lines = [
    `language: ${i.language}`,
    `learner: level ${i.level} (${i.band})`,
  ];
  if (i.interview) {
    lines.push(`programming experience: ${i.interview.experience}`);
    lines.push(`languages known: ${i.interview.known || "not given"}`);
    lines.push(`familiarity with ${i.language}: ${i.interview.familiarity}`);
    lines.push(`goal: ${i.interview.goal || "not given"}`);
    lines.push(`preferred size: ${i.interview.size}`);
  }
  lines.push(`weak concepts: ${list(i.weakConcepts)}`);
  lines.push(`finished projects: ${list(i.done)}`);
  return lines.join("\n");
}

function text(v: unknown, field: string, n: number): string {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`project ${n} needs a non-empty ${field}`);
  return v.trim();
}

export function checkSuggestions(v: unknown): Suggestion[] {
  const projects = (v as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(projects)) throw new Error('reply must be {"projects":[…]}');
  if (projects.length !== 3) throw new Error(`need exactly 3 projects, got ${projects.length}`);
  return projects.map((p, idx) => {
    const n = idx + 1;
    const o = (p ?? {}) as Record<string, unknown>;
    if (!SIZES.includes(o.size as string)) throw new Error(`project ${n} size must be small, medium or large`);
    if (!Array.isArray(o.concepts) || !o.concepts.every((c) => typeof c === "string")) throw new Error(`project ${n} concepts must be strings`);
    return { title: text(o.title, "title", n), summary: text(o.summary, "summary", n), size: o.size as Size, concepts: o.concepts as string[] };
  });
}

export function suggestionLabel(s: Suggestion, i: number): string {
  return `${i + 1}. ${s.title} (${s.size}) — ${s.summary}`;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/suggest.test.ts test/prompts.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/suggest.ts pi-tutor/prompts/system/suggest.md pi-tutor/extensions/tutor/prompts.ts pi-tutor/test/suggest.test.ts
git commit -m "feat(pi-tutor): project suggester prompt and reply check"
```

---

### Task 5: Scaffold spec check and writer

**Files:**
- Create: `pi-tutor/extensions/tutor/scaffold.ts`, `pi-tutor/prompts/system/scaffold.md`
- Test: `pi-tutor/test/scaffold.test.ts`

**Interfaces:**
- Consumes: `Suggestion` (Task 4); `InterviewAnswers` (Task 2); `Band`.
- Produces:
  ```ts
  export interface ScaffoldSpec { design_md: string; tasks_md: string; requirements_md: string; entry_file: string; run_cmd: string }
  export interface ScaffoldMeta { language: string; level: number; band: Band; title: string; summary: string }
  export function scaffoldPrompt(i: { language: string; level: number; band: Band; project: Suggestion; interview: InterviewAnswers | null }): string;
  export function checkScaffold(v: unknown): ScaffoldSpec;     // throws with a reason
  export function taskIds(tasksMd: string): string[];          // unique, in order
  export function slugify(title: string): string;
  export function commentPrefix(entryFile: string): string;
  export function isEmptyOrMissing(dir: string): boolean;
  export function writeScaffold(dir: string, s: ScaffoldSpec, meta: ScaffoldMeta): string[]; // relative paths written; throws if dir is non-empty
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/scaffold.test.ts`:
```ts
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
    expect(written).toEqual(["README.md", "AGENTS.md", ".pi/skills/.gitkeep", "spec/design.md", "spec/tasks.md", "spec/requirements.md", "src/main.rs"]);
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
    expect(writeScaffold(empty, spec(), meta)).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/scaffold.test.ts`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement**

`pi-tutor/prompts/system/scaffold.md`:
````markdown
You write the specification for one small learning project. The learner writes all the code; you never write implementation code.

Reply with only one JSON object, no prose, in exactly this shape:

{"design_md":"…","tasks_md":"…","requirements_md":"…","entry_file":"src/…","run_cmd":"…"}

- `design_md`: the blueprint. An ASCII architecture diagram in a fenced block, the components, the data flow, and a list of the functions, features or services to build. No code.
- `tasks_md`: phases → tasks → subtasks with stable ids `P1`, `P1.T2`, `P1.T2.S3`. Every task and subtask is one line starting `- [ ] <id> `, followed by what to build, which files, and "done when: …".
- `requirements_md`: one `## <id>` section per task and subtask id in `tasks_md`: inputs, outputs, constraints, concepts needed, acceptance criteria. Every id in `tasks_md` must have a section.
- `entry_file`: the single source file the learner starts in, a relative path under `src/` (for example `src/main.py`, `src/main.rs`).
- `run_cmd`: the shell command that runs the program from the project folder.
- Use the language's normal project conventions. Keep the whole project within the stated size.
````

`pi-tutor/extensions/tutor/scaffold.ts`:
```ts
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, isAbsolute } from "node:path";
import type { Band } from "./policy.js";
import type { InterviewAnswers } from "./interview.js";
import type { Suggestion } from "./suggest.js";

// Scaffold writer (spec §6): one structured call → spec/{design,tasks,requirements}.md, plus local templates.
export interface ScaffoldSpec { design_md: string; tasks_md: string; requirements_md: string; entry_file: string; run_cmd: string }
export interface ScaffoldMeta { language: string; level: number; band: Band; title: string; summary: string }

const ID = /\bP\d+(?:\.T\d+(?:\.S\d+)?)?\b/g;
const DETAIL: Record<Band, string> = {
  beginner: "Detail: beginner. Break every task into subtasks small enough to read like \"define a function that takes X and returns Y\".",
  intermediate: "Detail: intermediate. Tasks with subtasks only where a step is not obvious.",
  pro: "Detail: pro. Phases and tasks with requirements only; no subtasks.",
};
const COMMENT: Record<string, string> = {
  ".rs": "//", ".go": "//", ".ts": "//", ".js": "//", ".c": "//", ".cpp": "//", ".java": "//", ".kt": "//", ".swift": "//", ".zig": "//",
  ".lua": "--", ".hs": "--", ".sql": "--",
};

export function taskIds(tasksMd: string): string[] {
  return [...new Set((tasksMd.match(ID) ?? []).filter((id) => id.includes(".T")))];
}

function field(o: Record<string, unknown>, k: keyof ScaffoldSpec): string {
  const v = o[k];
  if (typeof v !== "string" || v.trim() === "") throw new Error(`${k} must be a non-empty string`);
  return v;
}

export function checkScaffold(v: unknown): ScaffoldSpec {
  if (typeof v !== "object" || v === null) throw new Error("reply must be a JSON object");
  const o = v as Record<string, unknown>;
  const s: ScaffoldSpec = {
    design_md: field(o, "design_md"), tasks_md: field(o, "tasks_md"), requirements_md: field(o, "requirements_md"),
    entry_file: field(o, "entry_file"), run_cmd: field(o, "run_cmd"),
  };
  const ids = taskIds(s.tasks_md);
  if (ids.length === 0) throw new Error("tasks_md has no task ids like P1.T1");
  if (!s.tasks_md.includes("[ ]")) throw new Error("tasks_md tasks need [ ] checkboxes");
  const missing = ids.filter((id) => !new RegExp(`\\b${id.replace(/\./g, "\\.")}\\b`).test(s.requirements_md));
  if (missing.length) throw new Error(`requirements_md is missing sections for ${missing.join(", ")}`);
  const entry = normalize(s.entry_file);
  if (isAbsolute(s.entry_file) || !entry.startsWith("src/") || entry === "src/" || entry.split("/").includes("..")) {
    throw new Error("entry_file must be a relative file path under src/");
  }
  return s;
}

export function scaffoldPrompt(i: { language: string; level: number; band: Band; project: Suggestion; interview: InterviewAnswers | null }): string {
  return [
    `language: ${i.language}`,
    `learner: level ${i.level} (${i.band})`,
    `project: ${i.project.title} — ${i.project.summary}`,
    `size: ${i.project.size}`,
    `concepts to exercise: ${i.project.concepts.join(", ") || "any"}`,
    ...(i.interview?.goal ? [`learner goal: ${i.interview.goal}`] : []),
    DETAIL[i.band],
  ].join("\n");
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "project";
}

export function commentPrefix(entryFile: string): string {
  return COMMENT[extname(entryFile)] ?? "#";
}

export function isEmptyOrMissing(dir: string): boolean {
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

function readme(s: ScaffoldSpec, m: ScaffoldMeta): string {
  return `---\nrun: ${s.run_cmd}\nlanguage: ${m.language}\n---\n# ${m.title}\n\n${m.summary}\n\n` +
    `## Run\n\n\`${s.run_cmd}\`\n\n## Working with the tutor\n\n` +
    `- The plan is in \`spec/\`: start with \`spec/tasks.md\`, tick tasks as you finish them.\n` +
    `- Open the tutor with \`:Tutor\`; ask it anything, it answers with hints, not code.\n` +
    `- Change how much help you get with \`:TutorLevel <0-100>\`.\n`;
}

function agents(m: ScaffoldMeta): string {
  return `# Tutor instructions for this project\n\n` +
    `- This is a ${m.language} learning project: ${m.title}. ${m.summary}\n` +
    `- The learner's level is ${m.level} (${m.band}). Coach; never write the solution.\n` +
    `- Never write or edit files in src/. You have read-only tools; the learner writes all the code.\n` +
    `- The plan is spec/design.md, spec/tasks.md and spec/requirements.md. Refer to tasks by id (P1.T2.S3) and cite \`path:line\`.\n`;
}

export function writeScaffold(dir: string, s: ScaffoldSpec, meta: ScaffoldMeta): string[] {
  if (!isEmptyOrMissing(dir)) throw new Error(`${dir} is not empty`);
  const entry = normalize(s.entry_file);
  const first = taskIds(s.tasks_md)[0];
  const files: [string, string][] = [
    ["README.md", readme(s, meta)],
    ["AGENTS.md", agents(meta)],
    [".pi/skills/.gitkeep", ""],
    ["spec/design.md", s.design_md],
    ["spec/tasks.md", s.tasks_md],
    ["spec/requirements.md", s.requirements_md],
    [entry, `${commentPrefix(entry)} Start here: spec/tasks.md, task ${first}. You write the code; the tutor coaches.\n`],
  ];
  for (const [rel, text] of files) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text, { flag: "wx" });
  }
  return files.map(([rel]) => rel);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/scaffold.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/scaffold.ts pi-tutor/prompts/system/scaffold.md pi-tutor/test/scaffold.test.ts
git commit -m "feat(pi-tutor): scaffold spec check and writer"
```

---

### Task 6: The `/tutor-start` flow

**Files:**
- Create: `pi-tutor/extensions/tutor/start.ts`
- Test: `pi-tutor/test/start.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `bandFor` (policy.ts).
- Produces:
  ```ts
  export const LANGUAGES: readonly string[]; // python, rust, go, typescript, lua
  export interface StartUi extends Ask { notify(msg: string, level: "info" | "warning" | "error"): void; working(msg?: string): void }
  export interface StartDeps { ui: StartUi; profile: Profile; complete: Complete; now: () => number; home: string }
  export interface StartResult { dir: string; language: string; level: number; title: string; files: string[] }
  export function runStart(arg: string, d: StartDeps): Promise<StartResult | null>;
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/start.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStart, LANGUAGES, type StartDeps } from "../extensions/tutor/start.js";
import { Profile } from "../extensions/tutor/profile.js";

const SUGGEST = JSON.stringify({ projects: [
  { title: "Todo CLI", summary: "Track tasks.", size: "small", concepts: ["structs"] },
  { title: "Word Count", summary: "Count words.", size: "small", concepts: ["iterators"] },
  { title: "Pinger", summary: "Ping URLs.", size: "medium", concepts: ["async"] },
] });
const SCAFFOLD = JSON.stringify({
  design_md: "# D\n", tasks_md: "- [ ] P1.T1 Parse args\n", requirements_md: "## P1.T1\n", entry_file: "src/main.rs", run_cmd: "cargo run",
});

let profile: Profile | undefined;
afterEach(() => { profile?.close(); profile = undefined; });

function deps(answers: (string | undefined)[], replies: string[] = [SUGGEST, SCAFFOLD]) {
  const home = mkdtempSync(join(tmpdir(), "pitutor-home-"));
  profile = Profile.open(":memory:");
  const notes: string[] = [];
  const working: (string | undefined)[] = [];
  const prompts: string[] = [];
  const next = async (title: string) => { prompts.push(title); return answers.shift(); };
  const d: StartDeps = {
    ui: { select: (t) => next(t), input: (t) => next(t), notify: (m) => { notes.push(m); }, working: (m) => { working.push(m); } },
    profile, home, now: () => 1000,
    complete: async () => { const r = replies.shift(); if (r === undefined) throw new Error("no more replies"); return r; },
  };
  return { d, home, notes, working, prompts, profile };
}
const interview = ["1-3 years", "python", "tried it a little", "a CLI", "small (1-2 h)"];

describe("runStart", () => {
  it("new language: interview, suggest, pick, scaffold into the default folder, record profile", async () => {
    const t = deps(["rust", ...interview, "1. Todo CLI (small) — Track tasks.", ""]);
    const r = await runStart("", t.d);
    const dir = join(t.home, "lazycourse", "rust-todo-cli");
    expect(r).toEqual({ dir, language: "rust", level: 50, title: "Todo CLI", files: expect.arrayContaining(["spec/tasks.md", "AGENTS.md", "src/main.rs"]) });
    expect(existsSync(join(dir, "spec", "requirements.md"))).toBe(true);
    expect(t.profile.language("rust")).toMatchObject({ level: 50, interview: { goal: "a CLI" } });
    expect(t.profile.projectAt(dir)).toMatchObject({ title: "Todo CLI", language: "rust" });
    expect(t.working.at(-1)).toBeUndefined();
  });

  it("known language skips the interview and uses the stored level; the argument picks the language", async () => {
    const t = deps(["2. Word Count (small) — Count words.", "~/code/wc"]);
    t.profile.saveLanguage("rust", 80, {}, 1);
    const r = await runStart("Rust", t.d);
    expect(r).toMatchObject({ language: "rust", level: 80, title: "Word Count", dir: join(t.home, "code", "wc") });
    expect(t.prompts).toHaveLength(2);
  });

  it("offers the built-in languages plus profile languages and an 'other' entry", async () => {
    const t = deps([undefined]);
    t.profile.saveLanguage("zig", 30, {}, 1);
    let options: string[] = [];
    t.d.ui.select = async (_title, opts) => { options = opts; return undefined; };
    expect(await runStart("", t.d)).toBeNull();
    expect(options).toEqual([...LANGUAGES, "zig", "other…"]);
  });

  it("aborts cleanly at every cancel point: no files, no project row, no half interview", async () => {
    for (let stop = 0; stop <= 7; stop++) {
      const all = ["rust", ...interview, "1. Todo CLI (small) — Track tasks."];
      const t = deps([...all.slice(0, stop), undefined]);
      expect(await runStart("", t.d)).toBeNull();
      expect(t.profile.projects("rust")).toEqual([]);
      if (stop <= 5) expect(t.profile.language("rust")).toBeUndefined();
      expect(existsSync(join(t.home, "lazycourse"))).toBe(false);
      expect(t.working.at(-1)).toBeUndefined();
    }
  });

  it("refuses a non-empty folder before asking the model for the spec", async () => {
    const t = deps(["1. Todo CLI (small) — Track tasks.", "~/busy"], [SUGGEST, SCAFFOLD]);
    t.profile.saveLanguage("rust", 40, {}, 1);
    const busy = join(t.home, "busy");
    mkdirSync(busy);
    writeFileSync(join(busy, "mine.txt"), "x");
    expect(await runStart("rust", t.d)).toBeNull();
    expect(t.notes.at(-1)).toMatch(/not empty/);
    expect(readdirSync(busy)).toEqual(["mine.txt"]);
  });

  it("reports a model failure, writes nothing, and clears the working message", async () => {
    const t = deps(["1. Todo CLI (small) — Track tasks.", ""], [SUGGEST, "garbage", "still garbage"]);
    t.profile.saveLanguage("rust", 40, {}, 1);
    expect(await runStart("rust", t.d)).toBeNull();
    expect(t.notes.at(-1)).toMatch(/rejected twice/);
    expect(existsSync(join(t.home, "lazycourse"))).toBe(false);
    expect(t.working.at(-1)).toBeUndefined();
  });

  it("rejects an invalid language name", async () => {
    const t = deps([]);
    expect(await runStart("rm -rf /", t.d)).toBeNull();
    expect(t.notes.at(-1)).toMatch(/language/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/start.test.ts`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement**

`pi-tutor/extensions/tutor/start.ts`:
```ts
import { resolve, join } from "node:path";
import { bandFor } from "./policy.js";
import type { Profile } from "./profile.js";
import { runInterview, initialLevel, type Ask, type InterviewAnswers } from "./interview.js";
import { completeJson, type Complete } from "./llm.js";
import { systemText } from "./prompts.js";
import { suggestPrompt, checkSuggestions, suggestionLabel } from "./suggest.js";
import { scaffoldPrompt, checkScaffold, writeScaffold, slugify, isEmptyOrMissing } from "./scaffold.js";

// /tutor-start (spec §6): language → interview if new → 3 suggestions → folder → scaffold. Every dependency injected.
export const LANGUAGES = ["python", "rust", "go", "typescript", "lua"] as const;
const OTHER = "other…";
const NAME = /^[a-z][a-z0-9+#.-]{0,30}$/;

export interface StartUi extends Ask {
  notify(msg: string, level: "info" | "warning" | "error"): void;
  working(msg?: string): void;
}
export interface StartDeps { ui: StartUi; profile: Profile; complete: Complete; now: () => number; home: string }
export interface StartResult { dir: string; language: string; level: number; title: string; files: string[] }

async function pickLanguage(arg: string, d: StartDeps): Promise<string | null> {
  let name = arg.trim();
  if (!name) {
    const extra = d.profile.languages().filter((l) => !(LANGUAGES as readonly string[]).includes(l));
    const choice = await d.ui.select("Which language?", [...LANGUAGES, ...extra, OTHER]);
    if (choice === undefined) return null;
    name = choice === OTHER ? ((await d.ui.input("Language name", "e.g. zig")) ?? "") : choice;
    if (!name.trim()) return null;
  }
  name = name.trim().toLowerCase();
  if (!NAME.test(name)) { d.ui.notify(`"${name}" is not a language name I can use`, "warning"); return null; }
  return name;
}

function expandHome(p: string, home: string): string {
  return p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p;
}

export async function runStart(arg: string, d: StartDeps): Promise<StartResult | null> {
  const language = await pickLanguage(arg, d);
  if (!language) return null;

  let interview: InterviewAnswers | null = null;
  let level: number;
  const row = d.profile.language(language);
  if (row) {
    level = row.level;
  } else {
    interview = await runInterview(language, d.ui);
    if (!interview) return null;
    level = initialLevel(interview);
  }
  const band = bandFor(level);

  try {
    d.ui.working("tutor: suggesting projects…");
    const suggestions = await completeJson(d.complete, systemText("suggest"), suggestPrompt({
      language, level, band, interview,
      weakConcepts: d.profile.concepts(language).filter((c) => c.ease < 0.5).slice(0, 8).map((c) => c.tag),
      done: d.profile.projects(language).map((p) => p.title),
    }), checkSuggestions);
    d.ui.working();

    const labels = suggestions.map(suggestionLabel);
    const picked = await d.ui.select("Pick a project", labels);
    if (picked === undefined) return null;
    const project = suggestions[labels.indexOf(picked)];

    const fallback = `~/lazycourse/${language}-${slugify(project.title)}`;
    const answer = await d.ui.input("Project folder", fallback);
    if (answer === undefined) return null;
    const dir = resolve(expandHome(answer.trim() || fallback, d.home));
    if (!isEmptyOrMissing(dir)) { d.ui.notify(`${dir} is not empty; pick another folder`, "warning"); return null; }

    d.ui.working("tutor: writing the spec…");
    const spec = await completeJson(d.complete, systemText("scaffold"), scaffoldPrompt({ language, level, band, project, interview }), checkScaffold);
    const files = writeScaffold(dir, spec, { language, level, band, title: project.title, summary: project.summary });
    if (interview) d.profile.saveLanguage(language, level, interview as unknown as Record<string, string>, d.now());
    d.profile.addProject(language, dir, project.title, d.now());
    return { dir, language, level, title: project.title, files };
  } catch (e) {
    d.ui.notify(`tutor-start failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    return null;
  } finally {
    d.ui.working();
  }
}
```

Note: the interview row is saved only after the scaffold is written. Cancelling anywhere leaves no half profile; Review Focus 1 and the "aborts cleanly" test pin this.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/start.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/start.ts pi-tutor/test/start.test.ts
git commit -m "feat(pi-tutor): /tutor-start flow — language, interview, suggestions, scaffold"
```

---

### Task 7: Wire the profile and `/tutor-start` into Pi and Neovim

**Files:**
- Modify: `pi-tutor/extensions/tutor/ladder.ts` (add `episodeScore`)
- Modify: `pi-tutor/extensions/tutor/nvim.ts` (add `switchProject`)
- Modify: `pi-tutor/extensions/tutor/index.ts`
- Modify: `nvim-tutor/lua/tutor/init.lua` (add `M.switch`)
- Modify: `pi-tutor/test/fake-pi.ts` (profile env, `model`, `modelRegistry`, `select`/`input`/`setWorkingMessage`)
- Test: `pi-tutor/test/ladder.test.ts`, `pi-tutor/test/nvim.test.ts`, `pi-tutor/test/smoke.test.ts`, `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  ```ts
  // ladder.ts
  export function episodeScore(ep: Episode): number | null; // null for superseded
  // nvim.ts
  async switchProject(dir: string, file: string): Promise<void>; // schedules require("tutor").switch(dir, file) in 500 ms
  ```
  ```lua
  -- init.lua
  function M.switch(dir, file) -> boolean  -- cd, open file in the editor window, restart Pi with cwd = dir
  ```
  In `index.ts`:
  - The `tutor-start` command.
  - `session_start` sets `state.language` and the level from the profile when `ctx.cwd` is a recorded project.
  - `/tutor-level` writes `profile.setLevel`.
  - Every closed episode goes to `profile.recordEpisode`.

- [ ] **Step 1: Write the failing tests**

`pi-tutor/test/ladder.test.ts`, add:
```ts
import { episodeScore } from "../extensions/tutor/ladder.js";

describe("episodeScore", () => {
  const at = (band: "beginner" | "intermediate" | "pro", rung: number, closeReason = "judged") =>
    ({ ...openEpisode({ kind: "chat" }, band, 1), rung, closed: 2, closeReason } as Parameters<typeof episodeScore>[0]);
  it("is 1 at the start rung and falls one step per extra rung, floored at 0", () => {
    expect(episodeScore(at("intermediate", 2))).toBe(1);
    expect(episodeScore(at("intermediate", 3))).toBe(0.75);
    expect(episodeScore(at("intermediate", 5))).toBe(0.25);
    expect(episodeScore(at("pro", 4))).toBe(0.25);
    expect(episodeScore(at("beginner", 5))).toBeCloseTo(1 / 3);
  });
  it("is null for a superseded episode", () => {
    expect(episodeScore(at("pro", 1, "superseded"))).toBeNull();
  });
});
```
(Merge the import into the existing import line.)

`pi-tutor/test/nvim.test.ts`, add inside the last `describe`:
```ts
  it("switchProject schedules require('tutor').switch(dir, file) after the call returns", async () => {
    const { link } = await setup();
    await link.raw.lua(`package.loaded.tutor = { switch = function(d, f) vim.g.switched = { d, f } end }`);
    await link.switchProject("/x/proj", "spec/tasks.md");
    expect(await link.raw.lua("return vim.g.switched")).toBeNull(); // deferred, not yet
    await new Promise((r) => setTimeout(r, 800));
    expect(await link.raw.lua("return vim.g.switched")).toEqual(["/x/proj", "spec/tasks.md"]);
  }, 20000);
```

`nvim-tutor/tests/init_spec.lua`, add inside `describe("tutor.init", …)`:
```lua
  it("switch cds into the project, opens the file and restarts pi there", function()
    local tutor = require("tutor")
    local dir = vim.fn.tempname()
    vim.fn.mkdir(dir .. "/spec", "p")
    vim.fn.writefile({ "- [ ] P1.T1" }, dir .. "/spec/tasks.md")
    vim.cmd("Tutor")
    local old = tutor.state.term:job_id()
    assert.is_true(tutor.switch(dir, "spec/tasks.md"))
    local real = vim.fn.resolve(dir)
    assert.equals(real, vim.fn.resolve(vim.fn.getcwd()))
    assert.equals(dir, tutor.state.term.opts.cwd)
    assert.are_not.equal(old, tutor.state.term:job_id())
    local found = false
    for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
      if vim.fn.resolve(vim.api.nvim_buf_get_name(vim.api.nvim_win_get_buf(w))) == real .. "/spec/tasks.md" then found = true end
    end
    assert.is_true(found)
    assert.is_false(tutor.switch(dir .. "/missing", "x"))
  end)
```

`pi-tutor/test/fake-pi.ts`:
- Below the `PI_TUTOR` line, add:
  ```ts
  process.env.PI_TUTOR_PROFILE ??= ":memory:"; // each boot gets a private in-memory profile
  ```
- In `fakeCtx`, add `select`, `input` and `setWorkingMessage` to `ui`, driven by a `script` array, plus a `model` and a `modelRegistry` whose replies come from a `replies` array:
  ```ts
  export function fakeCtx(branch: unknown[] = [], cwd = "/tmp/proj") {
    const widgets: Record<string, string[] | undefined> = {};
    const statuses: Record<string, string | undefined> = {};
    const notes: string[] = [];
    const busy = { value: false };
    const script: (string | undefined)[] = [];
    const replies: string[] = [];
    return {
      ctx: {
        hasUI: true, cwd, mode: "tui",
        isIdle: () => !busy.value,
        sessionManager: { getBranch: () => branch },
        model: { id: "fake-model" },
        modelRegistry: {
          complete: async () => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: replies.shift() ?? "" }] }),
        },
        ui: {
          setWidget: (k: string, c: string[] | undefined) => { widgets[k] = c; },
          setStatus: (k: string, t: string | undefined) => { statuses[k] = t; },
          setWorkingMessage: () => {},
          notify: (m: string) => notes.push(m),
          select: async () => script.shift(),
          input: async () => script.shift(),
        },
      },
      widgets, statuses, notes, busy, script, replies,
    };
  }
  ```

`pi-tutor/test/smoke.test.ts`, add at the end:
```ts
describe("M4 profile and /tutor-start", () => {
  it("registers /tutor-start", async () => {
    const { commands } = await boot();
    expect(Object.keys(commands)).toContain("tutor-start");
  });

  it("/tutor-start scaffolds through the real model call path and says how to continue when detached", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "pitutor-smoke-"));
    const b = await boot({ cwd: root });
    b.replies.push(
      JSON.stringify({ projects: [1, 2, 3].map((n) => ({ title: `P${n}`, summary: "s.", size: "small", concepts: [] })) }),
      JSON.stringify({ design_md: "# D", tasks_md: "- [ ] P1.T1 x", requirements_md: "## P1.T1", entry_file: "src/main.py", run_cmd: "python src/main.py" }),
    );
    b.script.push("none yet", "", "never used it", "", "small (1-2 h)", "1. P1 (small) — s.", join(root, "p1"));
    await b.commands["tutor-start"].handler("python", b.ctx);
    expect(existsSync(join(root, "p1", "spec", "tasks.md"))).toBe(true);
    expect(b.notes.at(-1)).toContain(`cd ${join(root, "p1")} && pi`);
  });

  it("/tutor-start without a model says so and does nothing", async () => {
    const b = await boot();
    (b.ctx as { model?: unknown }).model = undefined;
    await b.commands["tutor-start"].handler("python", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no model/i);
  });

  it("a scaffolded project's language and level come from the profile; /tutor-level writes back; closed episodes are recorded", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const dir = mkdtempSync(join(tmpdir(), "pitutor-proj-"));
    const file = join(dir, "profile.sqlite");
    const seed = Profile.open(file);
    seed.saveLanguage("rust", 20, {}, 1);
    seed.addProject("rust", dir, "Todo CLI", 1);
    seed.close();
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot({ cwd: dir });
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  rust · lvl 20 · rung 3");
      await b.events["before_agent_start"]({ type: "before_agent_start", prompt: "q", systemPromptOptions: { sections: {} } }, b.ctx);
      await b.events["turn_end"]({ type: "turn_end", message: assistant('ok\n```tutor-judgment\n{"judgment":"correct","concept_tags":["traits"],"episode_closed":true}\n```') }, b.ctx);
      await b.commands["tutor-level"].handler("70", b.ctx);
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
      const check = Profile.open(file);
      expect(check.language("rust")?.level).toBe(70);
      expect(check.episodes("rust")).toEqual([expect.objectContaining({ project: dir, concept_tags: ["traits"], turns: 1, rungs_used: 2 })]);
      expect(check.concepts("rust")).toEqual([{ language: "rust", tag: "traits", ease: 2 / 3, episodes: 1 }]);
      check.close();
    } finally { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; }
  });

  it("keeps working without a profile when the profile file is from a newer pi-tutor", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { DatabaseSync } = await import("node:sqlite");
    const { Profile, SCHEMA_VERSION } = await import("../extensions/tutor/profile.js");
    const file = join(mkdtempSync(join(tmpdir(), "pitutor-newer-")), "p.sqlite");
    Profile.open(file).close();
    const db = new DatabaseSync(file); db.prepare("UPDATE schema_version SET v = ?").run(SCHEMA_VERSION + 1); db.close();
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot();
      expect(b.notes.some((n) => /newer/.test(n))).toBe(true);
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  lvl 50 · rung 2");
      await b.commands["tutor-start"].handler("python", b.ctx);
      expect(b.notes.at(-1)).toMatch(/profile/i);
    } finally { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; }
  });
});
```
Arithmetic for the episode test: level 20 is beginner, so the start rung is 3. A `correct` judgment moves it to 4, so `rungs_used = 4 − 3 + 1 = 2`. Score: `1 − (4 − 3) / (5 − 3 + 1) = 2/3`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd pi-tutor && npx vitest run test/ladder.test.ts test/nvim.test.ts test/smoke.test.ts`
Expected: FAIL. `episodeScore` and `switchProject` are missing, `tutor-start` is not registered, and the widget has no `rust`.
Run the plenary command from CLAUDE.md in `nvim-tutor/`.
Expected: the `switch` spec FAILS because `tutor.switch` is nil.

- [ ] **Step 3: Implement**

`ladder.ts`, add:
```ts
/** Ease sample for the profile (spec §5/§6): 1 at the start rung, one step less per extra rung; superseded is not a sample. */
export function episodeScore(ep: Episode): number | null {
  if (ep.closeReason === "superseded") return null;
  const start = startRung(ep.band);
  return Math.min(1, Math.max(0, 1 - (ep.rung - start) / (rungCap(ep.band) - start + 1)));
}
```

`nvim.ts`, add this method to `NvimLink`:
```ts
  /** Re-root the editor and the Pi pane at `dir` once this command has returned (the restart kills this Pi). */
  async switchProject(dir: string, file: string): Promise<void> {
    await this.raw.lua(`local d, f = ...; vim.defer_fn(function() require("tutor").switch(d, f) end, 500)`, [dir, file]);
  }
```

`nvim-tutor/lua/tutor/init.lua`, add above `function M.setup`:
```lua
--- Re-root the tutor at `dir`: cd there, open `file` in the editor window, restart Pi with cwd = dir.
---@return boolean ok
function M.switch(dir, file)
  if vim.fn.isdirectory(dir) == 0 then
    vim.notify("[tutor] not a directory: " .. dir, vim.log.levels.WARN)
    return false
  end
  opts.cwd = dir
  vim.cmd.cd(vim.fn.fnameescape(dir))
  for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
    if vim.bo[vim.api.nvim_win_get_buf(w)].buftype == "" then
      vim.api.nvim_win_call(w, function() vim.cmd.edit(vim.fn.fnameescape(dir .. "/" .. file)) end)
      break
    end
  end
  M.state.term.opts.cwd = dir
  M.state.term:restart()
  return true
end
```

`index.ts` changes:
1. Imports:
   ```ts
   import { realpathSync } from "node:fs";
   import { homedir } from "node:os";
   import { Profile } from "./profile.js";
   import { runStart } from "./start.js";
   import type { Complete } from "./llm.js";
   ```
   Add `episodeScore` to the `./ladder.js` import, and `rungCap` to the same import (used below).
2. Add this helper at module level, below `restoreEpisode`:
   ```ts
   function realCwd(cwd: string): string {
     try { return realpathSync(cwd); } catch { return cwd; }
   }

   /** Pi's own model as a JSON-call function for the suggester and scaffold (spec §6). */
   function modelComplete(ctx: ExtensionContext): Complete {
     return async (system, user) => {
       const model = ctx.model;
       if (!model) throw new Error("no model selected");
       const r = await ctx.modelRegistry.complete(model, { systemPrompt: system, messages: [{ role: "user", content: [{ type: "text", text: user }], timestamp: Date.now() }] });
       if (r.stopReason !== "stop") throw new Error(`model stopped (${r.stopReason})${r.errorMessage ? `: ${r.errorMessage}` : ""}`);
       return r.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
     };
   }
   ```
3. Inside the factory, add `let profile: Profile | null = null;` next to the other state, and add `mirror`:
   ```ts
   /** Spec §5: a closed episode is mirrored to the profile (needs a known language). */
   function mirror(closed: Episode) {
     if (!profile || !state.language || closed.closed === undefined) return;
     const score = episodeScore(closed);
     if (score === null) return;
     profile.recordEpisode({
       language: state.language,
       project: session ? profile.projectAt(realCwd(session.cwd))?.path ?? null : null,
       concept_tags: closed.concept_tags,
       rungs_used: closed.rung - startRung(closed.band) + 1,
       turns: closed.turns, opened: closed.opened, closed: closed.closed,
     }, score);
   }
   ```
   In `closeEp`, build the closed episode once, append it, then mirror it:
   ```ts
   function closeEp(reason: CloseReason) {
     if (!episode) return;
     const closed = closeEpisode(episode, reason, Date.now());
     pi.appendEntry("tutor_episode", closed);
     mirror(closed);
     episode = null;
     signal = `episode closed (${reason})`;
   }
   ```
   In `turn_end`, inside `if (episode.closed !== undefined) { … }`, call `mirror(episode);` before `episode = null;`.
4. In `session_start`, replace the level line:
   ```ts
   if (!profile) {
     try { profile = Profile.open(); } catch (e) { ctx.ui.notify(`tutor profile unavailable: ${e instanceof Error ? e.message : String(e)}`, "warning"); }
   }
   const proj = profile?.projectAt(realCwd(ctx.cwd));
   if (proj) state.language = proj.language;
   state.level = restoreLevel(ctx) ?? (proj ? profile?.language(proj.language)?.level : undefined) ?? DEFAULT_LEVEL;
   ```
5. In `session_shutdown`, add `profile?.close(); profile = null;` before closing the link.
6. In the `tutor-level` handler, after `pi.appendEntry("tutor_level", { level: n });`, add:
   ```ts
   if (state.language) profile?.setLevel(state.language, n);
   ```
7. Register the command, next to the other commands:
   ```ts
   pi.registerCommand("tutor-start", {
     description: "Pick a language, get three project ideas, scaffold one (spec/ + AGENTS.md)",
     handler: async (args, ctx) => {
       if (!profile) { ctx.ui.notify("tutor profile unavailable; see the earlier warning", "error"); return; }
       if (!ctx.model) { ctx.ui.notify("no model selected; pick one with /model first", "error"); return; }
       const r = await runStart(args, {
         ui: {
           select: (t, o) => ctx.ui.select(t, o),
           input: (t, p) => ctx.ui.input(t, p),
           notify: (m, l) => ctx.ui.notify(m, l),
           working: (m) => ctx.ui.setWorkingMessage(m),
         },
         profile, complete: modelComplete(ctx), now: Date.now, home: homedir(),
       });
       if (!r) return;
       if (link) {
         ctx.ui.notify(`scaffolded ${r.title} in ${r.dir}; switching the editor and tutor there…`, "info");
         await link.switchProject(r.dir, "spec/tasks.md");
       } else {
         ctx.ui.notify(`scaffolded ${r.title} in ${r.dir}. Continue with: cd ${r.dir} && pi`, "info");
       }
     },
   });
   ```

- [ ] **Step 4: Run both suites and the typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`, then the plenary command in `nvim-tutor/`.
Expected: everything PASSES. If `ctx.modelRegistry.complete`'s `messages` element type rejects the literal, import `UserMessage` from `@earendil-works/pi-ai` as a type and annotate it, as `examples/extensions/qna.ts` does.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/ladder.ts pi-tutor/extensions/tutor/nvim.ts pi-tutor/extensions/tutor/index.ts nvim-tutor/lua/tutor/init.lua pi-tutor/test/ladder.test.ts pi-tutor/test/nvim.test.ts pi-tutor/test/smoke.test.ts pi-tutor/test/fake-pi.ts nvim-tutor/tests/init_spec.lua
git commit -m "feat: /tutor-start wired to Pi's model and Neovim; profile-driven language/level; episodes mirrored"
```

---

### Task 8: Surface, docs, live check

**Files:**
- Modify: `pi-tutor/PI_SURFACE.md`, `README.md`, `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md`

- [ ] **Step 1: Re-verify the surface** (pi-surface-check)

Run:
```bash
cd pi-tutor && T=node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
grep -n "select(title\|input(title\|setWorkingMessage\|model: Model" $T
grep -n "complete<TApi" node_modules/@earendil-works/pi-coding-agent/dist/core/model-registry.d.ts
node --version; node -e "require('node:sqlite')" 2>&1 | head -1
```
Expected: every grep hits. `node -e` prints nothing (no ExperimentalWarning). If a warning appears on the installed Node, stop and record it in PI_SURFACE.md's "Observed behaviour" section.

- [ ] **Step 2: `PI_SURFACE.md`**

Under "Pi extension API", add:
```markdown
- `ctx.modelRegistry.complete(ctx.model, { systemPrompt, messages: [UserMessage] })` → `AssistantMessage`
  (model-registry.d.ts:40; pattern from examples/extensions/qna.ts). Used by `/tutor-start` for the
  suggester and the scaffold; non-`"stop"` `stopReason` is an error (`errorMessage` shown).
- `ctx.ui.select(title, options)` / `ctx.ui.input(title, placeholder)` → `string | undefined` (Esc = undefined);
  `ctx.ui.setWorkingMessage(text?)`; `ctx.model` (undefined → `/tutor-start` refuses).
```
Under "Neovim", add:
```markdown
- `require("tutor").switch(dir, file)` (nvim-tutor init.lua) is called by `NvimLink.switchProject` via
  `vim.defer_fn(…, 500)` so the restart that kills this Pi happens after `/tutor-start` returns.
```
Add a section:
```markdown
## Node
- `node:sqlite` `DatabaseSync` (profile). No ExperimentalWarning on Node 26.11.1 (2026-10-12); on Node 22.x it
  warns on stderr — check before supporting an older Node, the warning would draw over Pi's TUI.
```

- [ ] **Step 3: README and spec**

`README.md`: after the Milestone 3 paragraph, add:
```markdown
Milestone 4 done (2026-10-12): `:TutorStart` (or `/tutor-start [language]`) runs a short
interview the first time you pick a language, suggests three projects aimed at your weak
concepts, and scaffolds the one you pick into `~/lazycourse/<language>-<project>` (or a folder
you choose): `README.md`, `AGENTS.md`, `spec/design.md`, `spec/tasks.md`,
`spec/requirements.md`, `src/<entry>`. Neovim then switches into that folder and restarts the
tutor there. Your levels, projects and finished stuck episodes (with per-concept ease) live in
`~/.local/share/nvim-tutor/profile.sqlite`.
```
Update the Plans bullet with `, M4 profile/start`.

Spec: change the header to `rev 6, 2026-10-12: M4 interview choices, switch into the project after scaffold, ease formula; rev 5: …`. In §6, after the scaffold bullets, add:
```markdown
- M4 rulings: the interview asks experience, familiarity and size as choices (they set the
  starting level: familiarity 15/45/80, experience −10/0/+5/+10) and languages known and goal as
  free text. After scaffolding, `require("tutor").switch(dir, "spec/tasks.md")` cds Neovim into
  the project and restarts Pi there, so the tool guard, `AGENTS.md`, and the editor root all
  follow. Ease per concept is the mean of episode scores `1 − (rung − start)/(cap − start + 1)`.
```

- [ ] **Step 4: Run everything; manual live acceptance**

Run both suites (the commands from CLAUDE.md).
Expected: green.

The live drive can't answer Pi's TUI dialogs, so M4's acceptance is manual, after the merge. In LazyVim:
1. Run `:TutorStart rust` (or any language without a profile row).
2. Answer the five questions.
3. Pick a project and accept the default folder.

Expected: Neovim moves into `~/lazycourse/rust-…`, `spec/tasks.md` opens on the left, and a fresh tutor pane shows `rust · lvl <n>`. Also run `/tutor-live` to confirm M3 behaviour is unchanged.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/PI_SURFACE.md README.md docs/superpowers/specs/2026-10-07-nvim-tutor-design.md
git commit -m "docs: M4 surface, README status, spec rev 6"
```
